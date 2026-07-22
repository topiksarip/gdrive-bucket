import hashlib
import hmac
import secrets
import time
import base64
import json

from app.config import SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD

# ---------- Argon2id password hashing ----------
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
    _ph = PasswordHasher()
    _HAS_ARGON2 = True
except ImportError:
    _HAS_ARGON2 = False


def hash_password(pw: str) -> str:
    if _HAS_ARGON2:
        return _ph.hash(pw)
    # fallback (should not happen in production)
    return hashlib.sha256((SECRET_KEY + pw).encode()).hexdigest()


def verify_password(pw: str, pw_hash: str) -> bool:
    if _HAS_ARGON2 and pw_hash.startswith("$argon2"):
        try:
            _ph.verify(pw_hash, pw)
            return True
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False
    # legacy SHA-256
    return hmac.compare_digest(
        hashlib.sha256((SECRET_KEY + pw).encode()).hexdigest(), pw_hash
    )


def verify_password_and_upgrade(pw: str, pw_hash: str):
    """Verify a password; if it was stored as legacy SHA-256, return an
    upgraded argon2id hash so the caller can persist it.

    Returns (valid: bool, upgraded: str | None).
    """
    # Try argon2 first
    if _HAS_ARGON2 and pw_hash.startswith("$argon2"):
        try:
            _ph.verify(pw_hash, pw)
            return True, pw_hash  # already argon2id, no upgrade needed
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False, None

    # Legacy SHA-256 path
    legacy = hashlib.sha256((SECRET_KEY + pw).encode()).hexdigest()
    if hmac.compare_digest(legacy, pw_hash):
        # Password correct — upgrade to argon2id
        return True, hash_password(pw)
    return False, None


# ---------- API Key (legacy) ----------
def generate_api_key() -> str:
    return "bk_" + secrets.token_urlsafe(32)

def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()

def verify_api_key(key: str, key_hash: str) -> bool:
    return hmac.compare_digest(hash_api_key(key), key_hash)

# ---------- Access Keys (gaya AWS S3: Access Key ID + Secret) ----------
def generate_access_key_id() -> str:
    return "bkid_" + secrets.token_urlsafe(20)

def generate_secret_access_key() -> str:
    return "bksec_" + secrets.token_urlsafe(36)

def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()

def verify_secret(secret: str, secret_hash: str) -> bool:
    return hmac.compare_digest(hash_secret(secret), secret_hash)

# ---------- Signed session cookie with expiry + session_version ----------
def make_session_token(
    email: str,
    *,
    session_version: int = 0,
    now: float | None = None,
    ttl_seconds: int = 86400,
) -> str:
    ts = int(now if now is not None else time.time())
    exp = ts + ttl_seconds
    payload = f"{email}|{session_version}|{ts}|{exp}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}.{sig}".encode()).decode()


def verify_session_token(token: str, *, now: float | None = None):
    """Verify session token.  Returns dict with email+session_version, or None."""
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        payload, sig = raw.rsplit(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        parts = payload.split("|")
        if len(parts) == 4:
            email, session_version_str, _ts, exp_str = parts
            exp = int(exp_str)
            cur = int(now if now is not None else time.time())
            if cur > exp:
                return None
            return {"email": email, "session_version": int(session_version_str)}
        # legacy single-segment (email.ts)
        email = parts[0]
        return {"email": email, "session_version": 0}
    except Exception:
        return None


# ---------- CSRF tokens (bound to session) ----------
def make_csrf_token(session_id: str) -> str:
    sig = hmac.new(SECRET_KEY.encode(), session_id.encode(), hashlib.sha256).hexdigest()
    return sig[:32]


def verify_csrf_token(session_id: str, token: str) -> bool:
    expected = make_csrf_token(session_id)
    return hmac.compare_digest(expected, token)
