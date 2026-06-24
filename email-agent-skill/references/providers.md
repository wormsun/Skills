# Provider Reference

Provider presets are hints, not guarantees. Always confirm mailbox availability through IMAP `LIST` before safe-delete.

## Built-In Presets

| Provider | IMAP | SMTP | Safe-delete candidates |
|---|---|---|---|
| gmail | `imap.gmail.com:993 ssl` | `smtp.gmail.com:465 ssl` or `587 starttls` | special-use `\Trash`, `[Gmail]/Trash`, `[Google Mail]/Trash` |
| outlook | `outlook.office365.com:993 ssl` | `smtp.office365.com:587 starttls` | special-use `\Trash` or `\Deleted`, `Deleted Items` |
| qq | `imap.qq.com:993 ssl` | `smtp.qq.com:465 ssl` | special-use first, then user-configured mailbox |
| 163 | `imap.163.com:993 ssl` | `smtp.163.com:465 ssl` | special-use first, then user-configured mailbox |
| custom | user-defined | user-defined | user-configured mailbox required when discovery fails |

## Safe-Delete Resolution

Resolve the target mailbox in this order:

1. Explicit `delete.target_mailbox` when it is not `auto`.
2. IMAP special-use flags such as `\Trash` or `\Deleted`.
3. Provider candidate names.
4. User-confirmed quarantine mailbox such as `EmailAgent/Quarantine`.

If no target is found, fail closed and do not modify the message.
