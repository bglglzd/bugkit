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

Since there's no DB auto-increment, generate IDs however you like:
- Sequential: read the file, take the max id, +1 (O(n) but fine for <10k reports)
- Timestamp-based: `Date.now()` — globally unique, easy
- UUID: `crypto.randomUUID()` — boring but works

Timestamps are easiest; use `Date.now()` as the id.

---

## Create a report (Node)

```ts
import { appendFile, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const FILE = './.bugreports.jsonl'

export async function createBugReport(input: BugReportInput) {
  const report = {
    bugkit_spec: '1',
    id: Date.now(),
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
  const byId = new Map<number, any>()
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

```bash
# List open reports
node scripts/bugkit.js list --status=open

# Show one report
node scripts/bugkit.js show 1

# Produce AI context
node scripts/bugkit.js copy 1 | pbcopy   # macOS
node scripts/bugkit.js copy 1 | clip     # Windows
node scripts/bugkit.js copy 1 | xclip    # Linux

# Close with a note
node scripts/bugkit.js close 1 "Fixed in abc1234. Verify by tapping bookmark on mobile."
```

The `copy` command prints the exact `SPEC.md §3` format to stdout. User pipes to clipboard.

---

## Minimal CLI implementation

```ts
#!/usr/bin/env node
import { listReports, createBugReport, updateReport, buildAIContext } from './lib.js'

const [,, cmd, ...args] = process.argv

if (cmd === 'list') {
  const status = args.find(a => a.startsWith('--status='))?.split('=')[1]
  const reports = await listReports({ status })
  for (const r of reports) {
    console.log(`#${r.id} [${r.status}] ${r.type} — ${r.title}`)
  }
}
else if (cmd === 'show') {
  const id = parseInt(args[0], 10)
  const reports = await listReports()
  const r = reports.find(x => x.id === id)
  console.log(JSON.stringify(r, null, 2))
}
else if (cmd === 'copy') {
  const id = parseInt(args[0], 10)
  const reports = await listReports()
  const r = reports.find(x => x.id === id)
  if (!r) { console.error('Not found'); process.exit(1) }
  process.stdout.write(buildAIContext(r))
}
else if (cmd === 'close') {
  const id = parseInt(args[0], 10)
  const resolution = args.slice(1).join(' ')
  await updateReport(id, { status: 'resolved', resolution, resolved_at: new Date().toISOString() })
  console.log(`#${id} resolved.`)
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

## Acceptance checklist

- [ ] `.bugreports.jsonl` file gets appended on each report
- [ ] Each line is valid JSON with `bugkit_spec: "1"` and the required fields
- [ ] `bugkit list` shows reports, `bugkit show N` shows one, `bugkit copy N` pipes SPEC.md §3 output
- [ ] `bugkit close N "<note>"` updates status to resolved with a resolution note
- [ ] `.bugreports.jsonl` is gitignored (you probably don't want to commit user bug text)
