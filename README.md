# bugkit

**AI-friendly bug reports for any project.** Users report bugs with rich context. Admins hit one button. Paste into Claude Code (or any AI). Fix ships. Reporter gets notified. Loop closes in minutes, not days.

---

## The ritual

```
User finds bug
  ↓ (clicks bug icon, optionally picks the broken element)
Bug report saved with full context (URL, stack trace, selector, viewport...)
  ↓
Admin opens report → clicks "Copy Context for AI"
  ↓ (standardized prompt with everything the AI needs)
Paste into Claude Code / Copilot / ChatGPT / etc.
  ↓
AI fixes the bug, ships a commit
  ↓
Admin marks report "resolved" with a short note + commit SHA
  ↓
Reporter gets notified
```

No translation step. No "can you repro?" back-and-forth. The context that a human would gather manually is captured at the moment the bug happens.

---

## Install (one prompt, any project)

Open Claude Code in your project and paste **[INSTALL.md](./INSTALL.md)**. That's it.

Claude will:
1. Detect your stack (web app / CLI / API / static site / mobile / etc.)
2. Ask **one** question: where should bug reports go? (a local DB, GitHub Issues, Telegram, a JSONL file, email, Slack, Discord, or a combination)
3. Implement the right adapter from [`recipes/`](./recipes)
4. Keep the **[AI context format](./SPEC.md#ai-context-format)** identical regardless of stack — so the Copy-Context ritual works the same everywhere

Takes ~5-10 minutes for a full web app install.

---

## Why this beats a random "feedback" form

| Traditional feedback form | bugkit |
|---|---|
| "Something is broken" | Selector, XPath, HTML, viewport, URL, stack trace |
| Admin reads, asks clarifying questions | Admin pastes to AI, AI already has everything |
| Fix takes days | Fix ships in minutes |
| No closed-loop status | Reporter notified at each state change |
| Each project's format is different | Standardized spec — same ritual across all your projects |

---

## Documentation

- **[INSTALL.md](./INSTALL.md)** — the prompt to paste into Claude Code
- **[SPEC.md](./SPEC.md)** — data schema + AI context format (the portable standard)
- **[recipes/](./recipes/)** — pre-tuned adapters per sink (DB, GH Issues, Telegram, file, email, Slack, Discord)
- **[examples/](./examples/)** — what the AI context output actually looks like

---

## License

MIT — use it anywhere, no attribution required (but stars are appreciated).
