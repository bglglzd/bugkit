# Install BugKit

## Use the Chrome extension

Download **BugKit-MARK-1.1.0.zip** from [GitHub Releases](https://github.com/bglglzd/bugkit/releases/latest), extract it, then load its **extension** folder at `chrome://extensions` with Developer mode enabled. Click the toolbar icon or press Ctrl+Shift+Y (⌘+Shift+Y on macOS). No development tools or application changes are required.

See the [Russian walkthrough](docs/INSTALL.ru.md) and [extension reference](docs/EXTENSION.md) for updates, permissions and recovery.

## Integrate reporting into a project

Claude Code:

```text
/plugin marketplace add bglglzd/bugkit
/plugin install bugkit@bugkit
/bugkit:install
```

Other coding agents can read the task below. These are installer instructions for a project that has explicitly requested BugKit integration.

---

Implement BugKit in the current project. Read its development instructions and existing reporting code before changing files. If BugKit already exists, audit and upgrade it; preserve reports, IDs, original descriptions and working integrations.

1. **Inspect.** Identify the stack, UI, authentication, storage, tenant boundaries, notification delivery and deployment version source. Reuse them. Summarize the core journey, a representative failure/recovery, and the files to change.
2. **Choose storage.** Honor the user's existing choice. Otherwise recommend the existing database, or JSONL for a local tool. Ask one storage question only if unresolved. External delivery needs explicitly configured credentials; it is optional when local storage is primary.
3. **Read the contract.** Fetch `SPEC.md`, `HARDENING.md` and the matching file under `recipes/` from this repository at the same full commit SHA. Prefer bundled plugin/checkout files. Resolve relative links against this repository, not the host project. Do not mix snapshots or overwrite a working integration with an older sample.
4. **Implement the complete journey.** Preserve `bugkit_spec: "1"`, canonical fields, IDs and statuses. Follow the recipe, then implement every applicable HARDENING requirement. Small recipe snippets are examples, not a finished server. Use one formatter for CLI and Copy Context. Keep untrusted content in a fresh nonce-delimited block; apply the project's masking function by default. Review unknown reporters' requests before implementing them.
5. **Recover safely.** Use one main description, optional reproduction fields, explicit element/screenshot actions, an account-scoped session draft, clear-on-logout, and non-destructive failure handling. Picking a link must not navigate or close the inspected popup. Capture pointers at `window`, ignore the widget UI and restore listeners/focus on cancellation. Retain text after submission failure or stale-deployment errors.
6. **Make the server authoritative.** Derive author, tenant, permissions and build from server state. Bound context/attachments. Apply one access boundary to lists, detail, exports, edits, attachments and batches. Preserve originals on edit. Close through one operation with `resolution`, separate `user_note` and verification steps for fixes; validate a whole batch before writes. Store notification intent with the result and retry delivery without duplication. Never bypass closure with raw SQL.
7. **Verify through the real UI or CLI.** Create a synthetic report, select an element, recover a draft, fail a submission, inspect stored data, copy context, resolve and verify the author's state. Test unauthorized/cross-tenant access where applicable, a failed batch and delivery retry. Run relevant host build/tests. Record actual checks and blockers; mocked providers do not prove live delivery.
8. **Optional voice.** Offer it after the main journey passes. Read `skills/adding-voice/SKILL.md`. Explain browser support/provider processing; offer local Whisper for offline use. Do not add paid services without the user's request.
9. **Handoff.** List files, storage choice, entry point, reproducible verification, update/rollback instructions and limits. Save an integration note in the host's existing docs so future upgrades do not need rediscovery.

Recipes: [database/web app](recipes/web-app-full.md), [GitHub Issues](recipes/github-issues.md), [Telegram](recipes/telegram-bot.md), [JSONL](recipes/jsonl-file.md), [email](recipes/email.md), [Slack/Discord](recipes/slack-discord.md), [CLI](recipes/cli-tool.md).

Source: [bglglzd/bugkit](https://github.com/bglglzd/bugkit). These instructions do not authorize contacting users, publishing code or modifying production data.
