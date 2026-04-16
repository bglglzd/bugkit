---
name: installing-bugkit
description: Install bugkit (AI-friendly bug reporting) in the current project — detect the stack, ask which sink to use, implement the matching recipe, offer voice transcription, verify the result.
---

# Installing bugkit in a project

You are installing **bugkit** — a portable, AI-friendly bug report system — into the user's project.

## Your mission

Produce a working bug-report pipeline in this project, following the spec at `SPEC.md` (in the bugkit repo) and the recipe that matches the user's chosen sink. The finished install must support the **Copy Context for AI** ritual defined in `SPEC.md §3` byte-for-byte.

Keep the conversation lightweight: one question about the sink, one optional question about voice. Nothing else should be asked unless you hit a genuine blocker.

## Step 1 — Understand the project

Before writing anything, figure out:

1. **Stack** — read `package.json` / `go.mod` / `Cargo.toml` / `pyproject.toml` / `requirements.txt` / `composer.json` / `Gemfile` / etc.
2. **Shape** — full-stack web app, API-only backend, CLI tool, static site, mobile app, bot, or other.
3. **Existing infra** — is there already a database, auth system, notifications layer? Reuse what's there. Do not introduce new dependencies unless necessary.
4. **Conventions** — skim `CLAUDE.md`, `AGENTS.md`, a representative source file or two. Match the project's style.

Report back briefly — three bullets on what you found — before continuing.

## Step 2 — Ask ONE question

Ask the user exactly:

> **Where should bug reports be stored or delivered?** Pick one:
> 1. **Local DB** (recommended if the project has one) — full admin UI with status tracking
> 2. **GitHub Issues** — no DB needed; bugs open as issues with a `bugkit` label
> 3. **Telegram** — bugs get DM'd to a chat via bot token
> 4. **JSONL file** — simplest; append to `./.bugreports.jsonl`. Local-only.
> 5. **Email** — send via SMTP / SendGrid / Resend
> 6. **Slack** / **Discord** — webhook to a channel
> 7. **Multiple** — e.g. "DB + mirror to Telegram for notifications"

If the user is unsure, recommend based on their stack:
- Full-stack web app with an existing DB → **1 (Local DB)**
- Open-source CLI / static site → **2 (GitHub Issues)**
- Personal project / MVP → **4 (JSONL)** to start, upgrade later
- Solo dev living in Telegram → **3 (Telegram)**

## Step 3 — Implement the recipe

Map the chosen sink to a recipe from the bugkit repo:

| Sink | Recipe |
|---|---|
| Local DB | `recipes/web-app-full.md` |
| GitHub Issues | `recipes/github-issues.md` |
| Telegram | `recipes/telegram-bot.md` |
| JSONL | `recipes/jsonl-file.md` |
| Email | `recipes/email.md` |
| Slack / Discord | `recipes/slack-discord.md` |
| CLI tool | `recipes/cli-tool.md` |

Read the recipe from the plugin's bundled files (this skill is distributed with the recipes). If for some reason the recipes aren't locally available, fetch from:
`https://raw.githubusercontent.com/bglglzd/bugkit/main/recipes/<name>.md`

Follow the recipe faithfully. Non-negotiables from `SPEC.md`:

1. **Field names** — use exactly: `id, type, title, description, status, created_at, reporter, environment, page, client, element, error, logs, attachments, resolution, resolved_at, resolved_by, commit_sha, how_to_verify`. Do not rename.
2. **Status lifecycle** — `open → in_progress → resolved → closed`, plus terminal `wontfix`. Resolution required when moving to a terminal state.
3. **AI context format** — admins MUST be able to produce the EXACT text block defined in `SPEC.md §3`. This is the portable part. Copy the template verbatim with placeholder substitution — do not reorder sections, do not invent new labels.
4. **`bugkit_spec: "1"`** — include this in stored reports so future tools can detect the format version.

## Step 4 — Offer voice transcription

For web recipes (Local DB, GitHub Issues, or anything with a browser-facing form), after the main install succeeds, ask:

> **Voice transcription lets reporters speak their bug description instead of typing. Uses the browser's Web Speech API by default — free, no keys, works in Chrome/Edge/Safari. Want to enable it? (Y/n)**

If yes, invoke the `adding-voice` skill to wire it in. If no, move on — it can be added later via `/bugkit:voice`.

For non-web recipes (CLI, Telegram bot, JSONL, email, Slack/Discord), voice is a no-op — skip this step silently.

## Step 5 — Verify

Before declaring done:

1. Submit a test report using the actual UI / CLI / bot command you built (not curl — the real flow).
2. Confirm the report appears where it should (DB row, GitHub issue, JSONL line, channel message, etc.).
3. Generate the Copy-Context output and verify it matches `SPEC.md §3` — section order, exact labels, no extra decoration.
4. If the recipe includes a resolution flow, change status to `resolved` with a short note and confirm the reporter would see the update (look at the notification code path; don't need to actually deliver it in a test).

## Step 6 — Report back

Produce a short final message:

1. Which sink was chosen.
2. Files created or modified (bulleted list).
3. How the user tests it — specific URL, command, or interaction.
4. How the user copies AI context and closes the loop once a fix is in.
5. If voice was enabled, whether it's using Web Speech API or the local Whisper upgrade path, and any browser caveats.

## Things to avoid

- Don't pull in a heavy ORM or new DB just for this — use what's there, or JSONL if nothing exists.
- Don't rename spec field names to fit the project's existing schema. Add them as new fields or use a mapping layer. Portability is the point.
- Don't make the element picker fancy. Minimal: outline on hover, click to capture, Esc to cancel.
- Don't gate bug reporting behind complex auth flows. Reuse the project's auth if present; otherwise name + optional email.
- Don't skip the reporter notification on status change — the closed loop is what makes users file good reports.
- Don't ask more than one question at the top-level. The sink question is the only required one; voice is a yes/no follow-up.

## If you get stuck

- Read `SPEC.md` for the definitive data contract.
- Read the chosen recipe in full.
- If the recipe doesn't fit the project, compose from multiple recipes or improvise — but keep the Copy-Context format unchanged.
- Ask the user for one missing piece at a time; never batch 5 questions.
