from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

from app import db as db_mod
from app.auth import (
    verify_password, verify_session_token, make_session_token,
    generate_api_key, hash_api_key, verify_api_key, hash_password,
    generate_access_key_id, generate_secret_access_key, hash_secret, verify_secret,
    make_csrf_token, verify_csrf_token,
)
from app import drive as drive_mod
from app import config as cfg
from app.crypto import encrypt, decrypt

router = APIRouter()
COOKIE_NAME = "bk_session"


# ---------- deps ----------
def get_db():
    yield from db_mod.get_db()


def _valid_api_key(key: str, db: Session):
    """Validate API key. Returns (True, ApiKeyRecord) or (False, None)."""
    if not key:
        return False, None
    # legacy bk_ key
    rec = db.query(db_mod.ApiKey).filter(
        db_mod.ApiKey.key_hash == hash_api_key(key),
        db_mod.ApiKey.enabled == True,  # noqa: E712
    ).first()
    if rec:
        return True, rec
    # AWS-style secret access key (bksec_...) — agent kirim secret sebagai X-API-Key
    rec2 = db.query(db_mod.ApiKey).filter(
        db_mod.ApiKey.secret_hash == hash_secret(key),
        db_mod.ApiKey.enabled == True,  # noqa: E712
    ).first()
    return (True, rec2) if rec2 else (False, None)


def _valid_session(request: Request, db: Session):
    """Returns claims dict or None."""
    token = getattr(request.state, "session_cookie", None)
    if not token:
        return None
    claims = verify_session_token(token)
    if not claims:
        return None
    user = db.query(db_mod.User).filter(db_mod.User.email == claims["email"]).first()
    if not user:
        return None
    return claims


def require_api_key(request: Request, x_api_key: str = Header(None), db: Session = Depends(get_db)):
    # Terima X-API-Key ATAU session login (web UI).
    ok, rec = _valid_api_key(x_api_key, db)
    if ok:
        return rec  # return ApiKey record or True-like
    claims = _valid_session(request, db)
    if claims:
        return True  # session-based auth
    raise HTTPException(401, "Missing X-API-Key header or session")


def _require_write_scope(request: Request, x_api_key: str = Header(None), db: Session = Depends(get_db)):
    """Like require_api_key but enforces write scope for API keys."""
    ok, rec = _valid_api_key(x_api_key, db)
    if ok and rec is not None and rec is not True:
        # API key auth — check scope
        if hasattr(rec, 'scope') and rec.scope == "read":
            raise HTTPException(403, "API key has read-only scope")
        return rec
    if ok:
        return rec
    claims = _valid_session(request, db)
    if claims:
        return True
    raise HTTPException(401, "Missing X-API-Key header or session")


def require_web_login(request: Request, db: Session = Depends(get_db)):
    token = getattr(request.state, "session_cookie", None)
    if not token:
        raise HTTPException(401, "Not authenticated")
    claims = verify_session_token(token)
    if not claims:
        raise HTTPException(401, "Bad session")
    user = db.query(db_mod.User).filter(db_mod.User.email == claims["email"]).first()
    if not user:
        raise HTTPException(401, "Unknown user")
    return user


def _require_csrf(request: Request, db: Session = Depends(get_db)):
    """Enforce CSRF for state-changing session requests."""
    token = getattr(request.state, "session_cookie", None)
    if not token:
        return  # no session = API key, no CSRF needed
    claims = verify_session_token(token)
    if not claims:
        return
    csrf_header = request.headers.get("X-CSRF-Token", "")
    session_id = claims["email"]
    if not csrf_header or not verify_csrf_token(session_id, csrf_header):
        raise HTTPException(403, "CSRF token missing or invalid")


# ---------- auth (web login) ----------
class LoginIn(BaseModel):
    login: str
    password: str


@router.post("/api/v1/auth/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    # Accept both username and email for login
    user = db.query(db_mod.User).filter(
        (db_mod.User.email == payload.login) | (db_mod.User.username == payload.login)
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = make_session_token(user.email, session_version=user.session_version)
    csrf = make_csrf_token(user.email)
    secure = cfg.COOKIE_SECURE
    response.set_cookie(
        COOKIE_NAME, token,
        httponly=True, samesite="strict", path="/",
        secure=secure, max_age=86400,
    )
    return {
        "ok": True,
        "email": user.email,
        "username": user.username or user.email.split("@")[0],
        "is_admin": user.is_admin,
        "csrf_token": csrf,
    }


@router.post("/api/v1/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/api/v1/auth/me")
def auth_me(user: db_mod.User = Depends(require_web_login)):
    return {"ok": True, "email": user.email, "username": user.username, "is_admin": user.is_admin}


# ---------- API v1 (X-API-Key) ----------
@router.get("/api/v1/health")
def health():
    return {"status": "ok"}


@router.get("/api/v1/accounts")
def list_accounts(_: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db)):
    accs = db.query(db_mod.Account).all()
    total_limit = sum(a.quota_limit or 0 for a in accs)
    total_used = sum(a.quota_used or 0 for a in accs)
    return {
        "total": {"limit": total_limit, "used": total_used, "free": total_limit - total_used},
        "accounts": [
            {
                "id": a.id, "email": a.email, "label": a.label,
                "limit": a.quota_limit, "used": a.quota_used,
                "free": (a.quota_limit or 0) - (a.quota_used or 0),
                "enabled": a.enabled, "mock": a.mock, "connected": a.connected,
            } for a in accs
        ],
    }


@router.post("/api/v1/upload")
async def upload(
    request: Request,
    file: UploadFile = File(...),
    path: str = Form("/"),
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    data = await file.read()
    account = drive_mod.pick_account(db)
    if not account:
        raise HTTPException(507, "No Drive account has free space")
    drv = drive_mod.get_drive_account(account)
    drive_file_id, size = drv.upload(file.filename or "untitled", data)
    fm = db_mod.FileMeta(
        account_id=account.id,
        drive_file_id=drive_file_id,
        name=file.filename or "untitled",
        path=path.rstrip("/") or "/",
        mime=file.content_type or "application/octet-stream",
        size=size,
    )
    db.add(fm)
    db.commit()
    db.refresh(fm)
    return {"ok": True, "file_id": fm.id, "account": account.label, "size": size}


@router.get("/api/v1/files")
def list_files(
    path: str = "/", account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    q = db.query(db_mod.FileMeta)
    if path != "/":
        q = q.filter(db_mod.FileMeta.path == path.rstrip("/"))
    if account_id:
        q = q.filter(db_mod.FileMeta.account_id == account_id)
    items = q.order_by(db_mod.FileMeta.created_at.desc()).all()
    return {"count": len(items), "files": [
        {"id": f.id, "name": f.name, "path": f.path, "mime": f.mime,
         "size": f.size, "account_id": f.account_id, "created_at": str(f.created_at)}
        for f in items
    ]}


@router.get("/api/v1/search")
def search(q: str = "", _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db)):
    like = f"%{q}%"
    items = db.query(db_mod.FileMeta).filter(
        db_mod.FileMeta.name.ilike(like) | db_mod.FileMeta.path.ilike(like)
    ).order_by(db_mod.FileMeta.created_at.desc()).all()
    return {"count": len(items), "files": [
        {"id": f.id, "name": f.name, "path": f.path, "mime": f.mime,
         "size": f.size, "account_id": f.account_id, "created_at": str(f.created_at)}
        for f in items
    ]}


# ---------- Live Google Drive browser (real files & folders) ----------
@router.get("/api/v1/drive/browse")
def drive_browse(
    account_id: int = None, folder_id: str = "root",
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    if account_id:
        acc = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    else:
        acc = db.query(db_mod.Account).filter(
            db_mod.Account.enabled == True, db_mod.Account.mock == False,  # noqa: E712
            db_mod.Account.token_enc != "",
        ).order_by(db_mod.Account.id).first()
    if not acc:
        raise HTTPException(404, "Tidak ada akun real Drive yang connect")
    if acc.mock or not acc.token_enc:
        raise HTTPException(400, "Akun ini mock/belum connect OAuth")
    drv = drive_mod.RealDriveAccount(acc)
    items = drv.list_folder(folder_id)
    return {"account": {"id": acc.id, "email": acc.email, "label": acc.label},
            "folder_id": folder_id, "items": items}


@router.post("/api/v1/drive/upload")
async def drive_upload(
    request: Request,
    file: UploadFile = File(...),
    folder_id: str = Form("root"),
    account_id: int = Form(None),
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    if account_id:
        acc = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    else:
        acc = db.query(db_mod.Account).filter(
            db_mod.Account.enabled == True, db_mod.Account.mock == False,  # noqa: E712
            db_mod.Account.token_enc != "",
        ).order_by(db_mod.Account.id).first()
    if not acc or acc.mock or not acc.token_enc:
        raise HTTPException(400, "Tidak ada akun real Drive yang connect")
    data = await file.read()
    drv = drive_mod.RealDriveAccount(acc)
    parent = "root" if not folder_id or folder_id == "root" else folder_id
    fid, size = drv.upload_to_folder(file.filename or "untitled", data, parent)
    try:
        drive_mod.refresh_account_quota(acc, db)
    except Exception:
        pass
    return {"ok": True, "drive_file_id": fid, "account": acc.label, "size": size}


@router.delete("/api/v1/drive/files/{drive_file_id}")
def drive_delete(
    request: Request,
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    if account_id:
        acc = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    else:
        acc = db.query(db_mod.Account).filter(
            db_mod.Account.enabled == True, db_mod.Account.mock == False,  # noqa: E712
            db_mod.Account.token_enc != "",
        ).order_by(db_mod.Account.id).first()
    if not acc or acc.mock or not acc.token_enc:
        raise HTTPException(400, "Tidak ada akun real Drive yang connect")
    drv = drive_mod.RealDriveAccount(acc)
    drv.delete(drive_file_id)
    try:
        drive_mod.refresh_account_quota(acc, db)
    except Exception:
        pass
    return {"ok": True}


@router.get("/api/v1/drive/files/{drive_file_id}/download")
def drive_download(
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    if account_id:
        acc = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    else:
        acc = db.query(db_mod.Account).filter(
            db_mod.Account.enabled == True, db_mod.Account.mock == False,  # noqa: E712
            db_mod.Account.token_enc != "",
        ).order_by(db_mod.Account.id).first()
    if not acc or acc.mock or not acc.token_enc:
        raise HTTPException(400, "Tidak ada akun real Drive yang connect")
    drv = drive_mod.RealDriveAccount(acc)
    try:
        url, method = drv.direct_download_url(drive_file_id)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    # SECURITY: never return the bearer token to the client
    return {"url": url, "method": method}


@router.get("/api/v1/drive/files/{drive_file_id}/link")
def drive_link(
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    return drive_download(drive_file_id, account_id, db=db)


def _pick_real_account(db: Session, account_id: int = None):
    if account_id:
        acc = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    else:
        acc = db.query(db_mod.Account).filter(
            db_mod.Account.enabled == True, db_mod.Account.mock == False,  # noqa: E712
            db_mod.Account.token_enc != "",
        ).order_by(db_mod.Account.id).first()
    if not acc or acc.mock or not acc.token_enc:
        raise HTTPException(400, "Tidak ada akun real Drive yang connect")
    return acc


@router.post("/api/v1/drive/folders")
def drive_create_folder(
    request: Request,
    payload: dict,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    name = (payload.get("name") or "").strip()
    folder_id = payload.get("folder_id", "root") or "root"
    if not name:
        raise HTTPException(400, "Nama folder wajib")
    acc = _pick_real_account(db, account_id)
    drv = drive_mod.RealDriveAccount(acc)
    fid = drv.create_folder(name, folder_id)
    return {"ok": True, "folder_id": fid, "name": name}


@router.get("/api/v1/drive/files/{drive_file_id}/metadata")
def drive_metadata(
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    acc = _pick_real_account(db, account_id)
    drv = drive_mod.RealDriveAccount(acc)
    meta = drv.get_metadata(drive_file_id)
    dm = db.query(db_mod.DriveMeta).filter(
        db_mod.DriveMeta.drive_file_id == drive_file_id,
        db_mod.DriveMeta.account_id == acc.id,
    ).first()
    meta["tag"] = dm.tag if dm else ""
    meta["note"] = dm.note if dm else ""
    return meta


@router.put("/api/v1/drive/files/{drive_file_id}/meta")
def drive_set_meta(
    request: Request,
    drive_file_id: str, payload: dict,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    acc = _pick_real_account(db, account_id)
    tag = payload.get("tag", "")
    note = payload.get("note", "")
    dm = db.query(db_mod.DriveMeta).filter(
        db_mod.DriveMeta.drive_file_id == drive_file_id,
        db_mod.DriveMeta.account_id == acc.id,
    ).first()
    if not dm:
        dm = db_mod.DriveMeta(drive_file_id=drive_file_id, account_id=acc.id)
        db.add(dm)
    dm.tag = tag
    dm.note = note
    db.commit()
    return {"ok": True, "tag": tag, "note": note}


@router.get("/api/v1/drive/files/{drive_file_id}/path")
def drive_path(
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    acc = _pick_real_account(db, account_id)
    drv = drive_mod.RealDriveAccount(acc)
    return {"path": drv.get_full_path(drive_file_id)}


@router.get("/api/v1/drive/files/{drive_file_id}/permissions")
def drive_permissions(
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    acc = _pick_real_account(db, account_id)
    drv = drive_mod.RealDriveAccount(acc)
    perms = drv.get_permissions(drive_file_id)
    is_public = any(p.get("type") == "anyone" for p in perms)
    return {"permissions": perms, "is_public": is_public}


@router.post("/api/v1/drive/files/{drive_file_id}/permission")
def drive_set_permission(
    request: Request,
    drive_file_id: str, payload: dict,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    public = bool(payload.get("public", False))
    acc = _pick_real_account(db, account_id)
    drv = drive_mod.RealDriveAccount(acc)
    drv.set_public(drive_file_id, public)
    return {"ok": True, "public": public}


@router.get("/api/v1/drive/files/{drive_file_id}/links")
def drive_links(
    drive_file_id: str,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db),
):
    acc = _pick_real_account(db, account_id)
    drv = drive_mod.RealDriveAccount(acc)
    return drv.get_links(drive_file_id)


@router.post("/api/v1/drive/upload-url")
def drive_upload_url(
    request: Request,
    payload: dict,
    account_id: int = None,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    filename = payload.get("filename", "untitled")
    folder_id = payload.get("folder_id", "root")
    mime = payload.get("mime", "application/octet-stream")
    if account_id:
        acc = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    else:
        acc = db.query(db_mod.Account).filter(
            db_mod.Account.enabled == True, db_mod.Account.mock == False,  # noqa: E712
            db_mod.Account.token_enc != "",
        ).order_by(db_mod.Account.id).first()
    if not acc or acc.mock or not acc.token_enc:
        raise HTTPException(400, "Tidak ada akun real Drive yang connect")
    drv = drive_mod.RealDriveAccount(acc)
    try:
        session_uri = drv.upload_session_url(filename, folder_id, mime)
    except Exception as e:
        raise HTTPException(502, "Gagal buat upload session: " + str(e)[:300])
    return {"upload_url": session_uri}


@router.get("/api/v1/files/{file_id}/download")
def download(file_id: int, _: db_mod.ApiKey = Depends(require_api_key), db: Session = Depends(get_db)):
    fm = db.query(db_mod.FileMeta).filter(db_mod.FileMeta.id == file_id).first()
    if not fm:
        raise HTTPException(404, "File not found")
    account = fm.account
    drv = drive_mod.get_drive_account(account)
    data = drv.download(fm.drive_file_id)
    if data is None:
        raise HTTPException(404, "File blob missing")
    return Response(content=data, media_type=fm.mime,
                    headers={"Content-Disposition": f'attachment; filename="{fm.name}"'})


@router.patch("/api/v1/files/{file_id}")
def rename_move(
    request: Request,
    file_id: int, payload: dict,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    fm = db.query(db_mod.FileMeta).filter(db_mod.FileMeta.id == file_id).first()
    if not fm:
        raise HTTPException(404, "File not found")
    if "name" in payload:
        fm.name = payload["name"]
    if "path" in payload:
        fm.path = payload["path"].rstrip("/") or "/"
    db.commit()
    return {"ok": True, "id": fm.id, "name": fm.name, "path": fm.path}


@router.delete("/api/v1/files/{file_id}")
def delete(
    request: Request,
    file_id: int,
    _: db_mod.ApiKey = Depends(_require_write_scope),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    fm = db.query(db_mod.FileMeta).filter(db_mod.FileMeta.id == file_id).first()
    if not fm:
        raise HTTPException(404, "File not found")
    account = fm.account
    drv = drive_mod.get_drive_account(account)
    drv.delete(fm.drive_file_id)
    db.delete(fm)
    db.commit()
    return {"ok": True}


# ---------- Access Keys (gaya AWS S3) ----------
@router.post("/api/v1/access-keys")
def create_access_key(
    request: Request,
    user: db_mod.User = Depends(require_web_login),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    ak = generate_access_key_id()
    secret = generate_secret_access_key()
    db.add(db_mod.ApiKey(
        access_key_id=ak,
        secret_hash=hash_secret(secret),
        key_hash=ak,  # placeholder unik (access key baru tdk pakai legacy key_hash)
        label=user.email,
        enabled=True,
    ))
    db.commit()
    # secret hanya tampil sekali
    return {"access_key_id": ak, "secret_access_key": secret}


@router.get("/api/v1/access-keys")
def list_access_keys(user: db_mod.User = Depends(require_web_login), db: Session = Depends(get_db)):
    rows = db.query(db_mod.ApiKey).order_by(db_mod.ApiKey.id.desc()).all()
    return {"keys": [
        {"id": k.id, "access_key_id": k.access_key_id, "label": k.label,
         "enabled": k.enabled, "created_at": k.created_at.isoformat() if k.created_at else ""}
        for k in rows if k.access_key_id
    ]}


@router.delete("/api/v1/access-keys/{key_id}")
def revoke_access_key(
    request: Request,
    key_id: int,
    user: db_mod.User = Depends(require_web_login),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    k = db.query(db_mod.ApiKey).filter(db_mod.ApiKey.id == key_id).first()
    if not k or not k.access_key_id:
        raise HTTPException(404, "Access key tidak ditemukan")
    k.enabled = False
    db.commit()
    return {"ok": True}


@router.post("/api/v1/access-keys/{key_id}/rotate")
def rotate_access_key(
    request: Request,
    key_id: int,
    user: db_mod.User = Depends(require_web_login),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    k = db.query(db_mod.ApiKey).filter(db_mod.ApiKey.id == key_id).first()
    if not k or not k.access_key_id:
        raise HTTPException(404, "Access key tidak ditemukan")
    secret = generate_secret_access_key()
    k.secret_hash = hash_secret(secret)
    k.enabled = True
    db.commit()
    return {"access_key_id": k.access_key_id, "secret_access_key": secret}


# ---------- Domain setting (admin) ----------
@router.get("/api/v1/settings/domain")
def get_domain(user: db_mod.User = Depends(require_web_login), db: Session = Depends(get_db)):
    return {"domain": db_mod.get_setting(db, "BUCKET_DOMAIN", "")}


@router.put("/api/v1/settings/domain")
def set_domain(
    request: Request,
    payload: dict,
    user: db_mod.User = Depends(require_web_login),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    dom = (payload.get("domain") or "").strip().rstrip("/")
    db_mod.set_setting(db, "BUCKET_DOMAIN", dom)
    return {"domain": dom}


# ---------- Admin-only guard ----------
def require_admin(request: Request, db: Session = Depends(get_db)):
    user = require_web_login(request, db)
    if not user.is_admin:
        raise HTTPException(403, "Super admin only")
    return user


def _acct_out(a):
    return {
        "id": a.id, "email": a.email, "label": a.label,
        "client_id": a.client_id, "has_client_secret": bool(a.client_secret_enc),
        "mock": a.mock, "connected": a.connected, "enabled": a.enabled,
        "quota_limit": a.quota_limit, "quota_used": a.quota_used,
        "has_token": bool(a.token_enc),
    }


# ---------- Public registration ----------
class RegisterIn(BaseModel):
    username: str = ""
    email: str
    password: str


@router.post("/api/v1/auth/register")
def public_register(payload: RegisterIn, db: Session = Depends(get_db)):
    import re
    if not cfg.ALLOW_PUBLIC_REGISTRATION:
        raise HTTPException(403, "Public registration is disabled")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", payload.email):
        raise HTTPException(400, "Email tidak valid")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password minimal 6 karakter")
    if db.query(db_mod.User).filter(db_mod.User.email == payload.email).first():
        raise HTTPException(409, "Email sudah terdaftar")
    db.add(db_mod.User(
        username=payload.username or payload.email.split("@")[0],
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_admin=False,
    ))
    db.commit()
    return {"ok": True, "email": payload.email}


# ---------- Super Admin: Google Drive accounts ----------
class AccountIn(BaseModel):
    email: str
    label: str = ""
    mock: bool = False
    quota_limit: int = 0
    client_id: str = ""
    client_secret: str = ""


@router.get("/api/v1/admin/accounts")
def admin_list_accounts(_: db_mod.User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"accounts": [_acct_out(a) for a in db.query(db_mod.Account).order_by(db_mod.Account.id).all()]}


@router.post("/api/v1/admin/accounts")
def admin_create_account(
    request: Request,
    payload: AccountIn,
    _: db_mod.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    if db.query(db_mod.Account).filter(db_mod.Account.email == payload.email).first():
        raise HTTPException(409, "Email sudah terdaftar")
    acct = db_mod.Account(
        email=payload.email,
        label=payload.label or payload.email,
        mock=payload.mock,
        quota_limit=payload.quota_limit or cfg.MOCK_ACCOUNT_LIMIT,
        enabled=True,
        client_id=payload.client_id,
        client_secret_enc=encrypt(payload.client_secret) if payload.client_secret else "",
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return {"ok": True, "account": _acct_out(acct)}


@router.patch("/api/v1/admin/accounts/{account_id}")
def admin_update_account(
    request: Request,
    account_id: int, payload: dict,
    _: db_mod.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    a = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    if not a:
        raise HTTPException(404, "Account not found")
    for f in ("email", "label", "mock", "enabled", "quota_limit", "client_id"):
        if f in payload:
            setattr(a, f, payload[f])
    if "client_secret" in payload and payload["client_secret"]:
        a.client_secret_enc = encrypt(payload["client_secret"])
    db.commit()
    return {"ok": True, "account": _acct_out(a)}


@router.delete("/api/v1/admin/accounts/{account_id}")
def admin_delete_account(
    request: Request,
    account_id: int,
    _: db_mod.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    a = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    if not a:
        raise HTTPException(404, "Account not found")
    if a.mock is False and a.connected:
        raise HTTPException(400, "Putuskan koneksi OAuth dulu sebelum hapus")
    db.delete(a)
    db.commit()
    return {"ok": True}


@router.get("/api/v1/admin/me")
def admin_me(user: db_mod.User = Depends(require_admin)):
    return {"email": user.email, "is_admin": user.is_admin}


# ---------- Super Admin: global settings ----------
@router.get("/api/v1/admin/settings")
def admin_get_settings(_: db_mod.User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "oauth_redirect_uri": db_mod.get_setting(db, "OAUTH_REDIRECT_URI"),
        "drive_mock": db_mod.get_setting(db, "DRIVE_MOCK", "true"),
    }


@router.post("/api/v1/admin/settings")
def admin_save_settings(
    request: Request,
    payload: dict,
    _: db_mod.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    for k in ("OAUTH_REDIRECT_URI", "DRIVE_MOCK"):
        if k in payload:
            db_mod.set_setting(db, k, str(payload[k]))
    return {"ok": True}


# ---------- Google OAuth connect (real mode, per-akun) ----------
@router.get("/api/v1/admin/accounts/{account_id}/connect")
def admin_connect(account_id: int, request: Request, _: db_mod.User = Depends(require_admin), db: Session = Depends(get_db)):
    from urllib.parse import urlencode
    a = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    if not a:
        raise HTTPException(404, "Account not found")
    cid = a.client_id
    if not cid:
        raise HTTPException(400, "Set Google Client ID di akun ini dulu")
    redirect = db_mod.get_setting(db, "OAUTH_REDIRECT_URI") \
        or str(request.base_url).rstrip("/") + "/api/v1/admin/accounts/oauth/callback"
    params = urlencode({
        "client_id": cid,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file openid",
        "access_type": "offline",
        "prompt": "consent",
        "state": str(account_id),
    })
    return {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth?" + params}


@router.get("/api/v1/admin/accounts/oauth/callback")
def admin_oauth_callback(code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    try:
        if error:
            return JSONResponse({"error": error}, status_code=400)
        if not code or not state:
            raise HTTPException(400, "Missing code/state")
        a = db.query(db_mod.Account).filter(db_mod.Account.id == int(state)).first()
        if not a:
            raise HTTPException(404, "Account not found")
        redirect = db_mod.get_setting(db, "OAUTH_REDIRECT_URI") \
            or "http://localhost:8000/api/v1/admin/accounts/oauth/callback"
        secret = decrypt(a.client_secret_enc) if a.client_secret_enc else ""
        import requests
        print(f"[oauth-cb] account={a.id} exchanging code (len={len(code)})...")
        last_body = ""
        for attempt in range(2):
            r = requests.post("https://oauth2.googleapis.com/token", data={
                "code": code,
                "client_id": a.client_id,
                "client_secret": secret,
                "redirect_uri": redirect,
                "grant_type": "authorization_code",
            }, timeout=30)
            last_body = r.text
            print(f"[oauth-cb] attempt {attempt} status={r.status_code} body={r.text[:400]}")
            if r.status_code == 200:
                break
            if "invalid_grant" in r.text and attempt == 0:
                import time
                time.sleep(2)
        if r.status_code != 200:
            return JSONResponse(
                {"error": "token_exchange_failed", "google_status": r.status_code, "google_detail": r.text[:500]},
                status_code=400,
            )
        a.token_enc = encrypt(json.dumps(r.json()))
        a.connected = True
        db.commit()
        print(f"[oauth-cb] account={a.id} connected.")
        return {"ok": True, "account_id": a.id, "email": a.email, "connected": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[oauth-cb] ERROR: {type(e).__name__}: {e}")
        return JSONResponse({"error": "oauth_callback_error", "detail": str(e)[:300]}, status_code=400)


# expose cookie name for frontend
@router.get("/api/v1/_cookie")
def cookie_name():
    return {"cookie": COOKIE_NAME}


# ---------- Auto-detect kapasitas akun ----------
@router.post("/api/v1/admin/accounts/{account_id}/refresh-capacity")
def admin_refresh_capacity(
    request: Request,
    account_id: int,
    _: db_mod.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_csrf(request, db)
    from app import drive as drive_mod
    a = db.query(db_mod.Account).filter(db_mod.Account.id == account_id).first()
    if not a:
        raise HTTPException(404, "Account not found")
    try:
        limit, used = drive_mod.refresh_account_quota(a, db)
    except Exception as e:
        raise HTTPException(502, "Gagal auto-detect kapasitas: " + str(e)[:300])
    return {"ok": True, "account": _acct_out(a), "quota_limit": limit, "quota_used": used}
