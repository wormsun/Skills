# Task Package Schema

Use this JSON shape when routing email into an agent task:

```json
{
  "source": "email",
  "account": "gmail-main",
  "message_uid": "123",
  "message_id": "<mail-message-id@example.com>",
  "sender": "customer@example.com",
  "subject": "Login failed after SSO update",
  "date": "2026-06-23T20:00:00+08:00",
  "intent": "bug_report",
  "summary": "Customer reports SSO login failing with 403 after an update.",
  "key_facts": [
    "Affects a paying customer",
    "Occurs during SSO login",
    "Error code is 403"
  ],
  "required_action": "Investigate cause and draft a customer reply.",
  "suggested_agent": "codex",
  "risk_level": "medium",
  "human_confirmation_required": true
}
```

Supported intents:

- `bug_report`
- `feature_request`
- `customer_complaint`
- `sales_inquiry`
- `invoice_or_receipt`
- `system_alert`
- `newsletter`
- `meeting_or_schedule`
- `contract_or_legal`
- `unknown`

## Routing Targets

- `codex`: Markdown prompt for Codex-style coding agents.
- `openclaw`: Markdown prompt with an explicit OpenClaw safety contract and return format.
- `claude-code`: Markdown prompt for Claude Code-style agents.
- `workbuddy`: Markdown prompt for work/task assistants.
- `json`: raw task package JSON for agents that own their own prompt rendering.

For OpenClaw, prefer:

```bash
python scripts/email_agent.py route --account gmail-main --id <uid> --target openclaw
```

For tool-native agents, prefer:

```bash
python scripts/email_agent.py route --account gmail-main --id <uid> --target json --format json
```
