import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtemp, readFile, mkdir, rm, writeFile, realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve, join, basename, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const extension = resolve(process.env.BUGKIT_EXTENSION_DIR || join(root, 'extension'))
const demo = resolve(extension, '../demo')
const output = resolve(process.env.BUGKIT_ARTIFACT_DIR || join(root, 'artifacts/browser'))
await mkdir(output, {recursive: true})
const routes = new Map([['/', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/demo.js', ['demo.js', 'text/javascript']]])
const server = createServer(async (request, response) => {
  const route = routes.get(new URL(request.url, 'http://localhost').pathname)
  if (!route) return response.writeHead(404).end()
  try { response.writeHead(200, {'content-type': `${route[1]}; charset=utf-8`}).end(await readFile(join(demo, route[0]))) }
  catch { response.writeHead(500).end('Fixture unavailable') }
})
await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok) })
const origin = `http://127.0.0.1:${server.address().port}`
const temporary = await realpath(tmpdir())
const profile = await mkdtemp(join(temporary, 'bugkit-browser-'))
const checks = []
let context
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: {width: 1365, height: 900},
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--enable-unsafe-extension-debugging'],
  })
  const page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
  const id = new URL(worker.url()).hostname
  const cdp = await context.newCDPSession(page)
  const browserCdp = await context.browser().newBrowserCDPSession()
  const toggle = async () => {
    const {targetInfos} = await browserCdp.send('Target.getTargets', {filter: [{type: 'tab', exclude: false}]})
    const tab = targetInfos.find(target => target.url === page.url())
    if (!tab) throw Error('No tab target for the test page: ' + JSON.stringify(targetInfos))
    return browserCdp.send('Extensions.triggerAction', {id, targetId: tab.targetId})
  }
  const panel = page.locator('#mark-extension-root')
  const control = selector => panel.locator(selector)
  await page.goto(`${origin}/?token=synthetic-secret#private`)
  assert.equal(await panel.count(), 0)
  checks.push('No page injection before invocation')
  await toggle()
  await panel.waitFor()
  assert.equal(await panel.count(), 1)
  assert.ok(!(await control('#page-url').innerText()).includes('synthetic-secret'))
  await control('[name=description]').fill('Синтетическая проверка: ссылка не должна открываться при выборе элемента.')
  await control('#pick').click()
  const before = page.url()
  await page.locator('#project-link').click()
  assert.equal(page.url(), before)
  assert.match(await control('#elements').innerText(), /project-link/)
  checks.push('Real action injects once; picker captures a link without navigation')
  await control('#preview summary').click()
  await page.waitForFunction(() => document.querySelector('#mark-extension-root')?.shadowRoot?.querySelector('#report-preview')?.textContent.includes('USER-DATA'))
  const preview = await control('#report-preview').innerText()
  assert.ok(!preview.includes('synthetic-secret'))
  assert.ok(!preview.includes('synthetic-demo-only'))
  assert.match(preview, /USER-DATA/)
  assert.match(preview, /App: 2.4.1/)
  checks.push('Preview excludes query, fragment and form values; version metadata and data boundary present')
  const downloadJson = page.waitForEvent('download')
  await control('#save-json').click()
  const jsonDownload = await downloadJson
  await jsonDownload.saveAs(join(output, 'report.json'))
  const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'))
  assert.equal(report.bugkit_spec, '1')
  assert.equal(report.mark_version, '1.1.0')
  assert.equal(report.elements[0].selector, '#project-link')
  assert.equal(report.attachments.length, 0)
  const downloadMarkdown = page.waitForEvent('download')
  await control('#save-md').click()
  await (await downloadMarkdown).saveAs(join(output, 'report.md'))
  assert.match(await readFile(join(output, 'report.md'), 'utf8'), /Selected Element/)
  await context.grantPermissions(['clipboard-read'], {origin})
  await control('#copy').click()
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Синтетическая проверка/)
  checks.push('Real JSON/Markdown downloads and clipboard contain the selected report')
  // Match pointer position as well as page state to avoid background :hover differences.
  await control('#attachments summary').click()
  await control('#capture').scrollIntoViewIfNeeded()
  const captureBounds = await control('#capture').boundingBox()
  await page.mouse.move(captureBounds.x + captureBounds.width/2, captureBounds.y + captureBounds.height/2)
  await page.evaluate(() => document.querySelector('#mark-extension-root').style.setProperty('visibility', 'hidden', 'important'))
  const baseline = await page.screenshot({path: join(output, 'capture-baseline.png')})
  await page.evaluate(() => document.querySelector('#mark-extension-root').style.removeProperty('visibility'))
  await control('#capture').click()
  await page.waitForFunction(() => !!document.querySelector('#mark-extension-root')?.shadowRoot?.querySelector('#screenshot-preview')?.getAttribute('src'))
  const capture = await control('#screenshot-preview').getAttribute('src')
  const difference = await page.evaluate(async ({baseline, capture}) => {
    async function pixels(src) {
      const img = new Image(); img.src = src; await img.decode()
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, img.width, img.height).data
    }
    const a = await pixels(baseline), b = await pixels(capture)
    if (a.length !== b.length) return Infinity
    let changed = 0
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) changed++
    return changed
  }, {baseline: `data:image/png;base64,${baseline.toString('base64')}`, capture})
  await writeFile(join(output, 'capture-actual.png'), Buffer.from(capture.split(',')[1], 'base64'))
  assert.equal(difference, 0, 'Screenshot must match the page with MARK hidden')
  const downloadPng = page.waitForEvent('download')
  await control('#save-png').click()
  await (await downloadPng).saveAs(join(output, 'capture.png'))
  checks.push('Real captureVisibleTab and PNG download; pixels exclude the panel')
  await control('#remove-screenshot').click()
  await control('#attachments summary').click()
  await control('#preview summary').click()
  await page.screenshot({path: join(output, 'extension-preview.png')})
  await control('#close').click()
  await panel.waitFor({state: 'detached'})
  await page.reload()
  await toggle()
  await panel.waitFor()
  assert.match(await control('[name=description]').inputValue(), /Синтетическая проверка/)
  assert.match(await control('#elements').innerText(), /project-link/)
  assert.equal(await control('#screenshot-preview').getAttribute('src'), null)
  checks.push('Session draft restores after reload; screenshot is not persisted')
  await page.evaluate(() => history.pushState({}, '', '/?route=second'))
  await control('#save-json').click()
  assert.match(await control('#status').innerText(), /Страница изменилась/)
  await toggle(); await panel.waitFor({state: 'detached'})
  await toggle(); await panel.waitFor()
  assert.equal(await control('[name=description]').inputValue(), '')
  checks.push('SPA navigation rejects stale export and opens a separate draft')
  await control('[name=description]').fill('Другой синтетический отчёт')
  await control('#clear').click()
  assert.equal(await control('[name=description]').inputValue(), '')
  await page.setViewportSize({width: 360, height: 800})
  const bounds = await control('.panel').boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 360)
  await page.screenshot({path: join(output, 'extension-mobile.png')})
  await page.keyboard.press('Escape')
  await panel.waitFor({state: 'detached'})
  checks.push('Draft clearing, narrow viewport fit and Escape cleanup')
  await page.goto('chrome://version')
  const helpPromise = context.waitForEvent('page')
  await toggle()
  const help = await helpPromise
  await help.waitForLoadState()
  assert.match(help.url(), /help.html\?reason=restricted/)
  checks.push('Restricted Chrome page opens a useful help page')
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'result.json'), JSON.stringify({status: 'passed', browser: context.browser().version(), extension, checks, pixel_difference: difference}, null, 2)+'\n')
  console.log(`Browser acceptance passed: ${checks.length} scenario groups; Chromium ${context.browser().version()}`)
} catch (error) {
  await writeFile(join(output, 'result.json'), JSON.stringify({status: 'failed', checks, error: error.stack}, null, 2)+'\n')
  throw error
} finally {
  await context?.close()
  await new Promise(ok => server.close(ok))
  const resolvedProfile = await realpath(profile)
  if (!resolvedProfile.startsWith(temporary + sep) || !basename(resolvedProfile).startsWith('bugkit-browser-')) throw Error('Unsafe test-profile cleanup path')
  await rm(resolvedProfile, {recursive: true, force: true})
}
