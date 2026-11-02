import type { EssenceTechnique } from './EssenceTypes'

// Tempering techniques ("Tempered by ...") describe several standalone effects in one Details text. This module
// splits them apart and sorts each effect by how it is used, so the sheet can show every tempering effect a
// character carries in one place.

export type TemperingGroup = 'Major action' | 'Minor action' | 'During rest' | 'Spend to use' | 'On trigger' | 'Always on'

export const TEMPERING_GROUPS: TemperingGroup[] = ['Major action', 'Minor action', 'During rest', 'Spend to use', 'On trigger', 'Always on']

export type TemperingEffect = { source: string; text: string; group: TemperingGroup }

export const isTempering = (technique: Pick<EssenceTechnique, 'Name'>): boolean => /^tempered\b/i.test(technique.Name.trim())

// "Tempered By: Fire & Magma" -> "Fire & Magma"; "Tempered by the Barrens (+Earth)" -> "the Barrens (+Earth)".
export const temperingSource = (name: string): string => name.replace(/^tempered\s+by:?\s*/i, '').trim() || name

const MECHANICAL = /\d|\+|%|\b(immune|immunity|gains?|can|able|recovers?|den(y|ies)|prevent|grants?|suffers?|allows?|cost|action|roll)\b/i

export function classifyTemperingEffect(text: string): TemperingGroup {
  if (/\bmajor action\b/i.test(text)) return 'Major action'
  if (/\bminor action\b/i.test(text)) return 'Minor action'
  if (/\brest(s|ing|ed)?\b/i.test(text)) return 'During rest'
  if (/\b(spend|spending|pay|paying|sacrifice|sacrificing|bid|exchange|at a cost|for a .*? cost|for \d[\d,]* (willpower|reiryoku|reiatsu|hp|hope|evil|earth|essence))/i.test(text)) return 'Spend to use'
  if (/\b(when|whenever|upon|every time|any time|each time|on trigger|for every|if (it|the|this|they|an?)\b|fails?|incoming|on being|after)\b/i.test(text)) return 'On trigger'
  return 'Always on'
}

export const temperingParagraphs = (details: string): string[] =>
  details.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

export function temperingEffects(techniques: EssenceTechnique[]): TemperingEffect[] {
  return techniques.filter(isTempering).flatMap((technique) => {
    const paragraphs = temperingParagraphs(technique.Details)
    // The opening paragraph is usually flavour ("This character has been tempered by ..."); keep it only when it
    // carries a rule of its own.
    const effects = paragraphs.filter((paragraph, index) => index > 0 || MECHANICAL.test(paragraph.replace(/^this character has (been|become|gained|the)\b/i, '')))
    return effects.map((text) => ({ source: technique.Name, text, group: classifyTemperingEffect(text) }))
  })
}

export function collateTempering(techniques: EssenceTechnique[]): { group: TemperingGroup; effects: TemperingEffect[] }[] {
  const effects = temperingEffects(techniques)
  return TEMPERING_GROUPS.map((group) => ({ group, effects: effects.filter((effect) => effect.group === group) })).filter((entry) => entry.effects.length > 0)
}
