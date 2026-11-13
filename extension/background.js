// No page script runs until the user clicks MARK or invokes its shortcut.
const DRAFTS_KEY = 'mark:drafts'
const MAX_DRAFTS = 20
const MAX_DRAFT_BYTES = 128 * 1024
const toggleQueues = new Map()
let draftQueue = Promise.resolve()

function supportedPage(url) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'file:'].includes(parsed.protocol)
      && parsed.hostname !== 'chromewebstore.google.com'
      && !(parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'))
  } catch {
    return false
  }
}

async function showHelp(reason) {
  await chrome.tabs.create({url: chrome.runtime.getURL(`help.html?reason=${encodeURIComponent(reason)}`)})
}

async function togglePanel(tab) {
  if (!tab || !Number.isInteger(tab.id) || !supportedPage(tab.url)) {
    await showHelp('restricted')
    return
  }
  let ready = false
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {type: 'mark:ping'}, {frameId: 0})
    ready = response?.ok === true
  } catch {
    // A new page has no receiver; injecting on demand is expected.
  }
  if (!ready) {
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['core.js', 'content.js']})
  }
  const commands = await chrome.commands.getAll()
  const shortcut = commands.find(command => command.name === 'toggle-panel')?.shortcut || ''
  await chrome.tabs.sendMessage(tab.id, {type: 'mark:toggle', shortcut}, {frameId: 0})
}

function requestToggle(tab) {
  const key = tab?.id ?? 'unavailable'
  const previous = toggleQueues.get(key) || Promise.resolve()
  const pending = previous.then(() => togglePanel(tab)).catch(() => showHelp('unavailable')).catch(() => {})
  toggleQueues.set(key, pending)
  pending.finally(() => {
    if (toggleQueues.get(key) === pending) toggleQueues.delete(key)
  })
  return pending
}

chrome.action.onClicked.addListener(tab => { void requestToggle(tab) })
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-panel') return
  if (tab) {
    void requestToggle(tab)
  } else {
    void chrome.tabs.query({active: true, lastFocusedWindow: true})
      .then(([current]) => requestToggle(current))
      .catch(() => showHelp('unavailable')).catch(() => {})
  }
})

function senderContext(sender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0
      || !Number.isInteger(sender.tab?.id) || !supportedPage(sender.url)) {
    throw Error('Запрос доступен только панели MARK на открытой странице.')
  }
  const page = new URL(sender.url)
  return {tabId: sender.tab.id, url: page.href}
}

function requestedPageUrl(message, context) {
  if (message.pageUrl === undefined) return context.url
  if (typeof message.pageUrl !== 'string' || !supportedPage(message.pageUrl)) {
    throw Error('Не удалось определить страницу черновика.')
  }
  const current = new URL(context.url)
  const requested = new URL(message.pageUrl)
  if (requested.protocol !== current.protocol || requested.origin !== current.origin) {
    throw Error('Черновик относится к другому сайту. Откройте нужную страницу.')
  }
  return requested.href
}

async function draftKey(tabId, pageUrl) {
  // Preserve hash/query route identity without retaining addresses or credentials.
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pageUrl))
  return `${tabId}:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

async function currentCaptureTab(context) {
  const tab = await chrome.tabs.get(context.tabId)
  const [active] = await chrome.tabs.query({active: true, windowId: tab.windowId})
  if (!tab.active || active?.id !== context.tabId || tab.url !== context.url) {
    throw Error('Страница изменилась. Вернитесь на нужную вкладку и повторите снимок.')
  }
  return tab
}

async function capturePage(context) {
  const before = await currentCaptureTab(context)
  const dataUrl = await chrome.tabs.captureVisibleTab(before.windowId, {format: 'png'})
  const after = await currentCaptureTab(context)
  if (after.windowId !== before.windowId) {
    throw Error('Вкладка перемещена. Повторите снимок в её текущем окне.')
  }
  return {ok: true, dataUrl}
}

function queueDraftOperation(operation) {
  const pending = draftQueue.then(operation)
  draftQueue = pending.catch(() => {})
  return pending
}

async function readDrafts() {
  const stored = await chrome.storage.session.get(DRAFTS_KEY)
  return stored[DRAFTS_KEY] || {}
}

function validatedDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw Error('Не удалось сохранить черновик: неверный формат.')
  }
  const serialized = JSON.stringify(draft)
  if (new TextEncoder().encode(serialized).byteLength > MAX_DRAFT_BYTES) {
    throw Error('Черновик слишком большой. Сохраните отчёт в файл; снимки не входят в черновик.')
  }
  const result = JSON.parse(serialized)
  // Navigation identity belongs only in the request envelope, never in storage.
  delete result.pageUrl
  delete result.pageIdentity
  return result
}

async function handleMessage(message, sender) {
  const context = senderContext(sender)
  const pageUrl = requestedPageUrl(message, context)
  if (message.type === 'mark:capture') {
    // MessageSender.url can retain the injection URL after history.pushState.
    // Validate the requested route against Chrome's current tab, then check again
    // before and after capture so a navigation cannot attach another page.
    const current = await chrome.tabs.get(context.tabId)
    if (!supportedPage(current.url) || current.url !== pageUrl
        || new URL(current.url).origin !== new URL(context.url).origin) {
      throw Error('Страница изменилась. Повторите снимок на нужной странице.')
    }
    return capturePage({...context, url: current.url})
  }
  return queueDraftOperation(async () => {
    const key = await draftKey(context.tabId, pageUrl)
    const drafts = await readDrafts()
    if (message.type === 'mark:load-draft') return {ok: true, draft: drafts[key]?.draft || null}
    if (message.type === 'mark:clear-draft') {
      delete drafts[key]
    } else {
      const draft = validatedDraft(message.draft)
      // A sequence preserves recency even when several saves share a millisecond.
      const order = Math.max(0, ...Object.values(drafts).map(entry => entry.order || 0)) + 1
      drafts[key] = {draft, order}
    }
    const recent = Object.entries(drafts).sort((a, b) => b[1].order - a[1].order).slice(0, MAX_DRAFTS)
    await chrome.storage.session.set({[DRAFTS_KEY]: Object.fromEntries(recent)})
    return {ok: true}
  })
}

const messageTypes = new Set(['mark:capture', 'mark:load-draft', 'mark:save-draft', 'mark:clear-draft'])
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!messageTypes.has(message?.type)) return false
  void handleMessage(message, sender).then(sendResponse, error => {
    // Browser errors may contain page URLs. Return a bounded, local explanation.
    const known = error instanceof Error && /^[А-ЯЁ]/.test(error.message)
    sendResponse({ok: false, error: known ? error.message : 'Не удалось выполнить действие. Откройте панель заново и повторите попытку.'})
  })
  return true
})

chrome.tabs.onRemoved.addListener(tabId => {
  void queueDraftOperation(async () => {
    const drafts = await readDrafts()
    const remaining = Object.fromEntries(Object.entries(drafts).filter(([key]) => !key.startsWith(`${tabId}:`)))
    await chrome.storage.session.set({[DRAFTS_KEY]: remaining})
  }).catch(() => {})
})
