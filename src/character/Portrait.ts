// Character portraits: a resized JPEG data URL stored on the record plus a palette sampled from the image, so
// every sheet showing the character can be themed around it without re-reading pixels.
import type { CSSProperties } from 'react'

export type PortraitPalette = {
  accent: string
  accentStrong: string
  border: string
  pageBackground: string
  panelBackground: string
  cardBackground: string
}

export type Portrait = {
  DataUrl: string
  Palette: PortraitPalette
  UpdatedAt: string
}

export const MAX_PORTRAIT_EDGE = 640
// Records travel as JSON inside a 2 MB request body, so the encoded image is kept well under that.
export const MAX_PORTRAIT_BYTES = 600 * 1024

type Rgb = [number, number, number]

const clamp = (value: number, min = 0, max = 255) => Math.min(max, Math.max(min, Math.round(value)))
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}`
const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${alpha})`
const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]
const luminance = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
const saturation = ([r, g, b]: Rgb) => { const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max }

// Picks the dominant hue and a secondary tone from sampled pixels, then derives the sheet's skin variables.
export function paletteFromPixels(pixels: Uint8ClampedArray): PortraitPalette {
  const buckets = new Map<number, { sum: Rgb; count: number }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4)
    const bucket = buckets.get(key) ?? { sum: [0, 0, 0], count: 0 }
    bucket.sum = [bucket.sum[0] + rgb[0], bucket.sum[1] + rgb[1], bucket.sum[2] + rgb[2]]
    bucket.count++
    buckets.set(key, bucket)
  }
  const colours = [...buckets.values()].map(({ sum, count }) => ({ rgb: [sum[0] / count, sum[1] / count, sum[2] / count] as Rgb, count }))
  if (colours.length === 0) return paletteFromColours([150, 140, 200], [40, 36, 52])
  const total = colours.reduce((sum, colour) => sum + colour.count, 0)
  // Favour colours that are both common and vivid; near-black and near-white are poor accents.
  const scored = colours.map((colour) => {
    const lum = luminance(colour.rgb)
    const vividness = saturation(colour.rgb) * (1 - Math.abs(lum - 0.5) * 1.4)
    return { ...colour, score: (colour.count / total) * (0.35 + vividness) }
  }).sort((a, b) => b.score - a.score)
  const accent = scored[0].rgb
  const darkest = [...colours].sort((a, b) => luminance(a.rgb) - luminance(b.rgb) || b.count - a.count)[0].rgb
  return paletteFromColours(accent, darkest)
}

export function paletteFromColours(accentSource: Rgb, shadowSource: Rgb): PortraitPalette {
  // Accents must read on dark panels; lift dim colours and rein in glaring ones.
  const lum = luminance(accentSource)
  const accent = lum < 0.45 ? mix(accentSource, [255, 255, 255], (0.45 - lum) * 1.2) : lum > 0.8 ? mix(accentSource, [0, 0, 0], (lum - 0.8) * 1.5) : accentSource
  const accentStrong = mix(accent, [0, 0, 0], 0.38)
  const shadow = mix(shadowSource, [0, 0, 0], 0.55)
  const shadowLift = mix(shadowSource, accent, 0.12)
  const deep = mix(shadow, [0, 0, 0], 0.35)
  return {
    accent: hex(accent),
    accentStrong: hex(accentStrong),
    border: rgba(accent, 0.32),
    pageBackground: `linear-gradient(135deg, ${hex(deep)} 0%, ${hex(mix(shadowLift, [0, 0, 0], 0.45))} 48%, ${hex(mix(deep, accent, 0.08))} 100%)`,
    panelBackground: rgba(mix(shadow, [255, 255, 255], 0.04), 0.96),
    cardBackground: `linear-gradient(180deg, ${hex(mix(shadowLift, [0, 0, 0], 0.3))}, ${hex(mix(shadow, [0, 0, 0], 0.2))})`,
  }
}

// Inline style that overrides the active skin's variables for any element using them.
export function portraitStyle(portrait: Portrait | null | undefined): CSSProperties {
  if (!portrait) return {}
  const { Palette } = portrait
  return {
    '--skin-accent': Palette.accent,
    '--skin-accent-strong': Palette.accentStrong,
    '--skin-border': Palette.border,
    '--skin-page-bg': Palette.pageBackground,
    '--skin-panel-bg': Palette.panelBackground,
    '--skin-card-bg': Palette.cardBackground,
    '--portrait-url': `url("${portrait.DataUrl}")`,
  } as CSSProperties
}

// Class list for a sheet shell so the portrait wash only appears when there is a portrait.
export const portraitShellClass = (base: string, portrait: Portrait | null | undefined): string => portrait ? `${base} portrait-themed` : base

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('That file could not be read as an image.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Resizes to a sheet-friendly size, encodes as JPEG under the size budget, and samples the palette.
export async function readPortraitFile(file: File, maxBytes = MAX_PORTRAIT_BYTES): Promise<Portrait> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPEG, WebP, or GIF).')
  const image = await loadImage(file)
  const scale = Math.min(1, MAX_PORTRAIT_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is not available in this browser.')
  // Flatten transparency onto a dark ground so JPEG encoding does not turn it black-on-black.
  context.fillStyle = '#15121a'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const sample = document.createElement('canvas')
  sample.width = 48
  sample.height = 48
  const sampleContext = sample.getContext('2d')
  if (!sampleContext) throw new Error('Image processing is not available in this browser.')
  sampleContext.drawImage(canvas, 0, 0, 48, 48)
  const palette = paletteFromPixels(sampleContext.getImageData(0, 0, 48, 48).data)

  let quality = 0.86
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > maxBytes && quality > 0.4) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length > maxBytes) throw new Error('That image is too detailed to store; try a smaller or simpler picture.')
  return { DataUrl: dataUrl, Palette: palette, UpdatedAt: new Date().toISOString() }
}
