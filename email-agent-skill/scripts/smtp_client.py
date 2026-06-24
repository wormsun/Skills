from __future__ import annotations

import smtplib
from email.message import EmailMessage
from typing import Any

from config import resolve_password


def send_mail(account: dict[str, Any], to: list[str], subject: str, body: str, reply_to_message: dict[str, Any] | None = None) -> str:
    message = EmailMessage()
    message["From"] = account.get("email") or account["auth"]["username"]
    message["To"] = ", ".join(to)
    message["Subject"] = subject
    if reply_to_message:
        if reply_to_message.get("message_id"):
            message["In-Reply-To"] = reply_to_message["message_id"]
        refs = reply_to_message.get("raw_headers", {}).get("references") if reply_to_message.get("raw_headers") else None
        if refs:
            message["References"] = refs
    message.set_content(body)

    endpoint = account["smtp"]
    host = endpoint["host"]
    port = endpoint["port"]
    security = endpoint.get("security", "ssl")
    username = account["auth"]["username"]
    password = resolve_password(account)

    if security == "ssl":
        smtp: smtplib.SMTP = smtplib.SMTP_SSL(host, port)
    else:
        smtp = smtplib.SMTP(host, port)
    try:
        if security == "starttls":
            smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(message)
    finally:
        smtp.quit()
    return message.get("Message-ID", "")


def recipients_allowed(config: dict[str, Any], recipients: list[str]) -> bool:
    send_policy = ((config.get("safety") or {}).get("send") or {})
    if not send_policy.get("allow_auto_send", False):
        return False
    allow_recipients = {item.lower() for item in send_policy.get("allowlist_recipients", [])}
    allow_domains = {item.lower().lstrip("@") for item in send_policy.get("allowlist_domains", [])}
    for recipient in recipients:
        email = extract_email(recipient).lower()
        domain = email.rsplit("@", 1)[-1] if "@" in email else ""
        if email not in allow_recipients and domain not in allow_domains:
            return False
    return True


def extract_email(value: str) -> str:
    value = value.strip()
    if "<" in value and ">" in value:
        return value.split("<", 1)[1].split(">", 1)[0].strip()
    return value
