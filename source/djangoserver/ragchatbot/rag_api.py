import os
import time
import logging
import traceback
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage
from django.conf import settings

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from .models import KnowledgeFile, LLMSettings
from .embeddings_factory import get_embeddings_for_user
from .embedding_backends import get_embeddings_for_backend
from .rag_store import get_vectorstore_for_backend
from .ocr_pdf import extract_pdf_text

logger = logging.getLogger(__name__)

MAX_BYTES = 50 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".txt", ".md"}

# Batching settings for rate-limited embedding APIs (e.g. Gemini free tier)
EMBED_BATCH_SIZE = 20          # chunks per batch
EMBED_BATCH_DELAY = 1.5        # seconds between batches
EMBED_MAX_RETRIES = 5          # retries per batch on rate-limit errors
EMBED_RETRY_BASE_DELAY = 5.0   # initial retry delay (doubles each attempt)


def load_file_to_docs(file_path: str, original_name: str):
    """
    Load a file and return a list of LangChain Document objects.

    For PDFs, uses the OCR-aware extractor (PyMuPDF + Tesseract)
    so that scanned pages and embedded images are also captured.
    Page numbers are stored in metadata["page"] (0-indexed).
    """
    ext = os.path.splitext(original_name.lower())[1]

    if ext == ".pdf":
        pages = extract_pdf_text(file_path)
        docs = []
        for p in pages:
            text = (p.get("text") or "").strip()
            if not text:
                continue  # skip completely empty pages
            docs.append(Document(
                page_content=text,
                metadata={
                    "source": original_name,
                    "page": p["page"],
                    "ocr": p["ocr"],
                },
            ))
        return docs

    elif ext in {".txt", ".md"}:
        from langchain_community.document_loaders import TextLoader
        docs = TextLoader(file_path, encoding="utf-8").load()
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    for d in docs:
        d.metadata["source"] = original_name
    return docs


def _is_rate_limit_error(exc: Exception) -> bool:
    """Check if an exception is a rate-limit / quota-exhausted error."""
    msg = str(exc).lower()
    return any(keyword in msg for keyword in [
        "429", "resource_exhausted", "rate_limit", "rate limit",
        "quota", "too many requests",
    ])


def add_documents_batched(vs, chunks: list):
    """
    Add documents to the vector store in small batches with delays
    and automatic retry on rate-limit errors.

    This prevents blowing past free-tier API quotas (e.g. Gemini's
    100 embed requests/minute limit).
    """
    total = len(chunks)
    if total == 0:
        return

    for start in range(0, total, EMBED_BATCH_SIZE):
        batch = chunks[start : start + EMBED_BATCH_SIZE]
        batch_num = (start // EMBED_BATCH_SIZE) + 1

        for attempt in range(1, EMBED_MAX_RETRIES + 1):
            try:
                vs.add_documents(batch)
                break  # success
            except Exception as exc:
                if _is_rate_limit_error(exc) and attempt < EMBED_MAX_RETRIES:
                    delay = EMBED_RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "Rate limited on batch %d (chunks %d-%d), "
                        "retry %d/%d in %.1fs: %s",
                        batch_num, start + 1, start + len(batch),
                        attempt, EMBED_MAX_RETRIES, delay, exc,
                    )
                    time.sleep(delay)
                else:
                    raise  # non-rate-limit error or max retries exhausted

        # Small delay between batches to stay under rate limits
        if start + EMBED_BATCH_SIZE < total:
            time.sleep(EMBED_BATCH_DELAY)


@login_required
@require_POST
def upload_and_ingest(request):
    try:
        files = request.FILES.getlist("files")
        if not files:
            return JsonResponse({"error": "No files uploaded"}, status=400)

        for f in files:
            if f.size > MAX_BYTES:
                return JsonResponse({"error": f"{f.name} exceeds 50MB limit"}, status=400)
            ext = os.path.splitext(f.name.lower())[1]
            if ext not in ALLOWED_EXT:
                return JsonResponse({"error": f"{f.name}: unsupported type {ext}"}, status=400)

        cfg, _ = LLMSettings.objects.get_or_create(user=request.user)
        backend = cfg.provider  

        embeddings = get_embeddings_for_backend(request.user, backend)
        vs = get_vectorstore_for_backend(request.user.id, backend, embeddings)
        splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)

        ingested = []
        for f in files:
            saved_path = default_storage.save(f"uploads/{request.user.id}/{f.name}", f)
            abs_path = default_storage.path(saved_path)

            KnowledgeFile.objects.create(
                user=request.user,
                file=saved_path,
                original_name=f.name,
                size_bytes=f.size,
                backend=backend,
            )

            docs = load_file_to_docs(abs_path, f.name)
            for d in docs:
                d.metadata["user_id"] = request.user.id

            chunks = splitter.split_documents(docs)
            add_documents_batched(vs, chunks)

            ingested.append({"name": f.name, "chunks": len(chunks)})

        return JsonResponse({"ok": True, "files": ingested})

    except ValueError as e:
        return JsonResponse(
            {"error": str(e), "hint": "Check Settings → provider/keys/URLs and try again."},
            status=400
        )

    except Exception as e:
        payload = {"error": "Server error while ingesting files."}
        if getattr(settings, "DEBUG", False):
            payload["detail"] = str(e)
            payload["trace"] = traceback.format_exc()
        return JsonResponse(payload, status=500)
