# bugkit Install — Prompt for Claude Code

> **How to use this file:** Copy the entire content below (from `---` to the end) and paste it as your first message in a Claude Code session inside your project. Claude will handle the rest.

---

You are installing **bugkit** — a portable, AI-friendly bug report system — into this project.

bugkit's value is that reports carry enough context (URL, element selector, stack trace, viewport, user agent, etc.) that an AI assistant can fix the bug from one paste. The data contract is standardized in the bugkit Spec v1 so the "Copy Context → Paste → Fix → Close" ritual is identical across any project that installs it.

Your mission is to set up bugkit in THIS project. Work through the steps below in order.

---

## Step 1 — Understand the project

Before writing any code, figure out:

1. **Stack** — read `package.json` / `go.mod` / `Cargo.toml` / `pyproject.toml` / `requirements.txt` / `composer.json` / `Gemfile` / etc.
2. **Shape** — is this:
   - a full-stack web app (Next/Nuxt/Remix/SvelteKit/Astro/Rails/Django/Laravel/etc.)?
   - an API-only backend?
   - a CLI tool?
   - a static site (SSG)?
   - a mobile app (React Native/Flutter/native)?
   - a bot (Telegram, Discord, Slack)?
   - something else?
3. **Existing infra** — is there already a database? An auth system? A notifications layer? A CI/CD? Reuse what exists; do not introduce new dependencies unless necessary.
4. **Conventions** — skim `CLAUDE.md`, `AGENTS.md`, a representative source file or two. Match the project's style (semicolons or not, quote style, import style, framework idioms).

Report back briefly — 3 bullets on what you found — before continuing.

---

## Step 2 — Ask ONE question

Ask the user:

> **Where should bug reports be stored / delivered?** Pick one or combine:
> 1. **Local DB** (recommended if the project has one) — full admin UI with status tracking
> 2. **GitHub Issues** — no DB needed; bugs open as issues with a `bugkit` label
> 3. **Telegram** — bugs get DM'd to a chat via bot token
> 4. **JSONL file** — simplest; append to `./.bugreports.jsonl`. Local-only.
> 5. **Email** — send via SMTP / SendGrid / Resend
> 6. **Slack** / **Discord** — webhook to a channel
> 7. **Multiple** — e.g. "DB + mirror to Telegram for notifications"

Pick the **simplest** option that fits the project:
- Full-stack web app with existing DB → option 1
- Open-source CLI / static site → option 2 (GitHub Issues)
- Personal project / MVP → option 4 (JSONL file) to start, upgrade later
- Solo dev who lives in Telegram → option 3

Match the chosen sink to a recipe:
- DB → `recipes/web-app-full.md`
- GitHub Issues → `recipes/github-issues.md`
- Telegram → `recipes/telegram-bot.md`
- JSONL → `recipes/jsonl-file.md`
- Email → `recipes/email.md`
- Slack/Discord → `recipes/slack-discord.md`

Read the chosen recipe from the bugkit repo (either local clone or via WebFetch from `https://raw.githubusercontent.com/<owner>/bugkit/main/recipes/<name>.md`) and adapt it to this project's stack.

If the user is unsure, recommend based on their stack and ask them to confirm.

---

## Step 3 — Implement

Non-negotiables (from `SPEC.md`):

1. **Field names** — use `id, type, title, description, status, created_at, reporter, environment, page, client, element, error, logs, attachments, resolution, resolved_at, resolved_by, commit_sha, how_to_verify`. Do not rename or abbreviate.
2. **Status lifecycle** — `open → in_progress → resolved → closed`, plus terminal `wontfix`. Resolution note required when moving to a terminal state.
3. **AI context format** — admins MUST be able to produce the EXACT text block defined in `SPEC.md §3`. This is the portable part. Copy the template verbatim, with placeholder substitution.
4. **`bugkit_spec: "1"`** — include this in stored reports so future tools can detect the format version.

Platform-specific implementation notes:

### Web apps (full-stack)
- Add a **bug icon** in the global header/navbar, authenticated users only, same size/style as existing icons (notifications, messages, etc.)
- Open a modal on click with: type toggle (bug/feature), description textarea, optional **element picker**
- The element picker should: hide the modal, make the cursor a crosshair, outline hovered elements on mousemove, capture `selector/xpath/tag/id/classes/text/html/rect` on click, ESC cancels. Outline uses a fixed-position div over the element's bounding rect.
- Capture `window.location.href`, `navigator.userAgent`, `${innerWidth}x${innerHeight}` automatically
- Build a `/my-reports` page for users to see their own reports with status
- Build `/admin/bug-reports` (list, filter by status, paginate) and `/admin/bug-reports/[id]` (detail with one-click "Copy Context for AI" button) — gate by admin/staff role
- Send a notification to the reporter when status changes

### API-only / headless
- Expose `POST /bug-reports` (unauthenticated if public; otherwise gate to logged-in users)
- Provide an admin endpoint or CLI command to list / patch reports
- Provide a CLI or admin script `bugkit-copy <id>` that prints the AI context format to stdout — user pipes it to clipboard: `bugkit-copy 42 | pbcopy` (mac) / `clip` (win) / `xclip` (linux)

### CLI tool
- Add a subcommand: `mytool bug "<description>"`
- Capture `argv`, `cwd`, error from a prior failed command (if stored in shell history or a lockfile), OS, app version
- Store in `./.bugreports.jsonl` locally or ship to GH Issues via `gh` CLI
- Provide `mytool bug list` and `mytool bug copy <id>` subcommands

### Static site / SSG
- Add a floating bug button (bottom-right) that opens a form
- Form submits to a webhook (GitHub Issues via [issues API](https://docs.github.com/en/rest/issues/issues#create-an-issue), or Formspree, or your own edge function)
- Capture `location.href`, `document.referrer`, viewport, user agent
- No admin UI — admins triage in GitHub's web UI

### Mobile (React Native / Flutter / native)
- Add a "Shake to Report" or settings → Report Bug flow
- Grab screenshot automatically, let user annotate
- Upload to your existing backend or S3; store URL in `attachments`
- No native element picker; use screen name + screenshot instead

### Bot (Telegram / Discord / Slack)
- Users DM `/bug <description>` to the bot
- Bot captures chat ID, username, latest interactions as context
- Admin channel receives formatted report with "Copy Context" inline button

---

## Step 4 — Wire the "Copy Context for AI" action

This is the heart of bugkit. The admin must be able to produce the AI context format (SPEC.md §3) with one click/command, and it must paste cleanly into a fresh AI session.

For web admin pages: a prominent button near the top of the detail view, pink/primary color. Uses `navigator.clipboard.writeText(formatted)` and shows a toast.

For CLI: `bugkit copy <id>` prints to stdout.

For bots: an inline button on the report message that shows the formatted text in a code block for easy copy.

The formatted output MUST match SPEC.md §3 exactly — do not reorder sections, do not invent new labels, do not embellish. AI assistants parse this format and changing it defeats the portability.

---

## Step 5 — Verify

Before declaring done:

1. Submit a test report (real flow, not curl — use the UI / CLI you built)
2. Confirm the report appears in the admin view
3. Click "Copy Context" → paste into a text editor → verify the format matches SPEC.md §3
4. Change status to `resolved` with a resolution note → confirm the reporter sees the update
5. List one or two files you modified, so the user can review

---

## Step 6 — Document

Add a short section to the project's README pointing to:
- How users report bugs (where's the button / command?)
- How admins view reports
- The `bugkit_spec: "1"` marker in stored data so future tools recognize the format

If the project doesn't have a CLAUDE.md / AGENTS.md, consider adding a 5-line section describing bugkit for future AI sessions.

---

## Things to avoid

- Don't pull in a heavy ORM or new DB just for this — use what's there, or the JSONL recipe if nothing exists
- Don't rename spec field names to fit your existing schema. Add them as new fields or use a mapping layer. The point of the spec is portability.
- Don't make the element picker fancy. Minimal: outline on hover, click to capture, ESC to cancel.
- Don't gate bug reporting behind complex auth flows. If the project has auth, reuse it. If not, make the reporter identify themselves with just a name + optional email.
- Don't skip the notification to the reporter on status change. The closed loop is what makes users file good reports.

---

## If you get stuck

- Read `SPEC.md` for the definitive data contract
- Read `recipes/<chosen-sink>.md` for a full example
- If the recipe doesn't fit, compose from multiple recipes or improvise — but keep the AI context format unchanged
- Ask the user for one missing piece at a time; never batch 5 questions

---

When done, report back with:
1. What sink was chosen
2. Files created / modified
3. How to test (specific URL, command, or interaction)
4. How an admin copies context and closes the loop

Good luck.
