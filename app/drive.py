"""Drive abstraction: mock (local) + real (Google Drive via API)."""
import os
import shutil
import json
from pathlib import Path

from app.config import DATA_DIR, DRIVE_MOCK, MOCK_ACCOUNT_LIMIT
from app import db as db_mod
from app.crypto import encrypt, decrypt


class MockDriveAccount:
    """Stores files locally under data/mock/<account_id>/ to simulate Drive."""
    def __init__(self, account):
        self.account = account
        self.root = DATA_DIR / "mock" / str(account.id)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, drive_file_id):
        return self.root / drive_file_id

    def upload(self, filename: str, data: bytes):
        drive_file_id = f"{abs(hash(filename + str(os.urandom(4))))}"
        with open(self._path(drive_file_id), "wb") as f:
            f.write(data)
        self.account.quota_used += len(data)
        return drive_file_id, len(data)

    def download(self, drive_file_id):
        p = self._path(drive_file_id)
        if not p.exists():
            return None
        return p.read_bytes()

    def delete(self, drive_file_id):
        p = self._path(drive_file_id)
        if p.exists():
            sz = p.stat().st_size
            p.unlink()
            self.account.quota_used = max(0, self.account.quota_used - sz)


class RealDriveAccount:
    """Google Drive via API. Token diambil dari account.token_enc (decrypt)."""
    def __init__(self, account):
        self.account = account
        self._tok = None
        self._creds_obj = None
        if account.token_enc:
            try:
                self._tok = json.loads(decrypt(account.token_enc))
            except Exception:
                self._tok = None
        else:
            self._tok = None

    def _get_creds(self):
        """Return Credentials dengan token yang SELALU segar.
        Karena kita punya refresh_token, paksa refresh tiap panggil supaya
        token yang dikasih ke browser tidak pernah expired. Token segar
        langsung disimpan balik ke DB (Fernet)."""
        if not self._tok:
            raise RuntimeError("Akun belum connect OAuth — klik Connect dulu")
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request as GoogleRequest
        creds = Credentials(
            token=self._tok.get("token"),
            refresh_token=self._tok.get("refresh_token") or self._tok.get("access_token"),
            client_id=self.account.client_id,
            client_secret=decrypt(self.account.client_secret_enc) if self.account.client_secret_enc else "",
            token_uri=self._tok.get("token_uri") or "https://oauth2.googleapis.com/token",
            scopes=self._tok.get("scopes") or ["https://www.googleapis.com/auth/drive"],
        )
        # paksa refresh -> token selalu valid
        try:
            creds.refresh(GoogleRequest())
        except Exception:
            pass
        # simpan token segar ke dict + DB
        if creds.token:
            self._tok["token"] = creds.token
            self._tok["scopes"] = list(creds.scopes or []) or self._tok.get("scopes")
            try:
                self.account.token_enc = encrypt(json.dumps(self._tok))
                from app import db as _db
                _db.SessionLocal().merge(self.account)
                _db.SessionLocal().commit()
            except Exception:
                pass
        return creds

    def _service(self):
        from googleapiclient.discovery import build
        return build("drive", "v3", credentials=self._get_creds())

    def direct_download_url(self, drive_file_id: str):
        """Kembalikan (url, method) untuk download langsung dari Google.
        - file biasa  -> (alt=media URL, 'bearer')  -> browser fetch + Authorization
        - file google-native (Docs/Sheets/...) -> (exportLinks/pdf, 'direct') -> buka langsung
        - folder -> raise (tidak bisa di-download)
        Trafik file TIDAK lewat VPS (VPS hanya kembalikan JSON kecil)."""
        creds = self._get_creds()
        svc = self._service()
        meta = svc.files().get(
            fileId=drive_file_id,
            fields="mimeType, name, exportLinks, webContentLink",
        ).execute()
        mime = meta.get("mimeType", "")
        if mime == "application/vnd.google-apps.folder":
            raise RuntimeError("Folder tidak bisa di-download")
        # google-native -> export ke PDF (langsung, tanpa header)
        if mime.startswith("application/vnd.google-apps."):
            links = meta.get("exportLinks") or {}
            url = links.get("application/pdf") or meta.get("webContentLink")
            if not url:
                raise RuntimeError("Tidak ada export link untuk file ini")
            return url, "direct"
        # file biasa -> alt=media + Bearer
        url = f"https://www.googleapis.com/drive/v3/files/{drive_file_id}?alt=media"
        return url, "bearer"

    def upload_session_url(self, filename: str, folder_id: str = "root",
                           mime_type: str = "application/octet-stream") -> str:
        """Mulai resumable upload session ke Google -> kembalikan URL session.
        Browser lalu PUT langsung ke Google -> trafik upload TIDAK lewat VPS."""
        from google.auth.transport.requests import AuthorizedSession
        creds = self._get_creds()
        parent = "root" if not folder_id or folder_id == "root" else folder_id
        meta = {"name": filename, "parents": [parent]}
        body = json.dumps(meta).encode()
        sess = AuthorizedSession(creds)
        r = sess.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
            headers={"X-Upload-Content-Type": mime_type, "Content-Type": "application/json"},
            data=body,
            timeout=30,
        )
        loc = r.headers.get("Location")
        if not loc:
            raise RuntimeError("Gagal memulai upload session: " + r.text[:200])
        return loc

    def upload(self, filename, data):
        svc = self._service()
        from googleapiclient.http import MediaIoBaseUpload
        import io
        meta = {"name": filename, "parents": ["root"]}
        fh = io.BytesIO(data)
        media = MediaIoBaseUpload(fh, mimetype="application/octet-stream", resumable=True)
        f = svc.files().create(body=meta, media_body=media, fields="id,size").execute()
        return f["id"], int(f.get("size", len(data)))

    def get_links(self, drive_file_id: str):
        """webContentLink + webViewLink (preview) langsung dari Google."""
        svc = self._service()
        meta = svc.files().get(
            fileId=drive_file_id,
            fields="webContentLink, webViewLink, mimeType, name",
        ).execute()
        return {
            "download_link": meta.get("webContentLink") or "",
            "preview_link": meta.get("webViewLink") or "",
            "mime_type": meta.get("mimeType", ""),
            "name": meta.get("name", ""),
        }

    def get_full_path(self, drive_file_id: str) -> str:
        """Path lengkap dari root, dipisah '/'. (e.g. /FolderA/Sub/File.pdf)"""
        svc = self._service()
        parts = []
        cur = drive_file_id
        seen = set()
        while cur and cur not in seen:
            seen.add(cur)
            try:
                m = svc.files().get(fileId=cur, fields="name, parents").execute()
            except Exception:
                break
            parts.append(m.get("name", "?"))
            parents = m.get("parents") or []
            cur = parents[0] if parents else None
            if cur == "root" or not parents:
                break
        parts.reverse()
        return "/" + "/".join(parts)

    def create_folder(self, name: str, parent_folder_id: str = "root") -> str:
        """Buat folder baru di Google Drive, return folder id."""
        svc = self._service()
        parent = "root" if not parent_folder_id or parent_folder_id == "root" else parent_folder_id
        meta = {"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent]}
        f = svc.files().create(body=meta, fields="id").execute()
        return f["id"]

    def get_metadata(self, drive_file_id: str) -> dict:
        """Metadata lengkap file/folder dari Google Drive."""
        svc = self._service()
        fields = ("id, name, mimeType, size, parents, modifiedTime, createdTime, "
                  "ownedByMe, permissions(id, type, role, emailAddress, displayName), "
                  "webViewLink, webContentLink, thumbnailLink, description, trashed")
        m = svc.files().get(fileId=drive_file_id, fields=fields).execute()
        return {
            "id": m.get("id"),
            "name": m.get("name"),
            "mime_type": m.get("mimeType"),
            "size": int(m.get("size", 0) or 0),
            "parents": m.get("parents", []),
            "created": m.get("createdTime"),
            "modified": m.get("modifiedTime"),
            "is_folder": m.get("mimeType") == "application/vnd.google-apps.folder",
            "owner_me": bool(m.get("ownedByMe")),
            "web_view_link": m.get("webViewLink") or "",
            "web_content_link": m.get("webContentLink") or "",
            "thumbnail_link": m.get("thumbnailLink") or "",
            "description": m.get("description") or "",
            "permissions": [
                {"id": p.get("id"), "type": p.get("type"), "role": p.get("role"),
                 "email": p.get("emailAddress"), "name": p.get("displayName")}
                for p in (m.get("permissions") or [])
            ],
        }

    def get_permissions(self, drive_file_id: str) -> list:
        svc = self._service()
        perms = svc.permissions().list(fileId=drive_file_id).execute().get("permissions", [])
        return [
            {"id": p.get("id"), "type": p.get("type"), "role": p.get("role"),
             "email": p.get("emailAddress"), "name": p.get("displayName")}
            for p in perms
        ]

    def set_public(self, drive_file_id: str, public: bool):
        """Set file public (anyone reader) or private (hapus permission anyone)."""
        svc = self._service()
        if public:
            svc.permissions().create(
                fileId=drive_file_id,
                body={"role": "reader", "type": "anyone"},
                fields="id",
            ).execute()
        else:
            for p in svc.permissions().list(fileId=drive_file_id).execute().get("permissions", []):
                if p.get("type") == "anyone":
                    svc.permissions().delete(fileId=drive_file_id, permissionId=p["id"]).execute()

    def upload_to_folder(self, filename, data, parent_folder_id="root"):
        """Upload file ke folder tertentu di Google Drive (bukan root)."""
        svc = self._service()
        from googleapiclient.http import MediaIoBaseUpload
        import io
        parent = "root" if not parent_folder_id or parent_folder_id == "root" else parent_folder_id
        meta = {"name": filename, "parents": [parent]}
        fh = io.BytesIO(data)
        media = MediaIoBaseUpload(fh, mimetype="application/octet-stream", resumable=True)
        f = svc.files().create(body=meta, media_body=media, fields="id,size").execute()
        return f["id"], int(f.get("size", len(data)))

    def download(self, drive_file_id):
        svc = self._service()
        import io
        fh = io.BytesIO()
        svc.files().get_media(fileId=drive_file_id).execute_media_to_fd(fh)
        return fh.getvalue()

    def download_with_name(self, drive_file_id):
        """Download + kembalikan (name, mime, bytes)."""
        svc = self._service()
        import io
        meta = svc.files().get(fileId=drive_file_id, fields="name,mimeType").execute()
        fh = io.BytesIO()
        svc.files().get_media(fileId=drive_file_id).execute_media_to_fd(fh)
        return meta.get("name", "file"), meta.get("mimeType", ""), fh.getvalue()

    def delete(self, drive_file_id):
        svc = self._service()
        svc.files().delete(fileId=drive_file_id).execute()

    def list_folder(self, folder_id: str = "root"):
        """List file & folder asli dari Google Drive dalam folder tertentu.
        Return list dict: {id, name, mime_type, size, is_folder, parents}."""
        from googleapiclient.errors import HttpError
        svc = self._service()
        parent = "root" if not folder_id or folder_id == "root" else folder_id
        q = f"'{parent}' in parents and trashed = false"
        out = []
        page = None
        while True:
            try:
                resp = svc.files().list(
                    q=q,
                    spaces="drive",
                    fields="nextPageToken, files(id, name, mimeType, size, parents, modifiedTime)",
                    orderBy="folder, name",
                    pageToken=page,
                ).execute()
            except HttpError as e:
                raise RuntimeError("Gagal membaca Drive: " + str(e))
            for f in resp.get("files", []):
                mime = f.get("mimeType", "")
                out.append({
                    "id": f["id"],
                    "name": f.get("name", "(tanpa nama)"),
                    "mime_type": mime,
                    "is_folder": mime == "application/vnd.google-apps.folder",
                    "size": int(f.get("size", 0) or 0),
                    "parents": f.get("parents", []),
                    "modified": f.get("modifiedTime", ""),
                })
            page = resp.get("nextPageToken")
            if not page:
                break
        out.sort(key=lambda x: (not x["is_folder"], x["name"].lower()))
        return out

    def refresh_quota(self):
        """Auto-detect kapasitas maksimal + usage dari Google Drive via about.get().
        Return (limit_bytes, usage_bytes)."""
        svc = self._service()
        about = svc.about().get(fields="storageQuota").execute()
        q = about.get("storageQuota", {})
        limit = int(q.get("limit", 0) or 0)
        usage = int(q.get("usage", 0) or 0)
        return limit, usage


def refresh_account_quota(account, db):
    """Update quota_limit/quota_used akun dari sumber sebenarnya.
    - Mock: pakai quota_limit terkonfigurasi.
    - Real (connected): panggil Drive about.get() untuk auto-detect kapasitas maksimal.
    Return (limit, used)."""
    if account.mock or not account.token_enc:
        return account.quota_limit or 0, account.quota_used or 0
    da = RealDriveAccount(account)
    limit, usage = da.refresh_quota()
    if limit:
        account.quota_limit = limit
    account.quota_used = usage
    db.commit()
    return account.quota_limit, account.quota_used


def get_drive_account(account):
    if DRIVE_MOCK or account.mock:
        return MockDriveAccount(account)
    return RealDriveAccount(account)


def pick_account(db):
    """Sharding: pilih akun (enabled) dg rasio used/limit terendah & masih ada ruang."""
    accounts = db.query(db_mod.Account).filter(db_mod.Account.enabled == True).all()  # noqa: E712
    if not accounts:
        return None
    best = None
    best_ratio = 1.1
    for a in accounts:
        limit = a.quota_limit or MOCK_ACCOUNT_LIMIT
        ratio = (a.quota_used or 0) / limit if limit else 1.0
        if ratio < best_ratio:
            best_ratio = ratio
            best = a
    if best and (best.quota_used or 0) >= (best.quota_limit or MOCK_ACCOUNT_LIMIT):
        return None
    return best
