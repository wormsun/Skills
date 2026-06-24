import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from config import expand_account
from imap_client import (
    EmailIMAPClient,
    Mailbox,
    build_imap_criteria,
    decode_imap_utf7,
    encode_imap_utf7,
    parse_list_response,
    parse_summary_fetch_response,
    resolve_safe_delete_target,
)


class DummyConn:
    def __init__(self):
        self.closed = False
        self.logged_out = False

    def close(self):
        self.closed = True

    def logout(self):
        self.logged_out = True


def test_resolve_safe_delete_uses_explicit_target():
    account = expand_account(
        {
            "name": "custom",
            "provider": "custom",
            "email": "user@example.com",
            "imap": {"host": "imap.example.com", "port": 993, "security": "ssl"},
            "smtp": {"host": "smtp.example.com", "port": 465, "security": "ssl"},
            "auth": {"username": "user@example.com", "password_env": "MAIL_PASSWORD"},
            "delete": {"target_mailbox": "Deleted Items"},
        }
    )
    mailboxes = [Mailbox("INBOX", []), Mailbox("Deleted Items", [])]

    assert resolve_safe_delete_target(account, mailboxes) == "Deleted Items"


def test_resolve_safe_delete_uses_special_use_trash():
    account = expand_account(
        {
            "name": "custom",
            "provider": "custom",
            "email": "user@example.com",
            "imap": {"host": "imap.example.com", "port": 993, "security": "ssl"},
            "smtp": {"host": "smtp.example.com", "port": 465, "security": "ssl"},
            "auth": {"username": "user@example.com", "password_env": "MAIL_PASSWORD"},
        }
    )
    mailboxes = [Mailbox("Archive", []), Mailbox("Trash", ["\\Trash"])]

    assert resolve_safe_delete_target(account, mailboxes) == "Trash"


def test_resolve_safe_delete_fails_closed_without_target():
    account = expand_account(
        {
            "name": "custom",
            "provider": "custom",
            "email": "user@example.com",
            "imap": {"host": "imap.example.com", "port": 993, "security": "ssl"},
            "smtp": {"host": "smtp.example.com", "port": 465, "security": "ssl"},
            "auth": {"username": "user@example.com", "password_env": "MAIL_PASSWORD"},
        }
    )
    mailboxes = [Mailbox("INBOX", []), Mailbox("Archive", [])]

    assert resolve_safe_delete_target(account, mailboxes) is None


def test_build_imap_criteria_parses_common_query():
    assert build_imap_criteria("from:example.com unread since:2026-06-01") == [
        "FROM",
        "example.com",
        "UNSEEN",
        "SINCE",
        "01-Jun-2026",
    ]


def test_imap_utf7_round_trip_for_chinese_mailbox():
    mailbox = "已删除邮件"

    encoded = encode_imap_utf7(mailbox)

    assert encoded != mailbox
    assert decode_imap_utf7(encoded) == mailbox


def test_parse_list_response_handles_unquoted_name():
    mailbox = parse_list_response(b'(\\HasNoChildren) "/" INBOX')

    assert mailbox.name == "INBOX"
    assert mailbox.flags == ["\\HasNoChildren"]


def test_parse_summary_fetch_response_reads_batch_items():
    data = [
        (
            b'1 (UID 10 FLAGS (\\Seen) BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {123}',
            b"From: Example <no-reply@example.com>\r\nSubject: Hello\r\nDate: Tue, 23 Jun 2026 10:00:00 +0000\r\n\r\n",
        ),
        (
            b'2 (UID 11 FLAGS () BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {123}',
            b"From: Other <other@example.com>\r\nSubject: World\r\nDate: Tue, 24 Jun 2026 10:00:00 +0000\r\n\r\n",
        ),
    ]

    summaries = parse_summary_fetch_response(data)

    assert [item.uid for item in summaries] == ["10", "11"]
    assert summaries[0].subject == "Hello"
    assert summaries[0].flags == ["\\Seen"]


def test_client_close_does_not_call_imap_close_or_expunge():
    client = EmailIMAPClient({"imap": {}, "auth": {}})
    conn = DummyConn()
    client.conn = conn

    client.close()

    assert conn.closed is False
    assert conn.logged_out is True
