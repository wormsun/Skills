from __future__ import annotations

from collections import Counter
from email.utils import getaddresses
from typing import Any

from imap_client import MessageSummary


TYPE_SECURITY = "安全/账号通知"
TYPE_BILLING = "账单/订阅/收据"
TYPE_POLICY = "政策/条款更新"
TYPE_LEARNING = "学习/课程推荐"
TYPE_NEWSLETTER = "Newsletter/摘要"
TYPE_DEV = "开发者/技术平台通知"
TYPE_MARKETING = "营销/产品推广"
TYPE_CONFIRMATION = "注册/确认/提醒"
TYPE_OTHER = "其他/需人工判断"

PROTECTED_TYPES = {TYPE_SECURITY, TYPE_BILLING, TYPE_POLICY}


def analyze_summaries(messages: list[MessageSummary], recent_limit: int = 20) -> dict[str, Any]:
    rows = [summary_to_record(message) for message in messages]
    by_type = Counter(row["type"] for row in rows)
    by_year = Counter(row["year"] for row in rows)
    by_domain = Counter(row["domain"] for row in rows)
    sorted_rows = sorted(rows, key=lambda row: row["date"] or "", reverse=True)
    oldest_rows = sorted(rows, key=lambda row: row["date"] or "")
    return {
        "count": len(rows),
        "by_type": by_type.most_common(),
        "by_year": sorted(by_year.items()),
        "top_domains": by_domain.most_common(15),
        "recent": sorted_rows[:recent_limit],
        "oldest": oldest_rows[:5],
    }


def summary_to_record(message: MessageSummary) -> dict[str, Any]:
    year = "unknown"
    if message.date and len(message.date) >= 4 and message.date[:4].isdigit():
        year = message.date[:4]
    sender_domain = domain_of(message.sender)
    return {
        "uid": message.uid,
        "date": message.date,
        "year": year,
        "from": message.sender,
        "subject": normalize_subject(message.subject),
        "type": classify_summary(message),
        "domain": sender_domain,
        "flags": message.flags,
    }


def classify_summary(message: MessageSummary) -> str:
    sender = message.sender.lower()
    subject = normalize_subject(message.subject).lower()
    combined = f"{sender} {subject}"
    domain = domain_of(sender)

    if is_account_security_notice(domain, combined):
        return TYPE_SECURITY
    if contains_any(combined, ["receipt", "invoice", "订单收据", "收据", "payment", "付款", "subscription", "订阅", "google play", "google one"]):
        return TYPE_BILLING
    if contains_any(combined, ["privacy policy", "terms of service", "agreement", "隐私", "条款", "policy"]):
        return TYPE_POLICY
    if domain in {"coursera.org", "email.coursera.org", "edx.org", "freecodecamp.org"} or contains_any(combined, ["course", "课程", "learn ", "学习"]):
        return TYPE_LEARNING
    if contains_any(combined, ["newsletter", "weekly", "summary", "digest", "周报", "每周", "精选"]) or "newsletter" in domain:
        return TYPE_NEWSLETTER
    if is_developer_notice(domain, combined):
        return TYPE_DEV
    if is_marketing_notice(domain, combined):
        return TYPE_MARKETING
    if contains_any(combined, ["confirmation", "welcome", "注册", "已添加", "reminder", "提醒"]):
        return TYPE_CONFIRMATION
    return TYPE_OTHER


def is_account_security_notice(domain: str, text: str) -> bool:
    account_domains = {
        "accounts.google.com",
        "security.google.com",
        "appleid.apple.com",
        "github.com",
        "gitlab.com",
    }
    account_tokens = ["安全提醒", "password", "密码", "two-step", "2-step", "两步验证", "verification code", "验证码", "credential security"]
    if domain in account_domains and contains_any(text, account_tokens):
        return True
    return contains_any(text, ["your account", "您的账号", "sign-in", "login alert"]) and contains_any(text, account_tokens)


def is_developer_notice(domain: str, text: str) -> bool:
    developer_domains = {
        "git.oschina.net",
        "gitlab.com",
        "github.com",
        "google.com",
        "cloud.google.com",
        "firecrawl.dev",
        "kaggle.com",
        "mail.trae.ai",
        "nvidia.com",
        "notifications@vercel.com",
        "vercel.com",
        "alauda.cn",
    }
    if domain in developer_domains:
        return True
    return contains_any(text, ["api", "cloud", "developer", "developers", "competition launch", "product update", "build ", "studio", "sdk"])


def is_marketing_notice(domain: str, text: str) -> bool:
    marketing_domains = {
        "mail.adobe.com",
        "info.wise.com",
        "digital.similarweb.com",
        "mentor.com",
        "youmind.ai",
        "creators.suno.com",
        "genspark.ai",
    }
    if domain in marketing_domains:
        return True
    return contains_any(text, ["sale", "offer", "discount", "reward", "promo", "marketing", "优惠", "免费申请", "大奖", "try ", "new!", "introducing"])


def is_cleanup_protected(message: MessageSummary) -> bool:
    return classify_summary(message) in PROTECTED_TYPES


def domain_of(sender: str) -> str:
    pairs = getaddresses([sender])
    address = (pairs[0][1] if pairs else sender).lower()
    return address.rsplit("@", 1)[-1] if "@" in address else address


def normalize_subject(subject: str) -> str:
    return " ".join((subject or "").replace("\r", " ").replace("\n", " ").split())


def contains_any(text: str, tokens: list[str]) -> bool:
    return any(token in text for token in tokens)
