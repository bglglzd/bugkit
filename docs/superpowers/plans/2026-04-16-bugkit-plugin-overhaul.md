# bugkit v1.0 Plugin Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn bugkit into an installable Claude Code plugin, add a universal paste-in path for every other AI agent, wire optional voice transcription (Web Speech default, local Whisper upgrade), rewrite the README, and ship a GitHub Pages landing page.

**Architecture:** Two install paths (`.claude-plugin/` for Claude Code native install + `INSTALL.md` URL-paste for everyone else) backed by the same `recipes/*.md` source of truth. Voice is optional per-install, no SPEC change. Marketing is README rewrite + single-page GitHub Pages landing (no framework, no build step, no custom domain).

**Tech Stack:** Markdown (recipes, skills, docs), JSON (plugin manifests), YAML frontmatter (skills & commands), vanilla HTML/CSS/JS (landing), SVG (logo + og-image).

**Spec:** `docs/superpowers/specs/2026-04-16-bugkit-plugin-overhaul-design.md`

---

## Notes on this plan

This is content + configuration work, not a typical TDD codebase. Tests are replaced with **explicit verifications** per task (JSON parses, frontmatter valid, links resolve, file exists and has expected content). Each task ends with a commit.

Paths are all relative to the bugkit repo root: `C:/Users/bglgl/projects/bugkit/`.

---

## Task 1: Plugin manifests

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Create the plugin manifest**

Write `.claude-plugin/plugin.json`:

```json
{
  "name": "bugkit",
  "description": "AI-friendly bug reports for any project. Users click, AI fixes, done.",
  "version": "1.0.0",
  "author": {
    "name": "bglglzd"
  },
  "repository": "https://github.com/bglglzd/bugkit",
  "homepage": "https://bglglzd.github.io/bugkit"
}
```

- [ ] **Step 2: Create the marketplace manifest**

Write `.claude-plugin/marketplace.json`:

```json
{
  "name": "bugkit",
  "owner": {
    "name": "bglglzd"
  },
  "plugins": [
    {
      "name": "bugkit",
      "source": "./",
      "version": "1.0.0",
      "description": "AI-friendly bug reports for any project."
    }
  ]
}
```

- [ ] **Step 3: Verify both are valid JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('plugin.json OK')"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('marketplace.json OK')"
```

Expected: both print `OK`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/
git commit -m "feat: add Claude Code plugin manifests

Adds .claude-plugin/plugin.json and marketplace.json so the repo is
installable via /plugin marketplace add bglglzd/bugkit + /plugin install
bugkit@bglglzd-bugkit."
```

---

## Task 2: Slash command `/bugkit:install`

**Files:**
- Create: `commands/install.md`

- [ ] **Step 1: Write the slash command**

Write `commands/install.md`:

```markdown
---
description: Install bugkit — AI-friendly bug reporting — in this project.
---

The user wants to install bugkit in this project.

Invoke the `installing-bugkit` skill and follow it exactly. It will detect the
project's stack, ask one question (where reports should be stored), implement
the matching recipe, offer optional voice transcription, and verify the result.

Do not start writing code before invoking the skill — it handles the full flow.
```

- [ ] **Step 2: Verify frontmatter parses**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('commands/install.md', 'utf8');
const m = c.match(/^---\n([\s\S]*?)\n---/);
if (!m) throw new Error('no frontmatter');
console.log('frontmatter present:', m[1].trim());
"
```

Expected: prints the `description: ...` line.

- [ ] **Step 3: Commit**

```bash
git add commands/
git commit -m "feat: add /bugkit:install slash command

Minimal wrapper that delegates to the installing-bugkit skill. Users invoke as
/bugkit:install after installing the plugin."
```

---

## Task 3: `installing-bugkit` skill

**Files:**
- Create: `skills/installing-bugkit/SKILL.md`

- [ ] **Step 1: Write the skill**

Write `skills/installing-bugkit/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Verify frontmatter is valid**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('skills/installing-bugkit/SKILL.md', 'utf8');
const m = c.match(/^---\n([\s\S]*?)\n---/);
if (!m) throw new Error('no frontmatter');
const lines = m[1].split('\n').map(l => l.trim()).filter(Boolean);
const hasName = lines.some(l => l.startsWith('name:'));
const hasDesc = lines.some(l => l.startsWith('description:'));
if (!hasName || !hasDesc) throw new Error('missing name or description');
console.log('SKILL.md frontmatter OK');
"
```

Expected: prints `SKILL.md frontmatter OK`.

- [ ] **Step 3: Commit**

```bash
git add skills/installing-bugkit/
git commit -m "feat: add installing-bugkit skill

Main install orchestrator. Detects stack, asks one question about the sink,
implements the matching recipe from recipes/, offers voice transcription,
verifies the result."
```

---

## Task 4: `adding-voice` skill

**Files:**
- Create: `skills/adding-voice/SKILL.md`

- [ ] **Step 1: Write the skill**

Write `skills/adding-voice/SKILL.md`:

```markdown
---
name: adding-voice
description: Add optional voice transcription to an existing bugkit install — mic button next to the description field, Web Speech API by default, local Whisper as an opt-in upgrade. No paid APIs as the default path.
---

# Adding voice transcription to a bugkit install

You're adding voice transcription to an existing bugkit install. The user clicks a 🎤 mic button next to the description textarea, speaks, and the transcript appears in the field. They can edit before submitting.

## When this skill applies

- The project already has a bugkit web-facing modal (from `web-app-full.md` or `github-issues.md`).
- Voice is always **optional**. Typing still works.
- Mic button is hidden gracefully if the browser doesn't support it AND no local Whisper endpoint is configured.

If the project has no web-facing form (CLI, bot, JSONL, email), politely tell the user voice isn't applicable for this sink and stop.

## Decide the transcription path

Two modes. Default is **web-speech**. Only use **local-whisper** if the user explicitly asks for offline / Firefox support / privacy.

### Mode 1: Web Speech API (default)

Zero deps, zero keys, zero server-side code. Wire this into the modal's description field:

```ts
function attachVoice(textarea: HTMLTextAreaElement, micButton: HTMLButtonElement) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) {
    micButton.style.display = 'none'  // graceful: hide if unsupported
    return
  }

  const recognition = new SR()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = navigator.language || 'en-US'

  let recording = false
  let baseText = ''

  recognition.onresult = (e: any) => {
    let interim = ''
    let finalText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += t
      else interim += t
    }
    textarea.value = (baseText + finalText + interim).trimStart()
  }
  recognition.onerror = () => { stopRecording() }
  recognition.onend = () => { if (recording) recognition.start() /* keep alive */ }

  function startRecording() {
    baseText = textarea.value ? textarea.value + ' ' : ''
    recording = true
    micButton.classList.add('recording')
    recognition.start()
  }
  function stopRecording() {
    recording = false
    micButton.classList.remove('recording')
    try { recognition.stop() } catch {}
  }

  micButton.addEventListener('click', () => {
    if (recording) stopRecording()
    else startRecording()
  })
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recording) stopRecording()
  })
}
```

Under the textarea, a small grey italic label: *"Listening via Web Speech API"* (visible only while recording). Transparency about where the audio goes — Chrome uses Google's servers under the hood for Web Speech.

### Mode 2: Local Whisper (opt-in upgrade)

Adds a thin backend proxy + uses MediaRecorder on the frontend. Works in every browser including Firefox, fully offline, no keys.

**Backend proxy** — add `/api/bugkit/transcribe`:

```ts
// Adapts to the project's backend framework — this is the Next.js App Router flavor.
// For Express: app.post('/api/bugkit/transcribe', (req, res) => { ... })
// For FastAPI: @app.post('/api/bugkit/transcribe')
export async function POST(req: Request) {
  const url = process.env.BUGKIT_TRANSCRIBE_URL || 'http://localhost:9000/inference'
  const formData = await req.formData()
  const audio = formData.get('file') as Blob
  if (!audio) return new Response('no audio', { status: 400 })

  const upstream = new FormData()
  upstream.append('file', audio, 'audio.webm')
  upstream.append('response_format', 'text')

  const r = await fetch(url, { method: 'POST', body: upstream })
  if (!r.ok) return new Response('transcription failed', { status: 502 })
  const text = await r.text()
  return new Response(text, { headers: { 'content-type': 'text/plain' } })
}
```

**Frontend** — detect the endpoint once per session, cache result, route accordingly:

```ts
async function detectTranscribeEndpoint(): Promise<boolean> {
  const cached = sessionStorage.getItem('bugkit_transcribe_available')
  if (cached !== null) return cached === '1'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 500)
    const r = await fetch('/api/bugkit/transcribe', { method: 'OPTIONS', signal: ctrl.signal })
    clearTimeout(t)
    const ok = r.ok || r.status === 405  // 405 also means endpoint exists
    sessionStorage.setItem('bugkit_transcribe_available', ok ? '1' : '0')
    return ok
  } catch {
    sessionStorage.setItem('bugkit_transcribe_available', '0')
    return false
  }
}

async function recordAndTranscribe(textarea: HTMLTextAreaElement, micButton: HTMLButtonElement) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop())
    const blob = new Blob(chunks, { type: 'audio/webm' })
    const fd = new FormData()
    fd.append('file', blob, 'audio.webm')
    const r = await fetch('/api/bugkit/transcribe', { method: 'POST', body: fd })
    if (r.ok) {
      const text = (await r.text()).trim()
      textarea.value = textarea.value ? textarea.value + ' ' + text : text
    }
    micButton.classList.remove('recording')
  }
  micButton.classList.add('recording')
  recorder.start()

  // Click again to stop
  micButton.addEventListener('click', () => { if (recorder.state === 'recording') recorder.stop() }, { once: true })
}
```

Modal init: `if (await detectTranscribeEndpoint()) { /* use Whisper path */ } else { attachVoice(/* Web Speech path */) }`.

**Local Whisper setup** — print this for the user to run once, outside the project:

```bash
# One-time: install whisper.cpp and download a ~150MB model
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
./models/download-ggml-model.sh base.en

# Each dev session: run the server
./server -m models/ggml-base.en.bin --port 9000
```

Then set the env var (if different from default):
```
BUGKIT_TRANSCRIBE_URL=http://localhost:9000/inference
```

Once the server is running, bugkit's frontend will auto-detect `/api/bugkit/transcribe` and route voice through local Whisper instead of Web Speech. No user-visible change in the UI.

## Paid-API footnote

If the user explicitly wants OpenAI Whisper or Groq or Deepgram, point `BUGKIT_TRANSCRIBE_URL` at the provider's endpoint and add `Authorization: Bearer ...` in the proxy route. This is a footnote, not the default — never recommend a paid API unprompted.

## Mic button CSS (drop into the project's styles)

```css
.bugkit-mic-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border, #ccc); background: transparent; cursor: pointer;
}
.bugkit-mic-btn.recording {
  border-color: #e53935; color: #e53935;
  box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6);
  animation: bugkit-mic-pulse 1.2s infinite;
}
@keyframes bugkit-mic-pulse {
  0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6); }
  70% { box-shadow: 0 0 0 10px rgba(229, 57, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
}
```

## Privacy line under the textarea

While recording, show a small grey italic note below the textarea:
- Web Speech path: *"Listening via Web Speech API (Chrome may send audio to Google servers)"*
- Whisper path: *"Listening via local Whisper — stays on your machine"*

## Verify

1. Open the bug-report modal in the browser.
2. Click the 🎤 button. Browser asks for mic permission; grant.
3. Speak a short sentence. Confirm the transcript appears in the textarea as you speak (Web Speech) or after you click stop (Whisper).
4. Click submit. Confirm the report's `description` field matches what you said.
5. In an unsupported browser / with no Whisper endpoint: confirm the mic button is hidden and typing still works.

## Report back

Tell the user:
- Which path was wired (web-speech or local-whisper).
- Where the code lives (which file/function contains `attachVoice` or the MediaRecorder logic).
- Browser coverage: Chrome/Edge/Safari full, Firefox hidden (for web-speech) or working (for Whisper).
- How to switch paths later.
```

- [ ] **Step 2: Verify frontmatter is valid**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('skills/adding-voice/SKILL.md', 'utf8');
const m = c.match(/^---\n([\s\S]*?)\n---/);
if (!m) throw new Error('no frontmatter');
const lines = m[1].split('\n').map(l => l.trim()).filter(Boolean);
const hasName = lines.some(l => l.startsWith('name:'));
const hasDesc = lines.some(l => l.startsWith('description:'));
if (!hasName || !hasDesc) throw new Error('missing name or description');
console.log('adding-voice SKILL.md frontmatter OK');
"
```

Expected: prints `adding-voice SKILL.md frontmatter OK`.

- [ ] **Step 3: Commit**

```bash
git add skills/adding-voice/
git commit -m "feat: add adding-voice skill

Optional voice transcription for bugkit web installs. Web Speech API by default,
local Whisper (whisper.cpp) as opt-in upgrade — no paid APIs as the default
path. Mic button gracefully hides if unsupported."
```

---

## Task 5: Rewrite `INSTALL.md` (universal path)

**Files:**
- Modify: `INSTALL.md` (full rewrite)

- [ ] **Step 1: Replace `INSTALL.md` with the new content**

Overwrite `INSTALL.md` with:

```markdown
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
```

- [ ] **Step 2: Verify the file has the expected sections**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('INSTALL.md', 'utf8');
const sections = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Things to avoid'];
for (const s of sections) {
  if (!c.includes(s)) throw new Error('missing section: ' + s);
}
console.log('INSTALL.md has all expected sections');
"
```

Expected: prints `INSTALL.md has all expected sections`.

- [ ] **Step 3: Commit**

```bash
git add INSTALL.md
git commit -m "refactor: rewrite INSTALL.md as universal paste-in prompt

Tightened for Cursor / Copilot / ChatGPT / Gemini / Aider / Cline. Points users
to /bugkit:install instead for Claude Code. References recipes via raw GitHub
URLs so the AI can fetch on demand. Adds voice question for web recipes."
```

---

## Task 6: Voice section in `recipes/web-app-full.md`

**Files:**
- Modify: `recipes/web-app-full.md`

- [ ] **Step 1: Read the current file end**

Read the last ~30 lines of `recipes/web-app-full.md` to find the Acceptance checklist — the voice section goes right before it.

- [ ] **Step 2: Insert the "Voice (optional)" section**

Add a new section right before the "Acceptance checklist" heading:

```markdown
---

## Voice transcription (optional)

Lets reporters speak their bug description instead of typing. Default is the browser's **Web Speech API** — free, no keys, zero server code. Optional upgrade is **local Whisper** (whisper.cpp) for offline / Firefox / privacy — no paid APIs.

### Mic button in the modal

Next to the description textarea, add:

```html
<button type="button" class="bugkit-mic-btn" aria-label="Record description">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
</button>
```

Styles:

```css
.bugkit-mic-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border, #ccc); background: transparent; cursor: pointer;
}
.bugkit-mic-btn.recording {
  border-color: #e53935; color: #e53935;
  animation: bugkit-mic-pulse 1.2s infinite;
}
@keyframes bugkit-mic-pulse {
  0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6); }
  70% { box-shadow: 0 0 0 10px rgba(229, 57, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
}
```

### Web Speech path (default)

```ts
function attachVoice(textarea: HTMLTextAreaElement, micBtn: HTMLButtonElement) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { micBtn.style.display = 'none'; return }  // hide gracefully

  const rec = new SR()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = navigator.language || 'en-US'

  let recording = false
  let base = ''

  rec.onresult = (e: any) => {
    let interim = '', final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) final += t
      else interim += t
    }
    textarea.value = (base + final + interim).trimStart()
  }
  rec.onerror = () => { stop() }
  rec.onend = () => { if (recording) rec.start() }

  function start() {
    base = textarea.value ? textarea.value + ' ' : ''
    recording = true
    micBtn.classList.add('recording')
    rec.start()
  }
  function stop() {
    recording = false
    micBtn.classList.remove('recording')
    try { rec.stop() } catch {}
  }

  micBtn.addEventListener('click', () => { recording ? stop() : start() })
  textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape' && recording) stop() })
}
```

Wire it on modal mount. That's the whole thing for the default path.

### Local Whisper upgrade (optional)

If the user wants offline / Firefox / full privacy, add a `/api/bugkit/transcribe` endpoint that proxies to whisper.cpp:

```ts
// Next.js App Router — adapt to your framework
// For Express: app.post('/api/bugkit/transcribe', ...)
// For FastAPI: @app.post('/api/bugkit/transcribe')
export async function POST(req: Request) {
  const url = process.env.BUGKIT_TRANSCRIBE_URL || 'http://localhost:9000/inference'
  const formData = await req.formData()
  const audio = formData.get('file') as Blob
  if (!audio) return new Response('no audio', { status: 400 })
  const up = new FormData()
  up.append('file', audio, 'audio.webm')
  up.append('response_format', 'text')
  const r = await fetch(url, { method: 'POST', body: up })
  if (!r.ok) return new Response('transcription failed', { status: 502 })
  return new Response(await r.text(), { headers: { 'content-type': 'text/plain' } })
}
```

Frontend auto-detects the endpoint once per session (cached in `sessionStorage`) and uses MediaRecorder instead of Web Speech when available:

```ts
async function detectTranscribeEndpoint(): Promise<boolean> {
  const cached = sessionStorage.getItem('bugkit_transcribe_available')
  if (cached !== null) return cached === '1'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 500)
    const r = await fetch('/api/bugkit/transcribe', { method: 'OPTIONS', signal: ctrl.signal })
    clearTimeout(t)
    const ok = r.ok || r.status === 405
    sessionStorage.setItem('bugkit_transcribe_available', ok ? '1' : '0')
    return ok
  } catch {
    sessionStorage.setItem('bugkit_transcribe_available', '0')
    return false
  }
}
```

When `detectTranscribeEndpoint()` returns true, record with MediaRecorder and POST the blob to `/api/bugkit/transcribe`. Otherwise use the Web Speech path above.

**Run whisper.cpp locally (one-time setup):**

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
./models/download-ggml-model.sh base.en
./server -m models/ggml-base.en.bin --port 9000
```

~150MB model download, CPU-only, works offline. Set `BUGKIT_TRANSCRIBE_URL=http://localhost:9000/inference` if you run it elsewhere.

### Privacy line under the textarea

While recording, show a small italic note:
- Web Speech path: *"Listening via Web Speech API (Chrome may send audio to Google servers)"*
- Whisper path: *"Listening via local Whisper — stays on your machine"*

### Paid-API footnote

For OpenAI Whisper / Groq / Deepgram: point `BUGKIT_TRANSCRIBE_URL` at the provider and add `Authorization: Bearer ...` in the proxy route. This is a footnote, not the default — never recommend a paid API unprompted.

### No SPEC change

Voice is a UX layer. Description is populated from transcription; the portable format is unchanged. Audio blobs are not persisted in v1 — only the transcribed text.
```

- [ ] **Step 3: Verify the section is present**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('recipes/web-app-full.md', 'utf8');
if (!c.includes('Voice transcription (optional)')) throw new Error('Voice section missing');
if (!c.includes('SpeechRecognition')) throw new Error('Web Speech code missing');
if (!c.includes('BUGKIT_TRANSCRIBE_URL')) throw new Error('Whisper upgrade path missing');
console.log('web-app-full.md voice section OK');
"
```

Expected: prints `web-app-full.md voice section OK`.

- [ ] **Step 4: Commit**

```bash
git add recipes/web-app-full.md
git commit -m "feat: add voice transcription section to web-app-full recipe

Web Speech API by default (free, no keys), local whisper.cpp as opt-in upgrade.
Never paid APIs as the default path. Mic button hides gracefully if unsupported.
No change to SPEC.md — voice is purely a UX layer."
```

---

## Task 7: Reference voice in `recipes/github-issues.md`

**Files:**
- Modify: `recipes/github-issues.md`

- [ ] **Step 1: Add a short voice note**

Append to `recipes/github-issues.md`, right before "Acceptance checklist":

```markdown
---

## Voice transcription (optional)

The frontend modal is identical to the full web-app recipe. To add voice — Web Speech API default, local Whisper opt-in — follow the "Voice transcription (optional)" section in [`web-app-full.md`](./web-app-full.md). No backend changes needed; the description just arrives pre-populated from the mic.
```

- [ ] **Step 2: Verify**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('recipes/github-issues.md', 'utf8');
if (!c.includes('Voice transcription (optional)')) throw new Error('Voice reference missing');
console.log('github-issues.md voice reference OK');
"
```

Expected: prints `github-issues.md voice reference OK`.

- [ ] **Step 3: Commit**

```bash
git add recipes/github-issues.md
git commit -m "feat: reference voice section from github-issues recipe

Same frontend as web-app-full; point to that recipe's voice section rather than
duplicating."
```

---

## Task 8: Rewrite `README.md`

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Overwrite `README.md`**

Write the new README with:
1. Hero line + (placeholder for) GIF
2. Who this is for — two-persona block
3. Install table (agent picker)
4. How it works
5. Comparison table
6. Docs links
7. License + star

Full content:

```markdown
<div align="center">

<img src="./assets/logo.svg" alt="bugkit" width="120" />

# bugkit

**Users click. AI fixes. Done.**

*AI-friendly bug reports for any project. Users report bugs with full context (URL, element selector, stack trace, viewport, voice transcription). Admins hit one button. Paste into Claude Code — or any AI coding agent — and the fix ships. Reporter gets notified. Loop closes in minutes, not days.*

<!-- Hero GIF goes here once recorded (see docs/superpowers/specs/ for shot list) -->

[![star on github](https://img.shields.io/github/stars/bglglzd/bugkit?style=social)](https://github.com/bglglzd/bugkit)
[![spec v1](https://img.shields.io/badge/spec-v1-blue)](./SPEC.md)
[![license MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

</div>

---

## Who this is for

bugkit works the same way in two very different settings:

**🛠  Building for a boss, client, or team lead**
You're the dev. Someone non-technical is telling you what to change — and vague words lose a lot in translation. Send them the staging link. They click the bug icon, pick the exact thing that looks wrong, **speak or type** what they want. You paste the output into Claude Code / Cursor / Copilot. The fix ships the same day, exactly how they described it. No more "did they mean the header or the hero?"

**🚀  Running a product with real users**
You have a live app. Bugs and feature requests come in every day. Users click the bug icon from inside the product — you get a queue of reports with full context already captured. Paste → AI fixes → user gets notified their report was resolved. Your product improves as fast as you can read reports.

**Same spec. Same plugin. Same install command. Vibe-coder-friendly.**

---

## Install — pick your AI agent

| Your AI agent | Paste this into the chat |
|---|---|
| **Claude Code** | <pre>/plugin marketplace add bglglzd/bugkit<br>/plugin install bugkit@bglglzd-bugkit<br>/bugkit:install</pre> |
| **Cursor** | <pre>Install bugkit in this project from<br>https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md</pre> |
| **GitHub Copilot Chat** | <pre>Install bugkit in this project from<br>https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md</pre> |
| **ChatGPT / Codex** (with repo access) | <pre>Install bugkit in this project from<br>https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md</pre> |
| **Gemini CLI / Aider / Cline / anything else** | Paste the contents of [INSTALL.md](./INSTALL.md) |

Claude is going to:
1. Detect your stack (web app / API / CLI / static site / mobile / bot / etc.)
2. Ask **one** question: where should bug reports go? (DB / GitHub Issues / Telegram / JSONL / email / Slack / Discord / combination)
3. Implement the matching recipe from [`recipes/`](./recipes/)
4. Offer optional **voice transcription** (🎤 mic next to the description field — Web Speech API default, local Whisper upgrade, never paid APIs)
5. Verify with a test report

Takes about 5–10 minutes for a full web app install.

---

## How it works

```
User finds bug
  ↓  clicks bug icon, optionally picks the broken element, speaks or types
Bug report saved with full context (URL, selector, stack trace, viewport, voice transcript)
  ↓
Admin opens report → clicks "Copy Context for AI"
  ↓  standardized prompt with everything the AI needs
Paste into Claude Code / Cursor / Copilot / ChatGPT
  ↓
AI fixes the bug, ships a commit
  ↓
Admin marks report "resolved" with a short note + commit SHA
  ↓
Reporter gets notified
```

No translation step. No "can you repro?" back-and-forth. The context that a human would gather manually is captured at the moment the bug happens.

---

## Why this beats a random feedback form

| Traditional feedback form | bugkit |
|---|---|
| "Something is broken" | Selector, XPath, HTML, viewport, URL, stack trace, voice transcript |
| Admin reads, asks clarifying questions | Admin pastes to AI, AI already has everything |
| Fix takes days | Fix ships in minutes |
| Form and format differ per project | Standardized spec — same ritual across all your projects |
| No closed-loop status | Reporter notified at each state change |
| Typing long descriptions is a chore | 🎤 press-to-speak, auto-transcribed |

---

## Voice transcription (optional)

🎤 Mic button next to the description field. Press, speak, transcript streams into the textarea live, edit if you want, submit.

- **Default:** Web Speech API (browser-native). Zero install, zero keys, zero server. Chrome / Edge / Safari.
- **Upgrade:** local Whisper (whisper.cpp) via a thin proxy route. ~150MB one-time model download, fully offline, works in every browser including Firefox.
- **Never:** paid APIs as the default path. OpenAI / Groq / Deepgram are a footnote for people who want them.

Voice is always optional — typing still works.

---

## Documentation

- **[SPEC.md](./SPEC.md)** — data schema + AI context format (the portable standard, unchanged in v1.0)
- **[INSTALL.md](./INSTALL.md)** — universal paste-in prompt for any AI agent
- **[recipes/](./recipes/)** — pre-tuned adapters per sink (DB, GH Issues, Telegram, JSONL, email, Slack, Discord, CLI)
- **[examples/](./examples/)** — what the AI context output actually looks like
- **[Landing page](https://bglglzd.github.io/bugkit)** — one-page version with agent-picker tabs and copy buttons

---

## License

MIT — use it anywhere, no attribution required (but stars are appreciated).

---

<sub>Want new bugkit releases in your inbox? **Star** or **Watch** this repo on GitHub — you'll be notified automatically.</sub>
```

- [ ] **Step 2: Verify all promised sections are present**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('README.md', 'utf8');
const required = [
  'Who this is for',
  'Install — pick your AI agent',
  'How it works',
  'Why this beats',
  'Voice transcription',
  'Documentation',
  'License',
  '/plugin marketplace add bglglzd/bugkit',
  '/bugkit:install',
  'raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md'
];
for (const r of required) {
  if (!c.includes(r)) throw new Error('README missing: ' + r);
}
console.log('README.md has all required sections and install snippets');
"
```

Expected: prints `README.md has all required sections and install snippets`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with agent-picker install table

New scroll order: hero + tagline -> who this is for (two-persona) -> install
table for Claude Code / Cursor / Copilot / ChatGPT / etc -> how it works ->
comparison table -> voice -> docs + license. Punchier, scannable, and makes
clear who bugkit serves within the first 10 seconds."
```

---

## Task 9: Logo + OG image

**Files:**
- Create: `assets/logo.svg`
- Create: `assets/og-image.svg`

- [ ] **Step 1: Create the logo**

Write `assets/logo.svg`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="bugkit logo">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff4a6e"/>
      <stop offset="100%" stop-color="#ff7b3a"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="24" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <!-- bug body -->
    <ellipse cx="60" cy="64" rx="22" ry="26" fill="#fff" stroke="none"/>
    <line x1="60" y1="38" x2="60" y2="90"/>
    <!-- antennae -->
    <path d="M48 34 L40 24" />
    <path d="M72 34 L80 24" />
    <!-- legs left -->
    <path d="M38 54 L24 48" />
    <path d="M38 64 L22 64" />
    <path d="M38 74 L24 82" />
    <!-- legs right -->
    <path d="M82 54 L96 48" />
    <path d="M82 64 L98 64" />
    <path d="M82 74 L96 82" />
  </g>
  <!-- spots -->
  <circle cx="52" cy="58" r="3" fill="#ff4a6e"/>
  <circle cx="68" cy="58" r="3" fill="#ff4a6e"/>
  <circle cx="56" cy="72" r="3" fill="#ff4a6e"/>
  <circle cx="66" cy="78" r="3" fill="#ff4a6e"/>
</svg>
```

- [ ] **Step 2: Create the OG image**

Write `assets/og-image.svg` (1200×630 for social share cards):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="bugkit — Users click. AI fixes. Done.">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d0d12"/>
      <stop offset="100%" stop-color="#1a1024"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff4a6e"/>
      <stop offset="100%" stop-color="#ff7b3a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- logo mark -->
  <g transform="translate(100, 200)">
    <rect width="160" height="160" rx="32" fill="url(#accent)"/>
    <g transform="translate(80, 80) scale(1.2) translate(-60, -60)" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="60" cy="64" rx="22" ry="26" fill="#fff" stroke="none"/>
      <line x1="60" y1="38" x2="60" y2="90"/>
      <path d="M48 34 L40 24" />
      <path d="M72 34 L80 24" />
      <path d="M38 54 L24 48" />
      <path d="M38 64 L22 64" />
      <path d="M38 74 L24 82" />
      <path d="M82 54 L96 48" />
      <path d="M82 64 L98 64" />
      <path d="M82 74 L96 82" />
    </g>
  </g>

  <!-- wordmark + tagline -->
  <text x="300" y="250" fill="#fff" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="96">bugkit</text>
  <text x="300" y="320" fill="url(#accent)" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="52">Users click. AI fixes. Done.</text>
  <text x="300" y="380" fill="#aaa" font-family="system-ui, -apple-system, sans-serif" font-weight="400" font-size="28">AI-friendly bug reports for any project.</text>

  <!-- install hint -->
  <g transform="translate(100, 500)">
    <rect width="1000" height="80" rx="12" fill="#ffffff0a" stroke="#ffffff22"/>
    <text x="30" y="50" fill="#d0d0d8" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="26">
      /plugin marketplace add bglglzd/bugkit  ·  /plugin install  ·  /bugkit:install
    </text>
  </g>
</svg>
```

- [ ] **Step 3: Verify both SVGs parse**

Run:
```bash
node -e "
const fs = require('fs');
for (const f of ['assets/logo.svg', 'assets/og-image.svg']) {
  const c = fs.readFileSync(f, 'utf8');
  if (!c.includes('<svg') || !c.includes('</svg>')) throw new Error('not an SVG: ' + f);
  if (!c.includes('viewBox')) throw new Error('no viewBox: ' + f);
  console.log(f + ' OK');
}
"
```

Expected: both print `OK`.

- [ ] **Step 4: Commit**

```bash
git add assets/
git commit -m "feat: add logo and OG share image

assets/logo.svg used in README header and landing hero. assets/og-image.svg
(1200x630) for social shares. Both SVG so they render crisp on GitHub and
anywhere they're linked. Convert og-image to PNG when linking to Twitter /
Facebook if needed."
```

---

## Task 10: GitHub Pages landing

**Files:**
- Create: `docs/index.html`
- Create: `docs/style.css`
- Create: `docs/_config.yml`

- [ ] **Step 1: Create the Jekyll config**

Write `docs/_config.yml`:

```yaml
# Tells GitHub Pages this is a static site, not Jekyll-rendered.
# We ship plain HTML/CSS; Jekyll would otherwise try to process it.
plugins: []
include:
  - .nojekyll
```

Also write an empty `.nojekyll` file to disable Jekyll entirely:

```bash
touch docs/.nojekyll
```

- [ ] **Step 2: Create the stylesheet**

Write `docs/style.css`:

```css
:root {
  --bg: #0d0d12;
  --bg-2: #1a1024;
  --fg: #e8e8ef;
  --fg-muted: #9a9aa8;
  --accent: #ff4a6e;
  --accent-2: #ff7b3a;
  --border: #ffffff1a;
  --code-bg: #00000040;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, var(--bg) 0%, var(--bg-2) 100%);
  color: var(--fg);
  min-height: 100vh;
  line-height: 1.6;
}

.wrap {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.hero {
  text-align: center;
  padding: 40px 0 24px;
}

.hero img.logo {
  width: 96px;
  height: 96px;
  margin-bottom: 16px;
}

.hero h1 {
  font-size: 64px;
  margin: 0 0 8px;
  letter-spacing: -2px;
  font-weight: 800;
}

.hero .tagline {
  font-size: 28px;
  margin: 0 0 16px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 700;
}

.hero .subtitle {
  color: var(--fg-muted);
  max-width: 620px;
  margin: 0 auto 24px;
  font-size: 17px;
}

.badges { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.badges a { text-decoration: none; }

.personas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 56px 0;
}

@media (max-width: 640px) {
  .personas { grid-template-columns: 1fr; }
  .hero h1 { font-size: 44px; }
  .hero .tagline { font-size: 22px; }
}

.persona {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  background: #ffffff04;
}

.persona h3 { margin: 0 0 8px; font-size: 20px; }
.persona p { margin: 0; color: var(--fg-muted); font-size: 15px; }

h2 {
  font-size: 28px;
  margin: 48px 0 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

.install-tabs {
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}

.tab-buttons {
  display: flex;
  flex-wrap: wrap;
  background: #ffffff08;
  border-bottom: 1px solid var(--border);
}

.tab-button {
  padding: 12px 20px;
  background: transparent;
  color: var(--fg-muted);
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: color .15s, background .15s;
}

.tab-button:hover { color: var(--fg); background: #ffffff06; }
.tab-button.active { color: var(--fg); background: #ffffff10; border-bottom: 2px solid var(--accent); }

.tab-panel { display: none; padding: 20px; position: relative; }
.tab-panel.active { display: block; }

pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
}

.copy-btn {
  position: absolute;
  top: 28px;
  right: 28px;
  padding: 6px 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.copy-btn:hover { opacity: .9; }
.copy-btn.copied { background: #2ecc71; }

.how-it-works {
  background: #ffffff04;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px 24px;
  white-space: pre;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.9;
  color: var(--fg-muted);
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

th, td {
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
}

th { color: var(--fg); font-weight: 600; }
td { color: var(--fg-muted); }

footer {
  text-align: center;
  margin-top: 80px;
  padding-top: 32px;
  border-top: 1px solid var(--border);
  color: var(--fg-muted);
  font-size: 14px;
}

a { color: var(--accent-2); text-decoration: none; }
a:hover { text-decoration: underline; }
```

- [ ] **Step 3: Create the landing HTML**

Write `docs/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>bugkit — Users click. AI fixes. Done.</title>
  <meta name="description" content="AI-friendly bug reports for any project. Users report bugs with full context. Paste into Claude Code / Cursor / Copilot. Fix ships in minutes.">
  <meta property="og:title" content="bugkit — Users click. AI fixes. Done.">
  <meta property="og:description" content="AI-friendly bug reports for any project. Paste into any AI coding agent. Fix ships in minutes.">
  <meta property="og:image" content="https://bglglzd.github.io/bugkit/og-image.svg">
  <meta property="og:url" content="https://bglglzd.github.io/bugkit/">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/svg+xml" href="../assets/logo.svg">
  <link rel="stylesheet" href="style.css">
</head>
<body>
<div class="wrap">

  <section class="hero">
    <img src="../assets/logo.svg" alt="bugkit logo" class="logo">
    <h1>bugkit</h1>
    <div class="tagline">Users click. AI fixes. Done.</div>
    <p class="subtitle">
      AI-friendly bug reports for any project. Users report bugs with full context — URL, element selector, stack trace, viewport, voice transcript. Admins hit one button. Paste into Claude Code or any AI coding agent. Fix ships in minutes.
    </p>
    <div class="badges">
      <a href="https://github.com/bglglzd/bugkit"><img alt="stars" src="https://img.shields.io/github/stars/bglglzd/bugkit?style=social"></a>
      <a href="https://github.com/bglglzd/bugkit/blob/main/SPEC.md"><img alt="spec v1" src="https://img.shields.io/badge/spec-v1-blue"></a>
      <a href="https://github.com/bglglzd/bugkit/blob/main/LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
    </div>
  </section>

  <h2>Who this is for</h2>
  <div class="personas">
    <div class="persona">
      <h3>🛠  Building for a client or boss</h3>
      <p>Send them the staging link. They click the bug icon, pick the broken element, speak or type what they want. You paste the output into your AI coding agent. Fix ships the same day — exactly how they described it. No more "did they mean the header or the hero?"</p>
    </div>
    <div class="persona">
      <h3>🚀  Running a product with users</h3>
      <p>Users click the bug icon from inside your app. Reports arrive with full context — selector, stack trace, viewport, voice transcript. Paste → AI fixes → user gets notified. Your product improves as fast as you can read reports.</p>
    </div>
  </div>

  <h2>Install — pick your AI agent</h2>
  <div class="install-tabs">
    <div class="tab-buttons">
      <button class="tab-button active" data-tab="claude">Claude Code</button>
      <button class="tab-button" data-tab="cursor">Cursor</button>
      <button class="tab-button" data-tab="copilot">Copilot</button>
      <button class="tab-button" data-tab="chatgpt">ChatGPT / Codex</button>
      <button class="tab-button" data-tab="other">Other</button>
    </div>

    <div class="tab-panel active" id="tab-claude">
      <pre id="code-claude">/plugin marketplace add bglglzd/bugkit
/plugin install bugkit@bglglzd-bugkit
/bugkit:install</pre>
      <button class="copy-btn" data-copy="code-claude">Copy</button>
    </div>
    <div class="tab-panel" id="tab-cursor">
      <pre id="code-cursor">Install bugkit in this project from
https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md</pre>
      <button class="copy-btn" data-copy="code-cursor">Copy</button>
    </div>
    <div class="tab-panel" id="tab-copilot">
      <pre id="code-copilot">Install bugkit in this project from
https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md</pre>
      <button class="copy-btn" data-copy="code-copilot">Copy</button>
    </div>
    <div class="tab-panel" id="tab-chatgpt">
      <pre id="code-chatgpt">Install bugkit in this project from
https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md</pre>
      <button class="copy-btn" data-copy="code-chatgpt">Copy</button>
    </div>
    <div class="tab-panel" id="tab-other">
      <p style="margin:0;color:var(--fg-muted);">Paste the full contents of <a href="https://github.com/bglglzd/bugkit/blob/main/INSTALL.md">INSTALL.md</a> into your AI chat. Works with Gemini CLI, Aider, Cline, and anything else that accepts a prompt.</p>
    </div>
  </div>

  <h2>How it works</h2>
  <div class="how-it-works">User finds bug
  ↓  clicks bug icon, picks the broken element, speaks or types
Report saved with full context (URL, selector, stack trace, viewport, transcript)
  ↓
Admin opens report → clicks "Copy Context for AI"
  ↓  standardized prompt with everything the AI needs
Paste into Claude Code / Cursor / Copilot / ChatGPT
  ↓
AI fixes the bug, ships a commit
  ↓
Admin marks report "resolved" with a short note + commit SHA
  ↓
Reporter gets notified</div>

  <h2>Why this beats a feedback form</h2>
  <table>
    <thead>
      <tr><th>Traditional feedback form</th><th>bugkit</th></tr>
    </thead>
    <tbody>
      <tr><td>"Something is broken"</td><td>Selector, XPath, HTML, viewport, URL, stack trace, voice transcript</td></tr>
      <tr><td>Admin reads, asks clarifying questions</td><td>Admin pastes to AI, AI already has everything</td></tr>
      <tr><td>Fix takes days</td><td>Fix ships in minutes</td></tr>
      <tr><td>Format differs per project</td><td>Standardized spec — same ritual across all your projects</td></tr>
      <tr><td>No closed-loop status</td><td>Reporter notified at each state change</td></tr>
      <tr><td>Typing long descriptions is a chore</td><td>🎤 press-to-speak, auto-transcribed</td></tr>
    </tbody>
  </table>

  <h2>Voice — free, no keys, works on slow computers</h2>
  <p style="color:var(--fg-muted);">
    🎤 Mic button next to the description field. Press, speak, transcript streams into the textarea live. Edit if you want, submit.
  </p>
  <p style="color:var(--fg-muted);">
    Default is the browser's <strong>Web Speech API</strong> — free, no install, no keys. Optional upgrade is <strong>local Whisper</strong> (whisper.cpp) for offline / Firefox / full privacy — ~150MB one-time model download, CPU-only. Never paid APIs as the default path.
  </p>

  <h2>Docs</h2>
  <ul style="color:var(--fg-muted);">
    <li><a href="https://github.com/bglglzd/bugkit/blob/main/SPEC.md">SPEC.md</a> — the portable data contract</li>
    <li><a href="https://github.com/bglglzd/bugkit/tree/main/recipes">recipes/</a> — 7 sink adapters (DB, GitHub Issues, Telegram, JSONL, email, Slack/Discord, CLI)</li>
    <li><a href="https://github.com/bglglzd/bugkit/blob/main/INSTALL.md">INSTALL.md</a> — universal paste-in prompt</li>
    <li><a href="https://github.com/bglglzd/bugkit/blob/main/examples/ai-context-output.txt">Example AI context output</a></li>
  </ul>

  <footer>
    MIT licensed · <a href="https://github.com/bglglzd/bugkit">Star on GitHub</a> · built by <a href="https://github.com/bglglzd">bglglzd</a>
  </footer>

</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tab;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
    });
  });

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.copy;
      const target = document.getElementById(targetId);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.innerText);
        const old = btn.innerText;
        btn.innerText = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.innerText = old; btn.classList.remove('copied'); }, 1200);
      } catch {
        btn.innerText = 'Copy failed';
      }
    });
  });
});
</script>

</body>
</html>
```

- [ ] **Step 4: Verify HTML structure**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('docs/index.html', 'utf8');
const checks = ['<title>', 'bugkit', 'Users click. AI fixes. Done.', 'tab-button', 'copy-btn', '/bugkit:install', 'raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md'];
for (const ch of checks) {
  if (!c.includes(ch)) throw new Error('missing: ' + ch);
}
console.log('index.html structure OK');
"
```

Expected: prints `index.html structure OK`.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html docs/style.css docs/_config.yml docs/.nojekyll
git commit -m "feat: GitHub Pages landing page

Single-page landing at docs/index.html with: hero + tagline, two-persona block,
agent-picker tabs with copy buttons (Claude Code / Cursor / Copilot / ChatGPT /
Other), how-it-works, comparison table, voice section, docs links.

Vanilla HTML + CSS + minimal JS. No framework, no build step. .nojekyll
disables Jekyll so the HTML ships as-is."
```

---

## Task 11: Final polish + GitHub Pages enablement note

**Files:**
- Modify: `README.md` (add GH Pages enablement footnote)

- [ ] **Step 1: Add a "Deploying the landing page" line to the README**

Append to the end of `README.md` (just before the final `<sub>` note):

```markdown
---

<details>
<summary>📘 Deploying the landing page</summary>

The landing page lives in `docs/`. To enable it on GitHub Pages:

1. Go to your repo's **Settings → Pages**.
2. Under **Source**, pick **Deploy from a branch**.
3. Branch: `main`, folder: `/docs`.
4. Save. After ~1 minute, the page is live at `https://<your-username>.github.io/bugkit/`.

`.nojekyll` is already in place so your HTML ships as-is.

</details>
```

- [ ] **Step 2: Verify the note is in place**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('README.md', 'utf8');
if (!c.includes('Deploying the landing page')) throw new Error('deploy note missing');
console.log('GH Pages enablement note OK');
"
```

Expected: prints `GH Pages enablement note OK`.

- [ ] **Step 3: Full-repo structural sanity check**

Run:
```bash
node -e "
const fs = require('fs');
const must_exist = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'commands/install.md',
  'skills/installing-bugkit/SKILL.md',
  'skills/adding-voice/SKILL.md',
  'recipes/web-app-full.md',
  'recipes/github-issues.md',
  'docs/index.html',
  'docs/style.css',
  'docs/_config.yml',
  'docs/.nojekyll',
  'assets/logo.svg',
  'assets/og-image.svg',
  'README.md',
  'INSTALL.md',
  'SPEC.md',
  'LICENSE'
];
for (const p of must_exist) {
  if (!fs.existsSync(p)) throw new Error('missing: ' + p);
}
console.log('All expected files exist');
"
```

Expected: prints `All expected files exist`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add GitHub Pages deployment note to README

Short collapsible section at the bottom explaining the one-time Settings toggle
to enable the docs/ landing page at bglglzd.github.io/bugkit."
```

---

## Self-review (post-plan)

**Spec coverage:**
- Plugin manifests (plugin.json + marketplace.json) → Task 1 ✓
- Slash command `/bugkit:install` → Task 2 ✓
- `installing-bugkit` skill → Task 3 ✓
- `adding-voice` skill → Task 4 ✓
- Universal `INSTALL.md` → Task 5 ✓
- Voice in `web-app-full.md` → Task 6 ✓
- Voice reference in `github-issues.md` → Task 7 ✓
- README rewrite (hero, two-persona, install table, comparison, voice, docs) → Task 8 ✓
- Logo + OG image → Task 9 ✓
- GitHub Pages landing (docs/index.html + style + config) → Task 10 ✓
- GH Pages enablement note → Task 11 ✓
- No SPEC change (explicitly preserved) ✓
- No `@bugkit/browser` library (explicitly omitted) ✓
- Hero GIF as user TODO (not in plan, noted in the spec) ✓

**Placeholder scan:** No "TBD", "TODO", "fill in details". The GIF placeholder in the README is a deliberate recording-later marker, documented in the spec.

**Type consistency:** Function names stay consistent — `attachVoice` / `detectTranscribeEndpoint` / `recordAndTranscribe` used identically in the `adding-voice` skill and the `web-app-full.md` recipe. File paths consistent throughout. Install command syntax (`/plugin marketplace add bglglzd/bugkit` → `/plugin install bugkit@bglglzd-bugkit` → `/bugkit:install`) identical in README, INSTALL.md, and landing page.

No issues found. Plan is ready to execute.
