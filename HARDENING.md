# Application integration acceptance

These requirements apply when adapting BugKit to an application. Recipe snippets do not implement a host's authorization, transactions or notification system. Implement and verify applicable requirements before calling an integration complete. The Chrome extension has its own [scope](docs/EXTENSION.md).

## Data and authorization

- Derive author, roles, tenant and release from authenticated server state, never submitted fields. Verify every referenced entity against the actor's scope.
- Reuse a scoped query and authorized-target operation for lists, details, counters, exports, edits, attachments and batches. Missing and inaccessible records have the same response.
- Allowlist bounded context. Reject invalid mandatory fields; malformed optional context must not crash a queue or erase a valid description. CLI batches continue per report while reporting failures.
- Keep client `occurred_at`, server `created_at`, observed version and fixed release separate. Bound client time and label version sources.
- Preserve original title/description on first edit, with revision actor/time. Author editing has a stated server-enforced time/status window.
- Validate attachment MIME, size and access on the server. Store large screenshots appropriately; rate limits account for their cost.

## Widget and recovery

- Use one main description and derive its title. Optional reproduction fields and configurable `kind` remain compatible with old input during deployments.
- Mount once. Provide a small-screen entry when a floating button covers controls. A programmatic open action is optional.
- Use account/tenant-scoped session drafts, clearing on logout, account change and success. Retain text after validation/network/stale-deployment failure. Store screenshots separately when needed.
- Catch submission failures inside the widget. Distinguish a saved report with failed delivery from a failed save.
- Select only on request. Capture pointer/click/Escape at `window`, ignore marked widget UI, prevent link activation and restore listeners/focus on every exit. Test popups, scroll, touch and any claimed iframe behavior.
- Screenshots require explicit action and a visible-data warning. Do not collect form values or arbitrary HTML by default. Strip URL credentials, queries and fragments; apply project-specific path masking.

## Context export

Copy Context, exports and CLI use one formatter and masking policy. Enable the application's `mask(text)` hook by default; preview the processed result. A baseline mask cannot identify all sensitive data.

Place all report content, DOM text, metadata and logs in a fresh nonce-delimited untrusted block. Select a delimiter absent from its content. Keep instructions and configured update commands outside; normalize headers to one line. Unknown reporters' requests need review before implementation. Only server-authenticated state establishes authority. Delimiters aid separation; they do not guarantee protection from prompt injection.

Support server-defined text-only mode for restricted contexts, omitting automatic page/DOM/log/attachment context across every export. Optional AI conversation context is assembled from authorized server messages with bounded fields; a client transcript is not authoritative.

## Closing and notifying

UI, API and CLI call one closure operation; never bypass it with raw SQL. Require technical `resolution`, separate author-facing `user_note`, and verification steps for fixes. `resolved` denotes a fix; `closed`/`wontfix` denote review without claiming a fix.

Validate the entire batch, access and transitions before writing. Use a transaction when promising atomicity. Repeated idempotency keys return one logical result. Save closure and notification intent consistently, then deliver through an outbox or host equivalent. Retry delivery without duplicate closure/messages; expose failure separately. An unexecuted provider path does not establish notification success.

Admin counts must reflect actual queries, with bounded pagination including resolved records. Authors see only their own reports and the user-facing note. Optional commit/release links refer to the recorded fix.

## Acceptance

| Scenario | Required observation |
|---|---|
| Submit from real UI/CLI | Canonical report in chosen store |
| Reload draft, then logout | Text survives reload; next account cannot recover it |
| Failed save or stale deployment | Text retained; local error and working recovery |
| Pick a link in a popup, cancel, click normally | No navigation while picking; normal behavior restored |
| Forge role/tenant/release; request foreign report/attachment | Server authority; consistent access rejection |
| Malformed optional context | Other reports remain readable/exportable |
| Fake instructions/lookalike delimiter | Content inside data block; trusted commands outside |
| Copy Context and CLI | Same sections and masking |
| Batch with an inaccessible/conflicting record | No partial writes or record-existence leak |
| Concurrent/repeated closure and delivery retry | One result and logical notification; delivery failure separate |
| Edit report | Original observation remains identifiable |
| Restricted text-only policy | No automatic page/DOM/log/attachment data in exports |

Record actual results, commands, commit, environment and unmet checks in the host's integration note. Repository snippet tests do not establish acceptance of an untested host integration.
