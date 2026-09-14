/**
 * Generates the app's stone surfaces as greyscale PNGs, written into
 * `src/assets/`.
 *
 * They are generated rather than photographed for three reasons: the result is
 * seamless and can be regenerated at any size, it carries no licensing, and a
 * smooth greyscale PNG of this kind compresses to a fraction of what a
 * photograph costs — which matters because `build:single` inlines every asset
 * as base64 into one double-clickable file.
 *
 * Greyscale, not colour, on purpose: `styles/stone-shell.css` tints these
 * through a `multiply` blend, so the warm quarry palette lives in CSS next to
 * every other colour in the app instead of being baked into a binary nobody
 * can adjust.
 *
 *     node scripts/make-stone.mjs
 *
 * Deterministic — the seeds below are fixed, so re-running reproduces exactly
 * the same files and never shows up as a spurious diff.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets')

// ---------------------------------------------------------------- noise

/** A small, fast, seedable PRNG (mulberry32) — keeps the output reproducible. */
function rng(seed) {
  return function next() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Value noise on a wrapping lattice. Wrapping is what makes the result
 * tileable: sampling past the right edge reads the left edge back.
 */
function lattice(size, seed) {
  const random = rng(seed)
  const grid = new Float32Array(size * size)
  for (let i = 0; i < grid.length; i += 1) grid[i] = random()
  return { size, grid }
}

const smooth = (t) => t * t * (3 - 2 * t)

function sample({ size, grid }, x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)

  const ix = (v) => ((v % size) + size) % size
  const at = (cx, cy) => grid[ix(cy) * size + ix(cx)]

  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
  return top * (1 - fy) + bottom * fy
}

/** Fractal sum of several octaves — broad shapes plus fine grain. */
function fbm(layers, u, v, octaves, baseFreq) {
  let total = 0
  let amplitude = 1
  let norm = 0
  let freq = baseFreq

  for (let o = 0; o < octaves; o += 1) {
    total += sample(layers[o % layers.length], u * freq, v * freq) * amplitude
    norm += amplitude
    amplitude *= 0.5
    freq *= 2
  }

  return total / norm
}

// ---------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** An 8-bit greyscale PNG. `pixels` is one byte per pixel, row-major. */
function greyscalePng(width, height, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 0 // colour type: greyscale
  header[10] = 0 // deflate
  header[11] = 0 // adaptive filtering
  header[12] = 0 // no interlace

  // One filter byte per scanline. Up-filtering (2) predicts each row from the
  // one above it, which on a smooth gradient leaves near-zero residuals and
  // deflates far better than storing raw rows.
  const raw = Buffer.alloc(height * (width + 1))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1)
    raw[rowStart] = 2
    for (let x = 0; x < width; x += 1) {
      const here = pixels[y * width + x]
      const above = y === 0 ? 0 : pixels[(y - 1) * width + x]
      raw[rowStart + 1 + x] = (here - above) & 0xff
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------- surfaces

/**
 * Polished marble: broad slabs crossed by soft diagonal veining.
 *
 * The veining is the classic turbulence trick — take a linear ramp across the
 * slab and displace it with fractal noise before folding it through a sine, so
 * the bands buckle and branch the way mineral seams do instead of running
 * straight. `contrast` keeps the whole thing shallow, because this sits behind
 * the entire interface and has to stay quiet under text.
 */
function marble({ width, height, seed, veinScale, turbulence, contrast, centre }) {
  const layers = [lattice(64, seed), lattice(64, seed + 101), lattice(64, seed + 202)]
  const pixels = new Uint8Array(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width
      const v = y / height

      const turb = fbm(layers, u, v, 5, 4) - 0.5
      // The diagonal the veins run along.
      const ramp = (u * 0.7 + v * 0.55) * veinScale
      const vein = 0.5 + 0.5 * Math.sin((ramp + turb * turbulence) * Math.PI * 2)

      // A second seam set, finer and running across the first at a shallower
      // angle. Without it the sine bands read as cloud rather than as stone:
      // real marble has seams at more than one scale crossing each other.
      const fineTurb = fbm(layers, u + 11.3, v + 2.9, 4, 6) - 0.5
      const fineRamp = (u * 0.95 - v * 0.35) * veinScale * 1.9
      const fineVein = 0.5 + 0.5 * Math.sin((fineRamp + fineTurb * turbulence * 1.6) * Math.PI * 2)
      // Squared so the fine set reads as occasional dark seams rather than as
      // an even ripple — most of the slab stays clean, as polished stone does.
      const seam = fineVein * fineVein

      // A third, much broader field so the slab is not uniformly bright —
      // this is what reads as depth rather than as a repeating pattern.
      const slab = fbm(layers, u + 3.1, v + 7.7, 3, 1.6)

      // Fine grain, barely visible, but it stops large flat areas looking
      // digitally smooth once the image is scaled up to fill a screen.
      const grain = fbm(layers, u, v, 2, 40) - 0.5

      const value =
        centre +
        (vein - 0.5) * contrast +
        (seam - 0.5) * contrast * 0.22 +
        (slab - 0.5) * contrast * 1.35 +
        grain * 0.035

      pixels[y * width + x] = Math.max(0, Math.min(255, Math.round(value * 255)))
    }
  }

  return greyscalePng(width, height, pixels)
}

const surfaces = [
  {
    // Behind the whole content area. Light, low contrast, generous scale —
    // at `background-size: cover` only a portion of it is ever on screen.
    file: 'stone-field.png',
    png: () => marble({
      width: 900, height: 600, seed: 20260914,
      veinScale: 1.7, turbulence: 1.9, contrast: 0.14, centre: 0.87,
    }),
  },
  {
    // The navigation rail. Narrow and tall, quieter still — it sits directly
    // under the nav labels, so it carries the least contrast of the three.
    file: 'stone-rail.png',
    png: () => marble({
      width: 420, height: 900, seed: 77120,
      veinScale: 1.4, turbulence: 1.7, contrast: 0.07, centre: 0.92,
    }),
  },
  {
    // The stat cards. Smaller and a touch more contrast, because each card
    // shows only a small window onto it and would otherwise look flat.
    file: 'stone-card.png',
    png: () => marble({
      width: 520, height: 340, seed: 31415,
      veinScale: 2.0, turbulence: 2.0, contrast: 0.13, centre: 0.86,
    }),
  },
]

for (const surface of surfaces) {
  const buffer = surface.png()
  writeFileSync(path.join(OUT_DIR, surface.file), buffer)
  console.log(`${surface.file} — ${(buffer.length / 1024).toFixed(0)} KB`)
}
