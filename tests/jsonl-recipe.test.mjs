import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
import {tmpdir} from 'node:os'
import {join, resolve, sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import test from 'node:test'

const recipe = await readFile(new URL('../recipes/jsonl-file.md', import.meta.url), 'utf8')

function snippet(heading) {
  const section = recipe.split(`## ${heading}`)[1]?.split(/\r?\n## /)[0]
  const code = section?.match(/```ts\r?\n([\s\S]*?)```/)?.[1]
  assert.ok(code, `Missing TypeScript example: ${heading}`)
  // The documented CLI is saved as .js and run directly with Node. Do not
  // silently transpile it: TypeScript syntax there would break installation.
  return heading === 'Minimal CLI implementation' ? code : stripTypeScriptTypes(code, {mode: 'strip'})
}

async function fixture(run) {
  const parent = await realpath(tmpdir())
  const directory = await mkdtemp(join(parent, 'bugkit-recipe-'))
  try {
    await writeFile(join(directory, 'package.json'), '{"type":"module"}\n')
    // Only create/list/CLI dispatch come from the recipe. These small helpers
    // stand in for functions the recipe leaves to the installing project;
    // they let us observe which report the documented CLI selects and updates.
    const helpers = `
import {writeFile} from 'node:fs/promises'
function extractTitle(description) { return description.split(/\\r?\\n/)[0].slice(0, 200) }
export function buildAIContext(report) { return JSON.stringify({selected_id: report.id}) }
export async function updateReport(id, update) {
  const reports = await listReports()
  const report = reports.find(report => report.id === id)
  if (!report) throw new Error('Unknown update target')
  Object.assign(report, update)
  await writeFile(FILE, reports.reverse().map(report => JSON.stringify(report)).join('\\n') + '\\n')
}
`
    await writeFile(join(directory, 'lib.js'), snippet('Create a report (Node)') + '\n' + snippet('List / read reports') + helpers)
    await writeFile(join(directory, 'bugkit.js'), snippet('Minimal CLI implementation'))
    await run(directory)
  } finally {
    const target = await realpath(directory)
    assert.ok(target.startsWith(parent + sep), 'Cleanup must stay inside the temporary parent')
    await rm(target, {recursive: true})
  }
}

const record = id => ({bugkit_spec: '1', id, type: 'bug', title: 'Synthetic report', description: 'Synthetic report for recipe validation', status: 'open', created_at: '2026-01-01T00:00:00Z', reporter: {id: 'test', name: 'fixture'}})
const cli = (directory, ...args) => execFileSync(process.execPath, [join(directory, 'bugkit.js'), ...args], {cwd: directory, encoding: 'utf8'})

test('reports created within the same clock tick keep distinct IDs in the real JSONL file', async () => {
  await fixture(async directory => {
    const originalDirectory = process.cwd()
    const originalNow = Date.now
    try {
      process.chdir(directory)
      const {createBugReport} = await import(pathToFileURL(join(directory, 'lib.js')).href)
      Date.now = () => 1794289000000
      const first = await createBugReport({type: 'bug', description: 'First synthetic report', reporter: {id: 'test', name: 'fixture'}})
      const second = await createBugReport({type: 'bug', description: 'Second synthetic report', reporter: {id: 'test', name: 'fixture'}})
      assert.notEqual(first.id, second.id)
      const stored = (await readFile(join(directory, '.bugreports.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
      assert.equal(stored.length, 2)
      assert.equal(new Set(stored.map(report => report.id)).size, 2)
      assert.equal(JSON.parse(cli(directory, 'show', String(first.id))).description, first.description)
      assert.equal(JSON.parse(cli(directory, 'show', String(second.id))).description, second.description)
    } finally {
      Date.now = originalNow
      process.chdir(originalDirectory)
    }
  })
})

for (const id of [7, '6588a8c7-9437-47cf-a30c-6dbe49797f08']) {
  test(`show, copy and close select the full ${typeof id} ID and preserve the other report`, async () => {
    await fixture(async directory => {
      const other = record('other-report')
      await writeFile(join(directory, '.bugreports.jsonl'), [record(id), other].map(report => JSON.stringify(report)).join('\n') + '\n')
      assert.equal(JSON.parse(cli(directory, 'show', String(id))).id, id)
      assert.equal(JSON.parse(cli(directory, 'copy', String(id))).selected_id, id)
      cli(directory, 'close', String(id), 'Verified synthetic fix')
      const updated = JSON.parse(cli(directory, 'show', String(id)))
      assert.equal(updated.status, 'resolved')
      assert.equal(updated.resolution, 'Verified synthetic fix')
      assert.deepEqual(JSON.parse(cli(directory, 'show', other.id)), other)
    })
  })
}

test('a partial numeric ID cannot silently select a different report', async () => {
  await fixture(async directory => {
    await writeFile(join(directory, '.bugreports.jsonl'), JSON.stringify(record(7)) + '\n')
    const result = spawnSync(process.execPath, [join(directory, 'bugkit.js'), 'show', '7-other'], {cwd: directory, encoding: 'utf8'})
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Not found/)
  })
})

test('empty and oversized resolution notes fail without changing stored reports', async () => {
  await fixture(async directory => {
    const original = record('synthetic-close')
    await writeFile(join(directory, '.bugreports.jsonl'), JSON.stringify(original) + '\n')
    for (const note of ['', '   ', 'x'.repeat(2001)]) {
      const result = spawnSync(process.execPath, [join(directory, 'bugkit.js'), 'close', original.id, note], {cwd: directory, encoding: 'utf8'})
      assert.equal(result.status, 1)
      assert.match(result.stderr, /resolution note/)
      assert.deepEqual(JSON.parse(cli(directory, 'show', original.id)), original)
    }
  })
})

test('missing storage starts empty while real read errors are reported', async () => {
  await fixture(async directory => {
    assert.equal(cli(directory, 'list'), '')
    const {mkdir} = await import('node:fs/promises')
    await mkdir(join(directory, '.bugreports.jsonl'))
    const result = spawnSync(process.execPath, [join(directory, 'bugkit.js'), 'list'], {cwd: directory, encoding: 'utf8'})
    assert.notEqual(result.status, 0)
    assert.notEqual(result.stderr, '')
  })
})
