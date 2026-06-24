import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from email_agent import cleanup_candidates
from imap_client import MessageSummary


def test_cleanup_notifications_excludes_security_and_receipts():
    messages = [
        MessageSummary("1", "Google <no-reply@accounts.google.com>", "安全提醒", None, []),
        MessageSummary("2", "Google Play <googleplay-noreply@google.com>", "您的Google Play订单收据", None, []),
        MessageSummary("3", "Example <notification@example.com>", "Build completed notification", None, []),
    ]

    candidates = cleanup_candidates(messages, "notifications", {})

    assert [item.uid for item in candidates] == ["3"]
