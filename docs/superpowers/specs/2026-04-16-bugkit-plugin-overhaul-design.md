# bugkit v1.0 — Plugin Overhaul Design

**Date:** 2026-04-16
**Author:** bglglzd (with Claude)
**Status:** Approved for implementation

## Goal

Turn bugkit from a "paste this long prompt into your AI" repo into a **real installable plugin** that drives GitHub attention. One-command install for Claude Code, universal paste-in path for every other AI coding agent. Add optional voice transcription for bug reports (Web Speech API by default, local Whisper as upgrade — never paid APIs as the default path). Rewrite README and add a GitHub Pages landing page so the repo is pitch-ready for HN / r/ClaudeAI / Twitter.

## Success criteria

1. A developer using **Claude Code** can install bugkit in three commands: `/plugin marketplace add`, `/plugin install`, `/bugkit:install`. The skill walks them through stack detection, asks one question (sink), one optional question (voice), and produces a working bug-report pipeline in their project.
2. A developer using **Cursor / Copilot / ChatGPT / any other AI agent** can install bugkit by pasting one URL (or the full `INSTALL.md`) into their chat. Functionally identical outcome.
3. The **README** makes it obvious within 10 seconds (a) what bugkit is, (b) who it's for (agency-to-client + product-to-users), (c) how to install for the reader's specific AI agent. A hero GIF slot + install table + two-persona block + comparison table.
4. A **GitHub Pages landing page** at `bglglzd.github.io/bugkit` presents the same content in a polished single-page HTML, with clickable agent tabs for the install commands and copy-to-clipboard buttons.
5. **Voice transcription** is wired into the web-app recipe. Default: browser-native Web Speech API, zero config, zero keys. Optional upgrade: local Whisper (whisper.cpp), documented with a one-liner setup.
6. The existing **SPEC.md** is untouched — the portable format stays stable. The existing 7 recipes keep working; web recipes gain an optional "Voice" section.

## Audience & positioning

Two concrete user personas, both served by the same mechanic:

**Persona A — Agency / freelancer / solo dev building for a client.**
Ships staging site to a non-technical client. Client clicks bug icon in the app, picks the element that's wrong, speaks or types what they want. Dev pastes the output into Claude Code. AI implements the fix as described. Replaces the high-translation-loss email/Slack/figma-comment loop.

**Persona B — Indie hacker / PM / small team running a live product.**
Real users report bugs and feature requests via the in-app icon. Reports arrive in a triage queue with full technical context (URL, selector, stack trace, viewport). Admin hits Copy Context → pastes to AI → ships fix → user gets notified. Product improves at the speed of AI-assisted coding.

Both personas land on the same README/landing page and find themselves immediately.

## Architecture overview

### Repo layout after the overhaul

```
bugkit/
├── .claude-plugin/
│   ├── plugin.json                # Claude Code plugin manifest
│   └── marketplace.json           # makes the repo a one-plugin marketplace
├── commands/
│   └── install.md                 # /bugkit:install slash command
├── skills/
│   ├── installing-bugkit/
│   │   └── SKILL.md               # main install orchestrator
│   └── adding-voice/
│       └── SKILL.md               # /bugkit:voice [web-speech|local-whisper]
├── recipes/                       # existing, web recipes gain "Voice" section
│   ├── web-app-full.md
│   ├── github-issues.md
│   ├── telegram-bot.md
│   ├── jsonl-file.md
│   ├── email.md
│   ├── slack-discord.md
│   └── cli-tool.md
├── examples/
│   └── ai-context-output.txt
├── assets/
│   ├── logo.svg
│   └── og-image.svg
├── docs/                          # GitHub Pages source
│   ├── index.html                 # single-page landing
│   ├── style.css
│   └── _config.yml
├── README.md                      # rewritten
├── LICENSE
├── SPEC.md                        # unchanged
└── INSTALL.md                     # rewritten, tightened, used by non-Claude-Code agents
```

### Claude Code plugin anatomy

**`.claude-plugin/plugin.json`** — manifest with `name`, `description`, `version`, `author`, `repository`, `homepage`.

**`.claude-plugin/marketplace.json`** — single-plugin marketplace manifest so `/plugin marketplace add bglglzd/bugkit` works.

**`commands/install.md`** — minimal wrapper whose body invokes the `installing-bugkit` skill. Per Claude Code namespacing rules, this is surfaced to users as `/bugkit:install`.

**`skills/installing-bugkit/SKILL.md`** — the main orchestrator skill. Does stack detection, asks the one question (sink), reads the matching recipe from the bundled `recipes/` dir, implements per the recipe, then offers voice (delegates to `adding-voice` skill if yes), then verifies and reports back.

**`skills/adding-voice/SKILL.md`** — standalone skill, can run on its own later if the user initially declined voice. Has two modes: `web-speech` (default) and `local-whisper`. Web Speech mode wires the browser API directly. Local Whisper mode adds a `/api/bugkit/transcribe` backend proxy + documents the one-liner to run whisper.cpp server.

### Universal path (non-Claude-Code agents)

The rewritten `INSTALL.md` is the universal prompt. Agents that auto-fetch URLs (Cursor, Copilot Chat) receive `https://raw.githubusercontent.com/bglglzd/bugkit/main/INSTALL.md`. Agents that don't auto-fetch get the full content pasted. Either way, the prompt instructs the AI to: detect stack → ask the one sink question → WebFetch the matching recipe from GitHub raw → implement → offer voice → verify.

Both paths (Claude Code plugin + universal) are backed by the **same recipe files** in `recipes/`. One source of truth.

### Voice feature

**Frontend:** a 🎤 mic button next to the description textarea in the bug-report modal. Click to toggle recording. While recording, live interim transcripts stream into the textarea (via `SpeechRecognition.interimResults = true`). Final transcript is editable before submit. Gracefully hidden if unsupported.

**Primary path (Web Speech API):** `new (window.SpeechRecognition || window.webkitSpeechRecognition)()`. Zero deps, zero keys, zero server-side code. Works in Chrome/Edge/Safari, falls back gracefully in Firefox.

**Upgrade path (local Whisper):** a thin backend route `/api/bugkit/transcribe` that proxies audio blobs to a Whisper server. Users run `whisper.cpp` locally (one-time setup of ~150MB base model) and bugkit auto-detects the endpoint. Fully offline, universal browser support (uses MediaRecorder + fetch instead of Web Speech), no API keys. The recipe documents the setup as a copy-paste block.

**Paid-API fallback:** documented as a footnote — set `BUGKIT_TRANSCRIBE_URL` to an OpenAI-compatible endpoint if you want that. Never the headline.

**Frontend auto-detection:** on modal mount, frontend pings `/api/bugkit/transcribe` with a healthcheck. If present, uses MediaRecorder → POST audio. Otherwise uses Web Speech. User never chooses.

**No SPEC.md change:** voice is purely a UX layer. Description field is populated from transcription; the portable format is unchanged. Audio blobs are *not* persisted in v1 — only the transcribed text.

### Library decision — no `@bugkit/browser` in v1

Shipping an npm package cuts against the "just works on a slow computer, no deps" story. Recipes inline the picker + voice code. If real demand appears for a centralized library, revisit in v2 as a thin bundler-friendly package.

## Marketing deliverables

### README rewrite

New scroll order:
1. **Hero line** — "Users click. AI fixes. Done." (or similar punchy tagline)
2. **Hero GIF placeholder** — 10-12 second demo (shot list below; actual recording is a user TODO)
3. **Who this is for** — the two-persona block (agency+client / product+users)
4. **Install** — agent-picker table. Left col = agent name, right col = exact copy-paste command. Claude Code, Cursor, Copilot, ChatGPT/Codex, "Any other agent."
5. **How it works** — the 5-step ritual as arrows (already present, keep)
6. **Why this beats a feedback form** — the comparison table (already present, keep)
7. **Docs** — links to SPEC.md, recipes/, examples/
8. **License + star link**

### Hero GIF shot list (TODO for user to record)

Frame-by-frame (aim ~10 seconds):
1. User on a staging site — hovers, clicks the 🐛 icon in navbar (1s)
2. Modal opens, user clicks "Choose element on page" (1s)
3. Page crosshair, user clicks a broken button — modal returns with selector + element info filled in (2s)
4. User clicks 🎤, says "this button doesn't respond when I click it" — transcript appears live in textarea (3s)
5. User clicks Submit, toast confirms (1s)
6. Cut to admin view — admin clicks "Copy Context for AI" (1s)
7. Cut to Claude Code pasting, AI responding "Fixed — the click handler was missing the preventDefault..." (1s)

### Landing page at `docs/index.html`

Single HTML file on GitHub Pages (`docs/` branch or folder). Vanilla HTML + CSS + a tiny bit of JS for the agent tabs. No framework, no build step. `_config.yml` tells Jekyll to serve as-is. Content mirrors the README but with:
- Hero with inline GIF/video (when ready)
- Agent tabs with code blocks and copy buttons (`navigator.clipboard.writeText`)
- Same two-persona framing
- Footer with GitHub star link + spec link

### Logo + OG image

`assets/logo.svg` — simple mark: a stylized bug icon paired with `bugkit` wordmark. Used in README + landing page.

`assets/og-image.svg` (1200×630) — for social shares. Tagline + logo on a clean background. Converted to PNG when shared (SVG-in-OG isn't universally supported; user can export to PNG via browser or inline svg2png before linking).

## Implementation order

Logical commits, each independently reviewable:

1. **Plugin scaffold** — `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `commands/install.md`, `skills/installing-bugkit/SKILL.md`, `skills/adding-voice/SKILL.md`. Lets someone install the plugin and run it; skills reference existing recipes.
2. **Universal INSTALL.md rewrite** — tighten, add voice section, unify with plugin skill content so both paths produce the same result.
3. **Voice in recipes** — add "Voice (optional)" section to `recipes/web-app-full.md` with Web Speech code + local Whisper upgrade. Brief reference note in `recipes/github-issues.md` pointing back.
4. **README rewrite** — new hero, two-persona block, install table, preserved comparison table.
5. **Landing page + assets** — `docs/index.html`, `docs/style.css`, `docs/_config.yml`, `assets/logo.svg`, `assets/og-image.svg`.
6. **GitHub Pages enablement note** — a README line or repo-setup note explaining how to enable GH Pages for the `docs/` folder (manual one-time toggle in repo settings).

## Non-goals (explicit)

- No `@bugkit/browser` npm package in v1.
- No in-plugin auto-update mechanism — rely on GitHub release notifications for starrers/watchers.
- No changes to `SPEC.md`.
- No real-time "your bug is being worked on" indicator.
- No hero GIF recording (user records it after deploying the demo locally).
- No custom domain for the landing page — GitHub Pages default URL.
- No paid-API wiring as a default path (footnote only).

## Risks / open questions

- **GitHub Pages rendering of the landing page** — untested until enabled in repo settings. Fallback: the README itself is enough; landing is nice-to-have, not critical-path.
- **Marketplace-install syntax** — verified against Claude Code docs (Apr 2026). If Anthropic changes the syntax, README install block needs an update. Unlikely in the short term.
- **Web Speech API browser coverage** — Firefox support is weak. Mitigation: local Whisper path works in all browsers. README mentions this honestly.
- **Claude Code skill authoring conventions** — the `installing-bugkit` skill must be well-scoped (one job, asks one question, invokes the right recipe). Risk: AI agents reading the skill misfire if it's too long/ambiguous. Mitigation: keep the skill under ~300 lines, reference the recipe rather than inlining it.
