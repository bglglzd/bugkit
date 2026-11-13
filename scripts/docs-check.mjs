import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile, access, mkdir} from 'node:fs/promises'
import {resolve, join, sep, extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const docs = resolve(root, 'docs')
const output = resolve(process.env.BUGKIT_ARTIFACT_DIR || join(root, 'artifacts/docs'))
await mkdir(output, {recursive: true})
for (const file of ['README.md', 'INSTALL.md', 'HARDENING.md', 'SPEC.md', 'docs/INSTALL.ru.md', 'docs/EXTENSION.md']) {
  const text = await readFile(join(root, file), 'utf8')
  const references = [...text.matchAll(/\]\(([^)]+)\)|(?:src|href)="([^"]+)"/g)].map(match => match[1] || match[2])
  for (const ref of references) {
    if (/^[a-z]+:|^#/i.test(ref)) continue
    const target = fileURLToPath(new URL(ref.split('#')[0], new URL(file, new URL('../', import.meta.url))))
    await access(target)
  }
}
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png'}
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  const file = resolve(docs, '.'+pathname+(pathname.endsWith('/')?'index.html':''))
  if (!file.startsWith(docs+sep)) return response.writeHead(403).end()
  try { response.writeHead(200, {'content-type':types[extname(file)] || 'application/octet-stream'}).end(await readFile(file)) }
  catch { response.writeHead(404).end('Not found') }
})
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)})
let browser
try {
  browser = await chromium.launch({headless:true})
  const page = await browser.newPage({viewport:{width:1440,height:1100}})
  const failed = []
  page.on('response', response => {if(response.status()>=400)failed.push(response.url())})
  page.on('pageerror', error=>failed.push(error.message))
  const origin=`http://127.0.0.1:${server.address().port}`
  await page.goto(origin, {waitUntil:'networkidle'})
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin})
  await page.locator('[data-copy=claude-commands]').click()
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()), /bugkit@bugkit/)
  await page.screenshot({path:join(output,'page-desktop.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:join(output,'page-mobile.png'),fullPage:true})
  await page.goto(origin+'/demo/',{waitUntil:'networkidle'})
  assert.match(await page.title(),/MARK/)
  assert.deepEqual(failed,[])
  // Render a deterministic layout around the ImageGen raster, without altering it.
  await page.setViewportSize({width:1200,height:630})
  await page.goto(new URL('../assets/social-preview.html',import.meta.url).href)
  const social = process.argv.includes('--update-assets') ? join(root,'assets/social-preview.png') : join(output,'social-preview.png')
  await page.screenshot({path:social})
  if (process.argv.includes('--update-assets')) {
    const {copyFile}=await import('node:fs/promises')
    await copyFile(social,join(docs,'assets/social-preview.png'))
  }
  console.log('Documentation links, assets, copy controls, responsive layout and demo passed.')
} finally {
  await browser?.close()
  await new Promise(ok=>server.close(ok))
}
