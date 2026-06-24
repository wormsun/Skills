from __future__ import annotations

import imaplib
import base64
import re
import socket
from dataclasses import dataclass
from datetime import datetime
from email.parser import BytesParser
from email import policy
from email.utils import parsedate_to_datetime
from typing import Any

from config import resolve_password


@dataclass
class Mailbox:
    name: str
    flags: list[str]
    delimiter: str | None = None


@dataclass
class MessageSummary:
    uid: str
    sender: str
    subject: str
    date: str | None
    flags: list[str]


class EmailIMAPClient:
    def __init__(self, account: dict[str, Any], timeout: int = 30):
        self.account = account
        self.timeout = timeout
        self.conn: imaplib.IMAP4 | imaplib.IMAP4_SSL | None = None

    def __enter__(self) -> "EmailIMAPClient":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def connect(self) -> None:
        socket.setdefaulttimeout(self.timeout)
        endpoint = self.account["imap"]
        security = endpoint.get("security", "ssl")
        host = endpoint["host"]
        port = endpoint["port"]
        if security == "ssl":
            conn: imaplib.IMAP4 | imaplib.IMAP4_SSL = imaplib.IMAP4_SSL(host, port)
        else:
            conn = imaplib.IMAP4(host, port)
            if security == "starttls":
                conn.starttls()
        auth = self.account["auth"]
        conn.login(auth["username"], resolve_password(self.account))
        self.conn = conn

    def close(self) -> None:
        if not self.conn:
            return
        try:
            self.conn.logout()
        except Exception:
            pass
        finally:
            self.conn = None

    def list_mailboxes(self) -> list[Mailbox]:
        conn = self._conn()
        typ, data = conn.list()
        if typ != "OK":
            raise IMAPError("Unable to list mailboxes.")
        return [parse_list_response(item) for item in data or [] if item]

    def select(self, mailbox: str = "INBOX", readonly: bool = True) -> None:
        conn = self._conn()
        typ, _ = conn.select(quote_mailbox(mailbox), readonly=readonly)
        if typ != "OK":
            raise IMAPError(f"Unable to select mailbox: {mailbox}")

    def search(self, query: str = "ALL", mailbox: str = "INBOX", limit: int = 20) -> list[str]:
        self.select(mailbox, readonly=True)
        criteria = build_imap_criteria(query)
        typ, data = self._conn().uid("SEARCH", None, *criteria)
        if typ != "OK":
            raise IMAPError(f"Search failed for query: {query}")
        uids = (data[0] or b"").decode("ascii", errors="ignore").split()
        if limit and limit > 0:
            return uids[-limit:]
        return uids

    def list_messages(self, mailbox: str = "INBOX", limit: int = 20, query: str = "ALL") -> list[MessageSummary]:
        uids = self.search(query=query, mailbox=mailbox, limit=limit)
        return list(reversed(self.fetch_summaries(uids)))

    def fetch_summaries(self, uids: list[str], batch_size: int = 100) -> list[MessageSummary]:
        summaries: list[MessageSummary] = []
        for index in range(0, len(uids), batch_size):
            chunk = uids[index : index + batch_size]
            if not chunk:
                continue
            typ, data = self._conn().uid("FETCH", ",".join(chunk), "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            if typ != "OK":
                raise IMAPError(f"Unable to fetch message summaries for UIDs: {chunk[0]}..{chunk[-1]}")
            summaries.extend(parse_summary_fetch_response(data or []))
        by_uid = {summary.uid: summary for summary in summaries}
        return [by_uid[uid] for uid in uids if uid in by_uid]

    def fetch_summary(self, uid: str) -> MessageSummary:
        typ, data = self._conn().uid("FETCH", uid, "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
        if typ != "OK":
            raise IMAPError(f"Unable to fetch message summary: {uid}")
        flags: list[str] = []
        header_bytes = b""
        for item in data or []:
            if isinstance(item, tuple):
                meta, payload = item
                header_bytes += payload or b""
                flags = parse_flags(meta)
        message = BytesParser(policy=policy.default).parsebytes(header_bytes)
        return MessageSummary(
            uid=uid,
            sender=str(message.get("from", "")),
            subject=str(message.get("subject", "")),
            date=parse_date(str(message.get("date", ""))),
            flags=flags,
        )

    def fetch_raw(self, uid: str, mailbox: str = "INBOX") -> bytes:
        self.select(mailbox, readonly=True)
        typ, data = self._conn().uid("FETCH", uid, "(BODY.PEEK[])")
        if typ != "OK":
            raise IMAPError(f"Unable to fetch message: {uid}")
        chunks: list[bytes] = []
        for item in data or []:
            if isinstance(item, tuple) and item[1]:
                chunks.append(item[1])
        if not chunks:
            raise IMAPError(f"Message not found: {uid}")
        return b"".join(chunks)

    def fetch_partial(self, uid: str, mailbox: str = "INBOX", size: int = 65536) -> bytes:
        self.select(mailbox, readonly=True)
        typ, data = self._conn().uid("FETCH", uid, f"(BODY.PEEK[]<0.{size}>)")
        if typ != "OK":
            raise IMAPError(f"Unable to fetch message preview: {uid}")
        chunks: list[bytes] = []
        for item in data or []:
            if isinstance(item, tuple) and item[1]:
                chunks.append(item[1])
        if not chunks:
            raise IMAPError(f"Message not found: {uid}")
        return b"".join(chunks)

    def safe_delete(self, uid: str, target_mailbox: str, source_mailbox: str = "INBOX") -> str:
        self.select(source_mailbox, readonly=False)
        conn = self._conn()
        capabilities = {item.upper() for item in conn.capabilities}
        if b"MOVE" in capabilities or "MOVE" in capabilities:
            typ, _ = conn.uid("MOVE", uid, quote_mailbox(target_mailbox))
            if typ == "OK":
                return "moved"

        typ, _ = conn.uid("COPY", uid, quote_mailbox(target_mailbox))
        if typ != "OK":
            raise IMAPError(f"Unable to copy message {uid} to {target_mailbox}")
        typ, _ = conn.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
        if typ != "OK":
            raise IMAPError(f"Copied message {uid}, but failed to mark original as deleted.")
        return "copied_marked_deleted_no_expunge"

    def create_mailbox(self, mailbox: str) -> None:
        typ, _ = self._conn().create(quote_mailbox(mailbox))
        if typ != "OK":
            raise IMAPError(f"Unable to create mailbox: {mailbox}")

    def _conn(self) -> imaplib.IMAP4 | imaplib.IMAP4_SSL:
        if not self.conn:
            raise IMAPError("IMAP client is not connected.")
        return self.conn


def resolve_safe_delete_target(account: dict[str, Any], mailboxes: list[Mailbox]) -> str | None:
    delete = account.get("delete") or {}
    configured = delete.get("target_mailbox", "auto")
    existing = {normalize_mailbox_name(mailbox.name): mailbox.name for mailbox in mailboxes}
    if configured and configured != "auto":
        return existing.get(normalize_mailbox_name(str(configured)), str(configured))

    for mailbox in mailboxes:
        flags = {flag.lower().lstrip("\\") for flag in mailbox.flags}
        if "trash" in flags or "deleted" in flags:
            return mailbox.name

    for candidate in account.get("delete_candidates", []):
        if normalize_mailbox_name(candidate) in existing:
            return existing[normalize_mailbox_name(candidate)]

    quarantine = delete.get("target_mailbox") if delete.get("mode") == "quarantine" else "EmailAgent/Quarantine"
    if delete.get("create_quarantine_if_missing") and quarantine:
        return str(quarantine)
    return None


def parse_list_response(raw: bytes | str) -> Mailbox:
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    match = re.match(r'\((?P<flags>.*?)\)\s+"?(?P<delimiter>[^"\s]+|NIL)"?\s+(?P<name>.+)$', text)
    if not match:
        return Mailbox(name=text.strip().strip('"'), flags=[], delimiter=None)
    flags = [flag.strip() for flag in match.group("flags").split() if flag.strip()]
    delimiter = match.group("delimiter")
    name = match.group("name").strip()
    if name.startswith('"') and name.endswith('"'):
        name = name[1:-1]
    return Mailbox(name=decode_imap_utf7(name), flags=flags, delimiter=None if delimiter == "NIL" else delimiter)


def parse_summary_fetch_response(data: list[Any]) -> list[MessageSummary]:
    summaries: list[MessageSummary] = []
    for item in data:
        if not isinstance(item, tuple):
            continue
        meta, payload = item
        uid = parse_uid(meta)
        if not uid:
            continue
        message = BytesParser(policy=policy.default).parsebytes(payload or b"")
        summaries.append(
            MessageSummary(
                uid=uid,
                sender=str(message.get("from", "")),
                subject=str(message.get("subject", "")),
                date=parse_date(str(message.get("date", ""))),
                flags=parse_flags(meta),
            )
        )
    return summaries


def parse_uid(meta: bytes | str) -> str | None:
    text = meta.decode("utf-8", errors="ignore") if isinstance(meta, bytes) else str(meta)
    match = re.search(r"\bUID (\d+)\b", text)
    return match.group(1) if match else None


def build_imap_criteria(query: str) -> list[str]:
    query = (query or "ALL").strip()
    if query.upper() in {"ALL", "UNSEEN", "SEEN"}:
        return [query.upper()]

    criteria: list[str] = []
    for token in split_query(query):
        lowered = token.lower()
        if lowered == "unread":
            criteria.append("UNSEEN")
        elif lowered == "read":
            criteria.append("SEEN")
        elif lowered.startswith("from:"):
            criteria.extend(["FROM", token[5:]])
        elif lowered.startswith("subject:"):
            criteria.extend(["SUBJECT", token[8:]])
        elif lowered.startswith("since:"):
            criteria.extend(["SINCE", to_imap_date(token[6:])])
        elif lowered.startswith("before:"):
            criteria.extend(["BEFORE", to_imap_date(token[7:])])
        else:
            criteria.extend(["TEXT", token])
    return criteria or ["ALL"]


def split_query(query: str) -> list[str]:
    return re.findall(r'"[^"]+"|\S+', query.replace("'", '"'))


def to_imap_date(value: str) -> str:
    value = value.strip('"')
    parsed = datetime.fromisoformat(value)
    return parsed.strftime("%d-%b-%Y")


def parse_flags(meta: bytes) -> list[str]:
    text = meta.decode("utf-8", errors="ignore") if isinstance(meta, bytes) else str(meta)
    match = re.search(r"FLAGS \((.*?)\)", text)
    if not match:
        return []
    return [flag for flag in match.group(1).split() if flag]


def parse_date(value: str) -> str | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).isoformat()
    except (TypeError, ValueError, IndexError):
        return value


def normalize_mailbox_name(value: str) -> str:
    return value.replace("\\", "/").strip().strip('"').lower()


def quote_mailbox(mailbox: str) -> str:
    return f'"{encode_imap_utf7(mailbox)}"'


def encode_imap_utf7(value: str) -> str:
    result: list[str] = []
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        raw = "".join(buffer).encode("utf-16-be")
        encoded = base64.b64encode(raw).decode("ascii").rstrip("=").replace("/", ",")
        result.append(f"&{encoded}-")
        buffer.clear()

    for char in value:
        code = ord(char)
        if char == "&":
            flush()
            result.append("&-")
        elif 0x20 <= code <= 0x7E:
            flush()
            result.append(char)
        else:
            buffer.append(char)
    flush()
    return "".join(result)


def decode_imap_utf7(value: str) -> str:
    result: list[str] = []
    index = 0
    while index < len(value):
        char = value[index]
        if char != "&":
            result.append(char)
            index += 1
            continue
        end = value.find("-", index)
        if end == -1:
            result.append(char)
            index += 1
            continue
        token = value[index + 1 : end]
        if token == "":
            result.append("&")
        else:
            padded = token.replace(",", "/")
            padded += "=" * (-len(padded) % 4)
            try:
                result.append(base64.b64decode(padded).decode("utf-16-be"))
            except Exception:
                result.append(value[index : end + 1])
        index = end + 1
    return "".join(result)


class IMAPError(RuntimeError):
    pass
