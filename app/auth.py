import hashlib
import hmac
import secrets
import time
import base64

from app.config import SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD

# ---------- Password ----------
def hash_password(pw: str) -> str:
    return hashlib.sha256((SECRET_KEY + pw).encode()).hexdigest()

def verify_password(pw: str, pw_hash: str) -> bool:
    return hmac.compare_digest(hash_password(pw), pw_hash)

# ---------- API Key (sederhana, legacy) ----------
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

# ---------- Signed session cookie ----------
def make_session_token(email: str) -> str:
    ts = str(int(time.time()))
    payload = f"{email}.{ts}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}.{sig}".encode()).decode()

def verify_session_token(token: str):
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        payload, sig = raw.rsplit(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        email = payload.rsplit(".", 1)[0]
        return email
    except Exception:
        return None
