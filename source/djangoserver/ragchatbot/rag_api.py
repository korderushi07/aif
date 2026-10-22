import os
import traceback
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage
from django.conf import settings

from langchain_text_splitters import RecursiveCharacterTextSplitter

from .models import KnowledgeFile, LLMSettings
from .embeddings_factory import get_embeddings_for_user
from .embedding_backends import get_embeddings_for_backend
from .rag_store import get_vectorstore_for_backend

MAX_BYTES = 50 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".txt", ".md"}

def load_file_to_docs(file_path: str, original_name: str):
    ext = os.path.splitext(original_name.lower())[1]
    if ext == ".pdf":
        from langchain_community.document_loaders import PyPDFLoader
        docs = PyPDFLoader(file_path).load()
    elif ext in {".txt", ".md"}:
        from langchain_community.document_loaders import TextLoader
        docs = TextLoader(file_path, encoding="utf-8").load()
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    for d in docs:
        d.metadata["source"] = original_name
    return docs

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
            vs.add_documents(chunks)

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
