import os
import shutil
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_POST
from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage

from langchain_text_splitters import RecursiveCharacterTextSplitter

from .models import KnowledgeFile
from .rag_api import load_file_to_docs
from .embedding_backends import get_embeddings_for_backend
from .rag_store import (
    user_chroma_dir,
    get_vectorstore_for_backend,
    collection_name_for_backend,
)

BACKENDS = ["openai", "google", "ollama"]

def _fmt_size(n: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

@login_required
@require_http_methods(["GET"])
def list_knowledge_files(request):
    qs = KnowledgeFile.objects.filter(user=request.user).order_by("-created_at")
    items = []
    for f in qs:
        items.append({
            "id": f.id,
            "name": f.original_name,
            "backend": getattr(f, "backend", "openai"),
            "size_bytes": int(f.size_bytes),
            "size_human": _fmt_size(int(f.size_bytes)),
            "created_at": f.created_at.isoformat(),
        })
    return JsonResponse({"files": items})

def _delete_collection(user_id: int, backend: str):
    try:
        from chromadb import PersistentClient
        client = PersistentClient(path=user_chroma_dir(user_id))
        client.delete_collection(collection_name_for_backend(backend))
    except Exception:
        pass

def _reindex_backend(request, backend: str):
    _delete_collection(request.user.id, backend)

    embeddings = get_embeddings_for_backend(request.user, backend)
    vs = get_vectorstore_for_backend(request.user.id, backend, embeddings)
    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)

    qs = KnowledgeFile.objects.filter(user=request.user, backend=backend).order_by("created_at")
    total_chunks = 0

    for kf in qs:
        abs_path = default_storage.path(kf.file.name)
        docs = load_file_to_docs(abs_path, kf.original_name)
        for d in docs:
            d.metadata["user_id"] = request.user.id
            d.metadata["source"] = kf.original_name
            d.metadata["kb_backend"] = backend

        chunks = splitter.split_documents(docs)
        vs.add_documents(chunks)
        total_chunks += len(chunks)

    return {"backend": backend, "files": qs.count(), "chunks": total_chunks}

@login_required
@require_POST
def delete_knowledge_file(request):
    file_id = request.POST.get("id") or request.GET.get("id")
    if not file_id:
        return JsonResponse({"error": "Missing id"}, status=400)

    try:
        kf = KnowledgeFile.objects.get(id=file_id, user=request.user)
    except KnowledgeFile.DoesNotExist:
        return JsonResponse({"error": "File not found"}, status=404)

    backend = getattr(kf, "backend", "openai")

    try:
        if default_storage.exists(kf.file.name):
            default_storage.delete(kf.file.name)
    except Exception:
        pass

    kf.delete()

    stats = _reindex_backend(request, backend)
    return JsonResponse({"ok": True, "reindexed": stats})

@login_required
@require_POST
def clear_knowledge(request):
    qs = KnowledgeFile.objects.filter(user=request.user)
    for kf in qs:
        try:
            if default_storage.exists(kf.file.name):
                default_storage.delete(kf.file.name)
        except Exception:
            pass
    qs.delete()

    for b in BACKENDS:
        _delete_collection(request.user.id, b)

    shutil.rmtree(user_chroma_dir(request.user.id), ignore_errors=True)
    os.makedirs(user_chroma_dir(request.user.id), exist_ok=True)

    return JsonResponse({"ok": True})
