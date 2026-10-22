from langchain_core.documents import Document
from .embedding_backends import get_embeddings_for_backend
from .rag_store import get_vectorstore_for_backend, collection_name_for_backend
from .models import LLMSettings
from chromadb import PersistentClient
from .rag_store import user_chroma_dir

BACKENDS = ["openai", "google", "ollama"]

def list_existing_backends(user_id: int):
    client = PersistentClient(path=user_chroma_dir(user_id))
    existing = {c.name for c in client.list_collections()}
    out = []
    for b in BACKENDS:
        if collection_name_for_backend(b) in existing:
            out.append(b)
    return out

def retrieve_merged(user, query: str, k_per_backend=3, k_total=4, max_distance=0.45):
    merged = []

    for backend in list_existing_backends(user.id):
        try:
            emb = get_embeddings_for_backend(user, backend)
        except Exception:
            continue

        vs = get_vectorstore_for_backend(user.id, backend, emb)
        try:
            docs_scores = vs.similarity_search_with_score(query, k=k_per_backend)
            for d, score in docs_scores:
                score = float(score)
                if max_distance is not None and score > max_distance:
                    continue

                d.metadata["kb_backend"] = backend
                d.metadata["score"] = float(score)
                merged.append(d)

        except Exception:
            
            #docs = vs.similarity_search(query, k=k_per_backend)
            #for d in docs:
                #d.metadata["kb_backend"] = backend
                #merged.append(d)
            continue

    merged.sort(key=lambda d: d.metadata.get("score", 1e9))
    return merged[:k_total]
