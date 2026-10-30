import { useState } from 'react'
import RollButton from './RollButton'
import { d20Roll, maxRoll, scaleRoll, toRoll, type Roll } from './Roll20'
import { isReseroUnlocked, type EssenceDerived, type ReseroStage } from './EssenceSystem'
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

export function EssenceCombatModule({
  data,
  stats,
  current,
  onCurrentChange,
  reseroStage,
  onReseroChange,
  open,
  onClose,
}: {
  data: EssenceCharacterData
  stats: EssenceDerived
  current: CurrentValues
  onCurrentChange: (patch: CurrentValues) => void
  reseroStage: ReseroStage | null
  onReseroChange: (stage: ReseroStage | null) => void
  open: boolean
  onClose: () => void
}) {
  const [openKind, setOpenKind] = useState<ActionKind | null>(null)
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

      <div className="essence-combat-resero" role="group" aria-label="Resero state">
        <span className="essence-sub">Resero</span>
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
        <div><span>Max HP</span><strong>{stats.maxHP}</strong>{bonus && <small>{signed(bonus.hp)} Resero</small>}</div>
        <div><span>Max Reiryoku</span><strong>{stats.maxReiryoku}</strong>{bonus && <small>{signed(bonus.reiryoku)} Resero</small>}</div>
        <div><span>Armour</span><strong>{stats.armour}</strong>{bonus && <small>{signed(bonus.armour)} Resero</small>}</div>
        <div><span>Resero damage</span><strong>{bonus ? stats.resero.damageBonus : 0}</strong></div>
        <div><span>Resero roll</span><strong>{bonus ? signed(stats.resero.rollBonus) : '+0'}</strong></div>
      </div>

      {message && <p className="essence-note" role="status">{message}</p>}

      {bonus && (
        <div className="essence-resero-effects" aria-label="Active Resero effects">
          {bonus.stages.map((stageName) => {
            const stage = data.Resero.find((item) => item.Stage === stageName)
            return stage && (
              <details className="essence-detail" key={stageName}>
                <summary><strong>{stage.Stage}: {stage.Name}</strong> <small>{stageName === bonus.stage ? 'current form' : 'carried over'}</small></summary>
                <p>{stage.Details}</p>
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
    </section>
    </div>
  )
}
