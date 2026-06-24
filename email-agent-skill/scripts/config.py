from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - exercised only without optional dependency
    yaml = None


DEFAULT_CONFIG_PATH = Path("~/.email-agent/config.yaml").expanduser()
DEFAULT_AUDIT_PATH = Path("~/.email-agent/audit.jsonl").expanduser()


PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "gmail": {
        "imap": {"host": "imap.gmail.com", "port": 993, "security": "ssl"},
        "smtp": {"host": "smtp.gmail.com", "port": 465, "security": "ssl"},
        "delete_candidates": ["[Gmail]/Trash", "[Google Mail]/Trash", "Trash"],
    },
    "outlook": {
        "imap": {"host": "outlook.office365.com", "port": 993, "security": "ssl"},
        "smtp": {"host": "smtp.office365.com", "port": 587, "security": "starttls"},
        "delete_candidates": ["Deleted Items", "Trash", "Deleted"],
    },
    "qq": {
        "imap": {"host": "imap.qq.com", "port": 993, "security": "ssl"},
        "smtp": {"host": "smtp.qq.com", "port": 465, "security": "ssl"},
        "delete_candidates": ["已删除邮件", "垃圾箱", "Deleted", "Trash"],
    },
    "163": {
        "imap": {"host": "imap.163.com", "port": 993, "security": "ssl"},
        "smtp": {"host": "smtp.163.com", "port": 465, "security": "ssl"},
        "delete_candidates": ["已删除邮件", "垃圾箱", "Deleted", "Trash"],
    },
    "custom": {
        "delete_candidates": [],
    },
}


def default_config_path() -> Path:
    return Path(os.environ.get("EMAIL_AGENT_CONFIG", DEFAULT_CONFIG_PATH)).expanduser()


def default_audit_path(config: dict[str, Any] | None = None) -> Path:
    configured = ((config or {}).get("audit") or {}).get("path")
    return Path(os.environ.get("EMAIL_AGENT_AUDIT_LOG", configured or DEFAULT_AUDIT_PATH)).expanduser()


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    config_path = Path(path).expanduser() if path else default_config_path()
    if not config_path.exists():
        raise ConfigError(f"Config file not found: {config_path}")
    if yaml is None:
        raise ConfigError("PyYAML is required to read YAML config. Install pyyaml or use the bundled environment.")

    with config_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    if not isinstance(data, dict):
        raise ConfigError("Config root must be a mapping.")

    data["accounts"] = [expand_account(account) for account in data.get("accounts", [])]
    return data


def expand_account(account: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(account, dict):
        raise ConfigError("Each account must be a mapping.")

    provider = str(account.get("provider", "custom")).lower()
    preset = deepcopy(PROVIDER_PRESETS.get(provider, PROVIDER_PRESETS["custom"]))
    expanded = deep_merge(preset, account)
    expanded["provider"] = provider

    expanded.setdefault("delete", {})
    expanded["delete"].setdefault("mode", "move")
    expanded["delete"].setdefault("target_mailbox", "auto")
    expanded["delete"].setdefault("create_quarantine_if_missing", False)
    expanded.setdefault("delete_candidates", preset.get("delete_candidates", []))

    auth = expanded.setdefault("auth", {})
    if "username" not in auth and expanded.get("email"):
        auth["username"] = expanded["email"]
    return expanded


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def get_account(config: dict[str, Any], name: str) -> dict[str, Any]:
    for account in config.get("accounts", []):
        if account.get("name") == name:
            return account
    raise ConfigError(f"Account not found: {name}")


def resolve_password(account: dict[str, Any]) -> str:
    auth = account.get("auth") or {}
    if auth.get("password_env"):
        value = os.environ.get(str(auth["password_env"]))
        if not value:
            raise ConfigError(f"Password env var is not set: {auth['password_env']}")
        return value
    if auth.get("password"):
        raise ConfigError("Plaintext auth.password is not allowed. Use auth.password_env.")
    raise ConfigError(f"Account {account.get('name', '<unknown>')} is missing auth.password_env.")


def validate_config(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    accounts = config.get("accounts")
    if not isinstance(accounts, list) or not accounts:
        errors.append("At least one account is required.")
        return errors

    names: set[str] = set()
    for idx, account in enumerate(accounts):
        prefix = f"accounts[{idx}]"
        name = account.get("name")
        if not name:
            errors.append(f"{prefix}.name is required.")
        elif name in names:
            errors.append(f"Duplicate account name: {name}")
        else:
            names.add(str(name))

        provider = str(account.get("provider", "custom")).lower()
        if provider not in PROVIDER_PRESETS:
            errors.append(f"{prefix}.provider is unsupported: {provider}")

        for section in ("imap", "smtp"):
            endpoint = account.get(section) or {}
            if not endpoint.get("host"):
                errors.append(f"{prefix}.{section}.host is required.")
            if not isinstance(endpoint.get("port"), int):
                errors.append(f"{prefix}.{section}.port must be an integer.")
            if endpoint.get("security") not in ("ssl", "starttls", "none"):
                errors.append(f"{prefix}.{section}.security must be ssl, starttls, or none.")

        auth = account.get("auth") or {}
        if auth.get("password"):
            errors.append(f"{prefix}.auth.password is not allowed; use password_env.")
        if not auth.get("username"):
            errors.append(f"{prefix}.auth.username is required.")
        if not auth.get("password_env"):
            errors.append(f"{prefix}.auth.password_env is required.")

        delete = account.get("delete") or {}
        if delete.get("mode") not in ("move", "quarantine"):
            errors.append(f"{prefix}.delete.mode must be move or quarantine.")
        if not delete.get("target_mailbox"):
            errors.append(f"{prefix}.delete.target_mailbox is required; use auto to detect.")

    return errors


class ConfigError(RuntimeError):
    pass
