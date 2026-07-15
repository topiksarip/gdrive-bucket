"""Symmetric encryption for stored OAuth refresh tokens (Fernet, key from SECRET_KEY)."""
from cryptography.fernet import Fernet
import base64
import hashlib

from app.config import SECRET_KEY


def _fernet() -> Fernet:
    # Derive a 32-byte URL-safe key from SECRET_KEY (Fernet needs 32 url-safe bytes).
    digest = hashlib.sha256(SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt(plain: str) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception:
        return ""
