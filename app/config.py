import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# .env sederhana (tanpa dependency python-dotenv)
_env_file = BASE_DIR / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
DRIVE_MOCK = os.getenv("DRIVE_MOCK", "true").lower() in ("1", "true", "yes", "on")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "")

DB_PATH = DATA_DIR / "bucket.db"
PORT = int(os.getenv("PORT", "8000"))

# Kapasitas default per akun di mode mock (15 GB)
MOCK_ACCOUNT_LIMIT = 15 * 1024 * 1024 * 1024
