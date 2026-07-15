from sqlalchemy import (
    create_engine, Column, Integer, String, BigInteger, Boolean,
    DateTime, ForeignKey, Text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session
from datetime import datetime, timezone

from app.config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True)
    password_hash = Column(String(255))
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True)  # akun Google A-G
    label = Column(String(64), default="")
    client_id = Column(Text, default="")          # Google Client ID per-akun
    client_secret_enc = Column(Text, default="")  # Google Client Secret (terenkripsi)
    token_enc = Column(Text, default="")          # refresh/access token (terenkripsi, real mode)
    quota_limit = Column(BigInteger, default=0)    # bytes
    quota_used = Column(BigInteger, default=0)     # bytes
    enabled = Column(Boolean, default=True)
    mock = Column(Boolean, default=True)           # akun mock atau real
    connected = Column(Boolean, default=False)     # sudah OAuth connect (real mode)
    created_at = Column(DateTime, default=utcnow)


class Setting(Base):
    """Key-value store untuk konfigurasi global (GOOGLE_CLIENT_ID, dll)."""
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True)
    key = Column(String(255), unique=True, index=True)
    value = Column(Text, default="")



class FileMeta(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), index=True)
    drive_file_id = Column(String(255), default="")  # id di Drive / mock
    name = Column(String(500))
    path = Column(String(1000), default="/", index=True)  # virtual path
    mime = Column(String(255), default="application/octet-stream")
    size = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=utcnow)

    account = relationship("Account")


class ApiKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True)
    key_hash = Column(String(255), unique=True, index=True)  # hash API key lama (bk_...)
    access_key_id = Column(String(64), default="", index=True)  # AWS-style AK ID (tampil)
    secret_hash = Column(String(255), default="")  # hash secret access key (bksec_...)
    label = Column(String(255), default="")
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class DriveMeta(Base):
    """Meta lokal per file/folder Google Drive: object tag + catatan.
    dipakai UI (klik kanan -> Object Tag / Metadata) tanpa ubah Drive."""
    __tablename__ = "drive_meta"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), index=True, default=0)
    drive_file_id = Column(String(255), index=True)
    tag = Column(String(255), default="")          # object tag
    note = Column(Text, default="")                # catatan bebas
    web_view_link = Column(Text, default="")       # cache link preview Drive
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


def init_db():
    Base.metadata.create_all(engine)
    # Migrasi ringan kolom baru (idempoten) — aman dijalankan berulang.
    _migrate_columns()


def _migrate_columns():
    sa = __import__("sqlalchemy")
    # migrasi per-tabel: accounts
    acct_cols = {c[1] for c in engine.connect().execute(
        sa.text("PRAGMA table_info(accounts)")).fetchall()}
    acct_wanted = {
        "connected": "BOOLEAN DEFAULT 0",
        "client_id": "TEXT DEFAULT ''",
        "client_secret_enc": "TEXT DEFAULT ''",
        "token_enc": "TEXT DEFAULT ''",
    }
    for col, ddl in acct_wanted.items():
        if col not in acct_cols:
            with engine.begin() as conn:
                conn.execute(sa.text(f"ALTER TABLE accounts ADD COLUMN {col} {ddl}"))
    # migrasi per-tabel: api_keys (Access Key gaya AWS)
    ak_cols = {c[1] for c in engine.connect().execute(
        sa.text("PRAGMA table_info(api_keys)")).fetchall()}
    ak_wanted = {
        "access_key_id": "TEXT DEFAULT ''",
        "secret_hash": "TEXT DEFAULT ''",
    }
    for col, ddl in ak_wanted.items():
        if col not in ak_cols:
            with engine.begin() as conn:
                conn.execute(sa.text(f"ALTER TABLE api_keys ADD COLUMN {col} {ddl}"))
    # migrate lama: refresh_token_enc -> token_enc
    if "refresh_token_enc" in acct_cols and "token_enc" in acct_cols:
        with engine.begin() as conn:
            conn.execute(sa.text(
                "UPDATE accounts SET token_enc = refresh_token_enc WHERE token_enc = '' AND refresh_token_enc != ''"))
        with engine.begin() as conn:
            conn.execute(sa.text("ALTER TABLE accounts DROP COLUMN refresh_token_enc"))
    if "settings" not in {t[0] for t in engine.connect().execute(
            __import__("sqlalchemy").text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}:
        Base.metadata.create_all(engine)
    # seed default mock accounts A-G + admin user + demo API key
    from app import auth as auth_mod
    with SessionLocal() as db:
        if db.query(Account).count() == 0:
            for letter in "ABCDEFG":
                db.add(Account(
                    email=f"mock-{letter.lower()}@drive.local",
                    label=f"Cloud {letter}",
                    mock=True,
                    quota_limit=15 * 1024 * 1024 * 1024,
                    quota_used=0,
                    enabled=True,
                ))
            db.commit()
        if db.query(User).count() == 0:
            db.add(User(
                email=auth_mod.ADMIN_EMAIL,
                password_hash=auth_mod.hash_password(auth_mod.ADMIN_PASSWORD),
                is_admin=True,
            ))
            db.commit()
        if db.query(ApiKey).count() == 0:
            # demo key: demo-key-123 (simpan di env nanti, ini cuma seed)
            demo = "demo-key-123"
            db.add(ApiKey(key_hash=auth_mod.hash_api_key(demo), label="demo", enabled=True))
            db.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Settings (global key-value) ----------
def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else default


def set_setting(db: Session, key: str, value: str):
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()
