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
    top: rect.top + 'px',
    left: rect.left + 'px',
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
    classes: (el.getAttribute('class') || '').trim(),
    text: (el as HTMLElement).innerText?.slice(0, 200) ?? '',
    html: el.outerHTML.slice(0, 1200),   // truncate
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
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
function buildAIContext(r: BugReport, updateHint = `PATCH /api/bug-reports/${encodeURIComponent(String(r.id))}`): string {
  const lines: string[] = []
  lines.push(`=== BUG REPORT #${r.id} ===`)
  lines.push(`Type: ${r.type}`)
  lines.push(`Status: ${r.status}`)
  lines.push(`Reported: ${r.created_at} by @${r.reporter?.name || 'unknown'}`)
  lines.push('')
  lines.push('## Description')
  lines.push(r.description)
  lines.push('')
  const environment = r.environment || {}
  if (environment.app_version || environment.commit || environment.platform || environment.os) {
    lines.push('## Environment')
    if (environment.app_version || environment.commit) lines.push(`App: ${environment.app_version || ''} (commit ${environment.commit || ''})`)
    if (environment.platform) lines.push(`Platform: ${environment.platform}`)
    if (environment.os) lines.push(`OS: ${environment.os}`)
    lines.push('')
  }
  // Canonical SPEC v1 fields; the fallback reads older flattened app records.
  const page = r.page || { url: r.page_url }
  const client = r.client || { viewport: r.viewport, user_agent: r.user_agent }
  if (page.url || page.route || client.viewport || client.user_agent) {
    lines.push('## Page')
    if (page.url) lines.push(`URL: ${page.url}`)
    if (page.route) lines.push(`Route: ${page.route}`)
    if (client.viewport) lines.push(`Viewport: ${client.viewport}`)
    if (client.user_agent) lines.push(`User Agent: ${client.user_agent}`)
    lines.push('')
  }
  const e = r.element || r.element_context
  if (e && Object.values(e).some(value => value !== undefined && value !== null && value !== '')) {
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
  if (r.error?.message || r.error?.stack) {
    lines.push('## Error')
    if (r.error.message) lines.push(`Message: ${r.error.message}`)
    if (r.error.stack) lines.push('Stack:', r.error.stack)
    lines.push('')
  }
  if (r.logs?.console?.length) {
    lines.push('## Recent Console', r.logs.console.join('\n'), '')
  }
  if (r.attachments?.length) {
    lines.push('## Attachments', ...r.attachments.map(a => `- ${a.type}: ${a.url}`), '')
  }
  lines.push('## Instructions')
  lines.push(`${r.type === 'bug' ? 'Fix this bug' : 'Implement this feature'}. When done:`)
  lines.push('1. Summarize root cause and files changed.')
  lines.push('2. Provide a short "how to verify" note.')
  lines.push(`3. Update the report via: ${updateHint}`)
  lines.push('   With: { status: "resolved", resolution: "<short note>", commit_sha: "<sha>" }')
  lines.push('   (Or status "wontfix" / "closed" with a reason.)')
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

## Voice transcription (optional)

Lets reporters speak their bug description instead of typing. Default is the browser's **Web Speech API** — free, no keys, zero server code. Optional upgrade is **local Whisper** (whisper.cpp) for offline / Firefox / privacy — no paid APIs.

### Mic button in the modal

Next to the description textarea, add:

```html
<button type="button" class="bugkit-mic-btn" aria-label="Record description">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
</button>
```

Styles:

```css
.bugkit-mic-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border, #ccc); background: transparent; cursor: pointer;
}
.bugkit-mic-btn.recording {
  border-color: #e53935; color: #e53935;
  animation: bugkit-mic-pulse 1.2s infinite;
}
@keyframes bugkit-mic-pulse {
  0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6); }
  70% { box-shadow: 0 0 0 10px rgba(229, 57, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
}
```

### Web Speech path (default)

```ts
function attachVoice(textarea: HTMLTextAreaElement, micBtn: HTMLButtonElement) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { micBtn.style.display = 'none'; return }  // hide gracefully

  const rec = new SR()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = navigator.language || 'en-US'

  let recording = false
  let base = ''

  rec.onresult = (e: any) => {
    const speech = Array.from(e.results, (result: any) => result[0].transcript.trim()).filter(Boolean).join(' ')
    textarea.value = (base + speech).trimStart()
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
  rec.onerror = () => { stop() }
  rec.onend = () => {
    if (recording) {
      base = textarea.value ? textarea.value + ' ' : ''
      try { rec.start() } catch { stop() }
    }
  }

  function start() {
    base = textarea.value ? textarea.value + ' ' : ''
    recording = true
    micBtn.classList.add('recording')
    rec.start()
  }
  function stop() {
    recording = false
    micBtn.classList.remove('recording')
    try { rec.stop() } catch {}
  }

  micBtn.addEventListener('click', () => { recording ? stop() : start() })
  textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape' && recording) stop() })
}
```

Wire it on modal mount. That's the whole thing for the default path.

### Local Whisper upgrade (optional)

For browsers with MediaRecorder (including Firefox), add a
`/api/bugkit/transcribe` endpoint that proxies to whisper.cpp. Transcription runs
offline after model download, on the machine hosting that server:

```ts
// Next.js App Router — adapt to your framework
// For Express: app.post('/api/bugkit/transcribe', ...)
// For FastAPI: @app.post('/api/bugkit/transcribe')
export async function POST(req: Request) {
  const url = process.env.BUGKIT_TRANSCRIBE_URL || 'http://localhost:9000/inference'
  const formData = await req.formData()
  const audio = formData.get('file') as Blob
  if (!(audio instanceof Blob) || audio.size === 0) return new Response('no audio', { status: 400 })
  const up = new FormData()
  up.append('file', audio, 'audio.webm')
  up.append('response_format', 'text')
  const r = await fetch(url, { method: 'POST', body: up })
  if (!r.ok) return new Response('transcription failed', { status: 502 })
  return new Response(await r.text(), { headers: { 'content-type': 'text/plain' } })
}
```

Frontend auto-detects the endpoint once per session (cached in `sessionStorage`) and uses MediaRecorder instead of Web Speech when available:

```ts
async function detectTranscribeEndpoint(): Promise<boolean> {
  const cached = sessionStorage.getItem('bugkit_transcribe_available')
  if (cached !== null) return cached === '1'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 500)
    const r = await fetch('/api/bugkit/transcribe', { method: 'OPTIONS', signal: ctrl.signal })
    clearTimeout(t)
    const ok = r.ok || r.status === 405
    sessionStorage.setItem('bugkit_transcribe_available', ok ? '1' : '0')
    return ok
  } catch {
    sessionStorage.setItem('bugkit_transcribe_available', '0')
    return false
  }
}
```

When `detectTranscribeEndpoint()` returns true, record with MediaRecorder and POST the blob to `/api/bugkit/transcribe`. Otherwise use the Web Speech path above.

**Run whisper.cpp locally (one-time setup):**

```bash
# Prerequisites: Git, CMake, a C++ compiler, curl and FFmpeg on PATH.
# POSIX shell; pin the source snapshot used by this recipe.
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
git checkout d2c6f05a46dacf663e357bcf0ed40f542a72825d
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release --target whisper-server -j 2
./models/download-ggml-model.sh base.en
./build/bin/whisper-server -m models/ggml-base.en.bin --host 127.0.0.1 --port 9000 --convert
```

The base.en model is about 150 MB. `--convert` requires FFmpeg for browser formats
such as WebM/Opus or MP4/AAC. Run the loopback-only example server as an ordinary
user in an isolated development environment. Set `BUGKIT_TRANSCRIBE_URL` to the
actual server URL if needed. See the [voice recipe](../skills/adding-voice/SKILL.md)
and [upstream server documentation](https://github.com/ggml-org/whisper.cpp/blob/d2c6f05a46dacf663e357bcf0ed40f542a72825d/examples/server/README.md).
The automated proxy checks use synthetic HTTP responses, not a Whisper model.

### Privacy line under the textarea

While recording, show a small italic note:
- Web Speech path: *"Listening via Web Speech API (Chrome may send audio to Google servers)"*
- Whisper path: *"Transcribing on the configured Whisper server"* (identify its
  host; audio leaves the browser for that server).

### Paid-API footnote

For OpenAI Whisper / Groq / Deepgram: point `BUGKIT_TRANSCRIBE_URL` at the provider and add `Authorization: Bearer ...` in the proxy route. This is a footnote, not the default — never recommend a paid API unprompted.

### No SPEC change

Voice is a UX layer. Description is populated from transcription; the portable format is unchanged. Audio blobs are not persisted in v1 — only the transcribed text.

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
