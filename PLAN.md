# PLAN — Bucket Pribadi (Google Drive Pool Aggregator)

## Konsep
Aplikasi web pribadi yang menggabungkan beberapa akun Google Drive (email A–G) menjadi
satu "Bucket" penyimpanan terpadu. Berjalan *always-on* di VPS, diakses oleh beberapa
orang via login, dan dikendalikan penuh lewat **API Key** (REST: GET/POST/DELETE/PATCH/SEARCH).

## Arsitektur
- **Backend:** Python + FastAPI
- **DB:** SQLite (user, akun Drive, API key, metadata file)
- **Storage:** Google Drive tiap akun (via Drive API). Mode `MOCK` untuk dev (file disimpan lokal).
- **Auth Web:** login email+password (beberapa operator tepercaya) → session cookie (HMAC signed)
- **Auth API:** API Key via header `X-API-Key`
- **Frontend:** React + Tailwind (dark enterprise) — tahap berikutnya
- **Hosting:** VPS + Cloudflare Tunnel → `drive.losiento.dev`

## Model Data
- `users` — operator yang login ke app
- `accounts` — akun Google Drive terhubung (A–G): email, refresh_token (terenkripsi), quota_limit, quota_used, enabled
- `files` — metadata: id, account_id, drive_file_id, name, path, mime, size, created_at
- `api_keys` — token (hash disimpan), label, enabled

## Sharding / Distribusi File
Upload → pilih akun dengan rasio `used/limit` terendah yang masih punya ruang →
simpan ke Drive akun itu → simpan metadata ke SQLite. Download/delete/restore lookup via metadata.

## Kapasitas
Tampilkan per-akun (limit/used) + total agregat. Di real mode, di-sync via Drive `about.get`.

## Endpoint (API v1, butuh X-API-Key)
- `GET  /api/v1/health`
- `GET  /api/v1/accounts`            → daftar akun + kapasitas
- `POST /api/v1/accounts/connect`    → mulai koneksi OAuth (real)
- `POST /api/v1/upload`              → upload file (multipart)
- `GET  /api/v1/files?path=&account=`→ list file
- `GET  /api/v1/files/{id}/download`
- `PATCH /api/v1/files/{id}`         → rename / move (ubah virtual path)
- `DELETE /api/v1/files/{id}`
- `GET  /api/v1/search?q=`           → cari file by nama/path

## Web (butuh login)
- Dashboard kapasitas (total + per akun)
- File browser CRUD + search
- Manajemen API Key

## Prasyarat Manual (user lakukan 1x)
1. Google Cloud Console → buat project → enable **Google Drive API**
2. OAuth Consent Screen (External, add test users A–G)
3. Credentials → OAuth Client ID (Web) → dapat `CLIENT_ID` + `CLIENT_SECRET`
4. Isi `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`
5. Di app: connect tiap akun A–G via flow → refresh token tersimpan terenkripsi

## Fase
1. ✅ Backend skeleton + mock drive + auth + API (selesai awal)
2. ⏳ Google OAuth real + Drive service asli
3. ⏳ Frontend React dark
4. ⏳ Deploy VPS + Cloudflare Tunnel
5. ⏳ E2E test + hardening
