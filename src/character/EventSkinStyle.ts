// Inline styling for an event card: the chosen page skin's art, washed with the banner's palette and the accent.
// Separate from EventEffects.ts because the skin art imports SVG assets, which only Vite can load.
import type { CSSProperties } from 'react'
import { isHexColour, type EventSkin } from './EventEffects'
import { portraitStyle } from './Portrait'
import { skinArtStyle } from '../skins'

const darken = (hex: string, amount = 0.38): string => {
  const channels = [1, 3, 5].map((index) => Math.round(parseInt(hex.slice(index, index + 2), 16) * (1 - amount)))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function eventSkinStyle(skin: EventSkin): CSSProperties {
  const accent = isHexColour(skin.accent) ? { '--skin-accent': skin.accent, '--skin-accent-strong': darken(skin.accent) } : {}
  return { ...skinArtStyle(skin.skin), ...portraitStyle(skin.banner), ...accent } as CSSProperties
}
