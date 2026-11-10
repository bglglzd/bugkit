# Recipe: Slack / Discord webhook sink

Bug reports arrive in a Slack or Discord channel via a webhook. No DB, no admin UI.

**Best for:** teams that live in their chat app. Reports become messages; threads become discussion; thumbs-up = resolved.

---

## Prerequisites

### Slack
- An **Incoming Webhook** URL (`https://hooks.slack.com/services/...`)
  - Create in Slack → Apps → "Incoming Webhooks" → pick a channel
- Store as `BUGKIT_SLACK_WEBHOOK`

### Discord
- A channel webhook URL (`https://discord.com/api/webhooks/...`)
  - Create in Discord: Channel → Edit → Integrations → Webhooks → New Webhook
- Store as `BUGKIT_DISCORD_WEBHOOK`

Pick one or both.

---

## Message format

### Slack (Block Kit)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🐛 Bug Report #42" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Type:* bug" },
        { "type": "mrkdwn", "text": "*Reporter:* @op" },
        { "type": "mrkdwn", "text": "*Page:* <https://yoursite.com/c/foo|/c/foo>" },
        { "type": "mrkdwn", "text": "*Viewport:* 1920x1080" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "```\n{description}\n```" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Element:* `{element.selector}`\n*Text:* {element.text}" }
    }
  ],
  "attachments": [
    {
      "color": "#E84393",
      "text": "```{full AI context from SPEC.md §3}```",
      "footer": "bugkit_spec: 1 — copy the code block above and paste into Claude Code"
    }
  ]
}
```

### Discord (embed)

```json
{
  "embeds": [{
    "title": "🐛 Bug Report #42",
    "color": 15214227,
    "fields": [
      { "name": "Reporter", "value": "@op", "inline": true },
      { "name": "Type", "value": "bug", "inline": true },
      { "name": "Page", "value": "https://yoursite.com/c/foo" },
      { "name": "Description", "value": "{description truncated to 1024 chars}" },
      { "name": "Element", "value": "`{element.selector}`" }
    ],
    "footer": { "text": "bugkit_spec: 1" }
  }]
}
```

The examples above are optional previews, not containers for the complete context.
Discord's content field is limited to 2,000 characters. The implementation below
uploads the full UTF-8 context as a file; Slack receives ordered plain-text blocks
under its 3,000-character limit. No context is silently truncated.

---

## Implementation (minimal)

```ts
function splitText(text: string, limit = 2800): string[] {
  const chunks: string[] = []
  let current = ''
  for (const character of text) {
    if (current.length + character.length > limit) { chunks.push(current); current = '' }
    current += character
  }
  if (current) chunks.push(current)
  return chunks
}

export async function postToChat(report: BugReport) {
  const aiContext = buildAIContext(report)   // SPEC.md §3
  if (!process.env.BUGKIT_SLACK_WEBHOOK && !process.env.BUGKIT_DISCORD_WEBHOOK) throw new Error('No chat destination configured')

  if (process.env.BUGKIT_SLACK_WEBHOOK) {
    const chunks = splitText(aiContext)
    for (let i = 0; i < chunks.length; i++) {
      const response = await fetch(process.env.BUGKIT_SLACK_WEBHOOK, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `bugkit report context (${i + 1}/${chunks.length})`,
          blocks: [{ type: 'section', text: { type: 'plain_text', text: chunks[i], emoji: false } }],
          unfurl_links: false, unfurl_media: false,
        }), signal: AbortSignal.timeout(10000),
      })
      if (!response.ok || (await response.text()).trim() !== 'ok') throw new Error(`Slack delivery failed (${response.status})`)
    }
  }

  if (process.env.BUGKIT_DISCORD_WEBHOOK) {
    const hook = new URL(process.env.BUGKIT_DISCORD_WEBHOOK)
    hook.searchParams.set('wait', 'true')  // require Discord's delivery acknowledgement
    const filename = `bug-${String(report.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}.txt`
    const form = new FormData()
    form.append('payload_json', JSON.stringify({
      content: 'bugkit report context attached', allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename }],
    }))
    form.append('files[0]', new Blob([aiContext], { type: 'text/plain;charset=utf-8' }), filename)
    const response = await fetch(hook, { method: 'POST', body: form, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`Discord delivery failed (${response.status})`)
  }
}
```

Use Node 24 LTS built-in fetch/FormData/Blob. The report store remains the source of
truth. Propagate delivery errors and expose partial delivery separately from a
stored report; retrying after a partially accepted multi-message delivery can
duplicate notifications. Configure request-size/rate limits for your application.
See [Slack text limits](https://docs.slack.dev/reference/block-kit/composition-objects/text-object/)
and [Discord webhook/file parameters](https://docs.discord.com/developers/resources/webhook#execute-webhook).

---

## Status tracking

Webhooks are one-way — you post, you don't receive callbacks (unless you graduate to a full Slack/Discord bot with an interaction URL).

**MVP pattern:** pair with `jsonl-file.md` or a tiny DB for state. Chat apps are the notification layer; storage is elsewhere.

**Zero-state pattern:** admins use emoji reactions as a lightweight state signal:
- ✅ = resolved
- 🚫 = wontfix
- 👀 = in progress

No code enforces it; it's a team convention. Surprisingly workable for small teams.

---

## Discussion threads

Use Slack/Discord threads on the bot's message for back-and-forth. The AI context block stays at the root; discussion happens in replies. Clean separation.

---

## Acceptance checklist

- [ ] Submitting a bug report posts to the configured webhook
- [ ] Message includes: reporter, page, type, description, element selector (if present)
- [ ] A second message or attachment contains the SPEC.md §3 formatted block for one-tap copy
- [ ] No secrets exposed; webhook URL only in server env
