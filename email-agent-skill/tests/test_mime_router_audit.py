import json
import sys
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from audit import write_audit
from mime_parser import parse_email
from router import build_task_package, classify_email, render_prompt


def test_parse_email_extracts_text_and_attachment():
    message = EmailMessage()
    message["From"] = "Customer <customer@example.com>"
    message["To"] = "support@example.com"
    message["Subject"] = "Login failed after SSO update"
    message["Message-ID"] = "<msg-1@example.com>"
    message.set_content("Login failed with 403 after the SSO update.")
    message.add_attachment(b"hello", maintype="text", subtype="plain", filename="debug.txt")

    parsed = parse_email(message.as_bytes()).to_dict()

    assert parsed["sender_email"] == "customer@example.com"
    assert "403" in parsed["text"]
    assert parsed["attachments"][0]["filename"] == "debug.txt"


def test_router_classifies_bug_report_as_high_risk_with_attachment():
    parsed = {
        "message_id": "<msg-1@example.com>",
        "sender": "Customer <customer@example.com>",
        "subject": "Login failed after SSO update",
        "date": None,
        "text": "Login failed with 403 after the SSO update.",
        "attachments": [{"filename": "debug.txt"}],
    }

    classification = classify_email(parsed)
    task = build_task_package("main", "42", parsed)

    assert classification["intent"] == "bug_report"
    assert classification["risk_level"] == "high"
    assert task["suggested_agent"] == "codex"


def test_router_renders_openclaw_safety_contract():
    task = {
        "account": "main",
        "message_uid": "42",
        "message_id": "<msg-1@example.com>",
        "sender": "Customer <customer@example.com>",
        "subject": "Login failed",
        "date": None,
        "intent": "bug_report",
        "risk_level": "medium",
        "human_confirmation_required": True,
        "summary": "Login failed with 403.",
        "key_facts": ["403 during SSO login"],
        "required_action": "Investigate.",
    }

    prompt = render_prompt(task, target="openclaw")

    assert "OpenClaw Email Task" in prompt
    assert "Do not send email, delete email, open attachments" in prompt
    assert "`decision`" in prompt


def test_write_audit_writes_jsonl():
    audit_path = Path(__file__).with_name(".tmp-audit.jsonl")

    write_audit(audit_path, {"account": "main", "action": "send", "result": "success"})

    line = audit_path.read_text(encoding="utf-8").strip().splitlines()[-1]
    record = json.loads(line)
    assert record["account"] == "main"
    assert record["action"] == "send"
    assert "timestamp" in record
