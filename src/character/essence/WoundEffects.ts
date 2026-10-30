export type WoundTarget = { Id: string; Name: string; Aliases?: string[]; Minimum?: number; Maximum?: number }
export type WoundModifier = { Target: string; Name: string; Operation: 'add' | 'multiply'; Value: number }
export type WoundInterpretation = { Modifiers: WoundModifier[]; Unapplied: string[] }

const amount = '(\\d+(?:\\.\\d+)?)'
const normalized = (text: string) => text.toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim()

export function interpretWoundResult(text: string, targets: WoundTarget[]): WoundInterpretation {
  if (typeof text === 'string' && text.length > 4000) return { Modifiers: [], Unapplied: ['Result exceeds 4000 characters; review manually.'] }
  const result: WoundInterpretation = { Modifiers: [], Unapplied: [] }
  const aliases = new Map<string, WoundTarget | null>()
  for (const target of targets) {
    for (const name of [target.Name, ...(target.Aliases ?? [])]) {
      const key = normalized(name)
      aliases.set(key, aliases.has(key) && aliases.get(key)?.Id !== target.Id ? null : target)
    }
  }
  const parts = (typeof text === 'string' ? text : '').replace(/(\d),(?=\d{3}\b)/g, '$1').split(/[;\r\n]+|[.!?](?=\s|$)/).map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    if (/\b(if|when|while|unless|until|per|each|every|chance|once|twice)\b/i.test(part)) { result.Unapplied.push(part); continue }
    for (const clause of part.split(/\s+and\s+|,\s*/i).map((entry) => entry.trim()).filter(Boolean)) {
      const clean = normalized(clause)
      let targetText = '', value = 0, percent = false, operation: WoundModifier['Operation'] = 'add'
      let match = clean.match(new RegExp(`^(.+?)\\s*[:=]?\\s*([+-]\\s*${amount})(%)?$`))
      if (match) { targetText = match[1]; value = Number(match[2].replace(/\s/g, '')); percent = Boolean(match[4]) }
      else if ((match = clean.match(new RegExp(`^([+-]\\s*${amount})(%)?\\s+(?:to\\s+)?(.+)$`)))) {
        value = Number(match[1].replace(/\s/g, '')); percent = Boolean(match[3]); targetText = match[4]
      } else if ((match = clean.match(new RegExp(`^(lose|loses|reduce|decrease|gain|increase|bonus of|penalty of)\\s+${amount}(%)?\\s+(?:(?:to|from)\\s+)?(.+)$`)))) {
        targetText = match[4]; percent = Boolean(match[3]); value = Number(match[2]) * (/^(lose|loses|reduce|decrease|penalty of)$/.test(match[1]) ? -1 : 1)
      } else if ((match = clean.match(new RegExp(`^(.+?)\\s+(?:is\\s+)?(reduced|decreased|lowered|increased|raised)\\s+by\\s+${amount}(%)?$`)))) {
        targetText = match[1]; percent = Boolean(match[4]); value = Number(match[3]) * (/^(reduced|decreased|lowered)$/.test(match[2]) ? -1 : 1)
      } else if ((match = clean.match(new RegExp(`^(reduce|reduces|decrease|decreases|lower|lowers|increase|increases|raise|raises)\\s+(.+?)\\s+by\\s+${amount}(%)?$`)))) {
        targetText = match[2]; percent = Boolean(match[4]); value = Number(match[3]) * (/^(reduce|reduces|decrease|decreases|lower|lowers)$/.test(match[1]) ? -1 : 1)
      } else if ((match = clean.match(new RegExp(`^(.+?)\\s*(?:x|\\*|\u00d7)\\s*${amount}$`)))) {
        targetText = match[1]; value = Number(match[2]); operation = 'multiply'
      } else if ((match = clean.match(/^(?:half|halve|halved)\s+(.+)$/))) {
        targetText = match[1]; value = 0.5; operation = 'multiply'
      } else { result.Unapplied.push(clause); continue }
      const target = aliases.get(normalized(targetText).replace(/^(?:your|the)\s+/, '').replace(/\s+points?$/, ''))
      if (percent) { value = 1 + value / 100; operation = 'multiply' }
      if (!target || !Number.isFinite(value) || Math.abs(value) > 1_000_000 || (operation === 'multiply' && value < 0)) { result.Unapplied.push(clause); continue }
      result.Modifiers.push({ Target: target.Id, Name: target.Name, Operation: operation, Value: value })
    }
  }
  return result
}

export function applyWoundModifiers(target: WoundTarget, base: number, modifiers: WoundModifier[]): number {
  const matching = modifiers.filter((modifier) => modifier.Target === target.Id)
  const flat = matching.filter((modifier) => modifier.Operation === 'add').reduce((total, modifier) => total + modifier.Value, 0)
  const scale = matching.filter((modifier) => modifier.Operation === 'multiply').reduce((total, modifier) => total * modifier.Value, 1)
  let value = (base + flat) * scale
  if (!Number.isFinite(value)) return base
  if (target.Minimum !== undefined) value = Math.max(target.Minimum, value)
  if (target.Maximum !== undefined) value = Math.min(target.Maximum, value)
  return value
}