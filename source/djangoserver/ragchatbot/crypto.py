import os
from cryptography.fernet import Fernet

def _fernet() -> Fernet:
    key = os.environ.get("RAGCHATBOT_FERNET_KEY", "").strip()
    if key:
        try:
            return Fernet(key.encode("utf-8"))
        except Exception:
            pass
    # Safe deterministic fallback derived from SECRET_KEY so deployment never crashes
    import base64, hashlib
    from django.conf import settings
    secret = getattr(settings, "SECRET_KEY", "fallback-secret-rag-chatbot-key")
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(derived_key)

def encrypt_str(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")

def decrypt_str(value: str) -> str:
    if not value:
        return ""
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
