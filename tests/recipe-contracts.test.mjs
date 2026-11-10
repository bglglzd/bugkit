// Execute the documented snippets with synthetic browser/SDK boundaries.
// Never contact a provider or send an actual report from these tests.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {EventEmitter} from 'node:events'
import test from 'node:test'

import {snippet, load, report} from './helpers.mjs'

test('install instructions name the registered marketplace and advertised voice command exists', async () => {
  const marketplace = JSON.parse(await readFile(new URL('../.claude-plugin/marketplace.json', import.meta.url)))
  for (const file of ['README.md', 'INSTALL.md', 'docs/index.html']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.ok(text.includes(`bugkit@${marketplace.name}`), file)
    assert.ok(!text.includes('bugkit@bglglzd-bugkit'), file)
  }
  assert.match(await readFile(new URL('../commands/voice.md', import.meta.url), 'utf8'), /adding-voice/)
})

test('canonical context preserves every populated SPEC section in order and sink-specific update hints', async () => {
  const {buildAIContext} = load(await snippet('recipes/web-app-full.md', '## The "Copy Context for AI" function'), ['buildAIContext'])
  const context = buildAIContext(report, 'node scripts/bugkit.js close synthetic-report "<note>"')
  const headings = ['Description', 'Environment', 'Page', 'Selected Element', 'Error', 'Recent Console', 'Attachments', 'Instructions']
  assert.deepEqual([...context.matchAll(/^## (.*)$/gm)].map(match => match[1]), headings)
  for (const value of ['App: 1 (commit abc123)', 'Platform: web', 'OS: Synthetic OS', 'Route: problem', 'Viewport: 1200x800', 'User Agent: Synthetic UA', 'Position: x=1 y=2 w=3 h=4', 'Message: Synthetic error', 'Stack:\nSynthetic stack', 'Synthetic console\nSecond line', '- screenshot: https://example.invalid/synthetic.png']) assert.ok(context.includes(value), value)
  assert.ok(context.includes('Update the report via: node scripts/bugkit.js close synthetic-report'))
  assert.ok(!context.includes('PATCH /api/bug-reports/'))
  const minimal = buildAIContext({id: 1, type: 'feature', status: 'open', created_at: 'synthetic', description: 'Synthetic feature', reporter: {name: 'fixture'}})
  assert.deepEqual([...minimal.matchAll(/^## (.*)$/gm)].map(match => match[1]), ['Description', 'Instructions'])
  assert.match(minimal, /Implement this feature/)
})

test('CLI context reuses the canonical formatter instead of a second section layout', async () => {
  const {buildAIContext} = load(await snippet('recipes/web-app-full.md', '## The "Copy Context for AI" function'), ['buildAIContext'])
  const {buildCLIContext} = load(await snippet('recipes/cli-tool.md', '## AI context format for CLI'), ['buildCLIContext'], {buildAIContext})
  const input = {...report, environment: {...report.environment, platform: 'cli'}, logs: {console: ['Command: synthetic-tool check', 'CWD: /synthetic/project']}}
  const hint = 'synthetic-tool bug close synthetic-report "<note>"'
  assert.equal(buildCLIContext(input, hint), buildAIContext(input, hint))
  assert.match(buildCLIContext(input, hint), /by @fixture/)
})

test('active landing copy and metadata make no minute or same-day fix promise', async () => {
  const landing = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8')
  assert.doesNotMatch(landing, /Fix ships in minutes|Fix ships the same day|Reporter notified at each state change/)
  assert.match(landing, /bugkit@bugkit/)
})

for (const [file, heading] of [
  ['recipes/web-app-full.md', '### Web Speech path (default)'],
  ['skills/adding-voice/SKILL.md', '### Mode 1: Web Speech API (default)'],
]) {
  test(`${file}: voice retains finalized segments, interim updates and restarted sessions`, async () => {
    let recognition
    class SpeechRecognition { constructor() { recognition = this } start() {} stop() {} }
    const clicks = new Map(), inputEvents = []
    const textarea = {value: 'Typed', addEventListener() {}, dispatchEvent: event => inputEvents.push(event.type)}
    const button = {style: {}, classList: {add() {}, remove() {}}, addEventListener: (name, fn) => clicks.set(name, fn)}
    const {attachVoice} = load(await snippet(file, heading), ['attachVoice'], {window: {SpeechRecognition}, navigator: {language: 'en-US'}, Event})
    attachVoice(textarea, button); clicks.get('click')()
    const result = (text, final = true) => Object.assign([{transcript: text}], {isFinal: final})
    recognition.onresult({resultIndex: 0, results: [result('First')]})
    recognition.onresult({resultIndex: 1, results: [result('First'), result('Second', false)]})
    recognition.onresult({resultIndex: 1, results: [result('First'), result('Second')]})
    assert.equal(textarea.value, 'Typed First Second')
    recognition.onend()
    recognition.onresult({resultIndex: 0, results: [result('Third')]})
    assert.equal(textarea.value, 'Typed First Second Third')
    assert.ok(inputEvents.every(type => type === 'input') && inputEvents.length === 4)
  })
}

test('fixed picker outline and element coordinates share viewport space after scrolling', async () => {
  const element = {closest: () => false, getBoundingClientRect: () => ({top: 30, left: 20, x: 20, y: 30, width: 50, height: 10}), tagName: 'BUTTON', id: 'fixture', getAttribute: () => '', innerText: 'Synthetic', outerHTML: '<button>Synthetic</button>'}
  const {onMove, outline, extractContext} = load(await snippet('recipes/web-app-full.md', '## Element picker'), ['onMove', 'outline', 'extractContext'], {
    ref: value => ({value}), document: {elementFromPoint: () => element}, scrollY: 500, scrollX: 300,
    buildSelector: () => '#fixture', buildXPath: () => '/button',
  })
  onMove({clientX: 20, clientY: 30})
  assert.equal(outline.value.top, '30px'); assert.equal(outline.value.left, '20px')
  assert.deepEqual(extractContext(element).rect, {x: 20, y: 30, w: 50, h: 10})
  const svg = {...element, tagName: 'svg', className: {baseVal: 'synthetic-icon'}, getAttribute: () => ' synthetic-icon '}
  assert.equal(extractContext(svg).classes, 'synthetic-icon')
})

test('GitHub CLI uses direct argv/body-file stdin, preserves literal title and propagates failure', async () => {
  let code = 0, captured, body
  const spawn = (command, args, options) => {
    captured = {command, args, options}
    const child = new EventEmitter(); child.stdin = new EventEmitter()
    child.stdin.end = value => { body = value; queueMicrotask(() => child.emit('close', code)) }
    return child
  }
  const {buildAIContext} = load(await snippet('recipes/web-app-full.md', '## The "Copy Context for AI" function'), ['buildAIContext'])
  const {createGhIssue} = load(await snippet('recipes/cli-tool.md', '## Publishing via GitHub Issues instead'), ['createGhIssue'], {spawn, buildAIContext})
  const title = 'Synthetic $(literal) `title` "quoted"'
  const hint = 'gh issue close "<created-issue-URL>" --comment "<short note>"'
  await assert.rejects(createGhIssue(report), /update hint is required/)
  assert.equal(captured, undefined)
  await createGhIssue({...report, title}, hint)
  assert.equal(captured.command, 'gh'); assert.equal(captured.options.shell, false)
  assert.equal(captured.args[captured.args.indexOf('--title') + 1], title)
  assert.equal(captured.args[captured.args.indexOf('--body-file') + 1], '-')
  assert.equal(body, buildAIContext({...report, title}, hint))
  assert.ok(!body.includes('PATCH /api/bug-reports/'))
  await createGhIssue({...report, type: 'feature'}, hint)
  assert.equal(captured.args[captured.args.indexOf('--label') + 1], 'bugkit,feature')
  code = 1; await assert.rejects(createGhIssue(report, hint), /failed/)
})
