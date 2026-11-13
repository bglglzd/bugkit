# Contributing

Keep the portable contract in `SPEC.md` compatible. Prefer the canonical context
formatter to a second, shorter copy. Describe which installing-project helpers
an example expects and which environment values stay on its server.

For a behavioral recipe change, reproduce the problem and run:

```bash
npm run check
npm test
```

Use synthetic reports, temporary files and loopback services. Never run a test
against real recipients, provider credentials or a user's report store. Clearly
label mocked SDK/browser boundaries and document what still needs verification
in the installing project. Keep optional voice input optional; browser speech
may use a browser-provider service, while local Whisper is a separate setup.

Keep PRs focused, retain licenses/attribution, and list the relevant checks and
limits. Do not commit local agent instructions, private reports or credentials.

For extension behavior, also run `npm ci`, `npx playwright install chromium`
and `npm run test:browser`. The browser harness uses only an isolated profile
and synthetic loopback data. Change both package/manifest versions together.
Build release ZIPs from a clean commit with `python scripts/package.py`, then
exercise the extracted package and verify its digest before publishing.
