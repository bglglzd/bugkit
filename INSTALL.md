# bugkit — universal install prompt

> **How to use this file (not Claude Code):**
>
> - **Cursor / Copilot Chat / ChatGPT / Codex / Gemini CLI / Aider / Cline:** paste this into your AI chat:
>
>   ```
>   Install bugkit in this project from https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md
>   ```
>
>   The agent fetches this file and follows it.
>
> - **Any AI agent that doesn't auto-fetch URLs:** copy the content below the `---` line into the chat directly.
>
> **Claude Code users should NOT use this file.** Run `/plugin marketplace add bglglzd/bugkit`, `/plugin install bugkit@bglglzd-bugkit`, then `/bugkit:install` instead.

---

You are installing **bugkit** — a portable, AI-friendly bug report system — into the current project. The value: reports carry enough context (URL, element selector, stack trace, viewport, etc.) that an AI assistant can fix the bug from one paste. The data contract is standardized in **bugkit Spec v1** so the "Copy Context → Paste → Fix → Close" ritual is identical across any project that installs it.

## Step 1 — Understand the project

1. **Stack** — read `package.json` / `go.mod` / `Cargo.toml` / `pyproject.toml` / `requirements.txt` / `composer.json` / `Gemfile` / etc.
2. **Shape** — full-stack web app, API-only backend, CLI tool, static site, mobile app, bot, other.
3. **Existing infra** — database, auth, notifications layer, CI/CD. Reuse what exists.
4. **Conventions** — skim `CLAUDE.md`, `AGENTS.md`, a source file or two. Match the project's style.

Report back three bullets on what you found, then continue.

## Step 2 — Ask ONE question

Ask the user:

> **Where should bug reports be stored or delivered?** Pick one:
> 1. **Local DB** (recommended if the project has one) — full admin UI with status tracking
> 2. **GitHub Issues** — no DB needed; bugs open as issues with a `bugkit` label
> 3. **Telegram** — bugs get DM'd to a chat via bot token
> 4. **JSONL file** — simplest; append to `./.bugreports.jsonl`. Local-only.
> 5. **Email** — send via SMTP / SendGrid / Resend
> 6. **Slack** / **Discord** — webhook to a channel
> 7. **Multiple** — e.g. "DB + mirror to Telegram for notifications"

Recommend based on stack if unsure:
- Full-stack web app with a DB → option 1
- Open-source CLI / static site → option 2
- Personal / MVP → option 4, upgrade later
- Solo dev in Telegram → option 3

## Step 3 — Fetch the matching recipe and implement

| Sink | Recipe URL |
|---|---|
| Local DB | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/web-app-full.md` |
| GitHub Issues | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/github-issues.md` |
| Telegram | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/telegram-bot.md` |
| JSONL | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/jsonl-file.md` |
| Email | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/email.md` |
| Slack / Discord | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/slack-discord.md` |
| CLI | `https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/cli-tool.md` |

Fetch the chosen recipe and follow it. Non-negotiables from the spec (`https://raw.githubusercontent.com/bglglzd/bugkit/main/SPEC.md`):

1. **Field names** — use exactly: `id, type, title, description, status, created_at, reporter, environment, page, client, element, error, logs, attachments, resolution, resolved_at, resolved_by, commit_sha, how_to_verify`. Do not rename.
2. **Status lifecycle** — `open → in_progress → resolved → closed`, plus terminal `wontfix`. Resolution required when moving to a terminal state.
3. **AI context format** — admins MUST be able to produce the exact text block from SPEC.md §3. Do not reorder sections, do not invent new labels.
4. **`bugkit_spec: "1"`** — include in stored reports.

## Step 4 — Offer voice transcription (web recipes only)

If the chosen recipe produces a browser-facing form (Local DB, GitHub Issues, or similar), after the main install succeeds, ask:

> **Voice transcription lets reporters speak their bug description instead of typing. Uses the browser's Web Speech API by default — free, no keys, works in Chrome/Edge/Safari. Want to enable it? (Y/n)**

If yes, add a 🎤 mic button next to the description textarea. Wire up the Web Speech API per `recipes/web-app-full.md §Voice (optional)`. Optional upgrade: local Whisper (whisper.cpp) via a thin `/api/bugkit/transcribe` proxy. Never suggest a paid API unless the user explicitly asks.

## Step 5 — Verify

Before declaring done:

1. Submit a test report using the actual UI / CLI / bot command (not curl — the real flow).
2. Confirm the report appears in the chosen sink.
3. Generate the Copy-Context output and verify it matches SPEC.md §3 — section order, exact labels, no extra decoration.
4. If applicable, change status to `resolved` with a short note and confirm the reporter would see the update.

## Step 6 — Report back

1. Sink chosen.
2. Files created or modified.
3. How to test it (URL, command, or interaction).
4. How the admin copies context and closes the loop once a fix is in.
5. Whether voice is enabled and which path it's using.

## Things to avoid

- Don't pull in a heavy ORM or new DB just for this — use what's there, or JSONL.
- Don't rename spec field names. Add new fields or map. Portability is the point.
- Don't make the element picker fancy. Minimal: outline on hover, click to capture, Esc to cancel.
- Don't gate bug reporting behind complex auth flows.
- Don't skip the reporter notification on status change.
- Don't ask more than the one sink question + optional voice question.

## If you get stuck

- Read SPEC.md in full.
- Read the chosen recipe in full.
- Compose from multiple recipes if needed — but keep the Copy-Context format unchanged.
- Ask the user for one missing piece at a time.
