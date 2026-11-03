// Keywords in a roll's label pick a visual theme for its card, and "damage"-like words make the entrance dramatic.
// Both scale with how close the result came to the formula's maximum.

export type RollThemeId = 'fire' | 'ice' | 'lightning' | 'poison' | 'heal' | 'shadow' | 'holy'

const THEMES: { id: RollThemeId; pattern: RegExp }[] = [
  { id: 'fire', pattern: /\b(fire|flame|flames|burn|burning|ignite|inferno|ember|blaze)\b/i },
  { id: 'ice', pattern: /\b(ice|frost|freeze|freezing|chill|glacial|snow)\b/i },
  { id: 'lightning', pattern: /\b(lightning|shock|thunder|storm|static|bolt)\b/i },
  { id: 'poison', pattern: /\b(poison|venom|toxic|toxin|acid|plague)\b/i },
  { id: 'heal', pattern: /\b(heal|healing|restore|mend|cure|regenerate|recovery)\b/i },
  { id: 'shadow', pattern: /\b(shadow|dark|darkness|void|curse|drain)\b/i },
  { id: 'holy', pattern: /\b(holy|radiant|divine|sacred|blessed|smite)\b/i },
]

const DRAMATIC = /\b(damage|dmg|crit|critical|burst|slam|smash)\b/i

export type RollTheme = { theme: RollThemeId | null; dramatic: boolean }

export function themeForLabel(label: string): RollTheme {
  const theme = THEMES.find((entry) => entry.pattern.test(label))?.id ?? null
  return { theme, dramatic: DRAMATIC.test(label) || theme !== null }
}

// 0..1: how close the total came to the best possible result; drives glow, shake, and entrance speed.
export function rollIntensity(total: number, maxTotal: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(maxTotal) || maxTotal <= 0) return 0.5
  return Math.min(1, Math.max(0.12, total / maxTotal))
}
