# Recipe: Email sink

Bug reports arrive as emails to a specified address. No DB, no admin UI — admins triage in their inbox.

**Best for:** tiny teams, side projects, projects where email is already the collaboration channel.

---

## Prerequisites

One of:
- SMTP credentials (Gmail app password, AWS SES, Postmark, etc.)
- A transactional email provider API key (Resend, SendGrid, Mailgun, Postmark)

Plus:
- `BUGKIT_EMAIL_TO` — admin email address
- `BUGKIT_EMAIL_FROM` — sender (e.g. `noreply@yourapp.com`)

---

## Email format

Subject: `[BUG #{id}] {title}` or `[FEATURE #{id}] {title}`

HTML body:

```html
<h2>🐛 Bug Report #{id}</h2>
<p><strong>Reporter:</strong> {reporter.name} ({reporter.email || 'no email'})<br>
   <strong>Page:</strong> {page.url}<br>
   <strong>Viewport:</strong> {viewport}</p>

<h3>Description</h3>
<p style="white-space: pre-wrap">{description}</p>

<h3>Selected Element</h3>
<pre>Selector: {element.selector}
XPath: {element.xpath}
Text: {element.text}</pre>

<hr>
<details>
  <summary>🤖 Copy this into Claude Code</summary>
  <pre>{SPEC.md §3 formatted text}</pre>
</details>

<p style="color: #888; font-size: 12px">bugkit_spec: 1 · sent from yourapp.com</p>
```

**Key trick:** bake the AI context format directly into the email inside a `<details>` block (or a `<pre>` block at the bottom). Admin can copy-select the text and paste into Claude Code.

---

## Implementation sketch (Resend)

```ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendBugByEmail(report: BugReport) {
  const aiContext = buildAIContext(report)     // SPEC.md §3 template

  await resend.emails.send({
    from: process.env.BUGKIT_EMAIL_FROM!,
    to: process.env.BUGKIT_EMAIL_TO!,
    subject: `[${report.type.toUpperCase()} #${report.id}] ${report.title}`,
    html: renderHtml(report, aiContext),
    text: renderPlainText(report, aiContext),  // fallback
  })
}
```

Use any email library — `nodemailer`, `@sendgrid/mail`, `mailgun.js`, whatever the project already has.

---

## Status tracking

Email alone is write-only — there's no way to update status after sending. Options:

### A. Fire-and-forget (MVP)

Just send. No status tracking. Admins reply to the user directly when fixed. Simple, works for <10 reports/week.

### B. Pair with JSONL (recommended)

Combine this recipe with `jsonl-file.md`:
1. Store report in JSONL (the source of truth)
2. Also email the admin
3. Admin uses `bugkit close N "<note>"` CLI to update status
4. Optionally, second email to the reporter when status changes (if they provided an email)

### C. Reply parsing (advanced)

If you have inbound email infrastructure (AWS SES + Lambda, Mailgun routes, Postmark webhooks), admins can reply with:
- `RESOLVED: <note>` — updates status
- `WONTFIX: <reason>` — closes

Parse the reply, match to the original report by subject line (`[BUG #42]`), update JSONL/DB. Most projects won't need this.

---

## Notify reporter on status change

Only if they provided an email. Skip if not.

```ts
async function notifyReporter(report: BugReport) {
  if (!report.reporter.email) return
  await resend.emails.send({
    from: process.env.BUGKIT_EMAIL_FROM!,
    to: report.reporter.email,
    subject: `Re: [${report.type.toUpperCase()} #${report.id}] ${report.title}`,
    html: `<p>Your bug report has been marked <strong>${report.status}</strong>.</p>
           ${report.resolution ? `<p>${report.resolution}</p>` : ''}
           <p style="color:#888;font-size:12px">bugkit · yourapp.com</p>`,
  })
}
```

---

## Acceptance checklist

- [ ] Submitting a report sends an email to the admin address
- [ ] Email subject has `[BUG #id]` / `[FEATURE #id]` prefix
- [ ] Email body includes a `<details>` block with SPEC.md §3 formatted text
- [ ] Admin can select the text from `<details>` and paste into Claude without cleanup
- [ ] (Optional) Reporter gets a second email when status changes, if email provided
