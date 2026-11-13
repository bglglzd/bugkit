(() => {
  'use strict'

  // The background may inject this file again after its service worker restarts.
  if (globalThis.__markExtension) return
  globalThis.__markExtension = true

  const core = globalThis.MarkCore
  const MAX_ELEMENTS = 5
  const fields = ['title', 'description', 'type', 'steps', 'expected', 'actual', 'appVersion', 'buildId']
  const newId = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const emptyDraft = () => ({id: newId(), createdAt: new Date().toISOString(), pageUrl: core.sanitizeUrl(location.href), title: '', description: '', type: 'bug', steps: '', expected: '', actual: '', appVersion: '', buildId: '', elements: []})
  let draft = emptyDraft()
  // Full URL is kept only in memory for route identity, never exported or stored.
  let pageIdentity = location.href
  let screenshot = ''
  let host, root, previousFocus, pickerTarget, modalParent
  let picking = false
  let capturing = false
  let loaded = false
  let saveTimer
  let shortcut = ''
  let queue = Promise.resolve()

  const css = `
    :host { all: initial; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #202624; }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button, input, textarea, select { font: inherit; }
    button, summary { cursor: pointer; }
    button { color: inherit; }
    button:disabled { cursor: wait; opacity: .6; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid #cf4328; outline-offset: 3px; }
    button { min-height: 38px; border: 1px solid #cbd3cf; border-radius: 7px; background: #fff; padding: 8px 12px; font-weight: 600; }
    button:hover:not(:disabled) { background: #edf1ef; }
    button.primary { border-color: #bf391f; background: #bf391f; color: #fff; }
    button.primary:hover:not(:disabled) { background: #9c2e19; }
    .panel, .hint { font: 14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #202624; direction: ltr; }
    .panel { pointer-events: auto; position: fixed; right: 16px; top: 16px; width: 380px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 32px); display: flex; flex-direction: column; border: 1px solid #b9c4bf; border-radius: 12px; background: #f8faf9; overflow: hidden; }
    .header { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid #dce3df; background: #fff; }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 850; letter-spacing: -.035em; margin-right: auto; }
    .brand-mark { display: block; width: 28px; height: 28px; border-radius: 5px; }
    .local { color: #53635b; font-size: 11px; font-weight: 650; }
    .icon-button { padding: 4px 8px; min-width: 36px; min-height: 36px; font-size: 22px; line-height: 1; border-color: transparent; background: transparent; }
    .scroll { padding: 18px; overflow: auto; overscroll-behavior: contain; }
    h1 { font-size: 20px; line-height: 1.25; margin: 0 0 5px; letter-spacing: -.02em; }
    p { margin: 0; }
    .subtle { color: #53635b; font-size: 12px; }
    .intro { margin-bottom: 18px; }
    .page { margin: 0 0 16px; overflow-wrap: anywhere; color: #53635b; font-size: 12px; }
    .page-meta { display: block; margin-top: 7px; color: #3d5547; font-size: 11px; }
    .page strong { display: block; color: #202624; font-size: 13px; margin-bottom: 2px; }
    .field { display: block; margin-bottom: 13px; }
    .label { display: block; margin-bottom: 5px; font-size: 12px; font-weight: 700; }
    input, textarea, select { display: block; width: 100%; border: 1px solid #b9c4bf; border-radius: 6px; color: #202624; background: #fff; padding: 9px 10px; min-height: 40px; }
    textarea { resize: vertical; min-height: 90px; }
    input::placeholder, textarea::placeholder { color: #64716a; opacity: 1; }
    .short { min-height: 66px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .row > .field { flex: 1; min-width: 0; }
    .pick { width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; }
    .pick span:last-child { color: #53635b; font-size: 12px; font-weight: 400; }
    .elements { padding: 0; margin: 8px 0 14px; list-style: none; }
    .elements li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #dce3df; }
    .element-copy { min-width: 0; flex: 1; }
    .element-copy code { display: block; font: 11px/1.4 ui-monospace, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .element-copy small { display: block; color: #53635b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .empty { padding: 8px 0 13px; }
    details { border-top: 1px solid #dce3df; padding: 12px 0; }
    summary { font-weight: 650; font-size: 12px; padding: 3px 0; }
    details > .details-content { padding-top: 12px; }
    .version-note { font-size: 11px; color: #53635b; margin-top: -7px; margin-bottom: 9px; }
    .screenshot { display: block; width: 100%; max-height: 170px; object-fit: contain; border: 1px solid #cbd3cf; border-radius: 5px; background: #e5ebe7; margin: 10px 0 7px; }
    .attachment-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .attachment-actions button { font-size: 12px; }
    .privacy { margin-top: 8px; font-size: 11px; color: #53635b; }
    pre { max-height: 250px; white-space: pre-wrap; overflow-wrap: anywhere; overflow: auto; font: 11px/1.55 ui-monospace, Consolas, monospace; padding: 12px; background: #edf1ef; border-radius: 6px; margin: 10px 0 0; }
    .footer { padding: 12px 18px 14px; border-top: 1px solid #dce3df; background: #fff; }
    .export-row { display: flex; gap: 7px; }
    .export-row .primary { flex: 1; }
    .export-row button { font-size: 12px; padding: 9px 11px; }
    .status { color: #3d5547; min-height: 17px; margin: 8px 0 5px; font-size: 11px; overflow-wrap: anywhere; }
    .status.error { color: #a32919; }
    .footnote { display: flex; justify-content: space-between; align-items: center; gap: 5px; color: #53635b; font-size: 10px; }
    .clear { min-height: 26px; padding: 3px 0 3px 6px; border: 0; font-size: 10px; font-weight: 500; color: #53635b; }
    .hint { pointer-events: auto; position: fixed; top: 16px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 24px); display: flex; align-items: center; gap: 14px; padding: 10px 14px; background: #202624; color: white; border-radius: 8px; font-size: 13px; }
    .hint button { background: transparent; color: white; border-color: #7c8a82; font-size: 12px; padding: 5px 9px; min-height: 32px; }
    .hint button:hover { background: #36443c; }
    .highlight { position: fixed; pointer-events: none; border: 2px solid #d94326; background: #d9432614; }
    @media (max-width: 440px) { .panel { top: 8px; right: 8px; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); } .scroll { padding: 14px; } .header, .footer { padding-left: 14px; padding-right: 14px; } .hint { align-items: flex-start; font-size: 12px; } }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
  `

  function $(selector) { return root?.querySelector(selector) }

  async function message(payload) {
    try {
      const result = await chrome.runtime.sendMessage({pageUrl: pageIdentity, ...payload})
      if (!result?.ok) throw new Error(result?.error || 'Расширение не ответило. Перезагрузите страницу.')
      return result
    } catch (error) {
      throw new Error(error.message || 'Перезагрузите страницу после обновления расширения.')
    }
  }

  function status(text, error = false) {
    const output = $('#status')
    if (!output) return
    output.textContent = text
    output.classList.toggle('error', error)
  }

  function readFields() {
    if (!root) return
    for (const field of fields) draft[field] = $(`[name="${field}"]`).value
  }

  function persist() {
    clearTimeout(saveTimer)
    const snapshot = structuredClone(draft)
    return message({type: 'mark:save-draft', draft: snapshot}).catch(error => {
      status(`Черновик остаётся на странице: ${error.message}`, true)
    })
  }

  function changed() {
    readFields()
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 350)
    updatePreview()
  }

  function report() {
    readFields()
    if (pageIdentity !== location.href) {
      throw new Error('Страница изменилась. Закройте и откройте MARK для нового адреса. Прежний черновик сохранён отдельно.')
    }
    return core.buildReport({...draft, screenshot}, core.collectPageContext(document, window))
  }

  function updatePreview() {
    if (!$('#preview')?.open) return
    try { $('#report-preview').textContent = core.toMarkdown(report()) }
    catch (error) { $('#report-preview').textContent = error.message }
  }

  function renderElements() {
    const list = $('#elements')
    if (!list) return
    list.replaceChildren()
    draft.elements.forEach((element, index) => {
      const item = document.createElement('li')
      const copy = document.createElement('div')
      copy.className = 'element-copy'
      const selector = document.createElement('code')
      selector.textContent = element.selector || element.tag || 'Элемент'
      selector.title = selector.textContent
      const text = document.createElement('small')
      text.textContent = element.text || 'Без текстового фрагмента'
      copy.append(selector, text)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'icon-button'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `Убрать элемент ${index + 1}`)
      remove.addEventListener('click', () => {
        draft.elements.splice(index, 1)
        renderElements()
        changed()
      })
      item.append(copy, remove)
      list.append(item)
    })
    $('#element-count').textContent = `${draft.elements.length} / ${MAX_ELEMENTS}`
    $('#empty-elements').hidden = draft.elements.length > 0
  }

  function renderScreenshot() {
    if (!root) return
    $('#screenshot-block').hidden = !screenshot
    const preview = $('#screenshot-preview')
    if (screenshot) preview.src = screenshot
    else preview.removeAttribute('src')
    $('#capture').textContent = screenshot ? 'Переснять экран' : 'Добавить снимок экрана'
  }

  async function toggle() {
    if (capturing) return status('Дождитесь завершения снимка.')
    if (host) return close()
    if (!loaded || pageIdentity !== location.href) {
      if (loaded) await persist()
      pageIdentity = location.href
      draft = emptyDraft()
      screenshot = ''
      loaded = true
      try {
        const result = await message({type: 'mark:load-draft'})
        if (result.draft && typeof result.draft === 'object') {
          for (const field of fields) if (typeof result.draft[field] === 'string') draft[field] = result.draft[field]
          for (const field of ['id', 'createdAt', 'pageUrl']) if (typeof result.draft[field] === 'string') draft[field] = result.draft[field]
          if (Array.isArray(result.draft.elements)) draft.elements = result.draft.elements.slice(0, MAX_ELEMENTS)
        }
      } catch { /* Draft storage is optional. The live report remains usable. */ }
    }
    mount()
  }

  function mount() {
    previousFocus = document.activeElement
    host = document.createElement('div')
    host.id = 'mark-extension-root'
    // A user-invoked inspector must sit above the inspected site's stacking contexts.
    for (const [property, value] of Object.entries({all: 'initial', position: 'fixed', inset: '0', 'z-index': '2147483647', 'pointer-events': 'none'})) host.style.setProperty(property, value, 'important')
    root = host.attachShadow({mode: 'open'})
    const style = document.createElement('style')
    style.textContent = css
    root.append(style)
    const shell = document.createElement('div')
    shell.innerHTML = `
      <section class="panel" role="dialog" aria-modal="false" aria-labelledby="mark-heading">
        <header class="header"><div class="brand"><img class="brand-mark" width="28" height="28" alt="">BugKit MARK</div><span class="local">ЛОКАЛЬНО</span><button type="button" class="icon-button" id="close" aria-label="Закрыть панель">×</button></header>
        <div class="scroll">
          <div class="intro"><h1 id="mark-heading">Описание проблемы</h1><p class="subtle">Отметьте элемент и опишите проблему.</p></div>
          <p class="page"><strong id="page-title"></strong><span id="page-url"></span><span class="page-meta" id="page-meta"></span></p>
          <button type="button" class="pick" id="pick"><span>⌖ Выбрать элемент</span><span id="element-count">0 / 5</span></button>
          <p class="subtle empty" id="empty-elements">Можно добавить до пяти элементов — или описать всю страницу.</p>
          <ol class="elements" id="elements" aria-label="Выбранные элементы"></ol>
          <label class="field"><span class="label">Что произошло <span aria-hidden="true">*</span></span><textarea name="description" required minlength="5" maxlength="10000" placeholder="Что вы сделали и что пошло не так?"></textarea></label>
          <details id="details"><summary>Детали и версия</summary><div class="details-content">
            <label class="field"><span class="label">Название — необязательно</span><input name="title" maxlength="200" placeholder="По умолчанию — первая строка описания"></label>
            <label class="field"><span class="label">Тип отчёта</span><select name="type"><option value="bug">Ошибка</option><option value="feature">Предложение</option></select></label>
            <label class="field"><span class="label">Как повторить</span><textarea class="short" name="steps" maxlength="4000" placeholder="1. Откройте…&#10;2. Нажмите…"></textarea></label>
            <label class="field"><span class="label">Ожидали</span><textarea class="short" name="expected" maxlength="2000" placeholder="Как должно было сработать"></textarea></label>
            <label class="field"><span class="label">Получили</span><textarea class="short" name="actual" maxlength="2000" placeholder="Что увидели на самом деле"></textarea></label>
            <div class="row"><label class="field"><span class="label">Версия сайта</span><input name="appVersion" maxlength="100" placeholder="Не указана"></label><label class="field"><span class="label">Сборка / commit</span><input name="buildId" maxlength="100" placeholder="Не указана"></label></div>
            <p class="version-note" id="version-note"></p>
          </div></details>
          <details id="attachments"><summary>Снимок экрана</summary><div class="details-content">
            <button type="button" id="capture">Добавить снимок экрана</button>
            <p class="privacy">Снимок видимой области может содержать личные данные. Проверьте его перед передачей. Панель MARK на снимок не попадёт.</p>
            <div id="screenshot-block" hidden><img id="screenshot-preview" class="screenshot" alt="Снимок видимой области страницы"><div class="attachment-actions"><button type="button" id="save-png">Сохранить PNG</button><button type="button" id="remove-screenshot">Убрать снимок</button></div></div>
          </div></details>
          <details id="preview"><summary>Проверить текст отчёта</summary><pre id="report-preview" tabindex="0" aria-label="Текст отчёта"></pre></details>
        </div>
        <footer class="footer"><div class="export-row"><button type="button" class="primary" id="copy">Скопировать для AI</button><button type="button" id="save-md" aria-label="Сохранить Markdown">.md</button><button type="button" id="save-json" aria-label="Сохранить JSON">.json</button></div><p class="status" id="status" role="status" aria-live="polite">Проверьте отчёт перед передачей.</p><div class="footnote"><span id="shortcut"></span><button type="button" class="clear" id="clear">Очистить черновик</button></div></footer>
      </section>
      <div class="hint" hidden><span>Наведите на элемент и нажмите. Esc — отмена.</span><button type="button" id="cancel-pick">Отмена</button></div>
      <div class="highlight" hidden></div>`
    root.append(shell)
    $('.brand-mark').src = chrome.runtime.getURL('icons/mark.png')
    // Native modal dialogs make outside DOM inert and paint above any z-index.
    // Join the existing dialog without closing it or changing the site's state.
    modalParent = [...document.querySelectorAll('dialog:modal')].at(-1)
    const mountParent = modalParent || document.fullscreenElement || document.documentElement
    mountParent.append(host)
    modalParent?.addEventListener('close', close)
    for (const field of fields) $(`[name="${field}"]`).value = draft[field]
    const context = core.collectPageContext(document, window)
    $('#page-title').textContent = document.title || 'Текущая страница'
    $('#page-url').textContent = core.sanitizeUrl(location.href)
    $('#shortcut').textContent = shortcut ? `${shortcut} · Esc закрыть` : 'Иконка расширения · Esc закрыть'
    const version = context.environment?.app_version || ''
    const build = context.environment?.commit || context.environment?.build_id || ''
    $('#page-meta').textContent = `Сайт: ${version || 'версия не указана'}${build ? ` · ${build}` : ''} · MARK ${core.VERSION}`
    $('[name="appVersion"]').placeholder = version || 'Не указана'
    $('[name="buildId"]').placeholder = build || 'Не указана'
    $('#version-note').textContent = version || build ? 'Подсказки прочитаны из метаданных сайта. Можно указать свои значения.' : 'Сайт не сообщает версию. Укажите её, если знаете.'
    root.addEventListener('input', changed)
    root.addEventListener('change', changed)
    // Keep events inside MARK from reaching the site's bubbling outside-click handlers.
    // Native default actions (focus, selection, scrolling) remain intact.
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown', 'keyup', 'input', 'change']) {
      root.addEventListener(type, event => event.stopPropagation())
    }
    $('#close').addEventListener('click', close)
    $('#pick').addEventListener('click', startPicking)
    $('#cancel-pick').addEventListener('click', stopPicking)
    $('#capture').addEventListener('click', capture)
    $('#remove-screenshot').addEventListener('click', () => { screenshot = ''; renderScreenshot(); updatePreview(); status('Снимок удалён из отчёта.') })
    $('#save-png').addEventListener('click', () => { download(screenshot, core.filename({id: draft.id, created_at: draft.createdAt}, 'png')); status('PNG передан в загрузки Chrome.') })
    $('#copy').addEventListener('click', copyReport)
    $('#save-md').addEventListener('click', () => exportReport('md'))
    $('#save-json').addEventListener('click', () => exportReport('json'))
    $('#preview').addEventListener('toggle', updatePreview)
    $('#clear').addEventListener('click', clearDraft)
    window.addEventListener('keydown', onKeydown, true)
    renderElements()
    renderScreenshot()
    $('[name="description"]').focus({preventScroll: true})
  }

  function close() {
    if (!host) return
    readFields()
    void persist()
    stopPicking(false)
    window.removeEventListener('keydown', onKeydown, true)
    modalParent?.removeEventListener('close', close)
    modalParent = null
    host.remove()
    host = null
    root = null
    previousFocus?.focus?.({preventScroll: true})
  }

  function onKeydown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (picking) stopPicking()
    else close()
  }

  function ownEvent(event) { return event.composedPath().includes(host) }
  function targetFrom(event) { return event.composedPath().find(node => node instanceof Element && node !== host) }

  function startPicking() {
    if (capturing || picking) return
    if (draft.elements.length >= MAX_ELEMENTS) return status('Уже выбрано пять элементов. Уберите один, чтобы добавить другой.', true)
    if (pageIdentity !== location.href) return status('Страница изменилась. Закройте и откройте MARK для нового адреса.', true)
    picking = true
    $('.panel').hidden = true
    $('.hint').hidden = false
    window.addEventListener('pointermove', pointAt, true)
    window.addEventListener('pointerdown', blockPointer, true)
    window.addEventListener('mousedown', blockPointer, true)
    window.addEventListener('click', selectElement, true)
    window.addEventListener('scroll', refreshHighlight, true)
    window.addEventListener('resize', refreshHighlight)
    $('#cancel-pick').focus({preventScroll: true})
  }

  function stopPicking(focus = true) {
    picking = false
    pickerTarget = null
    window.removeEventListener('pointermove', pointAt, true)
    window.removeEventListener('pointerdown', blockPointer, true)
    window.removeEventListener('mousedown', blockPointer, true)
    window.removeEventListener('click', selectElement, true)
    window.removeEventListener('scroll', refreshHighlight, true)
    window.removeEventListener('resize', refreshHighlight)
    if (!root) return
    $('.panel').hidden = false
    $('.hint').hidden = true
    $('.highlight').hidden = true
    if (focus) $('#pick').focus({preventScroll: true})
  }

  function blockPointer(event) {
    if (ownEvent(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function pointAt(event) {
    if (ownEvent(event)) { $('.highlight').hidden = true; return }
    pickerTarget = targetFrom(event)
    refreshHighlight()
  }

  function refreshHighlight() {
    const highlight = $('.highlight')
    if (!highlight || !pickerTarget?.isConnected) return
    const rect = pickerTarget.getBoundingClientRect()
    highlight.hidden = false
    Object.assign(highlight.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
  }

  function selectElement(event) {
    if (ownEvent(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const element = targetFrom(event)
    if (!element) return
    try {
      const selected = core.describeElement(element)
      if (draft.elements.some(item => item.selector === selected.selector && JSON.stringify(item.shadow_hosts) === JSON.stringify(selected.shadow_hosts))) {
        stopPicking()
        status('Этот элемент уже добавлен.')
        return
      }
      draft.elements.push(selected)
      stopPicking()
      renderElements()
      changed()
      status('Элемент добавлен. Опишите проблему.')
      $('[name="description"]').focus({preventScroll: true})
    } catch (error) {
      stopPicking()
      status(`Не удалось выбрать элемент: ${error.message}`, true)
    }
  }

  async function capture() {
    if (capturing) return
    if (pageIdentity !== location.href) return status('Страница изменилась. Закройте и откройте MARK для нового адреса.', true)
    capturing = true
    const currentHost = host
    const button = $('#capture')
    button.disabled = true
    status('Делаю снимок текущей вкладки…')
    try {
      currentHost.style.setProperty('visibility', 'hidden', 'important')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const result = await message({type: 'mark:capture'})
      if (typeof result.dataUrl !== 'string' || !result.dataUrl.startsWith('data:image/png;base64,')) throw new Error('Chrome вернул неподдерживаемый снимок.')
      screenshot = result.dataUrl
      if (host === currentHost) {
        renderScreenshot()
        updatePreview()
        status('Снимок готов. Проверьте, нет ли на нём личных данных.')
      }
    } catch (error) { if (host === currentHost) status(`Снимок не получен: ${error.message}`, true) }
    finally {
      currentHost.style.removeProperty('visibility')
      button.disabled = false
      capturing = false
    }
  }

  async function copyReport() {
    let output
    try {
      output = core.toMarkdown(report())
      $('#preview').open = true
      $('#report-preview').textContent = output
    } catch (error) {
      status(error.message, true)
      $('[name="description"]').reportValidity()
      return
    }
    try {
      await navigator.clipboard.writeText(output)
      status(screenshot ? 'Текст скопирован. Снимок передайте отдельно: «Сохранить PNG».' : 'Отчёт скопирован. Вставьте его в чат с разработчиком или AI.')
    } catch { status('Копирование недоступно. Сохраните .md или скопируйте текст из предпросмотра.', true) }
  }

  function exportReport(format) {
    try {
      const data = report()
      const text = format === 'json' ? JSON.stringify(data, null, 2) : core.toMarkdown(data)
      $('#preview').open = true
      $('#report-preview').textContent = core.toMarkdown(data)
      const blob = new Blob([text], {type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'})
      const url = URL.createObjectURL(blob)
      download(url, core.filename(data, format))
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      status(format === 'md' && screenshot ? 'Markdown передан в загрузки. Снимок сохраните отдельно в PNG.' : 'Отчёт передан в загрузки Chrome.')
    } catch (error) {
      status(error.message, true)
      $('[name="description"]').reportValidity()
    }
  }

  function download(url, filename) {
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    root.append(anchor)
    anchor.click()
    anchor.remove()
  }

  async function clearDraft() {
    if (pageIdentity !== location.href) return status('Страница изменилась. Закройте и откройте MARK, затем очистите нужный черновик.', true)
    clearTimeout(saveTimer)
    draft = emptyDraft()
    screenshot = ''
    for (const field of fields) $(`[name="${field}"]`).value = draft[field]
    renderElements()
    renderScreenshot()
    updatePreview()
    try { await message({type: 'mark:clear-draft'}); status('Черновик очищен.') }
    catch (error) { status(`Черновик очищен на странице: ${error.message}`, true) }
    $('[name="description"]').focus({preventScroll: true})
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'mark:ping') { sendResponse({ok: true}); return }
    if (request.type !== 'mark:toggle') return
    shortcut = request.shortcut || ''
    queue = queue.then(toggle).then(() => sendResponse({ok: true})).catch(error => sendResponse({ok: false, error: error.message}))
    return true
  })
})()
