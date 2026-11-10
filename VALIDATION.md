# Validation boundaries

bugkit contains a portable report specification, plugin commands/skills and
recipes that an installing agent adapts to a project. It has no runtime package
manifest or hosted delivery service. Recipe-specific SDKs belong to the target
project; keep them on supported versions there.

Run `node --test tests/*.test.mjs` with Node 24 LTS. CI runs the same checks on
Linux and Windows. Tests extract the actual documented code blocks, rather than
keeping a separate implementation of each adapter.

The suite exercises:

- Registered marketplace/install-command consistency and the advertised voice
  command asset.
- Canonical SPEC context fields, section order and storage-specific close hints.
- Actual temporary JSONL create/list/show/copy/close, full UUID/numeric selection,
  failure visibility and terminal resolution validation.
- Telegram complete IDs, webhook secret and chat/user authorization, reason
  replies, large context files and delivery failures using loopback HTTP.
- Slack chunk reconstruction and Discord file delivery with long Unicode text,
  controlled mentions, acknowledgement requests and rejected deliveries.
- Resend's resolved-promise error contract and GitHub issue-body reconstruction
  with explicit fake SDKs. No actual email or issue is created.
- Literal CLI argv/stdin, synthetic speech-result sequences/restarts, and picker
  coordinates with synthetic scrolled HTML/SVG browser objects.
- Both Whisper proxy snippets' input validation, multipart byte forwarding and
  upstream HTTP rejection using a synthetic loopback endpoint. Setup commands
  are checked against the linked upstream source; no actual Whisper server or
  model is executed by this suite.

These checks establish the supplied examples' contracts. They do not establish
live provider credentials, a generated project's framework integration, real
microphone recognition, email deliverability, rate-limit behavior or AI fix
quality. Plugin validation/clean local installation can be performed without an
inference request using an isolated Claude Code configuration directory.

Store a report before mirroring it. Delivery errors must remain distinguishable
from a saved report; retrying a partially accepted multi-message operation may
duplicate a notification. Telegram pending-reason storage in the example is for
a single process; use durable storage for multiple workers/serverless handlers.
