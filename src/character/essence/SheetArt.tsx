import { useId } from 'react'

export type ArtKind = 'combat' | 'basic' | 'equipment' | 'attributes' | 'development' | 'techniques' | 'essence' | 'notes'

const COPY: Record<ArtKind, { title: string; line: string }> = {
  combat: { title: 'COMBAT', line: 'Pools, defences and actions' },
  basic: { title: 'BASIC INFO & INJURIES', line: 'Who they are, and what has hurt them' },
  equipment: { title: 'EQUIPMENT & INVENTORY', line: 'What is worn, carried and burdened' },
  attributes: { title: 'ATTRIBUTES & SKILLS', line: 'Twelve attributes, thirty skills' },
  development: { title: 'DEVELOPMENT', line: 'Uses, milestones and requests' },
  techniques: { title: 'TECHNIQUES', line: 'Spirit weapon, Resero, Kido and Hado' },
  essence: { title: 'ESSENCE', line: 'Zodiac blessing and held essences' },
  notes: { title: 'OTHER NOTES', line: 'Training, mutations and the rules' },
}

const LIGHT = '#f4dcc0'
const EMBER = '#ff6a3d'
const DARK = '#2b0a0d'

// Each motif is drawn in a 100x100 box and shared by the banner and the round emblem.
function Motif({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case 'combat':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 82L76 20" stroke={LIGHT} strokeWidth="5" fill="none" />
          <path d="M80 82L24 20" stroke={LIGHT} strokeWidth="5" fill="none" />
          <path d="M10 72l18 8M90 72l-18 8" stroke={EMBER} strokeWidth="4" fill="none" />
          <path d="M50 28c11 6 21 6 26 6 0 24-9 38-26 48-17-10-26-24-26-48 5 0 15 0 26-6z" fill={DARK} stroke={EMBER} strokeWidth="3" />
          <path d="M50 38v34M36 50h28" stroke={LIGHT} strokeWidth="2.5" opacity="0.8" fill="none" />
        </g>
      )
    case 'basic':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="34" r="16" fill={LIGHT} />
          <path d="M18 88c0-20 14-30 32-30s32 10 32 30z" fill={LIGHT} />
          <path d="M36 30c4-10 24-12 28 0" fill="none" stroke={DARK} strokeWidth="3" />
          <g transform="rotate(-35 70 70)">
            <rect x="54" y="64" width="32" height="12" rx="3" fill={EMBER} stroke={DARK} strokeWidth="2" />
            <path d="M64 70h12M70 66v8" stroke={DARK} strokeWidth="2" />
          </g>
        </g>
      )
    case 'equipment':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M24 60c0-22 10-36 26-36s26 14 26 36v16H24z" fill={LIGHT} stroke={DARK} strokeWidth="3" />
          <path d="M32 58h36M50 58v18" stroke={DARK} strokeWidth="4" fill="none" />
          <path d="M50 24c-4-10 6-16 14-12-2 6-8 8-14 12z" fill={EMBER} />
          <path d="M20 84h60" stroke={EMBER} strokeWidth="4" fill="none" />
          <path d="M72 70c6 0 10 4 10 10s-4 10-10 10-10-4-10-10" fill={DARK} stroke={EMBER} strokeWidth="2.5" />
        </g>
      )
    case 'attributes':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <polygon points="50,14 82,32 82,68 50,86 18,68 18,32" fill="none" stroke={LIGHT} strokeWidth="3" />
          <path d="M50 14v72M18 32l64 36M82 32L18 68" stroke={EMBER} strokeWidth="1.8" opacity="0.8" fill="none" />
          <polygon points="50,28 68,40 62,62 38,62 32,40" fill={LIGHT} opacity="0.9" />
          {[[50, 14], [82, 32], [82, 68], [50, 86], [18, 68], [18, 32]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill={EMBER} stroke={DARK} strokeWidth="1.5" />)}
          <circle cx="50" cy="50" r="5" fill={DARK} stroke={LIGHT} strokeWidth="2" />
        </g>
      )
    case 'development':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 86h18V68h18V50h18V32h18v54z" fill={LIGHT} stroke={DARK} strokeWidth="3" />
          <path d="M26 56l18-18 6 6 24-26" fill="none" stroke={EMBER} strokeWidth="5" />
          <path d="M66 18l12-2-2 12" fill="none" stroke={EMBER} strokeWidth="5" />
          <circle cx="24" cy="26" r="2.5" fill={LIGHT} /><circle cx="40" cy="18" r="2" fill={LIGHT} /><circle cx="86" cy="52" r="2.5" fill={LIGHT} />
        </g>
      )
    case 'techniques':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M24 22h52a6 6 0 0 1 0 12H24a6 6 0 0 1 0-12z" fill={LIGHT} stroke={DARK} strokeWidth="2.5" />
          <path d="M30 34h40v44H30z" fill={LIGHT} stroke={DARK} strokeWidth="2.5" />
          <path d="M24 78h52a6 6 0 0 1 0 12H24a6 6 0 0 1 0-12z" fill={LIGHT} stroke={DARK} strokeWidth="2.5" />
          <path d="M38 46c14-6 24 4 12 10s-2 18 12 12" fill="none" stroke={EMBER} strokeWidth="4" />
          <path d="M40 40h20M40 72h14" stroke={DARK} strokeWidth="2" opacity="0.6" fill="none" />
        </g>
      )
    case 'essence':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <polygon points="50,12 76,44 50,88 24,44" fill={LIGHT} stroke={DARK} strokeWidth="3" />
          <path d="M24 44h52M50 12l-12 32 12 44M50 12l12 32-12 44" fill="none" stroke={EMBER} strokeWidth="2" />
          <path d="M18 70c-8-14 0-30 8-38M82 70c8-14 0-30-8-38" fill="none" stroke={EMBER} strokeWidth="3" />
          <circle cx="50" cy="44" r="4" fill={EMBER} />
        </g>
      )
    case 'notes':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 30c14-6 28-6 36 2v54c-8-8-22-8-36-2z" fill={LIGHT} stroke={DARK} strokeWidth="2.5" />
          <path d="M86 30c-14-6-28-6-36 2v54c8-8 22-8 36-2z" fill={LIGHT} stroke={DARK} strokeWidth="2.5" />
          <path d="M22 44c8-2 14-2 20 1M22 56c8-2 14-2 20 1M58 45c6-3 12-3 20-1M58 57c6-3 12-3 20-1" fill="none" stroke={DARK} strokeWidth="2" opacity="0.6" />
          <path d="M92 8L56 58l-6 10 12-4z" fill={EMBER} stroke={DARK} strokeWidth="2" />
          <path d="M56 58l6 6" stroke={DARK} strokeWidth="2" />
        </g>
      )
  }
}

// Wide header art in the Zodiac card style: parchment frame, ember scene, serif title.
export function SheetArt({ kind }: { kind: ArtKind }) {
  const id = useId().replace(/:/g, '')
  const copy = COPY[kind]
  const clip = `${id}-scene`

  return (
    <svg className="sheet-art" viewBox="0 0 720 150" role="img" aria-label={`${copy.title} banner`}>
      <defs>
        <linearGradient id={`${id}-paper`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f0e2da" /><stop offset="0.6" stopColor="#dcc3b8" /><stop offset="1" stopColor="#c3a094" />
        </linearGradient>
        <radialGradient id={`${id}-sky`} cx="0.72" cy="0.3" r="0.95">
          <stop offset="0" stopColor="#ffb34d" /><stop offset="0.25" stopColor="#ff5a2a" /><stop offset="0.55" stopColor="#b3151b" />
          <stop offset="0.85" stopColor="#4a0810" /><stop offset="1" stopColor="#14040a" />
        </radialGradient>
        <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6d0" /><stop offset="0.35" stopColor="#ffc766" /><stop offset="1" stopColor="#ff3b30" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-banner`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#2a0508" /><stop offset="0.5" stopColor="#5c0f14" /><stop offset="1" stopColor="#2a0508" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id={clip}><rect x="16" y="16" width="208" height="118" rx="8" /></clipPath>
      </defs>

      <rect x="3" y="3" width="714" height="144" rx="12" fill={`url(#${id}-paper)`} />

      <g clipPath={`url(#${clip})`}>
        <rect x="16" y="16" width="208" height="118" fill={`url(#${id}-sky)`} />
        <circle cx="168" cy="52" r="46" fill={`url(#${id}-sun)`} filter={`url(#${id}-glow)`} />
        <circle cx="168" cy="52" r="14" fill="#fff0c0" opacity="0.9" />
        <path d="M16 112l20-18 14 10 22-24 16 18 20-14 18 22 14-10 20 16 24-12 24 14v26H16z" fill="#2a0a0e" opacity="0.9" />
        <g fill="#ffb066">
          <circle cx="40" cy="40" r="1.4" /><circle cx="64" cy="26" r="1" /><circle cx="204" cy="100" r="1.4" /><circle cx="30" cy="84" r="1.1" /><circle cx="120" cy="28" r="1" />
        </g>
        <g transform="translate(66 22) scale(0.9)">
          <circle cx="50" cy="50" r="46" fill="#14040a" opacity="0.55" />
          <Motif kind={kind} />
        </g>
        <rect x="16" y="16" width="208" height="118" fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="4" />
      </g>
      <rect x="16" y="16" width="208" height="118" rx="8" fill="none" stroke="#ff3b30" strokeOpacity="0.85" strokeWidth="1.4" />

      <text x="244" y="62" fill={DARK} fontFamily="Georgia, 'Times New Roman', serif" fontSize="32" letterSpacing="2">{copy.title}</text>
      <rect x="244" y="76" width="440" height="17" rx="3" fill={`url(#${id}-banner)`} stroke="#ff3b30" strokeOpacity="0.7" />
      <text x="464" y="88.5" textAnchor="middle" fill="#ffe6dc" fontFamily="Georgia, 'Times New Roman', serif" fontSize="10.5" fontWeight="700" letterSpacing="1.4">{copy.line.toUpperCase()}</text>
      <path d="M244 110h440" stroke="#6a1a1c" strokeOpacity="0.5" />
      <circle cx="464" cy="110" r="3" fill="#e02a24" />

      <rect x="3" y="3" width="714" height="144" rx="12" fill="none" stroke={DARK} strokeWidth="3" />
      <rect x="8" y="8" width="704" height="134" rx="9" fill="none" stroke="#e02a24" strokeOpacity="0.7" />
      <g fill="none" stroke="#e02a24" strokeOpacity="0.9" strokeWidth="1.2" strokeLinecap="round">
        <path d="M14 30c0-10 6-16 16-16" /><path d="M706 30c0-10-6-16-16-16" />
        <path d="M14 120c0 10 6 16 16 16" /><path d="M706 120c0 10-6 16-16 16" />
      </g>
    </svg>
  )
}

// Round badge used on buttons.
export function SheetEmblem({ kind }: { kind: ArtKind }) {
  return (
    <svg className="sheet-emblem" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill={DARK} stroke="#ff3b30" strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="#4a0810" />
      <g transform="translate(16 16) scale(0.68)"><Motif kind={kind} /></g>
    </svg>
  )
}
