import importlib

from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path, *, registration="false"):
    monkeypatch.setenv("BUCKET_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SECRET_KEY", "s" * 64)
    monkeypatch.setenv("ADMIN_USERNAME", "termul")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "strong-admin-password")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DRIVE_MOCK", "false")
    monkeypatch.setenv("ALLOW_PUBLIC_REGISTRATION", registration)
    monkeypatch.setenv("COOKIE_SECURE", "false")

    import app.config as config
    import app.auth as auth
    import app.crypto as crypto
    import app.db as db
    import app.drive as drive
    import app.routes as routes
    import app.main as main

    for module in (config, auth, crypto, db, drive, routes, main):
        importlib.reload(module)
    return TestClient(main.create_app()), db


def test_public_registration_is_disabled_by_default(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)

    response = client.post(
        "/api/v1/auth/register",
        json={"username": "someone", "email": "person@example.com", "password": "password123"},
    )

    assert response.status_code == 403


def test_login_accepts_username_and_sets_secure_session_contract(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)

    response = client.post(
        "/api/v1/auth/login",
        json={"login": "termul", "password": "strong-admin-password"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "termul"
    assert body["email"] == "admin@example.com"
    assert "password" not in body
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "max-age=" in cookie
    assert body["csrf_token"]


def test_state_changing_session_request_requires_csrf(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    login = client.post(
        "/api/v1/auth/login",
        json={"login": "termul", "password": "strong-admin-password"},
    )
    assert login.status_code == 200

    without_csrf = client.post("/api/v1/access-keys")
    assert without_csrf.status_code == 403

    with_csrf = client.post(
        "/api/v1/access-keys",
        headers={"X-CSRF-Token": login.json()["csrf_token"]},
    )
    assert with_csrf.status_code == 200


def test_api_key_cannot_mutate_without_write_scope(monkeypatch, tmp_path):
    client, db = _client(monkeypatch, tmp_path)
    from app.auth import generate_secret_access_key, hash_secret

    key = generate_secret_access_key()
    with db.SessionLocal() as session:
        session.add(
            db.ApiKey(
                key_hash="placeholder-read-key",
                access_key_id="bkid_readonly",
                secret_hash=hash_secret(key),
                label="readonly",
                enabled=True,
                scope="read",
                path_prefix="/snapshots/termul/",
            )
        )
        session.commit()

    response = client.post(
        "/api/v1/drive/folders",
        headers={"X-API-Key": key},
        json={"name": "forbidden"},
    )
    assert response.status_code == 403


def test_download_endpoint_never_returns_bearer_token(monkeypatch, tmp_path):
    client, db = _client(monkeypatch, tmp_path)
    # Missing object/account is acceptable, but no route may return a token-shaped field.
    response = client.get("/api/v1/drive/files/not-present/download")
    assert response.status_code == 401
    assert "token" not in response.text.lower()
