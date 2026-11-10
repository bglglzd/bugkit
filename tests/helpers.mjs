import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'

export async function snippet(file, heading, index = 0) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  const section = text.split(heading)[1]?.split(/\r?\n## /)[0]
  const blocks = [...(section ?? '').matchAll(/^```ts\r?\n([\s\S]*?)^```\s*$/gm)]
  assert.ok(blocks[index], `${file}: missing example under ${heading}`)
  return stripTypeScriptTypes(blocks[index][1], {mode: 'strip'})
    .replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
}
export function load(code, names, globals = {}) {
  const scope = {process: {env: {}}, fetch: () => { throw Error('External requests forbidden') }, ...globals}
  return new Function(...Object.keys(scope), code + `\nreturn {${names.join(',')}}`)(...Object.values(scope))
}
export const report = {
  bugkit_spec: '1', id: 'synthetic-report', type: 'bug', status: 'open',
  title: 'Synthetic report', description: 'Synthetic broken button report',
  created_at: '2026-01-01T00:00:00Z', reporter: {id: 'fixture', name: 'fixture'},
  environment: {app_version: '1', commit: 'abc123', platform: 'web', os: 'Synthetic OS'},
  page: {url: 'https://example.invalid/problem', route: 'problem'},
  client: {viewport: '1200x800', user_agent: 'Synthetic UA'},
  element: {selector: '#fixture', xpath: '/html/body/button', tag: 'BUTTON', id: 'fixture', classes: 'fixture', text: 'Synthetic button', html: '<button>synthetic</button>', rect: {x: 1, y: 2, w: 3, h: 4}},
  error: {message: 'Synthetic error', stack: 'Synthetic stack'},
  logs: {console: ['Synthetic console', 'Second line']},
  attachments: [{type: 'screenshot', url: 'https://example.invalid/synthetic.png'}],
}
