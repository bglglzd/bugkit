# Recipe: Telegram bot sink

Bug reports arrive as messages in a Telegram chat via a bot. Admin reads on their phone, clicks an inline button to get the AI context formatted, pastes into Claude Code.

**Best for:** solo developers who live in Telegram, tiny teams, mobile-first workflows.

---

## Prerequisites

- A Telegram bot token (get one from [@BotFather](https://t.me/botfather))
- The chat ID where reports should be posted (personal chat, group, or channel)
  - For personal DM: send any message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` — look for `message.chat.id`
  - For a group: add the bot, send a message mentioning it, visit the same URL
- Stored as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` in env

---

## Architecture choices

Two patterns:

### A. Fire-and-forget (simplest)

No persistence. Each bug report just sends a formatted message to the admin chat and is done. No status tracking. Admin replies in-chat or just fixes it. Works if you're disciplined and don't lose track.

### B. Persist + mirror (recommended)

Store reports in a JSONL file or tiny SQLite DB so you have status tracking. Also send them to Telegram for notification. Admin can reply to the Telegram message with `/resolve 42 <note>` and the bot updates the JSONL/DB.

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
- `🤖 Copy for AI` — replies with the full AI context in a code block
- `✅ Mark Resolved` — moves status (pattern B only)
- `🚫 Won't Fix` — ditto
- `🔗 Open` — link to the full detail (if you have a web admin page)

---

## Implementation sketch (Node)

```ts
import fetch from 'node-fetch'

const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID!

export async function sendBugToTelegram(report: BugReport) {
  const text = [
    `🐛 *Bug Report #${report.id}*`,
    `━━━━━━━━━━━━━━━`,
    `*Reporter:* @${report.reporter.name}`,
    report.page_url ? `*Page:* ${report.page_url}` : '',
    report.viewport ? `*Viewport:* ${report.viewport}` : '',
    '',
    report.description,
    '',
    report.element_context?.selector ? `*Element:* \`${report.element_context.selector}\`` : '',
  ].filter(Boolean).join('\n')

  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🤖 Copy for AI', callback_data: `ctx:${report.id}` },
          { text: '✅ Resolved', callback_data: `res:${report.id}` },
          { text: '🚫 Won\'t Fix', callback_data: `wfx:${report.id}` },
        ]],
      },
    }),
  })
}
```

For the "Copy for AI" button, Telegram doesn't have a native copy-to-clipboard. Two approaches:
1. **Post the context as a reply in a Markdown code block.** User long-presses the block on their phone to copy.
2. **Send as a `.txt` file attachment.** User taps → shares → pastes into Claude.

Option 1 is smoother on mobile. Build the AI context from `SPEC.md §3` and send it inside triple-backtick fences.

---

## Webhook (for callback buttons)

You need a webhook endpoint to receive button clicks:

```ts
// POST /api/telegram/webhook
export async function handler(req: Request) {
  const update = await req.json()
  const callback = update.callback_query
  if (!callback) return new Response('ok')

  const [action, idStr] = callback.data.split(':')
  const id = parseInt(idStr, 10)

  if (action === 'ctx') {
    const report = await getReport(id)
    const ctx = buildAIContext(report)    // SPEC.md §3 format
    await tg('sendMessage', {
      chat_id: callback.message.chat.id,
      reply_to_message_id: callback.message.message_id,
      text: '```\n' + ctx + '\n```',
      parse_mode: 'MarkdownV2',
    })
  } else if (action === 'res') {
    await updateStatus(id, 'resolved', 'Fixed (via Telegram)')
    await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Marked resolved' })
  } else if (action === 'wfx') {
    // Ask the admin to reply with a reason
    await tg('sendMessage', {
      chat_id: callback.message.chat.id,
      reply_to_message_id: callback.message.message_id,
      text: `Reply with reason for marking #${id} as won\\'t fix:`,
      reply_markup: { force_reply: true, selective: true },
    })
    // Track the pending reply in memory/DB; on reply, call updateStatus(id, 'wontfix', reply.text)
  }

  return new Response('ok')
}
```

Register the webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourapp.com/api/telegram/webhook"`.

---

## Storage (pattern B)

If you're going beyond fire-and-forget, use `recipes/jsonl-file.md` for storage. The Telegram recipe is just the notification + admin layer on top.

---

## Closing the loop (notifying the reporter)

If reporter is also a Telegram user (because reports come from another Telegram bot), DM them directly.

If reporter submitted from a web app: reuse the web app's in-app notification system, OR send them an email via `recipes/email.md`, OR skip — Telegram-only setups often have a tight enough loop that admins just ping users directly.

---

## Acceptance checklist

- [ ] Bot token + admin chat ID in env vars
- [ ] Bug submission sends a formatted message to the admin chat
- [ ] Inline "Copy for AI" button replies with SPEC.md §3 formatted text in a code block
- [ ] Admin can mark reports resolved/wontfix via inline buttons
- [ ] Webhook is registered and receives callback queries
