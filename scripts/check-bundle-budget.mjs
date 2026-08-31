import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const webDist = resolve(import.meta.dirname, '../apps/web/dist')
const assetsDirectory = join(webDist, 'assets')
const entryBudgetBytes = 480_000
const chunkBudgetBytes = 480_000
const totalJavaScriptBudgetBytes = 550_000
const html = await readFile(join(webDist, 'index.html'), 'utf8')
const entryMatch = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)

if (entryMatch?.[1] === undefined) {
  throw new Error('Could not identify the production JavaScript entry chunk.')
}

const javascriptFiles = (await readdir(assetsDirectory)).filter((file) =>
  file.endsWith('.js'),
)
const sizes = await Promise.all(
  javascriptFiles.map(async (file) => ({
    file,
    size: (await stat(join(assetsDirectory, file))).size,
  })),
)
const entry = sizes.find((asset) => asset.file === basename(entryMatch[1]))

if (entry === undefined) {
  throw new Error('The production JavaScript entry chunk is missing.')
}

const total = sizes.reduce((sum, asset) => sum + asset.size, 0)
const oversizedChunks = sizes.filter((asset) => asset.size > chunkBudgetBytes)
const failures = [
  ...(entry.size > entryBudgetBytes
    ? [`entry ${String(entry.size)} > ${String(entryBudgetBytes)} bytes`]
    : []),
  ...(oversizedChunks.length > 0
    ? oversizedChunks.map(
        (asset) =>
          `${asset.file} ${String(asset.size)} > ${String(chunkBudgetBytes)} bytes`,
      )
    : []),
  ...(total > totalJavaScriptBudgetBytes
    ? [`total ${String(total)} > ${String(totalJavaScriptBudgetBytes)} bytes`]
    : []),
]

process.stdout.write(
  `Bundle budget: entry ${String(entry.size)} bytes; largest ${String(Math.max(...sizes.map((asset) => asset.size)))} bytes; total ${String(total)} bytes across ${String(sizes.length)} chunks.\n`,
)

if (failures.length > 0) {
  throw new Error(`Production bundle budget exceeded: ${failures.join('; ')}`)
}
