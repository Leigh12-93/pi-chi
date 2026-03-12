import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

function makeSvg(size, maskable = false) {
  const padding = maskable ? size * 0.2 : size * 0.08
  const fontSize = (size - padding * 2) * 0.45
  const centerX = size / 2
  const centerY = size / 2 + fontSize * 0.12
  const radius = maskable ? 0 : size * 0.18

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/>
  <text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central"
    font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="${fontSize}"
    fill="#dc2626">6-&#x03C7;</text>
</svg>`
}

const sizes = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
]

for (const { name, size, maskable } of sizes) {
  const svg = makeSvg(size, maskable)
  const buf = await sharp(Buffer.from(svg)).png().toBuffer()
  writeFileSync(join(outDir, name), buf)
  console.log(`${name} (${buf.length} bytes)`)
}

console.log('Done')
