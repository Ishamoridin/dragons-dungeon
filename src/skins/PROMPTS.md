# Skin texture prompts

Prompts for an image-generation model, one tile per skin. Save each result as `src/skins/<skin>-texture.png` (or
`.jpg`/`.webp`) and the app will use it automatically in place of the generated SVG tile; the heading ornaments
stay vector. No code changes are needed, just rebuild.

## Requirements for every image

- Square, 1024 x 1024 (2048 if the model allows). Seamlessly tileable: the left edge must continue into the right
  edge and the top into the bottom. Ask for "seamless tileable texture" explicitly and reject results with a visible
  seam or a single centred object.
- Straight-on, orthographic view of the surface. Even, soft, directional lighting from the upper left. No horizon,
  no perspective, no vignette, no frame, no border, no text, no watermark, no logos.
- Photographic realism for the material skins; the four stylised skins are described separately.
- Mid-range contrast. The app layers text over these tiles, so avoid large pure-white or pure-black areas; detail
  should sit between roughly 15% and 70% brightness.

Suggested negative prompt for all: `text, watermark, logo, signature, border, frame, vignette, seam, perspective,
horizon, people, hands, blurry, low detail, cartoon, illustration (material skins only)`.

## Material skins (photorealistic)

**basalt** — Volcanic glass. "Seamless tileable texture of polished black obsidian with faint violet undertones,
glassy conchoidal ripples, a few tiny trapped gas bubbles, hard dark sheen, macro photograph, top-down, soft
directional light from the upper left, photorealistic, 8k detail."

**tideglass** — Sea glass. "Seamless tileable texture of frosted teal sea glass seen from above with gentle wavy
refraction, soft caustic light ripples drifting across the surface, translucent depth, cool blue-green, macro
photograph, top-down, photorealistic."

**wildwood** — Oiled timber. "Seamless tileable texture of dark oiled oak planks, tight straight grain with two
small knots, subtle satin sheen from linseed oil, warm umber and olive tones, top-down macro photograph,
photorealistic, even lighting."

**moonstone** — Nacre. "Seamless tileable texture of mother-of-pearl nacre, soft lavender base with faint
iridescent pink, blue and green sheen, gentle rolling surface, dreamy soft focus highlights, top-down macro
photograph, photorealistic."

**stone** — Rough stone. "Seamless tileable texture of rough hand-carved granite, deep chisel marks and pitting,
grey-brown with warm flecks, a few fine cracks with lit edges, strong raking light from the upper left showing
relief, top-down photograph, photorealistic, high detail."

**moonsilver** — Moonlit silver. "Seamless tileable texture of finely brushed sterling silver plate under cool
moonlight, soft bluish-white specular sheen, delicate horizontal brushing, slight tarnish in the recesses,
top-down macro photograph, photorealistic."

**steel** — Polished steel. "Seamless tileable texture of polished brushed stainless steel, tight anisotropic
brushing, a bright diagonal gloss band, neutral grey, clean and industrial, top-down macro photograph,
photorealistic."

**rust** — Rusted iron. "Seamless tileable texture of heavily rusted iron plate, flaking orange and umber oxide
over dark pitted metal, scattered dark pits and pale flakes, dry matte surface, top-down macro photograph,
photorealistic, high detail."

**arcane** — Rune-etched steel. "Seamless tileable texture of dark blue-grey brushed steel plate etched with thin
glowing cyan runic circuit lines and small glowing nodes, the glow softly lighting the metal around it, top-down,
photorealistic metal with subtle magical light, no text or readable letters."

## Stylised skins (graphic, not photographic)

**matrix** — Falling code. "Seamless tileable pattern of vertical columns of glowing green katakana and digits on
black, phosphor glow, brighter leading characters, faint horizontal scanlines, dense, digital rain, flat graphic
style, no readable words."

**sao** — Luminous hex interface. "Seamless tileable pattern of a thin glowing cyan hexagonal lattice over deep
navy, a few hexagons filled with translucent light and small bright nodes at intersections, clean sci-fi interface
style, soft glow, flat graphic."

**startrek** — LCARS. "Seamless tileable pattern of long rounded horizontal bars in muted orange, lilac and
periwinkle on black, with small gaps between bars, flat retro-futuristic computer interface style, subtle sheen,
no text."

## After generating

1. Check tiling: place two copies side by side and above each other; edges must match.
2. Save as `src/skins/<skin>-texture.png` using the exact skin ids above.
3. Run `npm run build`. The index picks raster tiles up automatically and falls back to the SVG where none exists.
