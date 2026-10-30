export type Roll = { name: string; label: string; formula: string }

// Roll20 template fields break on these characters, so they are dropped from names and labels.
const clean = (text: string) => text.replace(/[{}[\]|?&=]/g, '').trim()

const signedModifier = (value: number) => (value < 0 ? `${value}` : `+${value}`)

export function d20Roll(name: string, label: string, modifier: number): Roll {
  return { name, label, formula: `1d20${signedModifier(modifier)}` }
}

// Turns sheet text such as "1d100+(Rei invested/2)" into a Roll20 formula, with words becoming ?{prompt|0} queries.
export function toRoll(name: string, label: string, text: string): Roll | null {
  const trimmed = text.trim()
  if (!/^\d*d\d+/i.test(trimmed)) {
    return null
  }

  const formula = trimmed.replace(/[A-Za-z][A-Za-z ]*[A-Za-z]/g, (phrase) => `?{${clean(phrase)}|0}`)
  const withoutQueries = formula.replace(/\?\{[^}]*\}/g, '0')
  return /^[\dd+\-*/().\s]+$/i.test(withoutQueries) ? { name, label, formula } : null
}

export const scaleRoll = (roll: Roll, factor: number, name: string, label: string): Roll => ({
  name,
  label,
  formula: `(${roll.formula})*${factor}`,
})

// The highest result a plain NdM+K formula can produce, or null for anything else.
export function maxRoll(text: string): number | null {
  const match = text.trim().match(/^(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?$/i)
  if (!match) {
    return null
  }
  const dice = Number(match[1] || 1) * Number(match[2])
  return match[4] ? dice + (match[3] === '-' ? -1 : 1) * Number(match[4]) : dice
}

// Typed into chat as-is.
export const toChatCommand = (roll: Roll) => `/roll ${roll.formula}`

export function attemptRoll20(command: string): Promise<{ sent: number; reason: string }> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID()
    const finish = (sent: number, reason: string) => {
      window.removeEventListener('message', receive)
      window.clearTimeout(timer)
      resolve({ sent, reason })
    }
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data
      if (data?.type !== 'dragons-dungeon:roll20-result' || data.requestId !== requestId) return
      if (!Number.isInteger(data.sent) || data.sent < 0 || typeof data.reason !== 'string') return
      finish(data.sent, data.reason.slice(0, 200))
    }
    const timer = window.setTimeout(() => finish(0, 'Roll20 bridge unavailable; paste the copied roll into chat.'), 1500)
    window.addEventListener('message', receive)
    window.postMessage({ type: 'dragons-dungeon:roll20', requestId, command }, window.location.origin)
  })
}

// Pasted into a macro; the template shows the character's roll under a titled card.
export const toMacro = (roll: Roll) =>
  `&{template:default} {{name=${clean(roll.name)}}} {{${clean(roll.label)}=[[${roll.formula}]]}}`
