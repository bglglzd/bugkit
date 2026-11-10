# Recipe: CLI tool

Your project is a command-line tool. Add a `bug` subcommand users can run when something breaks.

**Best for:** developer tools, build systems, dotfiles, scripts. Users already in the terminal — no UI needed.

---

## What you'll build

1. `mytool bug "<description>"` — creates a report
2. `mytool bug list` — shows reports
3. `mytool bug show <id>` — full detail
4. `mytool bug copy <id>` — prints AI context to stdout (pipe to clipboard)
5. `mytool bug close <id> "<note>"` — marks resolved

Storage: JSONL file at `~/.mytool/bugreports.jsonl` (or project-local `.bugreports.jsonl` for project-scoped tools).

---

## Context capture for CLI

Since there's no DOM, capture:
- `process.argv` / `$@` — the command that was invoked (probably the one that failed)
- `process.cwd()` — working directory
- `process.env.PATH` (maybe) — sometimes useful for debugging path issues
- OS + arch: `process.platform + process.arch`
- Tool version: from your package.json
- Node/Python/Rust/etc. version
- **Last error** from your tool's log file, if you have one

Also auto-attach:
- The last N lines of stdout/stderr if you log them
- Exit code of the previous command (if the shell propagates it)

Example capture:

```ts
const context = {
  environment: {
    app_version: require('./package.json').version,
    platform: process.platform,
    os: `${os.type()} ${os.release()}`,
    node: process.version,
  },
  cli: {
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    last_command: process.env.MYTOOL_LAST_CMD,   // if you set this on every run
    exit_code: process.env.MYTOOL_LAST_EXIT,
  },
  error: await readLastError(),   // e.g. last entry in ~/.mytool/error.log
}
```

---

## Usage examples

```bash
# Happy path: report something immediately
$ mytool build
Error: cannot resolve module './foo'

$ mytool bug "build fails with a spurious module resolve error on fresh clones"
✓ Bug report #17 saved to ~/.mytool/bugreports.jsonl
  Share with: mytool bug copy 17 | pbcopy

# Admin later: triage
$ mytool bug list --status=open
#15 [bug] "flaky test in CI"                 — 2h ago
#17 [bug] "build fails with a spurious..."   — 30m ago

$ mytool bug show 17
# full report including cwd, argv, last error, env

$ mytool bug copy 17 | pbcopy   # paste into Claude Code
```

---

## Interactive mode (nicer UX)

If description isn't provided, drop into an interactive prompt:

```bash
$ mytool bug
Describe the bug (multiline, end with "."):
> npm install fails after upgrading to v3.2.0
> the lockfile seems corrupted
> .

Type [bug/feature] (default bug):
> bug

Include current error log? [Y/n]:
> Y

✓ Bug report #18 saved.
```

Use `readline` or a small prompts library.

---

## AI context format for CLI

Use the canonical `buildAIContext` function from `web-app-full.md`, unchanged.
Set `environment.platform` to `cli`, map tool version/commit/OS to the matching
SPEC fields, and put optional command/CWD/runtime details in `logs.console`.
Keep the standard labels and reporter prefix; omit empty web/DOM sections.

```ts
function buildCLIContext(report: BugReport, closeHint: string): string {
  return buildAIContext(report, closeHint)
}
```

Pass a close hint matching your actual CLI storage command. The JSONL recipe
shows its `node scripts/bugkit.js close REPORT_ID "<note>"` path; a tool with its
own subcommand can supply that subcommand instead. Do not invent a web PATCH
endpoint for a file-backed CLI.

---

## Where to store the code

Inside your tool:
- `src/bug.ts` (or `.js`, `.py`, etc.) — the subcommand handler
- `src/bug/store.ts` — JSONL read/write
- `src/bug/context.ts` — build the AI context string

Keep it tiny. The subcommand should be <200 lines total.

---

## Publishing via GitHub Issues instead

If your CLI is open-source and you want reports to go to GitHub:
- `mytool bug "<desc>"` opens a pre-filled `gh issue create` with the AI context in the body
- Requires `gh` CLI installed; fall back to JSONL if not

```ts
async function createGhIssue(report: BugReport, updateHint: string) {
  if (!updateHint?.trim()) throw new Error('A storage-specific update hint is required')
  const body = buildAIContext(report, updateHint)
  const child = spawn('gh', ['issue', 'create', '--title', report.title, '--body-file', '-', '--label', `bugkit,${report.type}`], {
    shell: false, stdio: ['pipe', 'inherit', 'inherit'],
  })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.stdin.on('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`GitHub issue creation failed (${code})`)))
    child.stdin.end(body)
  })
}
```

Fall back to JSONL if `gh` isn't available so users without it still get a working local log.
Pass an explicit hint: for an issue-only store, use
`gh issue close "<created-issue-URL>" --comment "<short note>"`; for a JSONL
source of truth, use its actual local close command. A CLI must not inherit the
web reference's PATCH endpoint.

---

## Acceptance checklist

- [ ] `mytool bug "text"` creates a report in JSONL (or GitHub Issue)
- [ ] Interactive prompt works if no description given
- [ ] `mytool bug list` shows open reports
- [ ] `mytool bug copy N` prints SPEC.md §3 format to stdout
- [ ] `mytool bug close N "<note>"` marks resolved
- [ ] Context auto-captures: tool version, platform, cwd, argv, last error (if available)
