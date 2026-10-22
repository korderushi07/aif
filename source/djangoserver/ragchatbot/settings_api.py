import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required

from .models import LLMSettings
from .crypto import encrypt_str

DEFAULTS = {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "ollama_base_url": "http://localhost:11434",
}

@login_required
@require_http_methods(["GET", "POST"])
def llm_settings_api(request):
    obj, _ = LLMSettings.objects.get_or_create(user=request.user, defaults=DEFAULTS)

    def has_key_for_provider(p: str) -> bool:
        if p == "openai":
            return bool(obj.openai_api_key_enc)
        if p == "google":
            return bool(obj.google_api_key_enc)
        return False 

    if request.method == "GET":
        return JsonResponse({
            "provider": obj.provider,
            "model": obj.model,
            "temperature": obj.temperature,
            "base_url": obj.ollama_base_url if obj.provider == "ollama" else "",
            "has_api_key": has_key_for_provider(obj.provider),
        })

    payload = json.loads(request.body.decode("utf-8") or "{}")

    provider = payload.get("provider", obj.provider)
    obj.provider = provider
    obj.model = payload.get("model", obj.model)
    obj.temperature = float(payload.get("temperature", obj.temperature))

    api_key = (payload.get("api_key") or "").strip()

    if provider == "openai":
        if api_key:
            obj.openai_api_key_enc = encrypt_str(api_key)

    elif provider == "google":
        if api_key:
            obj.google_api_key_enc = encrypt_str(api_key)

    elif provider == "ollama":
        obj.ollama_base_url = (payload.get("base_url") or obj.ollama_base_url).strip() or "http://localhost:11434"

    if payload.get("clear_api_key") is True:
        if provider == "openai":
            obj.openai_api_key_enc = ""
        elif provider == "google":
            obj.google_api_key_enc = ""

    obj.save()
    return JsonResponse({"ok": True, "has_api_key": has_key_for_provider(obj.provider)})
