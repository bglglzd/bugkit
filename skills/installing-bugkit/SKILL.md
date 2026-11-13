---
name: installing-bugkit
description: Install or upgrade BugKit reporting in the current project, then verify its real journey and recovery.
---

# Install or upgrade BugKit

Read the bundled `INSTALL.md`, `SPEC.md`, `HARDENING.md` and the matching `recipes/` file from this plugin's root before implementing. These files are the shared installer contract; use bundled files rather than mixing remote revisions. If unavailable, fetch the files from one full commit SHA at https://github.com/bglglzd/bugkit.

Follow the application integration section in INSTALL.md. Reuse an existing integration and preserve stored reports. Honor a previously selected sink; ask about storage only if unresolved. Implement all applicable HARDENING requirements, not just the small recipe examples. The Chrome extension is an independent path and needs no backend changes.

Verify from the actual UI/CLI, including failure recovery, access checks, context export, closure and author-facing state. Record actual executed checks and blockers. Do not label a mocked or unavailable provider as live delivery. Offer optional voice only after the main journey passes; explain browser provider processing and the local Whisper alternative.

Finish with changed files, entry point, reproducible checks, update/rollback instructions and a host-project integration note. Installation is not complete merely because files compile. These instructions do not authorize real messages, production changes or publication beyond the user's request.
