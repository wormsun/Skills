from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from email import policy
from email.headerregistry import Address
from email.message import EmailMessage, Message
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
from html import unescape
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    BeautifulSoup = None


@dataclass
class AttachmentInfo:
    filename: str
    content_type: str
    size: int


@dataclass
class ParsedEmail:
    message_id: str
    sender: str
    sender_email: str
    to: list[str]
    cc: list[str]
    subject: str
    date: str | None
    text: str
    attachments: list[AttachmentInfo]
    raw_headers: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["attachments"] = [asdict(item) for item in self.attachments]
        return data


def parse_email(raw: bytes) -> ParsedEmail:
    message = BytesParser(policy=policy.default).parsebytes(raw)
    return parse_message(message)


def parse_message(message: Message) -> ParsedEmail:
    sender_header = str(message.get("from", ""))
    sender_pairs = getaddresses([sender_header])
    sender_name, sender_email = sender_pairs[0] if sender_pairs else ("", "")
    sender_display = format_address(sender_name, sender_email) if sender_pairs else sender_header

    date_value = None
    if message.get("date"):
        try:
            date_value = parsedate_to_datetime(str(message.get("date"))).isoformat()
        except (TypeError, ValueError, IndexError):
            date_value = str(message.get("date"))

    text = extract_text(message)
    attachments = extract_attachments(message)
    headers = {
        "message-id": str(message.get("message-id", "")),
        "in-reply-to": str(message.get("in-reply-to", "")),
        "references": str(message.get("references", "")),
    }
    return ParsedEmail(
        message_id=str(message.get("message-id", "")),
        sender=sender_display,
        sender_email=sender_email,
        to=extract_addresses(message.get_all("to", [])),
        cc=extract_addresses(message.get_all("cc", [])),
        subject=str(message.get("subject", "")),
        date=date_value,
        text=normalize_text(text),
        attachments=attachments,
        raw_headers=headers,
    )


def extract_text(message: Message) -> str:
    plain_parts: list[str] = []
    html_parts: list[str] = []

    if message.is_multipart():
        for part in message.walk():
            if part.is_multipart():
                continue
            if part.get_content_disposition() == "attachment":
                continue
            content_type = part.get_content_type()
            content = get_part_content(part)
            if not content:
                continue
            if content_type == "text/plain":
                plain_parts.append(content)
            elif content_type == "text/html":
                html_parts.append(html_to_text(content))
    else:
        content = get_part_content(message)
        if message.get_content_type() == "text/html":
            html_parts.append(html_to_text(content))
        else:
            plain_parts.append(content)

    return "\n\n".join(plain_parts or html_parts)


def get_part_content(part: Message) -> str:
    try:
        payload = part.get_content()
        if isinstance(payload, str):
            return payload
    except Exception:
        pass

    payload = part.get_payload(decode=True)
    if payload is None:
        raw_payload = part.get_payload()
        return raw_payload if isinstance(raw_payload, str) else ""

    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def html_to_text(html: str) -> str:
    if BeautifulSoup is not None:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        return soup.get_text("\n")
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", html)
    text = re.sub(r"(?s)<br\s*/?>", "\n", text)
    text = re.sub(r"(?s)</p>", "\n", text)
    text = re.sub(r"(?s)<.*?>", "", text)
    return unescape(text)


def extract_attachments(message: Message) -> list[AttachmentInfo]:
    attachments: list[AttachmentInfo] = []
    for part in message.walk() if message.is_multipart() else [message]:
        if part.get_content_disposition() != "attachment":
            continue
        payload = part.get_payload(decode=True) or b""
        attachments.append(
            AttachmentInfo(
                filename=part.get_filename() or "attachment",
                content_type=part.get_content_type(),
                size=len(payload),
            )
        )
    return attachments


def extract_addresses(headers: list[str]) -> list[str]:
    return [format_address(name, email) for name, email in getaddresses(headers)]


def format_address(name: str | Address, email: str) -> str:
    name_text = str(name).strip()
    email_text = email.strip()
    if name_text and email_text:
        return f"{name_text} <{email_text}>"
    return email_text or name_text


def normalize_text(text: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    compact: list[str] = []
    last_blank = False
    for line in lines:
        blank = not line
        if blank and last_blank:
            continue
        compact.append(line)
        last_blank = blank
    return "\n".join(compact).strip()
