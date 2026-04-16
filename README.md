<div align="center">

<img src="./assets/logo.svg" alt="bugkit" width="120" />

# bugkit

**Users click. AI fixes. Done.**

*AI-friendly bug reports for any project. Paste the report into Claude Code, Cursor, or any AI agent — and the fix ships in minutes.*

<img src="./assets/hero.gif" alt="bugkit demo — user clicks the bug icon, picks an element, speaks a description, and Claude ships the fix" width="900" />

<br><br>

[![star on github](https://img.shields.io/github/stars/bglglzd/bugkit?style=social)](https://github.com/bglglzd/bugkit)
[![spec v1](https://img.shields.io/badge/spec-v1-blue)](./SPEC.md)
[![license MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

</div>

---

## Who this is for

**🛠  Building for a client, boss, or team lead**
Send them the staging link. They click the bug icon, pick what's broken, speak or type what they want. You paste into your AI agent. Fix ships the same day.

**🚀  Running a product with real users**
Users click the bug icon from inside your app. Reports arrive with full context (URL, selector, stack trace, voice transcript). Paste → AI fixes → user gets notified. No more "can you repro?" back-and-forth.

---

## Install

### Claude Code

Three commands. Paste each one separately and wait for it to finish before the next.

**1.** Add the bugkit marketplace:

```
/plugin marketplace add bglglzd/bugkit
```

**2.** Install the plugin:

```
/plugin install bugkit@bglglzd-bugkit
```

**3.** Start the installer in your project:

```
/bugkit:install
```

### Any other AI agent

Cursor, GitHub Copilot, ChatGPT, Gemini, Aider, Cline — paste this one line into the chat:

```
Install bugkit in this project from https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md
```

---

Either path detects your stack, asks **one** question (where should bug reports go — DB, GitHub Issues, Telegram, JSONL, email, Slack, Discord), and implements the matching [recipe](./recipes/). Voice transcription is offered too — 🎤 mic button next to the description field, Web Speech API by default, local Whisper as an offline upgrade, never paid APIs.

Full install takes about 5–10 minutes for a web app.

---

## Why this beats a feedback form

| Traditional feedback form | bugkit |
|---|---|
| "Something is broken" | Selector, XPath, HTML, viewport, stack trace, voice transcript |
| Fix takes days | Fix ships in minutes |
| Format differs per project | Standardized spec — same ritual across every project |
| No closed-loop status | Reporter notified at each state change |
| Typing long descriptions is a chore | 🎤 press-to-speak, auto-transcribed |

---

## Docs

- **[SPEC.md](./SPEC.md)** — the portable data contract
- **[recipes/](./recipes/)** — 7 sink adapters (DB, GitHub Issues, Telegram, JSONL, email, Slack, Discord, CLI)
- **[INSTALL.md](./INSTALL.md)** — the universal paste-in prompt for non-Claude-Code agents
- **[Landing page](https://bglglzd.github.io/bugkit)** — one-page tour with copy-ready install commands

---

MIT — use it anywhere. ⭐ Star or watch this repo for new releases.
