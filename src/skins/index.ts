// Generated skin art: each skin's lit texture tile and heading ornament, imported through Vite so the URLs respect
// the deployment base path. Regenerate with the generator script rather than editing the SVGs by hand.
import type { CSSProperties } from 'react'
import type { PageSkin } from '../character/PageSkin'
import basaltTexture from './basalt-texture.svg'
import basaltOrnament from './basalt-ornament.svg'
import tideglassTexture from './tideglass-texture.svg'
import tideglassOrnament from './tideglass-ornament.svg'
import wildwoodTexture from './wildwood-texture.svg'
import wildwoodOrnament from './wildwood-ornament.svg'
import moonstoneTexture from './moonstone-texture.svg'
import moonstoneOrnament from './moonstone-ornament.svg'
import matrixTexture from './matrix-texture.svg'
import matrixOrnament from './matrix-ornament.svg'
import saoTexture from './sao-texture.svg'
import saoOrnament from './sao-ornament.svg'
import startrekTexture from './startrek-texture.svg'
import startrekOrnament from './startrek-ornament.svg'
import stoneTexture from './stone-texture.svg'
import stoneOrnament from './stone-ornament.svg'
import moonsilverTexture from './moonsilver-texture.svg'
import moonsilverOrnament from './moonsilver-ornament.svg'
import steelTexture from './steel-texture.svg'
import steelOrnament from './steel-ornament.svg'
import arcaneTexture from './arcane-texture.svg'
import arcaneOrnament from './arcane-ornament.svg'
import rustTexture from './rust-texture.svg'
import rustOrnament from './rust-ornament.svg'

// Photographic or AI-generated tiles saved as <skin>-texture.png/.jpg/.webp (see PROMPTS.md) take precedence over the SVG.
const rasterTiles = import.meta.glob<string>('./*-texture.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' })
const rasterFor = (id: string): string | undefined => Object.entries(rasterTiles).find(([path]) => path.includes(`/${id}-texture.`))?.[1]
export const SKIN_ART: Record<PageSkin, { texture: string; ornament: string }> = {
  basalt: { texture: rasterFor('basalt') ?? basaltTexture, ornament: basaltOrnament },
  tideglass: { texture: rasterFor('tideglass') ?? tideglassTexture, ornament: tideglassOrnament },
  wildwood: { texture: rasterFor('wildwood') ?? wildwoodTexture, ornament: wildwoodOrnament },
  moonstone: { texture: rasterFor('moonstone') ?? moonstoneTexture, ornament: moonstoneOrnament },
  matrix: { texture: rasterFor('matrix') ?? matrixTexture, ornament: matrixOrnament },
  sao: { texture: rasterFor('sao') ?? saoTexture, ornament: saoOrnament },
  startrek: { texture: rasterFor('startrek') ?? startrekTexture, ornament: startrekOrnament },
  stone: { texture: rasterFor('stone') ?? stoneTexture, ornament: stoneOrnament },
  moonsilver: { texture: rasterFor('moonsilver') ?? moonsilverTexture, ornament: moonsilverOrnament },
  steel: { texture: rasterFor('steel') ?? steelTexture, ornament: steelOrnament },
  arcane: { texture: rasterFor('arcane') ?? arcaneTexture, ornament: arcaneOrnament },
  rust: { texture: rasterFor('rust') ?? rustTexture, ornament: rustOrnament },
}

// Inline variables consumed by the skin rules in App.css.
export function skinArtStyle(skin: PageSkin): CSSProperties {
  const art = SKIN_ART[skin] ?? SKIN_ART.basalt
  return { '--skin-texture': `url("${art.texture}")`, '--skin-ornament': `url("${art.ornament}")` } as CSSProperties
}
