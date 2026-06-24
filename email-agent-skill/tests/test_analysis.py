import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from analysis import TYPE_DEV, TYPE_SECURITY, analyze_summaries, classify_summary
from imap_client import MessageSummary


def test_classify_account_security_notice():
    message = MessageSummary("1", "Google <no-reply@accounts.google.com>", "安全提醒", "2026-06-23T00:00:00+00:00", [])

    assert classify_summary(message) == TYPE_SECURITY


def test_classify_security_topic_as_developer_notice_not_account_security():
    message = MessageSummary(
        "2",
        "Kaggle <no-reply@kaggle.com>",
        "Competition Launch: AI Agent Security: Multi-Step Tool Attacks",
        "2026-06-12T00:00:00+00:00",
        [],
    )

    assert classify_summary(message) == TYPE_DEV


def test_analyze_summaries_groups_counts():
    messages = [
        MessageSummary("1", "Google <no-reply@accounts.google.com>", "安全提醒", "2026-06-23T00:00:00+00:00", []),
        MessageSummary("2", "Coursera <noreply@coursera.org>", "Recommended courses", "2015-01-14T00:00:00+00:00", []),
    ]

    result = analyze_summaries(messages)

    assert result["count"] == 2
    assert ("2015", 1) in result["by_year"]
    assert ("2026", 1) in result["by_year"]
