# Validation boundaries

BugKit includes a local Chrome extension, specification, plugin installer and application recipes. It has no hosted delivery service. Node.js 24+ runs the dependency-free checks; Playwright is a pinned development-only dependency for real Chromium acceptance. Python 3.11+ packages committed files.

```sh
npm run check
npm test
npm ci
npx playwright install chromium
npm run test:browser
```

CI runs syntax and contract checks on Linux and Windows, plus real extension acceptance in Chromium. Browser tests use a disposable profile, loopback synthetic demo and DevTools' extension action. They exercise actual injection, element selection, clipboard, downloads, captureVisibleTab, draft reload, SPA route isolation, narrow layout and restricted-page help. Pixel comparison checks that the capture excludes the panel. The clipboard-read permission granted by the harness is for checking exported text; MARK itself requests only clipboardWrite.

Results and screenshots are written to ignored `artifacts/browser/`. There is no connection to an existing browser or personal profile. The DevTools action verifies the toolbar action path, not physical shortcut key dispatch. Native Chrome installation and macOS keyboard/system behavior remain manual checks.

Contract tests execute documented recipe snippets with real temporary JSONL files and loopback HTTP. Provider SDKs, browser speech objects and some picker objects are explicitly synthetic. No real Telegram/Slack/Discord/email message or GitHub issue is created. Tests cover delivery rejection, complete IDs, safe argv, large Unicode payloads, required close hints, context masking/framing, malformed optional blocks and text-only export. Whisper proxy tests use a synthetic upstream; no model/server is run.

These tests establish supplied code/example behavior. They do not establish a generated application's framework integration, authorization, database transaction behavior, live provider credentials, microphone recognition, email deliverability or AI fix quality. The installer must perform the host-specific [acceptance checklist](HARDENING.md).

To verify an artifact, build with `python scripts/package.py` from a clean committed checkout, extract its ZIP, and rerun browser acceptance with `BUGKIT_EXTENSION_DIR` pointing to the extracted `extension/`. Compare the release download's digest against `SHA256SUMS.txt` and the source-bound `build-manifest.json`. A rebuilt ZIP is a new artifact until its bytes and relevant checks are verified.
