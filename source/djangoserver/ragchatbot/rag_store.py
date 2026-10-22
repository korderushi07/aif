from pathlib import Path
from django.conf import settings
from langchain_chroma import Chroma

def user_chroma_dir(user_id: int) -> str:
    base = Path(settings.BASE_DIR) / "chroma" / f"user_{user_id}"
    base.mkdir(parents=True, exist_ok=True)
    return str(base)

def collection_name_for_backend(backend: str) -> str:
    return f"kb_{backend}_v1"   

def get_vectorstore_for_backend(user_id: int, backend: str, embedding_function):
    return Chroma(
        collection_name=collection_name_for_backend(backend),
        persist_directory=user_chroma_dir(user_id),
        embedding_function=embedding_function,
        collection_metadata={"hnsw:space": "cosine"},
    )
