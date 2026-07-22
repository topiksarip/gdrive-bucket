import importlib


def _reload_database(monkeypatch, tmp_path, **env):
    monkeypatch.setenv("BUCKET_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SECRET_KEY", "s" * 64)
    monkeypatch.setenv("ADMIN_USERNAME", env.get("ADMIN_USERNAME", "termul"))
    monkeypatch.setenv("ADMIN_EMAIL", env.get("ADMIN_EMAIL", "admin@example.com"))
    monkeypatch.setenv("ADMIN_PASSWORD", env.get("ADMIN_PASSWORD", "strong-admin-password"))
    monkeypatch.setenv("APP_ENV", env.get("APP_ENV", "test"))
    monkeypatch.setenv("DRIVE_MOCK", env.get("DRIVE_MOCK", "false"))

    import app.config as config
    import app.auth as auth
    import app.db as db

    importlib.reload(config)
    importlib.reload(auth)
    return importlib.reload(db)


def test_bootstrap_creates_named_admin_without_demo_key_or_mock_accounts(monkeypatch, tmp_path):
    db = _reload_database(monkeypatch, tmp_path)

    db.init_db()

    with db.SessionLocal() as session:
        users = session.query(db.User).all()
        assert len(users) == 1
        assert users[0].username == "termul"
        assert users[0].email == "admin@example.com"
        assert users[0].is_admin is True
        assert users[0].password_hash.startswith("$argon2id$")
        assert session.query(db.ApiKey).count() == 0
        assert session.query(db.Account).count() == 0


def test_database_migration_adds_security_columns(monkeypatch, tmp_path):
    db = _reload_database(monkeypatch, tmp_path)

    db.init_db()

    with db.engine.connect() as connection:
        user_columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        }
        key_columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(api_keys)").fetchall()
        }

    assert {"username", "session_version", "disabled"} <= user_columns
    assert {"scope", "path_prefix", "expires_at"} <= key_columns
