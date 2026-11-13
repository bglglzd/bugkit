import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'

const port = Number(process.env.MARK_DEMO_PORT ?? 4173)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MARK_DEMO_PORT must be between 1024 and 65535')
const routes = new Map([
  ['/', ['../demo/index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['../demo/index.html', 'text/html; charset=utf-8']],
  ['/demo.js', ['../demo/demo.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['../demo/style.css', 'text/css; charset=utf-8']],
  ['/favicon.ico', [null, 'image/x-icon']],
])
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, {'allow': 'GET, HEAD'}).end()
    return
  }
  const route = routes.get(new URL(request.url, 'http://127.0.0.1').pathname)
  if (!route) { response.writeHead(404).end('Not found'); return }
  if (!route[0]) { response.writeHead(204).end(); return }
  try {
    const body = await readFile(new URL(route[0], import.meta.url))
    response.writeHead(200, {'content-type': route[1], 'cache-control': 'no-store'})
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.writeHead(500).end('Demo file unavailable')
  }
})
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set MARK_DEMO_PORT to another port.` : error.message)
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => console.log(`MARK demo: http://127.0.0.1:${port} — Ctrl+C to stop`))
