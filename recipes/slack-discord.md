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

Follow with a second message posted to the same channel containing `\`\`\`\n{SPEC.md §3 formatted}\n\`\`\`` so admins can copy-long-press.

---

## Implementation (minimal)

```ts
export async function postToChat(report: BugReport) {
  const aiContext = buildAIContext(report)   // SPEC.md §3

  if (process.env.BUGKIT_SLACK_WEBHOOK) {
    await fetch(process.env.BUGKIT_SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildSlackMessage(report, aiContext)),
    })
  }

  if (process.env.BUGKIT_DISCORD_WEBHOOK) {
    const hook = process.env.BUGKIT_DISCORD_WEBHOOK
    await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildDiscordEmbed(report)),
    })
    // Follow-up: full context in a code block for easy copy
    await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: '```\n' + aiContext + '\n```',
      }),
    })
  }
}
```

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
