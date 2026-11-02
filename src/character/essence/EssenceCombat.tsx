import { useState } from 'react'
import RollButton from './RollButton'
import { d20Roll, maxRoll, scaleRoll, toRoll, type Roll } from './Roll20'
import { ATTRIBUTE_GROUPS, ESSENCE_ATTRIBUTES, ESSENCE_SKILLS, isReseroUnlocked, weaponFormBonus, type EssenceDerived, type ReseroStage } from './EssenceSystem'
import type { EssenceCharacterData } from './EssenceTypes'

export type ResourceKey = 'hp' | 'reiryoku' | 'willpower'
export type CurrentValues = Partial<Record<ResourceKey, number>>

// An unset current value means the pool is full.
export const clampCurrent = (value: number | undefined, max: number) => Math.max(0, Math.min(max, value ?? max))

type ActionKind = 'basic' | 'major' | 'minor' | 'full' | 'reaction'

// An attack or target a modifier technique can be applied to.
type Variant = { id: string; label: string; roll: Roll | null; secondRoll?: Roll | null }

type ActionEntry = {
  id: string
  name: string
  source: string
  kind: ActionKind
  sheetAction: string
  reiMin: number | null
  reiMax: number | null
  reiText: string
  will: number
  oncePerSession?: boolean
  range: string
  effect: string
  dc?: string
  roll?: Roll | null
  variants?: Variant[]
  disabled?: string
}

const KIND_LABELS: Record<ActionKind, string> = {
  basic: 'Basic Melee Attack',
  major: 'Major Actions',
  minor: 'Minor Actions',
  full: 'Full Turn Actions',
  reaction: 'Reactions',
}
const KINDS: ActionKind[] = ['basic', 'major', 'minor', 'full', 'reaction']

// Stat lists the combat screen can open beside the action lists; each row carries a d20 roll.
type StatsKind = 'attributes' | 'skills' | 'combat'
const STATS_LABELS: Record<StatsKind, string> = { attributes: 'Attributes', skills: 'Skills', combat: 'Combat stats' }
const tagName = (tag: string) => ESSENCE_ATTRIBUTES.find((attribute) => attribute.Tag === tag)?.Name ?? tag

// Resero details end with an "Essence trait:" section on the workbook; split it off so it can be shown selectively.
export function splitEssenceTrait(details: string): { body: string; trait: string | null } {
  const match = /(?:^|\n)\s*Essence trait:\s*/i.exec(details)
  if (!match) return { body: details.trim(), trait: null }
  const body = details.slice(0, match.index).trim()
  const trait = details.slice(match.index + match[0].length).trim()
  return { body, trait: trait || null }
}

const isBlank = (text: string) => !text || /^(n\/a|not applicable|passive)$/i.test(text.trim())

function parseCost(value: number | string): number | null {
  if (typeof value === 'number') {
    return value
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:\s*Reiryoku)?\b/i)
  return match && !/Max Rei/i.test(value) ? Number(match[1]) : null
}

function kindOf(action: string): ActionKind | null {
  const text = action.toLowerCase()
  if (text.includes('reaction')) return 'reaction'
  if (text.includes('full turn')) return 'full'
  if (text.includes('major')) return 'major'
  if (text.includes('minor')) return 'minor'
  return null
}

function costFields(min: number | string, max: number | string) {
  const reiMin = parseCost(min)
  const reiMax = parseCost(max) ?? reiMin
  const unparsed = [min, max].map(String).filter((text) => !isBlank(text) && parseCost(text) === null)
  return { reiMin, reiMax, reiText: unparsed[0] ?? '' }
}

function buildActions(data: EssenceCharacterData, stats: EssenceDerived): ActionEntry[] {
  const base = { reiMin: null, reiMax: null, reiText: '', will: 0, range: '', effect: '' }
  const actions: ActionEntry[] = [
    { ...base, id: 'std-weapon', name: 'Weapon attack', source: 'Standard', kind: 'major', sheetAction: 'Major Action', effect: 'Weaponry to-hit', roll: d20Roll('Weapon attack', 'To hit', stats.weaponry) },
    { ...base, id: 'std-brawl', name: 'Brawl attack', source: 'Standard', kind: 'major', sheetAction: 'Major Action', effect: 'Brawl to-hit', roll: d20Roll('Brawl attack', 'To hit', stats.brawl) },
    { ...base, id: 'std-ranged', name: 'Ranged attack', source: 'Standard', kind: 'major', sheetAction: 'Major Action', effect: 'Ranged to-hit', roll: d20Roll('Ranged attack', 'To hit', stats.ranged) },
    { ...base, id: 'zodiac', name: `Zodiac of ${data.Zodiac.Essence}: Active`, source: 'Zodiac', kind: 'major', sheetAction: 'Major Action', will: 50, oncePerSession: true, effect: data.Zodiac.Active },
    { ...base, id: 'std-dash', name: 'Willpower dash', source: 'Standard', kind: 'minor', sheetAction: 'Minor', will: 25, effect: 'Five extra movement tiles.' },
    { ...base, id: 'std-boost', name: 'Willpower boost', source: 'Standard', kind: 'minor', sheetAction: 'Minor', will: 10, effect: '+1 to a roll (maximum +1).' },
    { ...base, id: 'std-defend', name: 'Defend', source: 'Reaction', kind: 'reaction', sheetAction: 'Reaction', will: 15, effect: 'Forces minimum damage.' },
    { ...base, id: 'std-dodge', name: 'Dodge', source: 'Reaction', kind: 'reaction', sheetAction: 'Reaction', will: 10, effect: 'Must beat the to-hit by 1.', roll: d20Roll('Dodge', 'Dodge', stats.dodge) },
    { ...base, id: 'std-counter', name: 'Counter', source: 'Reaction', kind: 'reaction', sheetAction: 'Reaction', will: 25, effect: 'Must beat the to-hit by 2.' },
    { ...base, id: 'std-panic', name: 'Panic cast', source: 'Reaction', kind: 'reaction', sheetAction: 'Reaction', effect: 'Raises the DC and costs 50% more Reiryoku.', reiMin: 0, reiMax: 1000 },
    { ...base, id: 'std-ally', name: 'React for an ally', source: 'Reaction', kind: 'reaction', sheetAction: 'Reaction', will: 50, effect: 'Take an ally\'s reaction in their place.' },
  ]

  for (const weapon of data.SpiritWeapons) {
    const kind = kindOf(weapon.ActionType) ?? 'minor'
    const cost = parseCost(weapon.CostToSummon)
    actions.push({
      ...base,
      id: `weapon-${weapon.Name}`,
      name: `Summon ${weapon.Name}`,
      source: `Spirit weapon · ${weapon.Category}`,
      kind,
      sheetAction: weapon.ActionType,
      reiMin: cost,
      reiMax: cost,
      reiText: cost === null ? weapon.CostToSummon : '',
      range: weapon.Range,
      effect: weapon.Damage,
      dc: weapon.ToHit,
      roll: toRoll(weapon.Name, 'Damage', weapon.Damage),
    })
  }

  for (const technique of data.Techniques) {
    const kind = kindOf(technique.Action)
    if (!kind) continue
    actions.push({
      ...base,
      ...costFields(technique.MinReiryoku, technique.MaxReiryoku),
      id: `tech-${technique.Name}`,
      name: technique.Name,
      source: 'Technique',
      kind,
      sheetAction: technique.Action,
      range: isBlank(technique.Range) ? '' : technique.Range,
      effect: isBlank(technique.Damage) ? '' : technique.Damage,
      dc: isBlank(technique.DC) ? undefined : technique.DC,
      roll: toRoll(technique.Name, 'Damage', technique.Damage),
    })
  }

  // The workbook gives no action type for Kido and Hado, so they are listed as Major Actions.
  for (const spell of data.Spells) {
    actions.push({
      ...base,
      ...costFields(spell.MinReiryoku, spell.MaxReiryoku),
      id: `spell-${spell.Path}-${spell.Name}`,
      name: spell.Name,
      source: spell.Path,
      kind: 'major',
      sheetAction: 'Not listed',
      range: spell.Range,
      effect: spell.Effect,
      dc: `Reiatsu ${spell.ReiatsuRequired}, DC ${spell.ReiatsuDC}`,
      disabled: data.DisabledSpellPaths?.includes(spell.Path) ? `${spell.Path} is disabled for this character.` : undefined,
    })
  }

  const weaponDamage = data.SpiritWeapons.flatMap((weapon) => {
    const roll = toRoll(weapon.Name, 'Damage', weapon.Damage)
    return roll ? [{ weapon, roll }] : []
  })
  const isMelee = (weapon: EssenceCharacterData['SpiritWeapons'][number]) =>
    /melee/i.test(weapon.Range) || ['Spirit Blade', 'Spirit Body'].includes(weapon.Category)
  const eligibleSpells = data.Spells.filter((spell) => !data.DisabledSpellPaths?.includes(spell.Path))

  const rollBonus = stats.reseroActive ? stats.resero.rollBonus : 0
  const damageBonus = stats.reseroActive ? stats.resero.damageBonus : 0
  actions.push({
    ...base,
    id: 'basic-melee',
    name: 'Basic melee attack',
    source: 'Standard',
    kind: 'basic',
    sheetAction: 'Major Action',
    effect: stats.reseroActive
      ? `${stats.reseroActive.stage} Resero applied: ${signed(rollBonus)} to hit, ${signed(damageBonus)} damage.`
      : 'No Resero active.',
    variants: weaponDamage.filter(({ weapon }) => isMelee(weapon)).map(({ weapon, roll }) => {
      const brawl = !/weaponry/i.test(weapon.ToHit) && /brawl/i.test(weapon.ToHit)
      const modifier = (brawl ? stats.brawl : stats.weaponry) + rollBonus
      const formula = damageBonus ? `${roll.formula}+${damageBonus}` : roll.formula
      return {
        id: weapon.Name,
        label: `${weapon.Name}: to hit ${signed(modifier)}, damage ${formula}`,
        roll: d20Roll(`${weapon.Name} attack`, 'To hit', modifier),
        secondRoll: { name: `${weapon.Name} attack`, label: 'Damage', formula },
      }
    }),
  })

  const variantsFor = (name: string): Variant[] | undefined => {
    if (name.startsWith('Concentrated Force')) {
      return weaponDamage.flatMap(({ weapon, roll }) => {
        const max = maxRoll(weapon.Damage)
        return [
          { id: `${weapon.Name}-strike`, label: `${weapon.Name}: strike (x1.5 damage)`, roll: scaleRoll(roll, 1.5, 'Concentrated Force', `${weapon.Name} damage`) },
          ...(max === null ? [] : [{ id: `${weapon.Name}-ranged`, label: `${weapon.Name}: ranged, maximum damage (8 tiles)`, roll: { name: 'Concentrated Force', label: `${weapon.Name} maximum damage`, formula: String(max) } }]),
        ]
      })
    }
    if (name.startsWith('Suffering Strike')) {
      return [
        { id: 'weapon', label: 'Weapon attack (melee to-hit)', roll: d20Roll('Suffering Strike', 'Weapon to hit', stats.weaponry) },
        { id: 'brawl', label: 'Brawl attack (melee to-hit)', roll: d20Roll('Suffering Strike', 'Brawl to hit', stats.brawl) },
        ...weaponDamage.filter(({ weapon }) => isMelee(weapon)).map(({ weapon, roll }) => ({
          id: weapon.Name,
          label: `${weapon.Name}: damage (+50%)`,
          roll: scaleRoll(roll, 1.5, 'Suffering Strike', `${weapon.Name} damage`),
        })),
      ]
    }
    if (name.startsWith('Phantom Wield')) {
      return weaponDamage.map(({ weapon, roll }) => ({ id: weapon.Name, label: `${weapon.Name} (damage x1-4 swings)`, roll }))
    }
    if (name.startsWith('Recursive Collapse') || name.startsWith('Recursive Casting')) {
      return [
        ...eligibleSpells.map((spell) => ({ id: spell.Name, label: `${spell.Path}: ${spell.Name}`, roll: null })),
        { id: 'essence', label: 'Essence casting', roll: null },
      ]
    }
    return undefined
  }

  for (const entry of actions) {
    if (entry.source === 'Technique') {
      entry.variants = variantsFor(entry.name)
    }
  }

  return actions
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))
const fmt = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')

export function EssenceCombatModule({
  data,
  stats,
  current,
  onCurrentChange,
  reseroStage,
  onReseroChange,
  activeWeapons,
  onWeaponsChange,
  derived,
  open,
  onClose,
}: {
  data: EssenceCharacterData
  stats: EssenceDerived
  current: CurrentValues
  onCurrentChange: (patch: CurrentValues) => void
  reseroStage: ReseroStage | null
  onReseroChange: (stage: ReseroStage | null) => void
  // Names of the spirit weapons currently summoned.
  activeWeapons: string[]
  onWeaponsChange: (names: string[]) => void
  // Combat summary rows as shown on the sheet's combat bar: [label, value, rollable].
  derived: [string, number, boolean][]
  open: boolean
  onClose: () => void
}) {
  const [openKind, setOpenKind] = useState<ActionKind | null>(null)
  const [openStats, setOpenStats] = useState<StatsKind | null>(null)
  const [message, setMessage] = useState('')
  const [used, setUsed] = useState<string[]>([])
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [choices, setChoices] = useState<Record<string, string>>({})

  const actions = buildActions(data, stats)
  const reiryoku = clampCurrent(current.reiryoku, stats.maxReiryoku)
  const willpower = clampCurrent(current.willpower, stats.maxWillpower)

  const pay = (reiCost: number, willCost: number, label: string): boolean => {
    if (reiryoku < reiCost || willpower < willCost) {
      setMessage(`Not enough resources for ${label}: needs ${reiCost} Reiryoku and ${willCost} Willpower.`)
      return false
    }
    onCurrentChange({ reiryoku: reiryoku - reiCost, willpower: willpower - willCost })
    return true
  }

  const selectedVariant = (entry: ActionEntry) =>
    entry.variants?.find((variant) => variant.id === choices[entry.id]) ?? entry.variants?.[0]

  const useAction = (entry: ActionEntry) => {
    const reiCost = amounts[entry.id] ?? entry.reiMin ?? 0
    const variant = selectedVariant(entry)
    if (!pay(reiCost, entry.will, entry.name)) return
    if (entry.oncePerSession) setUsed((ids) => [...ids, entry.id])
    setMessage(`Used ${entry.name}${variant ? ` on ${variant.label}` : ''}: -${reiCost} Reiryoku, -${entry.will} Willpower.`)
  }

  const selectResero = (stage: ReseroStage | null) => {
    if (stage === reseroStage) return
    if (stage === null) {
      onReseroChange(null)
      setMessage('Resero ended.')
      return
    }
    const definition = data.Resero.find((item) => item.Stage === stage)
    if (!definition || !pay(definition.CostToTrigger, 0, `${stage} Resero`)) return
    onReseroChange(stage)
    setMessage(`${stage} Resero active: -${definition.CostToTrigger} Reiryoku.`)
  }

  const endTurn = () => {
    const definition = data.Resero.find((item) => item.Stage === reseroStage)
    if (!definition) {
      setMessage('No Resero to maintain.')
      return
    }
    if (reiryoku < definition.CostToMaintain) {
      onReseroChange(null)
      setMessage(`Could not maintain ${definition.Stage} Resero; it ended.`)
      return
    }
    onCurrentChange({ reiryoku: reiryoku - definition.CostToMaintain })
    setMessage(`Maintained ${definition.Stage} Resero: -${definition.CostToMaintain} Reiryoku.`)
  }

  const reset = () => {
    onCurrentChange({ hp: undefined, reiryoku: undefined, willpower: undefined })
    setUsed([])
    setMessage('Pools restored; once-per-session actions reset.')
  }

  const bonus = stats.reseroActive
  const stages: (ReseroStage | null)[] = [null, 'Partial', 'First', 'True']
  // Resero stages are named after the weapon they belong to ("Snowball - Overrun"); that weapon is the Resero weapon.
  const reseroWeapon = data.SpiritWeapons.find((weapon) => data.Resero.some((stage) => stage.Name.toLowerCase().startsWith(weapon.Name.toLowerCase())))
  const extraMinor = stats.weaponForms.reduce((total, form) => total + form.extraMinorActions, 0)

  const toggleWeapon = (weapon: EssenceCharacterData['SpiritWeapons'][number]) => {
    if (activeWeapons.includes(weapon.Name)) {
      onWeaponsChange(activeWeapons.filter((name) => name !== weapon.Name))
      if (weapon === reseroWeapon && reseroStage) onReseroChange(null)
      setMessage(`${weapon.Name} dismissed${weapon === reseroWeapon && reseroStage ? '; Resero ended' : ''}.`)
      return
    }
    const cost = parseCost(weapon.CostToSummon) ?? 0
    if (!pay(cost, 0, `summoning ${weapon.Name}`)) return
    onWeaponsChange([...activeWeapons, weapon.Name])
    const form = weaponFormBonus(weapon)
    const effects = [form.armour && `${signed(form.armour)} armour`, form.hp && `${signed(form.hp)} max HP`, form.reiryoku && `${signed(form.reiryoku)} max Reiryoku`, form.extraMinorActions && `${form.extraMinorActions} extra minor action`].filter(Boolean).join(', ')
    setMessage(`${weapon.Name} summoned: -${cost} Reiryoku${effects ? ` · ${effects}` : ''}.`)
  }

  // State above stays alive while closed, so messages and used actions persist.
  if (!open) {
    return null
  }

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
    <section className="dm-character-modal essence-combat" role="dialog" aria-modal="true" aria-labelledby="essence-combat-title" onClick={(event) => event.stopPropagation()}>
      <div className="essence-combat-head">
        <h2 id="essence-combat-title">Combat</h2>
        <span className="essence-combat-head-actions">
          <button type="button" className="roll-button" onClick={reset}>Restore pools</button>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </span>
      </div>

      <div className="essence-combat-actions" role="group" aria-label="Action types">
        {KINDS.map((kind) => (
          <button type="button" key={kind} onClick={() => setOpenKind(kind)}>
            {KIND_LABELS[kind]} <span>{actions.filter((entry) => entry.kind === kind).length}</span>
          </button>
        ))}
      </div>

      <div className="essence-combat-actions" role="group" aria-label="Rollable stats">
        <button type="button" onClick={() => setOpenStats('attributes')}>{STATS_LABELS.attributes} <span>{ESSENCE_ATTRIBUTES.length}</span></button>
        <button type="button" onClick={() => setOpenStats('skills')}>{STATS_LABELS.skills} <span>{ESSENCE_SKILLS.length}</span></button>
        <button type="button" onClick={() => setOpenStats('combat')}>{STATS_LABELS.combat} <span>{derived.filter(([, , rollable]) => rollable).length}</span></button>
      </div>

      <div className="essence-combat-resero essence-combat-weapons" role="group" aria-label="Spirit weapons">
        <span className="essence-sub">Spirit weapons</span>
        {data.SpiritWeapons.map((weapon) => {
          const active = activeWeapons.includes(weapon.Name)
          const form = weaponFormBonus(weapon)
          const effects = [form.armour && `${signed(form.armour)} armour`, form.hp && `${signed(form.hp)} HP`, form.reiryoku && `${signed(form.reiryoku)} Rei`, form.extraMinorActions && `+${form.extraMinorActions} minor action`].filter(Boolean).join(', ')
          return (
            <button
              type="button"
              key={weapon.Name}
              aria-pressed={active}
              title={`${weapon.Category} · summon ${weapon.CostToSummon} · ${weapon.ActionType}${effects ? ` · while wielded: ${effects}` : ''}${weapon === reseroWeapon ? ' · Resero weapon' : ''}`}
              onClick={() => toggleWeapon(weapon)}
            >
              {weapon.Name}{effects ? <small> {effects}</small> : null}
            </button>
          )
        })}
      </div>

      <div className="essence-combat-resero" role="group" aria-label="Resero state">
        <span className="essence-sub">Resero{reseroWeapon ? ` · ${reseroWeapon.Name}` : ''}</span>
        {stages.map((stage) => {
          const definition = data.Resero.find((item) => item.Stage === stage)
          const locked = definition ? !isReseroUnlocked(data, definition) : false
          return (
            <button
              type="button"
              key={stage ?? 'off'}
              aria-pressed={reseroStage === stage}
              disabled={locked}
              title={definition ? `${definition.Name}: costs ${definition.CostToTrigger} Reiryoku, then ${definition.CostToMaintain} per turn` : 'End Resero'}
              onClick={() => selectResero(stage)}
            >
              {stage ?? 'Off'}
            </button>
          )
        })}
        <button type="button" onClick={endTurn}>End turn</button>
      </div>

      <div className="essence-stat-grid">
        <div><span>Max HP</span><strong>{stats.maxHP}</strong>{bonus && <small>{signed(bonus.hp)} Resero</small>}{stats.weaponForms.filter((form) => form.hp).map((form) => <small key={form.name}>{signed(form.hp)} {form.name}</small>)}</div>
        <div><span>Max Reiryoku</span><strong>{stats.maxReiryoku}</strong>{bonus && <small>{signed(bonus.reiryoku)} Resero</small>}{stats.weaponForms.filter((form) => form.reiryoku).map((form) => <small key={form.name}>{signed(form.reiryoku)} {form.name}</small>)}</div>
        <div><span>Armour</span><strong>{stats.armour}</strong>{bonus && <small>{signed(bonus.armour)} Resero</small>}{stats.weaponForms.filter((form) => form.armour).map((form) => <small key={form.name}>{signed(form.armour)} {form.name}</small>)}</div>
        <div><span>Resero damage</span><strong>{bonus ? stats.resero.damageBonus : 0}</strong></div>
        <div><span>Resero roll</span><strong>{bonus ? signed(stats.resero.rollBonus) : '+0'}</strong></div>
        {extraMinor > 0 && <div><span>Minor actions</span><strong>{1 + extraMinor}</strong><small>{stats.weaponForms.filter((form) => form.extraMinorActions).map((form) => form.name).join(', ')}</small></div>}
      </div>

      {message && <p className="essence-note" role="status">{message}</p>}

      {bonus && (
        <div className="essence-resero-effects" aria-label="Active Resero effects">
          {bonus.stages.map((stageName) => {
            const stage = data.Resero.find((item) => item.Stage === stageName)
            if (!stage) return null
            const isCurrent = stageName === bonus.stage
            const { body, trait } = splitEssenceTrait(stage.Details)
            return (
              <details className="essence-detail" key={stageName}>
                <summary><strong>{stage.Stage}: {stage.Name}</strong> <small>{isCurrent ? 'current form' : 'carried over'}</small></summary>
                <p>{body}</p>
                {/* The Essence trait belongs to the form actually taken; a higher Resero does not keep the lower forms' traits. */}
                {isCurrent && trait && <p><strong>Essence trait:</strong> {trait}</p>}
              </details>
            )
          })}
          <p className="essence-note">
            Armour takes the highest Resero bonus; HP and Reiryoku bonuses add up.
            {' '}{bonus.alignedEssence ? `Aligned essence (${bonus.stage} only): ${bonus.alignedEssence.name} ${bonus.alignedEssence.amount}.` : `No aligned essence in ${bonus.stage}.`}
          </p>
        </div>
      )}

      {openKind && (
        <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={() => setOpenKind(null)}>
          <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="essence-action-title" onClick={(event) => event.stopPropagation()}>
            <header className="dm-modal-header">
              <div>
                <p className="eyebrow">Reiryoku {reiryoku} · Willpower {willpower}</p>
                <h2 id="essence-action-title">{KIND_LABELS[openKind]}</h2>
              </div>
              <button type="button" className="modal-toggle" onClick={() => setOpenKind(null)}>Close</button>
            </header>
            {message && <p className="essence-note" role="status">{message}</p>}
            <div className="essence-action-list">
              {actions.filter((entry) => entry.kind === openKind).map((entry) => {
                const ranged = entry.reiMin !== null && entry.reiMax !== null && entry.reiMax !== entry.reiMin
                const spent = used.includes(entry.id)
                const variant = selectedVariant(entry)
                const roll = entry.variants ? variant?.roll : entry.roll
                const noTarget = entry.variants !== undefined && entry.variants.length === 0
                return (
                  <article className="essence-action" key={entry.id}>
                    <div className="essence-action-title">
                      <strong>{entry.name}</strong>
                      <small>{entry.source} · sheet: {entry.sheetAction}</small>
                    </div>
                    <div className="essence-facts">
                      {entry.reiMin !== null && !ranged && <span>Reiryoku <strong>{entry.reiMin}</strong></span>}
                      {entry.reiText && <span>Reiryoku <strong>{entry.reiText}</strong></span>}
                      {entry.will > 0 && <span>Willpower <strong>{entry.will}</strong></span>}
                      {entry.range && <span>Range <strong>{entry.range}</strong></span>}
                      {entry.dc && <span>Needs <strong>{entry.dc}</strong></span>}
                      {entry.oncePerSession && <span><strong>Once per session</strong></span>}
                    </div>
                    {entry.effect && <p>{entry.effect}</p>}
                    {entry.disabled && <p className="essence-note">{entry.disabled}</p>}
                    <div className="essence-action-controls">
                      {entry.variants && entry.variants.length > 0 && (
                        <label>
                          Apply to
                          <select
                            value={variant?.id}
                            aria-label={`${entry.name}: apply to`}
                            onChange={(event) => {
                              const value = event.currentTarget.value
                              setChoices((all) => ({ ...all, [entry.id]: value }))
                            }}
                          >
                            {entry.variants.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        </label>
                      )}
                      {noTarget && <small>No eligible attack available.</small>}
                      {ranged && (
                        <label>
                          Reiryoku
                          <input
                            type="number"
                            min={entry.reiMin ?? 0}
                            max={entry.reiMax ?? undefined}
                            value={amounts[entry.id] ?? entry.reiMin ?? 0}
                            onChange={(event) => {
                              const value = event.currentTarget.valueAsNumber
                              if (!Number.isNaN(value)) setAmounts((all) => ({ ...all, [entry.id]: value }))
                            }}
                          />
                          <small>{entry.reiMin}–{entry.reiMax}</small>
                        </label>
                      )}
                      {roll && <RollButton roll={roll} text={variant?.secondRoll ? 'To hit' : 'Roll'} />}
                      {variant?.secondRoll && <RollButton roll={variant.secondRoll} text="Damage" />}
                      {entry.kind !== 'basic' && (
                        <button type="button" onClick={() => useAction(entry)} disabled={spent || Boolean(entry.disabled) || noTarget}>{spent ? 'Used' : entry.disabled ? 'Disabled' : 'Use'}</button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {openStats && (
        <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={() => setOpenStats(null)}>
          <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="essence-stats-title" onClick={(event) => event.stopPropagation()}>
            <header className="dm-modal-header">
              <div>
                <p className="eyebrow">{bonus ? `${bonus.stage} Resero active · effective values` : 'Effective values'}</p>
                <h2 id="essence-stats-title">{STATS_LABELS[openStats]}</h2>
              </div>
              <button type="button" className="modal-toggle" onClick={() => setOpenStats(null)}>Close</button>
            </header>
            {openStats === 'combat' && (
              <div className="essence-skill-list">
                {derived.map(([label, value, rollable]) => (
                  <div className="essence-skill-row" key={label}>
                    <strong>{label}</strong>
                    <small />
                    <span>{fmt(value)}</span>
                    <small>{rollable && <RollButton roll={d20Roll(label, 'Roll', value)} />}</small>
                  </div>
                ))}
              </div>
            )}
            {openStats !== 'combat' && ATTRIBUTE_GROUPS.map((group) => (
              <section className="essence-panel" key={group.Id}>
                <h3>{group.Label}</h3>
                <div className="essence-skill-list">
                  {openStats === 'attributes' && ESSENCE_ATTRIBUTES.filter((attribute) => attribute.Group === group.Id).map((attribute) => (
                    <div className="essence-skill-row" key={attribute.Id} title={attribute.Description}>
                      <strong>{attribute.Name}</strong>
                      <small>{attribute.Tag.toUpperCase()}</small>
                      <span>{fmt(stats.attributes[attribute.Id] ?? data.Attributes[attribute.Id] ?? 0)}</span>
                      <small><RollButton roll={d20Roll(attribute.Name, 'Roll', stats.attributes[attribute.Id] ?? data.Attributes[attribute.Id] ?? 0)} /></small>
                    </div>
                  ))}
                  {openStats === 'skills' && ESSENCE_SKILLS.filter((skill) => skill.Group === group.Id).map((skill) => (
                    <div className="essence-skill-row" key={skill.Id}>
                      <strong>{skill.Name}</strong>
                      <small>{skill.Governors.map(tagName).join(' / ')}</small>
                      <span>{fmt(stats.skills[skill.Id] ?? data.Skills[skill.Id] ?? 0)}</span>
                      <small><RollButton roll={d20Roll(skill.Name, 'Roll', stats.skills[skill.Id] ?? data.Skills[skill.Id] ?? 0)} /></small>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </section>
        </div>
      )}
    </section>
    </div>
  )
}
