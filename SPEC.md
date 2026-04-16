# bugkit Spec v1

This document defines the **portable data contract** for bug reports and the **AI context format** that makes the Copy-Paste-Fix ritual work across any stack.

Implementations are free to vary the storage, UI, and notification mechanics, but MUST keep the field names and the AI context format compatible with this spec. That's what makes the ritual portable.

---

## 1. Report shape

### Required fields

| Field | Type | Notes |
|---|---|---|
| `id` | string or integer | Unique within the sink |
| `type` | `"bug" \| "feature"` | Defaults to `bug` |
| `title` | string (≤200 chars) | First line of description if not provided separately |
| `description` | string (5-10,000 chars) | Full user-provided text |
| `status` | `"open" \| "in_progress" \| "resolved" \| "closed" \| "wontfix"` | Defaults to `open` |
| `created_at` | ISO-8601 timestamp | UTC |
| `reporter` | object | See below |

### `reporter` object

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identifier in your system |
| `name` | string | Display name / handle |
| `email` | string (optional) | For follow-up |

### Optional context blocks

Everything below is **optional** — capture what your platform can provide.

```jsonc
{
  "environment": {
    "app_version": "1.4.2",
    "commit": "abc1234",
    "platform": "web | ios | android | cli | desktop | bot | other",
    "os": "macOS 14.4 / Windows 11 / ...",
    "locale": "en-US"
  },
  "page": {                       // web / webview only
    "url": "https://example.com/path?x=1",
    "route": "users/[id]/settings",
    "referrer": "..."
  },
  "client": {                     // web / desktop
    "user_agent": "Mozilla/5.0 ...",
    "viewport": "1920x1080"
  },
  "element": {                    // web only — element picker output
    "selector": "button.btn.btn-primary",
    "xpath": "/html/body/div[1]/...",
    "tag": "BUTTON",
    "id": "",
    "classes": "btn btn-primary",
    "text": "Reply",
    "html": "<button class=\"...\">Reply</button>",
    "rect": { "x": 450, "y": 600, "w": 120, "h": 32 }
  },
  "error": {                      // from crash/exception
    "message": "...",
    "stack": "...",
    "source_file": "...",
    "line": 42
  },
  "logs": {
    "console": ["string", "..."],           // last N lines
    "network_errors": [{"url": "...", "status": 500}],
    "telemetry_id": "trace-or-span-id"      // if you have APM
  },
  "attachments": [
    { "type": "screenshot", "url": "https://..." },
    { "type": "har", "url": "https://..." }
  ]
}
```

### Resolution fields

Populated when status moves to a terminal state:

| Field | Type | Notes |
|---|---|---|
| `resolution` | string (≤2000 chars) | Short — what was done or why closed/refused |
| `resolved_at` | ISO-8601 timestamp | Set when status first moves to terminal |
| `resolved_by` | string | User ID / "ai" / "system" |
| `commit_sha` | string (optional) | Link the fix to source |
| `how_to_verify` | string (optional, ≤500) | Paste-able steps |

---

## 2. Status lifecycle

```
                    ┌────────────────────┐
                    │                    ▼
  open ──► in_progress ──► resolved ──► closed
    │          │              ▲
    │          └──────────────┘ (reopen if verification fails)
    │
    └──► wontfix   (terminal, with reason in `resolution`)
```

- `open` — freshly submitted, awaiting triage
- `in_progress` — someone is working on it
- `resolved` — fix shipped, reporter should verify
- `closed` — verified or archived
- `wontfix` — rejected; `resolution` MUST explain why

---

## 3. AI context format

**This is the portable piece.** Every implementation MUST produce this exact format when the admin hits "Copy Context for AI". The field names and order matter — AI assistants are trained to parse predictable layouts.

```
=== BUG REPORT #{id} ===
Type: {type}
Status: {status}
Reported: {created_at} by @{reporter.name}

## Description
{description}

## Environment
App: {environment.app_version} (commit {environment.commit})
Platform: {environment.platform}
OS: {environment.os}

## Page
URL: {page.url}
Route: {page.route}
Viewport: {client.viewport}
User Agent: {client.user_agent}

## Selected Element
Selector: {element.selector}
XPath: {element.xpath}
Tag: {element.tag}
ID: {element.id}
Classes: {element.classes}
Visible text: {element.text}
Position: x={rect.x} y={rect.y} w={rect.w} h={rect.h}
HTML:
{element.html}

## Error
Message: {error.message}
Stack:
{error.stack}

## Recent Console
{logs.console joined by newlines}

## Attachments
- {type}: {url}

## Instructions
{Fix this bug | Implement this feature}. When done:
1. Summarize root cause and files changed.
2. Provide a short "how to verify" note.
3. Update the report via: {update_hint}
   With: { status: "resolved", resolution: "<short note>", commit_sha: "<sha>" }
   (Or status "wontfix" / "closed" with a reason.)
```

Omit any section where all fields are empty. Sections with partial data should still render with available fields.

### `update_hint`

A short, platform-appropriate hint for how to close the loop. Examples:
- Web app with DB: `PATCH /api/bug-reports/{id}`
- GitHub Issues: `gh issue edit {id} --add-label bugkit-resolved --body-file resolution.md`
- Telegram sink: `POST to the bugkit bot: /resolve {id} <note>`
- JSONL file: `append a line to .bugreports.jsonl with {id, status, resolution}`

Pick one that matches how reports are actually stored.

---

## 4. Minimum feature set for any implementation

Mandatory:
1. Create a report with at least `{type, title, description, reporter, created_at}`
2. Capture as much optional context as the platform can provide
3. Status lifecycle as defined
4. A way for admins to produce the **exact** AI context format above
5. A way to update status + resolution

Recommended:
- Notify reporter on status change
- Filter admin list by status
- Link resolution to a commit SHA when possible
- Rate-limit submissions per user

Out of scope for this spec (do it however you want):
- Authentication model
- Permissions
- Admin UI framework
- Deduplication / duplicate detection
- Attachments storage

---

## 5. Versioning

This is **Spec v1**. Breaking changes will bump to v2 and be announced in the repo. Additive changes (new optional fields) stay on v1.

Implementations should emit `bugkit_spec: "1"` somewhere in stored reports so future tools can tell what format to expect.
