from .models import LLMSettings
from .crypto import decrypt_str

EMBED_DEFAULTS = {
    "openai": ("text-embedding-3-small", 1536),
    "google": ("gemini-embedding-001", 3072),
    "ollama": ("nomic-embed-text", 768),
}

def get_embeddings_for_backend(user, backend: str):
    cfg, _ = LLMSettings.objects.get_or_create(user=user)

    if backend == "openai":
        from langchain_openai import OpenAIEmbeddings
        key = decrypt_str(cfg.openai_api_key_enc)
        if not key:
            raise ValueError("Missing OpenAI API key (needed to search OpenAI-embedded knowledge).")
        model, _dim = EMBED_DEFAULTS["openai"]
        return OpenAIEmbeddings(model=model, api_key=key)

    if backend == "google":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        key = decrypt_str(cfg.google_api_key_enc)
        if not key:
            raise ValueError("Missing Google API key (needed to search Google-embedded knowledge).")
        model, _dim = EMBED_DEFAULTS["google"]
        return GoogleGenerativeAIEmbeddings(model=model, google_api_key=key)

    if backend == "ollama":
        from langchain_ollama import OllamaEmbeddings
        base_url = (cfg.ollama_base_url or "http://localhost:11434").strip()
        model, _dim = EMBED_DEFAULTS["ollama"]
        return OllamaEmbeddings(model=model, base_url=base_url)

    raise ValueError(f"Unknown embedding backend: {backend}")
