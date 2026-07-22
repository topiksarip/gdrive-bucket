import hashlib

import pytest

from app import auth


def test_new_password_hash_uses_argon2id():
    encoded = auth.hash_password("correct horse battery staple")

    assert encoded.startswith("$argon2id$")
    assert auth.verify_password("correct horse battery staple", encoded)
    assert not auth.verify_password("wrong", encoded)


def test_legacy_password_hash_can_be_verified_and_upgraded(monkeypatch):
    monkeypatch.setattr(auth, "SECRET_KEY", "legacy-secret")
    legacy = hashlib.sha256(b"legacy-secretold-password").hexdigest()

    valid, upgraded = auth.verify_password_and_upgrade("old-password", legacy)

    assert valid is True
    assert upgraded is not None
    assert upgraded.startswith("$argon2id$")
    assert auth.verify_password("old-password", upgraded)


def test_invalid_legacy_password_is_not_upgraded(monkeypatch):
    monkeypatch.setattr(auth, "SECRET_KEY", "legacy-secret")
    legacy = hashlib.sha256(b"legacy-secretright-password").hexdigest()

    valid, upgraded = auth.verify_password_and_upgrade("wrong-password", legacy)

    assert valid is False
    assert upgraded is None


def test_session_token_expires_and_detects_tampering(monkeypatch):
    monkeypatch.setattr(auth, "SECRET_KEY", "session-secret")
    token = auth.make_session_token(
        "admin@example.com", session_version=7, now=1_000, ttl_seconds=60
    )

    claims = auth.verify_session_token(token, now=1_059)
    assert claims == {"email": "admin@example.com", "session_version": 7}
    assert auth.verify_session_token(token, now=1_061) is None

    replacement = "A" if token[-1] != "A" else "B"
    assert auth.verify_session_token(token[:-1] + replacement, now=1_010) is None


def test_csrf_token_is_bound_to_session(monkeypatch):
    monkeypatch.setattr(auth, "SECRET_KEY", "csrf-secret")
    first = auth.make_csrf_token("session-a")
    second = auth.make_csrf_token("session-b")

    assert first != second
    assert auth.verify_csrf_token("session-a", first)
    assert not auth.verify_csrf_token("session-b", first)


def test_production_defaults_are_rejected():
    from app.config import validate_production_settings

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_settings(
            environment="production",
            secret_key="dev-secret-change-me",
            admin_username="termul",
            admin_email="admin@example.com",
            admin_password="strong-enough-password",
        )

    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        validate_production_settings(
            environment="production",
            secret_key="x" * 64,
            admin_username="termul",
            admin_email="admin@example.com",
            admin_password="admin123",
        )


def test_production_settings_accept_strong_values():
    from app.config import validate_production_settings

    validate_production_settings(
        environment="production",
        secret_key="x" * 64,
        admin_username="termul",
        admin_email="admin@example.com",
        admin_password="a-strong-and-unique-password",
    )
