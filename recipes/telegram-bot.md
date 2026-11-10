# Recipe: Telegram bot sink

Bug reports arrive as messages in a Telegram chat via a bot. Admin reads on their phone, clicks an inline button to get the AI context formatted, pastes into Claude Code.

**Best for:** solo developers who live in Telegram, tiny teams, mobile-first workflows.

---

## Prerequisites

- A Telegram bot token (get one from [@BotFather](https://t.me/botfather))
- The chat ID where reports should be posted (personal chat, group, or channel)
  - Send a test message to your bot (or mention it in the group), then read
    `message.chat.id` using `getUpdates` in a server-side admin client with its
    token supplied from the environment. Avoid token-bearing browser URLs.
- Store `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` in server-only env.
- Pattern B also requires `BUGKIT_TELEGRAM_TRACKING=true`, a random
  `TELEGRAM_WEBHOOK_SECRET` (32–256 allowed characters), and comma-separated
  numeric `TELEGRAM_ADMIN_USER_IDS`. A group chat alone is not authorization.
- The examples target Node 24 LTS built-in fetch, FormData and Blob. Reuse the canonical
  `buildAIContext` from `web-app-full.md`; adapt `getReport` and `updateStatus`
  to your store, comparing the complete string representation of IDs.

---

## Architecture choices

Two patterns:

### A. Fire-and-forget (simplest)

No persistence. Each bug report just sends a formatted message to the admin chat and is done. No status tracking. Admin replies in-chat or just fixes it. Works if you're disciplined and don't lose track.

### B. Persist + mirror (recommended)

Store reports in JSONL or SQLite, then mirror them to Telegram. Authorized admin
buttons retrieve context or resolve a report; Won't Fix asks for an actual reason.
Without tracking, the example sends a notification and context file without buttons.

Start with A. Upgrade to B if you have more than a handful of reports per week.

---

## Message format

What the bot posts to the admin chat:

```
🐛 Bug Report #42
━━━━━━━━━━━━━━━━━━━
Reporter: @username
Page: https://yoursite.com/c/...
Viewport: 1920x1080

The bookmark button doesn't work on mobile.
When I tap it, nothing happens.

Element: button.btn.btn-ghost
Text: "Bookmark"
━━━━━━━━━━━━━━━━━━━
```

With inline keyboard:
- `🤖 Copy for AI` — sends the full AI context as a UTF-8 file
- `✅ Mark Resolved` — moves status (pattern B only)
- `🚫 Won't Fix` — ditto
- `🔗 Open` — link to the full detail (if you have a web admin page)

---

## Implementation sketch (Node)

```ts
const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID!
const TRACKING = process.env.BUGKIT_TELEGRAM_TRACKING === 'true'

async function tg(method: string, payload: Record<string, unknown> | FormData) {
  const form = payload instanceof FormData
  const response = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: form ? undefined : { 'content-type': 'application/json' },
    body: form ? payload : JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) throw new Error(`Telegram delivery failed (${response.status})`)
  return body.result
}

async function sendContext(report: BugReport) {
  const hint = TRACKING
    ? `Use the authorized admin workflow for the full report ID ${report.id}`
    : 'Notification-only sink: record the resolution in your project tracker'
  const form = new FormData()
  form.append('chat_id', ADMIN_CHAT)
  const filename = `bug-${String(report.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}.txt`
  form.append('document', new Blob([buildAIContext(report, hint)], { type: 'text/plain;charset=utf-8' }), filename)
  return tg('sendDocument', form)
}

export async function sendBugToTelegram(report: BugReport) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !ADMIN_CHAT) throw new Error('Telegram delivery is not configured')
  const buttons = [
    { text: '🤖 Copy for AI', callback_data: `ctx:${report.id}` },
    { text: '✅ Resolved', callback_data: `res:${report.id}` },
    { text: "🚫 Won't Fix", callback_data: `wfx:${report.id}` },
  ]
  if (TRACKING && buttons.some(button => Buffer.byteLength(button.callback_data, 'utf8') > 64)) {
    throw new Error('Report ID exceeds Telegram callback limit; use persisted opaque callback tokens')
  }
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT,
    text: `🐛 Bug Report #${String(report.id).slice(0, 64)}\nReporter: ${String(report.reporter.name).slice(0, 80)}\n${report.description.slice(0, 700)}`,
    ...(TRACKING ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  })
  await sendContext(report)
}
```

For the "Copy for AI" button, Telegram doesn't have a native copy-to-clipboard. Two approaches:
1. **Post the context as a reply in a Markdown code block.** User long-presses the block on their phone to copy.
2. **Send as a `.txt` file attachment.** User taps → shares → pastes into Claude.

The example uses a UTF-8 `.txt` document, retaining the full context without
Telegram's message-size or Markdown-escaping limits. Preview text is deliberately
short; the context document contains the complete report.

---

## Webhook (for callback buttons)

You need a webhook endpoint to receive button clicks:

```ts
import { timingSafeEqual } from 'node:crypto'

// A single-process sketch. Persist pending prompts for serverless/multi-worker
// deployments, keyed by chat/message/admin identity with the same expiry.
const pendingReasons = new Map<string, { id: string, user: string, expires: number }>()
const ADMIN_USERS = new Set((process.env.TELEGRAM_ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean))
function authorized(chat: unknown, user: unknown) {
  return String(chat) === ADMIN_CHAT && ADMIN_USERS.has(String(user))
}

// POST /api/telegram/webhook
export async function handler(req: Request) {
  if (!TRACKING) return new Response('disabled', { status: 404 })
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || ''
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(secret) || !ADMIN_CHAT || !ADMIN_USERS.size) return new Response('not configured', { status: 503 })
  const provided = Buffer.from(req.headers.get('x-telegram-bot-api-secret-token') || '')
  const expected = Buffer.from(secret)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return new Response('forbidden', { status: 403 })
  let update
  try { update = await req.json() } catch { return new Response('invalid update', { status: 400 }) }
  for (const [key, pending] of pendingReasons) if (pending.expires < Date.now()) pendingReasons.delete(key)
  const callback = update.callback_query
  if (!callback) {
    const message = update.message
    if (!message) return new Response('ok')
    if (!authorized(message.chat?.id, message.from?.id)) return new Response('forbidden', { status: 403 })
    const key = `${ADMIN_CHAT}:${message.reply_to_message?.message_id}`
    const pending = pendingReasons.get(key)
    if (!pending || pending.user !== String(message.from.id)) return new Response('ok')
    const reason = typeof message.text === 'string' ? message.text.trim() : ''
    if (!reason || reason.length > 2000) return new Response('reason required (1–2000 characters)', { status: 400 })
    await updateStatus(pending.id, 'wontfix', reason)
    pendingReasons.delete(key)
    await tg('sendMessage', { chat_id: ADMIN_CHAT, text: 'Reason saved.' })
    return new Response('ok')
  }
  if (!authorized(callback.message?.chat?.id, callback.from?.id)) return new Response('forbidden', { status: 403 })
  const data = typeof callback.data === 'string' ? callback.data : ''
  const separator = data.indexOf(':')
  const action = data.slice(0, separator), id = data.slice(separator + 1)
  if (separator < 1 || !id || !['ctx', 'res', 'wfx'].includes(action) || Buffer.byteLength(data, 'utf8') > 64) return new Response('invalid callback', { status: 400 })

  if (action === 'ctx') {
    const report = await getReport(id)
    if (!report) return new Response('not found', { status: 404 })
    await sendContext(report)
    await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Context sent as a file' })
  } else if (action === 'res') {
    await updateStatus(id, 'resolved', 'Marked resolved by an authorized administrator via Telegram')
    await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Marked resolved' })
  } else if (action === 'wfx') {
    if (pendingReasons.size >= 1000) return new Response('too many pending prompts', { status: 503 })
    const prompt = await tg('sendMessage', {
      chat_id: ADMIN_CHAT,
      text: `Reply with a reason for marking #${id} as won't fix:`,
      reply_markup: { force_reply: true, selective: true },
    })
    if (!Number.isInteger(prompt?.message_id)) throw new Error('Telegram did not return a prompt ID')
    pendingReasons.set(`${ADMIN_CHAT}:${prompt.message_id}`, { id, user: String(callback.from.id), expires: Date.now() + 15 * 60 * 1000 })
    await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Reply with a reason' })
  }

  return new Response('ok')
}
```

Register an HTTPS webhook with Telegram's `setWebhook` API and the same
`secret_token` stored in `TELEGRAM_WEBHOOK_SECRET`. Keep tokens out of shell
history/logs and source. Apply your framework's request-size and rate limits.
See the [official webhook contract](https://core.telegram.org/bots/api#setwebhook).

---

## Storage (pattern B)

If you're going beyond fire-and-forget, use `recipes/jsonl-file.md` for storage. The Telegram recipe is just the notification + admin layer on top.

---

## Closing the loop (notifying the reporter)

If reporter is also a Telegram user (because reports come from another Telegram bot), DM them directly.

If reporter submitted from a web app: reuse the web app's in-app notification system, OR send them an email via `recipes/email.md`, OR skip — Telegram-only setups often have a tight enough loop that admins just ping users directly.

---

## Acceptance checklist

- [ ] Server-only bot token and admin chat ID configured
- [ ] Tracking webhook requires its secret header plus allowed admin chat/user IDs
- [ ] Missing/incorrect authorization causes no storage read, mutation or delivery
- [ ] UUID IDs remain intact; callback data fits Telegram's 64-byte limit
- [ ] Bug submission sends a formatted message to the admin chat
- [ ] Full SPEC.md §3 context arrives as a UTF-8 file, including long reports
- [ ] HTTP errors and Telegram `ok: false` reject the operation
- [ ] Admin can mark reports resolved/wontfix via inline buttons
- [ ] Webhook is registered and receives callback queries
