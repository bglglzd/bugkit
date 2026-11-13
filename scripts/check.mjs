import {readdir, readFile, access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = []
async function collect(directory) {
  for (const entry of await readdir(new URL(`../${directory}/`, import.meta.url), {withFileTypes: true})) {
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) await collect(name)
    else if (/\.(m?js)$/.test(entry.name)) files.push(name)
  }
}
for (const directory of ['extension', 'scripts', 'tests', 'demo', 'docs']) await collect(directory)
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], {cwd: root, stdio: 'inherit'})
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url)))
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
if (manifest.version !== pkg.version) throw Error('Extension and package versions differ')
for (const file of Object.values(manifest.icons)) await access(new URL(`../extension/${file}`, import.meta.url))
console.log(`Checked ${files.length} JavaScript files and extension manifest.`)
