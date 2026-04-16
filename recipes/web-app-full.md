# Recipe: Full web-app (modal + DB + admin)

Use this recipe when the project is a full-stack web app with a backend and database. Produces the most complete experience: element picker, admin UI, notifications, status tracking.

This is the reference implementation — the shape proven in production at [gta6.forum](https://gta6.forum).

---

## What you'll build

1. `bug_reports` table in the DB
2. REST API: `POST /api/bug-reports`, `GET /api/bug-reports/mine`, `GET /api/bug-reports/:id`, `PATCH /api/bug-reports/:id`, `GET /api/admin/bug-reports`
3. `<BugReportModal>` component — modal with type toggle, description, element picker
4. Bug icon in the navbar (authenticated users only)
5. `/my-reports` (user's list + detail) pages
6. `/admin/bug-reports` (list + detail with Copy Context button) pages
7. Notification to reporter on status change

---

## Data model (DDL)

Adapt to your DB flavor. Example (Postgres):

```sql
CREATE TYPE bug_report_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'wontfix');
CREATE TYPE bug_report_type AS ENUM ('bug', 'feature');

CREATE TABLE bug_reports (
  id SERIAL PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type bug_report_type NOT NULL DEFAULT 'bug',
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  element_context JSONB,          -- the full element picker output
  user_agent TEXT,
  viewport VARCHAR(20),
  status bug_report_status NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  commit_sha VARCHAR(40),
  how_to_verify TEXT,
  bugkit_spec VARCHAR(10) NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON bug_reports (reporter_id);
CREATE INDEX ON bug_reports (status);
```

For SQLite: use `TEXT` instead of enums and `INTEGER` timestamps.

For MongoDB / Firestore: a single `bug_reports` collection with the same field names.

---

## Element picker — the key UX

Client-side only. No external dependencies needed. Core logic:

```ts
const picking = ref(false)
const outline = ref<{top, left, width, height, display}>({display: 'none'})

function startPicking() {
  picking.value = true                   // hide modal
  document.body.style.cursor = 'crosshair'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onEsc, true)
}

function onMove(e: MouseEvent) {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (!el || el.closest('#bugkit-picker-ui')) return
  const rect = el.getBoundingClientRect()
  outline.value = {
    display: 'block',
    top: rect.top + scrollY + 'px',
    left: rect.left + scrollX + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
  }
}

function onClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const el = document.elementFromPoint(e.clientX, e.clientY) as Element
  capturedElement.value = extractContext(el)
  stopPicking()     // reopen modal
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') { stopPicking() }
}

function extractContext(el: Element) {
  const rect = el.getBoundingClientRect()
  return {
    selector: buildSelector(el),       // tag#id.class1.class2, max 4 classes
    xpath: buildXPath(el),
    tag: el.tagName,
    id: el.id,
    classes: (el.className || '').trim(),
    text: (el as HTMLElement).innerText?.slice(0, 200) ?? '',
    html: el.outerHTML.slice(0, 1200),   // truncate
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y + scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
  }
}
```

Render the outline as a `position: fixed` div with `pointer-events: none`, a colored 2px border, and a subtle background tint. Add a pill at the bottom of the viewport saying "Click any element · Press Esc to cancel".

---

## Modal contents

- Type toggle: Bug / Feature Request (two buttons, visually distinct — bug red-ish, feature pink-ish)
- Description textarea (5-5000 chars)
- Element picker button: "Choose element on page" (switches to picker mode)
- When element selected: show its selector + first 200 chars of text + tag/size, with an X to clear
- Small note: "Page URL, viewport, and user-agent captured automatically"
- Buttons: Cancel, Submit

Use the project's existing button/input classes so it looks native.

---

## APIs

### POST /api/bug-reports (authenticated)

```ts
// body: { type, description, pageUrl, elementContext, userAgent, viewport }
// Auto-set: reporter_id from session, title = first line of description truncated to 100 chars
// Response: { data: { id, ... } }
```

### GET /api/bug-reports/mine (authenticated)

Returns the authenticated user's own reports, newest first.

### GET /api/bug-reports/:id (authenticated)

Returns a single report. Allowed only if the caller is the reporter OR has admin/moderator role.

### PATCH /api/bug-reports/:id (admin/moderator only)

```ts
// body: { status?, resolution?, commit_sha?, how_to_verify? }
// Auto-set: resolved_at when status moves to terminal and wasn't set before
// Side effect: create a notification for the reporter
```

### GET /api/admin/bug-reports (admin/moderator only)

Query: `?status=open&type=bug&page=1`. Returns list + status counts for filter badges.

---

## Pages

### `/my-reports` (user-facing)

List of the user's own reports. Each row shows: `#id`, type chip, status chip, title, submitted date. Link to detail.

### `/my-reports/[id]`

Full report detail + resolution note (if status is terminal) + a link back to the list. No edit controls for the user.

### `/admin/bug-reports`

- Status tabs (Open with count, In Progress, Resolved, Closed, Won't Fix, All)
- Type filter (Bug / Feature / All)
- List with pagination, newest first
- Each row links to detail

### `/admin/bug-reports/[id]`

- All captured context (description, URL, element selector + XPath + HTML preview, user agent, viewport)
- **Prominent "Copy Context for AI" button** near the top
- Status dropdown + resolution textarea + Save button

---

## The "Copy Context for AI" function

This is the heart of bugkit. The output MUST match `SPEC.md §3` exactly. Rough TypeScript:

```ts
function buildAIContext(r: BugReport): string {
  const lines: string[] = []
  lines.push(`=== BUG REPORT #${r.id} ===`)
  lines.push(`Type: ${r.type}`)
  lines.push(`Status: ${r.status}`)
  lines.push(`Reported: ${r.created_at} by @${r.reporter?.name || 'unknown'}`)
  lines.push('')
  lines.push('## Description')
  lines.push(r.description)
  lines.push('')
  if (r.page_url || r.viewport || r.user_agent) {
    lines.push('## Page')
    if (r.page_url) lines.push(`URL: ${r.page_url}`)
    if (r.viewport) lines.push(`Viewport: ${r.viewport}`)
    if (r.user_agent) lines.push(`User Agent: ${r.user_agent}`)
    lines.push('')
  }
  if (r.element_context) {
    const e = r.element_context
    lines.push('## Selected Element')
    if (e.selector) lines.push(`Selector: ${e.selector}`)
    if (e.xpath) lines.push(`XPath: ${e.xpath}`)
    if (e.tag) lines.push(`Tag: ${e.tag}`)
    if (e.id) lines.push(`ID: ${e.id}`)
    if (e.classes) lines.push(`Classes: ${e.classes}`)
    if (e.text) lines.push(`Visible text: ${e.text}`)
    if (e.rect) lines.push(`Position: x=${e.rect.x} y=${e.rect.y} w=${e.rect.w} h=${e.rect.h}`)
    if (e.html) { lines.push('HTML:'); lines.push(e.html) }
    lines.push('')
  }
  lines.push('## Instructions')
  lines.push(`${r.type === 'bug' ? 'Fix this bug' : 'Implement this feature'}. When done:`)
  lines.push('1. Summarize root cause and files changed.')
  lines.push('2. Provide a short "how to verify" note.')
  lines.push(`3. Update the report via: PATCH /api/bug-reports/${r.id}`)
  lines.push(`   With: { status: 'resolved', resolution: '<short note>', commit_sha: '<sha>' }`)
  lines.push(`   (Or status 'wontfix' / 'closed' with a reason.)`)
  return lines.join('\n')
}

async function copyContext(r: BugReport) {
  await navigator.clipboard.writeText(buildAIContext(r))
  showToast('Context copied — paste into Claude Code')
}
```

Wire that to the button. Done.

---

## Notifications

On status change (in the PATCH handler, after the update):

```ts
if (newStatus !== oldStatus && reporter_id !== current_user.id) {
  await createNotification({
    userId: reporter_id,
    type: 'system',
    title: `Bug report #${id} ${statusLabel[newStatus]}`,
    body: report.title,
    link: `/my-reports/${id}`,
  })
}
```

Reuse the project's existing notification plumbing if there is one.

---

## Acceptance checklist

- [ ] Bug icon visible in navbar, authenticated only
- [ ] Clicking opens modal; type toggle works; description validates (≥5 chars)
- [ ] "Choose element on page" hides modal, picker captures any element with outline preview, Esc cancels
- [ ] Submitting creates a DB row; toast confirms
- [ ] Reporter sees their report in `/my-reports`
- [ ] Admin sees it in `/admin/bug-reports` under "Open"
- [ ] Detail page renders all captured context + HTML preview
- [ ] "Copy Context for AI" button produces the exact SPEC.md §3 format
- [ ] Status change + resolution note saves; reporter gets a notification
