import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cleanup_plan import build_cleanup_plan, classify_for_cleanup, plan_delete_records
from imap_client import MessageSummary


def test_cleanup_plan_keeps_security_and_billing_but_deletes_newsletter():
    messages = [
        (
            MessageSummary("1", "Google <no-reply@accounts.google.com>", "安全提醒", "2026-06-01T00:00:00+00:00", []),
            {"text": "A new sign-in happened. If this was not you, secure your account."},
        ),
        (
            MessageSummary("2", "Google Play <googleplay-noreply@google.com>", "订单收据", "2026-06-02T00:00:00+00:00", []),
            {"text": "Receipt for subscription payment."},
        ),
        (
            MessageSummary("3", "Example <news@example.com>", "Weekly product update", "2026-06-03T00:00:00+00:00", []),
            {"text": "Newsletter roundup with product update and webinar invite."},
        ),
    ]

    plan = build_cleanup_plan(messages, query="unread", mailbox="INBOX", account_name="main")

    assert [record["uid"] for record in plan_delete_records(plan)] == ["3"]
    assert plan["records"][0]["action"] == "keep"
    assert plan["records"][1]["action"] == "keep"


def test_cleanup_plan_reviews_action_required_notice():
    summary = MessageSummary("9", "Cloud <notify@example.com>", "Action required before deletion", None, [])
    record = classify_for_cleanup(summary, {"text": "Your data will be deleted unless you complete migration."})

    assert record["action"] == "review"
    assert record["reason"] == "account_data_or_deadline_notice"
