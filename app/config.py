import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Allow override via env
_env_data = os.getenv("BUCKET_DATA_DIR", "")
DATA_DIR = Path(_env_data) if _env_data else BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# .env loader (tanpa python-dotenv)
_env_file = BASE_DIR / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "termul")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
DRIVE_MOCK = os.getenv("DRIVE_MOCK", "true").lower() in ("1", "true", "yes", "on")
APP_ENV = os.getenv("APP_ENV", "development")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes", "on")
ALLOW_PUBLIC_REGISTRATION = os.getenv("ALLOW_PUBLIC_REGISTRATION", "false").lower() in ("1", "true", "yes", "on")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "")

DB_PATH = DATA_DIR / "bucket.db"
PORT = int(os.getenv("PORT", "8000"))

# Kapasitas default per akun di mode mock (15 GB)
MOCK_ACCOUNT_LIMIT = 15 * 1024 * 1024 * 1024


def validate_production_settings(
    environment: str = "development",
    secret_key: str = "",
    admin_username: str = "",
    admin_email: str = "",
    admin_password: str = "",
):
    """Reject insecure defaults in production."""
    if environment != "production":
        return
    if not secret_key or secret_key == "dev-secret-change-me" or len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters in production")
    if not admin_password or admin_password in ("admin123", "change-me", "password"):
        raise RuntimeError("ADMIN_PASSWORD must not be a weak/default password in production")
