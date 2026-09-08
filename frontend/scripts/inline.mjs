/**
 * Fold the built assets into one HTML file.
 *
 * Produces a single document that opens by double-clicking, with no server and
 * no loose asset folder to lose — one file the office can email, copy to a USB
 * stick, or drop on a shared drive.
 *
 * Why a single file at all: Chrome and Edge refuse to load an *external*
 * module script over `file://`, because the origin is null and it fails CORS.
 * A normal multi-chunk build therefore shows a blank page when index.html is
 * double-clicked. An *inline* module has nothing to fetch, so it runs.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist-single'
const assets = join(dir, 'assets')

let html = readFileSync(join(dir, 'index.html'), 'utf8')
const files = readdirSync(assets)

const scripts = files.filter((f) => f.endsWith('.js'))
const styles = files.filter((f) => f.endsWith('.css'))

if (scripts.length !== 1) {
  throw new Error(`expected exactly one JS bundle, found ${scripts.length}: ${scripts.join(', ')}`)
}

/**
 * Every replacement below uses the FUNCTION form of `replace`.
 *
 * With a string replacement, `$&`, `$'`, "$`" and `$1` are substitution
 * patterns — and a minified React bundle is full of `$` sequences, which get
 * silently expanded and corrupt the output. The function form passes the text
 * through verbatim.
 */
for (const file of styles) {
  const css = readFileSync(join(assets, file), 'utf8')
  const pattern = new RegExp(`<link[^>]+href="[^"]*${escapeRegex(file)}"[^>]*>`)

  if (!pattern.test(html)) throw new Error(`could not find the <link> for ${file}`)

  html = html.replace(pattern, () => `<style>\n${css}\n</style>`)
}

const bundleFile = scripts[0]

// A literal `</script>` inside a JS string would close the surrounding tag
// early. Escaping the slash keeps the JavaScript identical and the HTML valid.
const bundle = readFileSync(join(assets, bundleFile), 'utf8').replace(
  /<\/script>/gi,
  () => '<\\/script>',
)

const scriptPattern = new RegExp(
  `<script[^>]+src="[^"]*${escapeRegex(bundleFile)}"[^>]*>\\s*</script>`,
)

if (!scriptPattern.test(html)) throw new Error(`could not find the <script> for ${bundleFile}`)

html = html.replace(scriptPattern, () => `<script type="module">\n${bundle}\n</script>`)

// Preload hints point at files that will not exist beside the finished page.
html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, () => '')

// Nothing local may remain referenced externally, or the page breaks the
// moment it is opened away from its build folder. Google Fonts is the
// deliberate exception: it degrades to the system stack when offline.
const leftovers = [...html.matchAll(/(?:src|href)="(\.?\/assets\/[^"]+)"/g)].map((m) => m[1])

if (leftovers.length > 0) {
  throw new Error(`assets still referenced externally: ${leftovers.join(', ')}`)
}

mkdirSync('release', { recursive: true })
const out = join('release', 'BHUIYAN-INDUSTRY.html')
writeFileSync(out, html)

console.log(
  `${out} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, self-contained ` +
    `(${styles.length} stylesheet${styles.length === 1 ? '' : 's'} + 1 script inlined)`,
)

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`)
}
