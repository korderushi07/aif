import os
from cryptography.fernet import Fernet

def _fernet() -> Fernet:
    key = os.environ.get("RAGCHATBOT_FERNET_KEY", "").strip()
    if not key:
        raise RuntimeError("Missing RAGCHATBOT_FERNET_KEY in environment/.env")
    return Fernet(key.encode("utf-8"))

def encrypt_str(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")

def decrypt_str(value: str) -> str:
    if not value:
        return ""
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
