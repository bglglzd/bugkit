---
name: adding-voice
description: Add optional voice transcription to an existing bugkit install — mic button next to the description field, Web Speech API by default, local Whisper as an opt-in upgrade. No paid APIs as the default path.
---

# Adding voice transcription to a bugkit install

You're adding voice transcription to an existing bugkit install. The user clicks a 🎤 mic button next to the description textarea, speaks, and the transcript appears in the field. They can edit before submitting.

## When this skill applies

- The project already has a bugkit web-facing modal (from `web-app-full.md` or `github-issues.md`).
- Voice is always **optional**. Typing still works.
- Mic button is hidden gracefully if the browser doesn't support it AND no local Whisper endpoint is configured.

If the project has no web-facing form (CLI, bot, JSONL, email), politely tell the user voice isn't applicable for this sink and stop.

## Decide the transcription path

Two modes. Default is **web-speech**. Only use **local-whisper** if the user explicitly asks for offline / Firefox support / privacy.

### Mode 1: Web Speech API (default)

Zero deps, zero keys, zero server-side code. Wire this into the modal's description field:

```ts
function attachVoice(textarea: HTMLTextAreaElement, micButton: HTMLButtonElement) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) {
    micButton.style.display = 'none'  // graceful: hide if unsupported
    return
  }

  const recognition = new SR()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = navigator.language || 'en-US'

  let recording = false
  let baseText = ''

  recognition.onresult = (e: any) => {
    let interim = ''
    let finalText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += t
      else interim += t
    }
    textarea.value = (baseText + finalText + interim).trimStart()
  }
  recognition.onerror = () => { stopRecording() }
  recognition.onend = () => { if (recording) recognition.start() /* keep alive */ }

  function startRecording() {
    baseText = textarea.value ? textarea.value + ' ' : ''
    recording = true
    micButton.classList.add('recording')
    recognition.start()
  }
  function stopRecording() {
    recording = false
    micButton.classList.remove('recording')
    try { recognition.stop() } catch {}
  }

  micButton.addEventListener('click', () => {
    if (recording) stopRecording()
    else startRecording()
  })
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recording) stopRecording()
  })
}
```

Under the textarea, a small grey italic label: *"Listening via Web Speech API"* (visible only while recording). Transparency about where the audio goes — Chrome uses Google's servers under the hood for Web Speech.

### Mode 2: Local Whisper (opt-in upgrade)

Adds a thin backend proxy + uses MediaRecorder on the frontend. Works in every browser including Firefox, fully offline, no keys.

**Backend proxy** — add `/api/bugkit/transcribe`:

```ts
// Adapts to the project's backend framework — this is the Next.js App Router flavor.
// For Express: app.post('/api/bugkit/transcribe', (req, res) => { ... })
// For FastAPI: @app.post('/api/bugkit/transcribe')
export async function POST(req: Request) {
  const url = process.env.BUGKIT_TRANSCRIBE_URL || 'http://localhost:9000/inference'
  const formData = await req.formData()
  const audio = formData.get('file') as Blob
  if (!audio) return new Response('no audio', { status: 400 })

  const upstream = new FormData()
  upstream.append('file', audio, 'audio.webm')
  upstream.append('response_format', 'text')

  const r = await fetch(url, { method: 'POST', body: upstream })
  if (!r.ok) return new Response('transcription failed', { status: 502 })
  const text = await r.text()
  return new Response(text, { headers: { 'content-type': 'text/plain' } })
}
```

**Frontend** — detect the endpoint once per session, cache result, route accordingly:

```ts
async function detectTranscribeEndpoint(): Promise<boolean> {
  const cached = sessionStorage.getItem('bugkit_transcribe_available')
  if (cached !== null) return cached === '1'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 500)
    const r = await fetch('/api/bugkit/transcribe', { method: 'OPTIONS', signal: ctrl.signal })
    clearTimeout(t)
    const ok = r.ok || r.status === 405  // 405 also means endpoint exists
    sessionStorage.setItem('bugkit_transcribe_available', ok ? '1' : '0')
    return ok
  } catch {
    sessionStorage.setItem('bugkit_transcribe_available', '0')
    return false
  }
}

async function recordAndTranscribe(textarea: HTMLTextAreaElement, micButton: HTMLButtonElement) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop())
    const blob = new Blob(chunks, { type: 'audio/webm' })
    const fd = new FormData()
    fd.append('file', blob, 'audio.webm')
    const r = await fetch('/api/bugkit/transcribe', { method: 'POST', body: fd })
    if (r.ok) {
      const text = (await r.text()).trim()
      textarea.value = textarea.value ? textarea.value + ' ' + text : text
    }
    micButton.classList.remove('recording')
  }
  micButton.classList.add('recording')
  recorder.start()

  // Click again to stop
  micButton.addEventListener('click', () => { if (recorder.state === 'recording') recorder.stop() }, { once: true })
}
```

Modal init: `if (await detectTranscribeEndpoint()) { /* use Whisper path */ } else { attachVoice(/* Web Speech path */) }`.

**Local Whisper setup** — print this for the user to run once, outside the project:

```bash
# One-time: install whisper.cpp and download a ~150MB model
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
./models/download-ggml-model.sh base.en

# Each dev session: run the server
./server -m models/ggml-base.en.bin --port 9000
```

Then set the env var (if different from default):
```
BUGKIT_TRANSCRIBE_URL=http://localhost:9000/inference
```

Once the server is running, bugkit's frontend will auto-detect `/api/bugkit/transcribe` and route voice through local Whisper instead of Web Speech. No user-visible change in the UI.

## Paid-API footnote

If the user explicitly wants OpenAI Whisper or Groq or Deepgram, point `BUGKIT_TRANSCRIBE_URL` at the provider's endpoint and add `Authorization: Bearer ...` in the proxy route. This is a footnote, not the default — never recommend a paid API unprompted.

## Mic button CSS (drop into the project's styles)

```css
.bugkit-mic-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border, #ccc); background: transparent; cursor: pointer;
}
.bugkit-mic-btn.recording {
  border-color: #e53935; color: #e53935;
  box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6);
  animation: bugkit-mic-pulse 1.2s infinite;
}
@keyframes bugkit-mic-pulse {
  0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6); }
  70% { box-shadow: 0 0 0 10px rgba(229, 57, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
}
```

## Privacy line under the textarea

While recording, show a small grey italic note below the textarea:
- Web Speech path: *"Listening via Web Speech API (Chrome may send audio to Google servers)"*
- Whisper path: *"Listening via local Whisper — stays on your machine"*

## Verify

1. Open the bug-report modal in the browser.
2. Click the 🎤 button. Browser asks for mic permission; grant.
3. Speak a short sentence. Confirm the transcript appears in the textarea as you speak (Web Speech) or after you click stop (Whisper).
4. Click submit. Confirm the report's `description` field matches what you said.
5. In an unsupported browser / with no Whisper endpoint: confirm the mic button is hidden and typing still works.

## Report back

Tell the user:
- Which path was wired (web-speech or local-whisper).
- Where the code lives (which file/function contains `attachVoice` or the MediaRecorder logic).
- Browser coverage: Chrome/Edge/Safari full, Firefox hidden (for web-speech) or working (for Whisper).
- How to switch paths later.
