from .models import LLMSettings
from .crypto import decrypt_str

DEFAULTS = {
    "openai": "text-embedding-3-small",  
    "google": "gemini-embedding-001",       
    "ollama": "nomic-embed-text",         
}

def get_embeddings_for_user(user):
    cfg, _ = LLMSettings.objects.get_or_create(user=user, defaults={
        "provider": "openai",
        "model": "gpt-4o-mini",
        "temperature": 0.2,
    })

    provider = cfg.provider
    api_key = decrypt_str(cfg.api_key_enc)
    base_url = (cfg.base_url or "").strip()

    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        if not api_key:
            raise ValueError("Missing OpenAI API key. Add it in Settings.")
        return OpenAIEmbeddings(model=DEFAULTS["openai"], api_key=api_key)

    if provider == "google":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        if not api_key:
            raise ValueError("Missing Google API key. Add it in Settings.")
        return GoogleGenerativeAIEmbeddings(model=DEFAULTS["google"], google_api_key=api_key)

    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        if not base_url:
            base_url = "http://localhost:11434"
        embed_model = DEFAULTS["ollama"]

        try:
            return OllamaEmbeddings(model=embed_model, base_url=base_url)
        except Exception as e:
            raise ValueError(
                f"Ollama embeddings failed. Make sure Ollama is running at {base_url} "
                f"and run: ollama pull {embed_model}. Details: {e}"
            )

    raise ValueError(f"Embeddings not configured for provider: {provider}")
