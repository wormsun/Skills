import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from config import expand_account, resolve_password, validate_config


def test_expand_account_applies_provider_defaults():
    account = expand_account(
        {
            "name": "main",
            "provider": "gmail",
            "email": "user@gmail.com",
            "auth": {"password_env": "MAIL_PASSWORD"},
        }
    )

    assert account["imap"]["host"] == "imap.gmail.com"
    assert account["smtp"]["host"] == "smtp.gmail.com"
    assert account["auth"]["username"] == "user@gmail.com"
    assert account["delete"]["target_mailbox"] == "auto"


def test_validate_rejects_plaintext_password():
    account = expand_account(
        {
            "name": "main",
            "provider": "gmail",
            "email": "user@gmail.com",
            "auth": {"username": "user@gmail.com", "password": "secret"},
        }
    )

    errors = validate_config({"accounts": [account]})

    assert any("auth.password is not allowed" in error for error in errors)


def test_resolve_password_from_env(monkeypatch):
    monkeypatch.setenv("MAIL_PASSWORD", "secret")
    account = expand_account(
        {
            "name": "main",
            "provider": "gmail",
            "email": "user@gmail.com",
            "auth": {"username": "user@gmail.com", "password_env": "MAIL_PASSWORD"},
        }
    )

    assert resolve_password(account) == "secret"
