import assert from 'node:assert/strict'
import {createHash, webcrypto} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8')
const draftKey = (tabId, url) => `${tabId}:${createHash('sha256').update(new URL(url).href).digest('hex')}`

function fixture() {
  const handlers = {}
  const calls = {messages: [], injections: [], created: [], captures: []}
  const session = {}
  const tab = {id: 7, windowId: 1, active: true, url: 'https://example.test/report?token=secret#private'}
  const state = {ready: false, activeId: 7, captureHook: null, injectionError: false}
  const event = name => ({addListener: callback => { handlers[name] = callback }})
  const chrome = {
    runtime: {id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, onMessage: event('message')},
    action: {onClicked: event('click')},
    commands: {onCommand: event('command'), getAll: async () => [{name: 'toggle-panel', shortcut: 'Ctrl+Shift+Y'}]},
    scripting: {executeScript: async details => {
      if (state.injectionError) throw Error('Cannot access https://private.test/?secret=value')
      calls.injections.push(details)
      state.ready = true
    }},
    storage: {session: {
      get: async key => ({[key]: session[key] ? structuredClone(session[key]) : undefined}),
      set: async values => { Object.assign(session, structuredClone(values)) },
    }},
    tabs: {
      onRemoved: event('removed'),
      get: async () => ({...tab}),
      query: async () => [{...tab, id: state.activeId}],
      create: async details => { calls.created.push(details) },
      sendMessage: async (tabId, message, options) => {
        calls.messages.push({tabId, message, options})
        if (message.type === 'mark:ping' && !state.ready) throw Error('No receiver')
        return {ok: true}
      },
      captureVisibleTab: async (windowId, options) => {
        calls.captures.push({windowId, options})
        state.captureHook?.()
        return 'data:image/png;base64,fixture'
      },
    },
  }
  vm.runInNewContext(source, {chrome, URL, TextEncoder, crypto: webcrypto})
  const sender = () => ({id: chrome.runtime.id, frameId: 0, tab: {...tab}, url: tab.url})
  function message(request, from = sender()) {
    return new Promise((resolve, reject) => {
      const handled = handlers.message(request, from, resolve)
      if (!handled) reject(Error('Message not handled'))
    })
  }
  const settle = () => new Promise(resolve => setImmediate(resolve))
  return {handlers, calls, session, state, tab, sender, message, settle}
}

test('manifest requests on-demand access and declares Windows/macOS shortcuts', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.content_scripts, undefined)
  assert.equal(manifest.host_permissions, undefined)
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'clipboardWrite'])
  assert.equal(manifest.commands['toggle-panel'].suggested_key.default, 'Ctrl+Shift+Y')
  assert.equal(manifest.commands['toggle-panel'].suggested_key.mac, 'Command+Shift+Y')
  assert.equal(manifest.action.default_popup, undefined)
})

test('background stays idle until invocation, injects once and preserves repeated toggles', async () => {
  const f = fixture()
  assert.equal(f.calls.messages.length, 0)
  assert.equal(f.calls.injections.length, 0)
  f.handlers.click(f.tab)
  f.handlers.click(f.tab)
  await f.settle()
  assert.equal(f.calls.injections.length, 1)
  assert.deepEqual(Array.from(f.calls.injections[0].files), ['core.js', 'content.js'])
  assert.equal(f.calls.messages.filter(call => call.message.type === 'mark:toggle').length, 2)
  assert.equal(f.calls.messages.at(-1).message.shortcut, 'Ctrl+Shift+Y')
  assert.equal(f.calls.messages.at(-1).options.frameId, 0)
})

test('keyboard command finds active tab when Chrome does not supply it', async () => {
  const f = fixture()
  f.handlers.command('another-command')
  await f.settle()
  assert.equal(f.calls.messages.length, 0)
  f.handlers.command('toggle-panel')
  await f.settle()
  assert.equal(f.calls.injections.length, 1)
  assert.equal(f.calls.messages.at(-1).tabId, 7)
})

test('restricted page opens local help without injection or disclosing its URL', async () => {
  const f = fixture()
  f.handlers.click({...f.tab, url: 'chrome://settings/private-secret'})
  await f.settle()
  assert.equal(f.calls.injections.length, 0)
  assert.equal(f.calls.created.length, 1)
  assert.equal(f.calls.created[0].url, 'chrome-extension://test-extension/help.html?reason=restricted')
})

test('failed injection opens actionable local help without leaking browser error URL', async () => {
  const f = fixture()
  f.state.injectionError = true
  f.handlers.click(f.tab)
  await f.settle()
  assert.equal(f.calls.created[0].url, 'chrome-extension://test-extension/help.html?reason=unavailable')
  assert.equal(f.calls.messages.filter(call => call.message.type === 'mark:toggle').length, 0)
})

test('capture succeeds only for active sender page and checks again after capture', async () => {
  const f = fixture()
  const result = await f.message({type: 'mark:capture'})
  assert.equal(result.ok, true)
  assert.equal(result.dataUrl, 'data:image/png;base64,fixture')
  assert.equal(f.calls.captures[0].windowId, 1)
  assert.equal(f.calls.captures[0].options.format, 'png')

  f.state.activeId = 8
  const inactive = await f.message({type: 'mark:capture'})
  assert.equal(inactive.ok, false)
  assert.equal(f.calls.captures.length, 1)

  f.state.activeId = 7
  f.state.captureHook = () => { f.state.activeId = 8 }
  const switched = await f.message({type: 'mark:capture'})
  assert.equal(switched.ok, false)
  assert.equal(switched.dataUrl, undefined)
})

test('capture discards screenshot if sender navigates or moves windows', async () => {
  const navigation = fixture()
  navigation.state.captureHook = () => { navigation.tab.url = 'https://example.test/another' }
  assert.equal((await navigation.message({type: 'mark:capture'})).ok, false)
  const moved = fixture()
  moved.state.captureHook = () => { moved.tab.windowId = 2 }
  assert.equal((await moved.message({type: 'mark:capture'})).ok, false)
})

test('messages reject iframe, external and extension-page senders', async () => {
  const f = fixture()
  for (const override of [
    {frameId: 2}, {id: 'external'}, {url: 'chrome-extension://test-extension/help.html'}, {tab: undefined},
  ]) {
    assert.equal((await f.message({type: 'mark:capture'}, {...f.sender(), ...override})).ok, false)
    assert.equal((await f.message({type: 'mark:save-draft', draft: {title: 'private'}}, {...f.sender(), ...override})).ok, false)
  }
  assert.equal(f.calls.captures.length, 0)
  assert.equal(f.session['mark:drafts'], undefined)
})

test('drafts live in session storage, omit URL query/hash, and isolate tabs/routes', async () => {
  const f = fixture()
  assert.equal((await f.message({type: 'mark:load-draft'})).draft, null)
  assert.equal((await f.message({type: 'mark:save-draft', draft: {description: 'Broken button'}})).ok, true)
  assert.deepEqual(Object.keys(f.session['mark:drafts']), [draftKey(7, f.tab.url)])
  assert.doesNotMatch(JSON.stringify(f.session), /example\.test|token|secret|private/)
  assert.equal((await f.message({type: 'mark:load-draft'})).draft.description, 'Broken button')
  assert.equal((await f.message({type: 'mark:load-draft'}, {...f.sender(), tab: {...f.tab, id: 8}})).draft, null)
  assert.equal((await f.message({type: 'mark:load-draft'}, {...f.sender(), url: 'https://example.test/other'})).draft, null)
  await f.message({type: 'mark:clear-draft'})
  assert.equal((await f.message({type: 'mark:load-draft'})).draft, null)
})

test('concurrent saves are retained and closing a tab clears only its drafts', async () => {
  const f = fixture()
  const otherSender = {...f.sender(), tab: {...f.tab, id: 8}}
  await Promise.all([
    f.message({type: 'mark:save-draft', draft: {description: 'first'}}),
    f.message({type: 'mark:save-draft', draft: {description: 'second'}}, otherSender),
  ])
  assert.equal(Object.keys(f.session['mark:drafts']).length, 2)
  f.handlers.removed(7)
  await f.settle()
  assert.equal((await f.message({type: 'mark:load-draft'})).draft, null)
  assert.equal((await f.message({type: 'mark:load-draft'}, otherSender)).draft.description, 'second')
})

test('oversized and invalid drafts fail without destroying a previous draft', async () => {
  const f = fixture()
  await f.message({type: 'mark:save-draft', draft: {description: 'keep'}})
  for (const draft of [null, [], 'bad', {description: 'x'.repeat(128 * 1024)}]) {
    assert.equal((await f.message({type: 'mark:save-draft', draft})).ok, false)
  }
  assert.equal((await f.message({type: 'mark:load-draft'})).draft.description, 'keep')
})

test('session cache is capped at twenty drafts', async () => {
  const f = fixture()
  for (let id = 0; id < 25; id++) {
    await f.message({type: 'mark:save-draft', draft: {description: `draft ${id}`}}, {...f.sender(), tab: {...f.tab, id}})
  }
  assert.equal(Object.keys(f.session['mark:drafts']).length, 20)
  assert.equal(f.session['mark:drafts'][draftKey(0, f.tab.url)], undefined)
  assert.equal(f.session['mark:drafts'][draftKey(24, f.tab.url)].draft.description, 'draft 24')
})

test('query and hash routes have separate drafts without storing raw addresses', async () => {
  const f = fixture()
  const urls = [
    'https://example.test/report?token=first-secret#/settings',
    'https://example.test/report?token=first-secret#/billing',
    'https://user:password@example.test/report?token=second-secret#/settings',
  ]
  for (const [index, pageUrl] of urls.entries()) {
    assert.equal((await f.message({type: 'mark:save-draft', pageUrl, draft: {description: `Report ${index}`, pageUrl}})).ok, true)
  }
  for (const [index, pageUrl] of urls.entries()) {
    const result = await f.message({type: 'mark:load-draft', pageUrl})
    assert.equal(result.draft.description, `Report ${index}`)
    assert.equal(result.draft.pageUrl, undefined)
  }
  assert.equal(Object.keys(f.session['mark:drafts']).length, 3)
  assert.doesNotMatch(JSON.stringify(f.session), /example\.test|token|secret|password|settings|billing/)
})

test('delayed SPA autosave writes the original route without overwriting current draft', async () => {
  const f = fixture()
  const previous = 'https://example.test/a'
  f.tab.url = 'https://example.test/b'
  await f.message({type: 'mark:save-draft', pageUrl: f.tab.url, draft: {description: 'Route B'}})
  await f.message({type: 'mark:save-draft', pageUrl: previous, draft: {description: 'Route A'}})
  assert.equal((await f.message({type: 'mark:load-draft'})).draft.description, 'Route B')
  assert.equal((await f.message({type: 'mark:load-draft', pageUrl: previous})).draft.description, 'Route A')
  await f.message({type: 'mark:clear-draft', pageUrl: previous})
  assert.equal((await f.message({type: 'mark:load-draft', pageUrl: previous})).draft, null)
  assert.equal((await f.message({type: 'mark:load-draft'})).draft.description, 'Route B')
})

test('foreign, protocol-changing and malformed draft identities are rejected', async () => {
  const f = fixture()
  for (const pageUrl of ['https://foreign.test/a', 'http://example.test/a', 'file:///private.html', '/relative', 1, null]) {
    const result = await f.message({type: 'mark:save-draft', pageUrl, draft: {description: 'Rejected'}})
    assert.equal(result.ok, false)
  }
  assert.equal(f.session['mark:drafts'], undefined)
})

test('screenshot request must match the exact current query and hash route', async () => {
  const f = fixture()
  assert.equal((await f.message({type: 'mark:capture', pageUrl: f.tab.url})).ok, true)
  assert.equal((await f.message({type: 'mark:capture', pageUrl: 'https://example.test/report?token=other#private'})).ok, false)
  assert.equal((await f.message({type: 'mark:capture', pageUrl: 'https://example.test/report?token=secret#other'})).ok, false)
  assert.equal(f.calls.captures.length, 1)
})
