from __future__ import annotations

from collections import Counter
from typing import Any

from analysis import (
    TYPE_BILLING,
    TYPE_DEV,
    TYPE_MARKETING,
    TYPE_NEWSLETTER,
    TYPE_POLICY,
    TYPE_SECURITY,
    classify_summary,
    domain_of,
    normalize_subject,
)
from imap_client import MessageSummary


FINANCE_TOKENS = [
    "receipt",
    "invoice",
    "payment",
    "billing",
    "paid",
    "charge",
    "subscription",
    "renewal",
    "付款",
    "支付",
    "账单",
    "发票",
    "收据",
    "扣费",
    "续费",
    "订阅",
    "订单",
    "退款",
]
SECURITY_TOKENS = [
    "security alert",
    "critical security",
    "password",
    "sign-in",
    "login",
    "verification",
    "verify",
    "验证码",
    "安全",
    "登录",
    "密码",
    "两步",
    "2fa",
    "passkey",
    "recovery",
    "suspicious",
    "token",
    "ssh key",
]
ACTION_TOKENS = [
    "action required",
    "requires action",
    "please confirm",
    "deadline",
    "expires",
    "expire",
    "will be deleted",
    "deletion",
    "suspended",
    "overdue",
    "failed",
    "failure",
    "请确认",
    "需要处理",
    "截止",
    "到期",
    "即将删除",
    "暂停",
    "失败",
    "余额不足",
    "迁移",
]
LOW_VALUE_TOKENS = [
    "newsletter",
    "digest",
    "weekly",
    "roundup",
    "webinar",
    "event",
    "tips",
    "promotion",
    "discount",
    "offer",
    "sale",
    "product update",
    "competition launch",
    "推荐",
    "精选",
    "周报",
    "月报",
    "活动",
    "研讨会",
    "优惠",
    "折扣",
    "促销",
    "功能速递",
]
PERSONAL_TOKENS = [
    "ticket",
    "booking",
    "reservation",
    "itinerary",
    "appointment",
    "interview",
    "offer letter",
    "contract",
    "车票",
    "航班",
    "行程",
    "预约",
    "面试",
    "合同",
    "医疗",
]


def build_cleanup_plan(
    messages: list[tuple[MessageSummary, dict[str, Any] | None]],
    *,
    query: str,
    mailbox: str,
    account_name: str,
) -> dict[str, Any]:
    records = [classify_for_cleanup(summary, parsed) for summary, parsed in messages]
    return {
        "version": 1,
        "account": account_name,
        "mailbox": mailbox,
        "query": query,
        "mode": "safe-delete-plan",
        "summary": {
            "count": len(records),
            "by_action": Counter(record["action"] for record in records).most_common(),
            "by_reason": Counter(record["reason"] for record in records).most_common(),
            "delete_by_domain": Counter(record["domain"] for record in records if record["action"] == "delete_candidate").most_common(30),
            "review_by_domain": Counter(record["domain"] for record in records if record["action"] == "review").most_common(30),
            "keep_by_reason": Counter(record["reason"] for record in records if record["action"] == "keep").most_common(),
        },
        "records": records,
    }


def classify_for_cleanup(summary: MessageSummary, parsed: dict[str, Any] | None = None) -> dict[str, Any]:
    parsed = parsed or {}
    sender = parsed.get("sender") or summary.sender
    sender_email = parsed.get("sender_email") or ""
    subject = normalize_subject(parsed.get("subject") or summary.subject)
    text = normalize_text(parsed.get("text") or "")
    domain = domain_of(sender_email or sender)
    header_type = classify_summary(summary)
    combined = f"{sender} {domain} {subject} {text}".lower()
    attachments = parsed.get("attachments") or []

    finance_hits = hits(combined, FINANCE_TOKENS)
    security_hits = hits(combined, SECURITY_TOKENS)
    action_hits = hits(combined, ACTION_TOKENS)
    low_value_hits = hits(combined, LOW_VALUE_TOKENS)
    personal_hits = hits(combined, PERSONAL_TOKENS)

    action = "review"
    reason = "ambiguous_or_needs_context"
    confidence = 0.55

    if attachments:
        action, reason, confidence = "review", "has_attachment", 0.45
    elif finance_hits or header_type == TYPE_BILLING:
        action, reason, confidence = "keep", "financial_or_purchase_record", 0.92
    elif security_hits or header_type == TYPE_SECURITY:
        action, reason, confidence = "keep", "account_security_record", 0.92
    elif personal_hits:
        action, reason, confidence = "keep", "personal_travel_medical_career_or_contract_record", 0.86
    elif action_hits:
        action, reason, confidence = "review", "account_data_or_deadline_notice", 0.68
    elif header_type == TYPE_POLICY:
        action, reason, confidence = "review", "policy_or_terms_record", 0.62
    elif low_value_hits and header_type in {TYPE_DEV, TYPE_MARKETING, TYPE_NEWSLETTER}:
        action, reason, confidence = "delete_candidate", "old_low_value_notification", 0.82
    elif low_value_hits:
        action, reason, confidence = "delete_candidate", "old_low_risk_reminder_or_promotion", 0.74
    elif header_type in {TYPE_MARKETING, TYPE_NEWSLETTER}:
        action, reason, confidence = "delete_candidate", "newsletter_or_marketing_without_record_signal", 0.70

    return {
        "uid": summary.uid,
        "date": parsed.get("date") or summary.date,
        "from": sender,
        "sender_email": sender_email,
        "domain": domain,
        "subject": subject,
        "header_type": header_type,
        "action": action,
        "reason": reason,
        "confidence": confidence,
        "evidence": {
            "finance": finance_hits,
            "security": security_hits,
            "action": action_hits,
            "low_value": low_value_hits,
            "personal": personal_hits,
        },
        "attachments": attachments,
        "snippet": text[:420],
    }


def plan_delete_records(plan: dict[str, Any]) -> list[dict[str, Any]]:
    if plan.get("mode") != "safe-delete-plan":
        raise ValueError("Plan mode must be safe-delete-plan.")
    return [record for record in plan.get("records", []) if record.get("action") == "delete_candidate"]


def summarize_plan(plan: dict[str, Any]) -> str:
    summary = plan.get("summary") or {}
    lines = [
        f"Plan messages: {summary.get('count', 0)}",
        "By action:",
    ]
    for action, count in summary.get("by_action", []):
        lines.append(f"- {action}: {count}")
    lines.append("Delete candidates by domain:")
    for domain, count in summary.get("delete_by_domain", [])[:15]:
        lines.append(f"- {domain}: {count}")
    return "\n".join(lines)


def normalize_text(text: str) -> str:
    return " ".join((text or "").replace("\r", " ").replace("\n", " ").split())


def hits(text: str, tokens: list[str], limit: int = 5) -> list[str]:
    found: list[str] = []
    for token in tokens:
        if token.lower() in text:
            found.append(token)
            if len(found) >= limit:
                break
    return found
