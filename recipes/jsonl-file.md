# Recipe: JSONL file (zero infra)

The simplest possible sink: append each report as one JSON line to `./.bugreports.jsonl`. No DB, no external service, no admin UI — just a file you can `cat`, `grep`, `jq` over.

**Best for:** MVPs, personal projects, prototypes, local-only tools. Upgrade to a real recipe later without losing data — JSONL is trivial to migrate.

---

## Data format

One report per line. Each line is valid JSON and self-contained:

```jsonl
{"bugkit_spec":"1","id":1,"type":"bug","title":"Button broken","status":"open","created_at":"2026-04-16T04:16:00Z","reporter":{"id":"u1","name":"op"},"description":"...","page":{"url":"..."},"client":{"viewport":"1920x1080","user_agent":"..."},"element":{"selector":"button.btn.btn-primary","xpath":"...","tag":"BUTTON","text":"Click me","html":"<button ...>"}}
{"bugkit_spec":"1","id":2,"type":"feature","title":"Dark mode","status":"open","created_at":"2026-04-16T05:00:00Z","reporter":{"id":"u2","name":"maria"},"description":"..."}
```

---

## ID assignment

Use `crypto.randomUUID()` for new reports. `Date.now()` can return the same value
for multiple reports in one millisecond, so a timestamp alone is not a unique ID.
Reading the largest sequential ID and adding one also needs coordination between
concurrent writers.

The spec accepts string and integer IDs. Keep existing numeric IDs unchanged;
the CLI below accepts both formats and compares the complete ID.

---

## Create a report (Node)

```ts
import { appendFile, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const FILE = './.bugreports.jsonl'

export async function createBugReport(input: BugReportInput) {
  const report = {
    bugkit_spec: '1',
    id: randomUUID(),
    status: 'open',
    created_at: new Date().toISOString(),
    ...input,
    title: extractTitle(input.description),
  }
  await appendFile(FILE, JSON.stringify(report) + '\n', 'utf8')
  return report
}
```

---

## List / read reports

```ts
export async function listReports(filter?: { status?: string, type?: string }) {
  const raw = await readFile(FILE, 'utf8').catch(() => '')
  const reports = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
  if (!filter) return reports.reverse()   // newest first
  return reports.filter(r =>
    (!filter.status || r.status === filter.status) &&
    (!filter.type || r.type === filter.type)
  ).reverse()
}
```

---

## Update a report (status change)

JSONL doesn't support in-place updates efficiently. Options:

1. **Rewrite** — read all, modify target, write back. Fine for <10k lines.
2. **Append update records** — treat the file as an event log. Final state = fold over all events with the same id.

Pattern 2 example:

```jsonl
{"id":1,"op":"create", ... full report ...}
{"id":1,"op":"update","status":"in_progress","updated_at":"..."}
{"id":1,"op":"update","status":"resolved","resolution":"Fixed in abc123","resolved_at":"..."}
```

Reader folds:

```ts
function foldToState(lines: any[]) {
  const byId = new Map<string | number, any>()
  for (const line of lines) {
    if (line.op === 'create') byId.set(line.id, { ...line })
    else if (line.op === 'update') {
      const cur = byId.get(line.id)
      if (cur) Object.assign(cur, line)
    }
  }
  return Array.from(byId.values())
}
```

For MVPs, pattern 1 (rewrite) is simpler. Pattern 2 is more auditable.

---

## Admin: CLI commands

Since there's no web UI, expose CLI commands:

Replace `REPORT_ID` below with the full ID shown by `list` (a UUID for new
reports, or a number for older reports).

```bash
# List open reports
node scripts/bugkit.js list --status=open

# Show one report
node scripts/bugkit.js show REPORT_ID

# Produce AI context
node scripts/bugkit.js copy REPORT_ID | pbcopy   # macOS
node scripts/bugkit.js copy REPORT_ID | clip     # Windows
node scripts/bugkit.js copy REPORT_ID | xclip    # Linux

# Close with a note
node scripts/bugkit.js close REPORT_ID "Fixed in abc1234. Verify by tapping bookmark on mobile."
```

The `copy` command prints the exact `SPEC.md §3` format to stdout. User pipes to clipboard.

---

## Minimal CLI implementation

```ts
#!/usr/bin/env node
import { listReports, createBugReport, updateReport, buildAIContext } from './lib.js'

const [,, cmd, ...args] = process.argv

async function findReport(id) {
  const reports = await listReports()
  const report = reports.find(report => String(report.id) === id)
  if (!report) { console.error('Not found'); process.exit(1) }
  return report
}

if (cmd === 'list') {
  const status = args.find(a => a.startsWith('--status='))?.split('=')[1]
  const reports = await listReports({ status })
  for (const r of reports) {
    console.log(`#${r.id} [${r.status}] ${r.type} — ${r.title}`)
  }
}
else if (cmd === 'show') {
  const r = await findReport(args[0])
  console.log(JSON.stringify(r, null, 2))
}
else if (cmd === 'copy') {
  const r = await findReport(args[0])
  process.stdout.write(buildAIContext(r))
}
else if (cmd === 'close') {
  const r = await findReport(args[0])
  const resolution = args.slice(1).join(' ')
  await updateReport(r.id, { status: 'resolved', resolution, resolved_at: new Date().toISOString() })
  console.log(`#${r.id} resolved.`)
}
```

`buildAIContext` is the SPEC.md §3 template — same as in `web-app-full.md`.

---

## Frontend (if you have one)

The JSONL sink pairs well with any frontend. For a simple project:
- A floating bug button (bottom-right) that opens a form
- Form POSTs to `/api/bug-reports` which calls `createBugReport`
- No user-facing "my reports" page in the MVP; admins handle everything via CLI

For a richer experience, layer `web-app-full.md`'s modal + pages on top of this sink.

---

## Check the examples

From a clean clone of this repository, run with Node.js 24:

```bash
node --test tests/jsonl-recipe.test.mjs
```

The tests execute the create/list/CLI examples against disposable JSONL files.
They check same-tick creation, full UUID lookup, legacy numeric IDs and rejection
of partial IDs. Project-specific title/context/update helpers are test fixtures;
this is not a full installation or a test of the AI context format.

---

## Acceptance checklist

- [ ] `.bugreports.jsonl` file gets appended on each report
- [ ] Each line is valid JSON with `bugkit_spec: "1"` and the required fields
- [ ] Reports created in the same millisecond have distinct IDs; existing numeric IDs remain readable
- [ ] `bugkit list` shows reports, `bugkit show N` shows one, `bugkit copy N` pipes SPEC.md §3 output
- [ ] `bugkit close N "<note>"` updates status to resolved with a resolution note
- [ ] `.bugreports.jsonl` is gitignored (you probably don't want to commit user bug text)
