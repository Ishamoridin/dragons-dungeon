import { useState } from 'react'
import {
  ATTRIBUTE_GROUPS,
  ESSENCE_ATTRIBUTES,
  ESSENCE_RULES,
  ESSENCE_SKILLS,
  computeEssenceStats,
  skillCap,
  toParagraphs,
  damageLabel,
  type EssenceDerived,
  type ReseroStage,
} from './EssenceSystem'
import type { EssenceCharacterData } from './EssenceTypes'
import { bucketFor, isUsesKind, validateDevelopmentRequest, validateSheetChange, type DevelopmentRequest, type EssenceChange, type SheetChange, type SheetRole, type StepKind } from './EssenceChanges'
import { addDevelopmentType, getDevelopmentTypes } from '../CharacterSheetDatabase'
import { SheetArt, SheetEmblem, type ArtKind } from './SheetArt'
import { ArmourPanel, InjuriesPanel, InventoryPanel } from './EssenceInventory'
import EssenceTree from './EssenceTree'
import { EssenceCombatModule, clampCurrent, type CurrentValues, type ResourceKey } from './EssenceCombat'
import RollButton from './RollButton'
import { d20Roll, toRoll } from './Roll20'

const fmt = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
const signed = (value: number): string => (value > 0 ? `+${fmt(value)}` : fmt(value))

const METAPHYSICAL_LABELS: Record<string, string> = {
  reiatsuManipulation: 'Reiatsu Manipulation',
  spiritWeapon: 'Spirit Weapon',
  reishiManipulation: 'Reishi Manipulation',
  kido: 'Kido',
  hado: 'Hado',
  essenceHarvesting: 'Essence Harvesting',
  essenceCasting: 'Essence Casting',
  essenceCultivation: 'Essence Cultivation',
}

const STAT_LABELS: Record<string, string> = {
  reducedToZeroHP: 'Reduced to 0 HP',
  tookOverTenPercent: 'Took over 10% HP in damage',
  tookNoDamage: 'Took no damage',
  dodged: 'Successfully dodged',
  defended: 'Successfully defended',
}

const tagName = (tag: string) => ESSENCE_ATTRIBUTES.find((attribute) => attribute.Tag === tag)?.Name ?? tag

// Bars read-only unless onChange is supplied; an unset current value means full.
function Bars({
  stats,
  current = {},
  onChange,
}: {
  stats: EssenceDerived
  current?: CurrentValues
  onChange?: (key: ResourceKey, value: number) => void
}) {
  const [adjustBy, setAdjustBy] = useState<Partial<Record<ResourceKey, number>>>({ hp: 10, reiryoku: 25, willpower: 10 })
  const bars: { key: ResourceKey; name: string; max: number; color: string }[] = [
    { key: 'hp', name: 'HP', max: stats.maxHP, color: 'health' },
    { key: 'reiryoku', name: 'Reiryoku', max: stats.maxReiryoku, color: 'mana' },
    { key: 'willpower', name: 'Willpower', max: stats.maxWillpower, color: 'stamina' },
  ]
  return (
    <div className="mini-sheet-resources">
      {bars.map((bar) => {
        const value = clampCurrent(current[bar.key], bar.max)
        const adjustAmount = adjustBy[bar.key] ?? 10
        return (
          <div className={`resource-row ${bar.color}`} key={bar.name}>
            <div className="resource-label">
              <span>{bar.name}</span>
              {onChange ? (
                <span className="resource-edit">
                  <input
                    type="number"
                    min={0}
                    max={bar.max}
                    step={1}
                    value={value}
                    aria-label={`Current ${bar.name}`}
                    onChange={(event) => {
                      const next = event.currentTarget.valueAsNumber
                      if (!Number.isNaN(next)) {
                        onChange(bar.key, clampCurrent(next, bar.max))
                      }
                    }}
                  />
                  <strong>/ {bar.max}</strong>
                  <span className="resource-adjust" aria-label={`${bar.name} quick adjust`}>
                    <button
                      type="button"
                      className="resource-adjust-button"
                      aria-label={`Subtract ${adjustAmount} from ${bar.name}`}
                      onClick={() => onChange(bar.key, clampCurrent(value - adjustAmount, bar.max))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={adjustAmount}
                      aria-label={`Adjust amount for ${bar.name}`}
                      onChange={(event) => {
                        const next = event.currentTarget.valueAsNumber
                        if (!Number.isNaN(next)) {
                          setAdjustBy((values) => ({ ...values, [bar.key]: next }))
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="resource-adjust-button"
                      aria-label={`Add ${adjustAmount} to ${bar.name}`}
                      onClick={() => onChange(bar.key, clampCurrent(value + adjustAmount, bar.max))}
                    >
                      +
                    </button>
                  </span>
                </span>
              ) : (
                <strong>{bar.max}</strong>
              )}
            </div>
            <div className="resource-track" role="progressbar" aria-label={bar.name} aria-valuemin={0} aria-valuemax={bar.max} aria-valuenow={value}>
              <span className="resource-fill" style={{ width: `${bar.max > 0 ? (value / bar.max) * 100 : 0}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function EssenceMiniSheet({ data, name }: { data: EssenceCharacterData; name: string }) {
  const stats = computeEssenceStats(data)
  const derived = [
    ['Armour', stats.armour],
    ['Dodge', stats.dodge],
    ['Defense', stats.defense],
    ['Init', stats.initiative],
  ] as const

  return (
    <section className="mini-sheet" aria-label={`${name} summary`}>
      <Bars stats={stats} />
      <div className="mini-sheet-attributes">
        {derived.map(([label, value]) => <div key={label}><span>{label}</span><strong>{fmt(value)}</strong></div>)}
      </div>
      <div className="mini-sheet-attributes">
        {ATTRIBUTE_GROUPS.map((group) => {
          const ids = ESSENCE_ATTRIBUTES.filter((attribute) => attribute.Group === group.Id)
          const total = ids.reduce((sum, attribute) => sum + (data.Attributes[attribute.Id] ?? 0), 0)
          return <div key={group.Id}><span>{group.Label}</span><strong>{total}</strong></div>
        })}
      </div>
    </section>
  )
}

type PendingChange = { kind: StepKind; id: string; name: string; direction: 1 | -1 }

// Players only ever see the plus; the DM also gets a minus to correct values.
function Stepper({
  value,
  label,
  onOpen,
  showDecrease = false,
  canIncrease = true,
  increaseHint,
}: {
  value: number
  label: string
  onOpen?: (direction: 1 | -1) => void
  showDecrease?: boolean
  canIncrease?: boolean
  increaseHint?: string
}) {
  if (!onOpen) {
    return <span>{value}</span>
  }
  return (
    <span className="stepper">
      {showDecrease && <button type="button" aria-label={`Decrease ${label}`} disabled={value <= 0} onClick={() => onOpen(-1)}>−</button>}
      <span className="stepper-value">{value}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={!canIncrease} title={canIncrease ? undefined : increaseHint} onClick={() => onOpen(1)}>+</button>
    </span>
  )
}

function ChangeDialog({
  data,
  role,
  pending,
  onCancel,
  onConfirm,
}: {
  data: EssenceCharacterData
  role: SheetRole
  pending: PendingChange
  onCancel: () => void
  onConfirm: (change: SheetChange) => void
}) {
  const [amount, setAmount] = useState<number>(pending.direction)
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState('')
  const uses = isUsesKind(pending.kind)
  const before = bucketFor(data, pending.kind)[pending.id] ?? 0
  const available = computeEssenceStats(data).points.available
  const isPlayer = role === 'player'
  const change: SheetChange = { kind: pending.kind, id: pending.id, name: pending.name, amount, purpose }

  const title = !isPlayer
    ? `Adjust ${pending.name}${uses ? ' uses' : ''}`
    : uses ? `Log development: ${pending.name}` : `Spend Universal Skill Points: ${pending.name}`

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const problem = validateSheetChange(data, change, role)
    if (problem) {
      setError(problem)
      return
    }
    onConfirm(change)
  }

  return (
    <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={onCancel}>
      <form className="dm-character-modal change-dialog" role="dialog" aria-modal="true" aria-labelledby="change-dialog-title" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2 id="change-dialog-title">{title}</h2>
        <p className="essence-note">Currently {before}{isPlayer && !uses ? ` · ${available} Universal Skill Points available` : ''}</p>
        <label className="dm-field-label">{uses ? 'Development gained' : isPlayer ? 'Points to spend' : 'Change by'}
          <input
            type="number"
            step={1}
            min={isPlayer ? 1 : undefined}
            max={isPlayer && !uses ? available : undefined}
            value={amount}
            autoFocus
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber
              setAmount(Number.isNaN(value) ? 0 : value)
              setError('')
            }}
          />
        </label>
        {isPlayer && uses && (
          <label className="dm-field-label">What was this development for?
            <textarea
              rows={3}
              value={purpose}
              required
              onChange={(event) => {
                const value = event.currentTarget.value
                setPurpose(value)
                setError('')
              }}
            />
          </label>
        )}
        {isPlayer && !uses && (
          <p>Spend {amount || 0} of {available} Universal Skill Points to raise {pending.name} from {before} to {before + (amount || 0)}? This cannot be undone.</p>
        )}
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <div className="change-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="dm-primary-action">{isPlayer ? (uses ? 'Log development' : 'Confirm and spend') : 'Apply'}</button>
        </div>
      </form>
    </div>
  )
}

const NEW_TYPE = '__new__'

function DevelopmentDialog({
  campaignName,
  onCancel,
  onSubmit,
}: {
  campaignName: string
  onCancel: () => void
  onSubmit: (request: DevelopmentRequest) => void
}) {
  const types = getDevelopmentTypes(campaignName)
  const [amountText, setAmountText] = useState('1')
  const [typeChoice, setTypeChoice] = useState(types[0] ?? NEW_TYPE)
  const [newType, setNewType] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const type = typeChoice === NEW_TYPE ? newType.trim() : typeChoice
    const request: DevelopmentRequest = { type, amountText, description }
    const problem = validateDevelopmentRequest(request)
    if (problem) {
      setError(problem)
      return
    }
    // A new type joins the campaign's list so everyone can pick it afterwards.
    onSubmit({ ...request, type: typeChoice === NEW_TYPE ? addDevelopmentType(campaignName, type) : type })
  }

  return (
    <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={onCancel}>
      <form className="dm-character-modal change-dialog" role="dialog" aria-modal="true" aria-labelledby="development-dialog-title" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2 id="development-dialog-title">Development</h2>
        <label className="dm-field-label">Amount to spend (X for as much as needed)
          <input
            type="text"
            inputMode="numeric"
            value={amountText}
            autoFocus
            onChange={(event) => {
              const value = event.currentTarget.value
              setAmountText(value)
              setError('')
            }}
          />
        </label>
        <label className="dm-field-label">Type
          <select
            value={typeChoice}
            onChange={(event) => {
              const value = event.currentTarget.value
              setTypeChoice(value)
              setError('')
            }}
          >
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
            <option value={NEW_TYPE}>New…</option>
          </select>
        </label>
        {typeChoice === NEW_TYPE && (
          <label className="dm-field-label">New type name
            <input
              value={newType}
              maxLength={40}
              onChange={(event) => {
                const value = event.currentTarget.value
                setNewType(value)
                setError('')
              }}
            />
          </label>
        )}
        <label className="dm-field-label">Description (optional)
          <textarea
            rows={3}
            value={description}
            onChange={(event) => {
              const value = event.currentTarget.value
              setDescription(value)
            }}
          />
        </label>
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <div className="change-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="dm-primary-action">Spend development</button>
        </div>
      </form>
    </div>
  )
}

type TabId = Exclude<ArtKind, 'combat'>

const TABS: { id: TabId; label: string }[] = [
  { id: 'basic', label: 'Basic Info and Injuries' },
  { id: 'equipment', label: 'Equipment and Inventory' },
  { id: 'attributes', label: 'Attributes and Skills' },
  { id: 'development', label: 'Development' },
  { id: 'techniques', label: 'Techniques' },
  { id: 'essence', label: 'Essence' },
  { id: 'notes', label: 'Other Notes' },
]

// Always visible above the tabs; opens the combat modal with the action buttons.
function CombatBar({
  stats,
  current,
  onCurrentChange,
  derived,
  onOpen,
}: {
  stats: EssenceDerived
  current: CurrentValues
  onCurrentChange: (patch: CurrentValues) => void
  derived: [string, number, boolean][]
  onOpen: () => void
}) {
  return (
    <section className="combat-bar" aria-label="Combat summary">
      <button type="button" className="combat-bar-open" onClick={onOpen} aria-label="Open combat actions">
        <SheetEmblem kind="combat" />
        <span><strong>Combat</strong><small>Actions and Resero</small></span>
      </button>
      <Bars stats={stats} current={current} onChange={(key, value) => onCurrentChange({ [key]: value })} />
      <div className="combat-bar-stats">
        {derived.map(([label, value, rollable]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{fmt(value)}</strong>
            {rollable && <RollButton roll={d20Roll(label, 'Roll', value)} />}
          </div>
        ))}
      </div>
    </section>
  )
}

export function EssenceSheetBody({
  data,
  role = 'player',
  onChange,
  development,
  onEditData,
  onEssenceChange,
}: {
  data: EssenceCharacterData
  role?: SheetRole
  onChange?: (change: SheetChange) => void
  // Add or remove essence from the essence window.
  onEssenceChange?: (change: EssenceChange) => void
  // Present only for players, who spend development by sending a request to the DM's log.
  development?: { campaignName: string; onRequest: (request: DevelopmentRequest) => void }
  // Lets the DM edit lists such as injuries and inventory directly.
  onEditData?: (mutate: (draft: EssenceCharacterData) => void) => void
}) {
  const [tab, setTab] = useState<TabId>('basic')
  const [combatOpen, setCombatOpen] = useState(false)
  const [developmentOpen, setDevelopmentOpen] = useState(false)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const open = onChange
    ? (kind: StepKind, id: string, name: string) => (direction: 1 | -1) => setPending({ kind, id, name, direction })
    : undefined
  const [current, setCurrent] = useState<CurrentValues>({})
  const [reseroStage, setReseroStage] = useState<ReseroStage | null>(null)
  const stats = computeEssenceStats(data, reseroStage)
  const { points } = stats
  const isDm = role === 'dm'
  // Players raise attributes and skills only by spending points the DM has issued.
  const canSpend = isDm || points.available > 0
  const noPointsHint = 'No Universal Skill Points available'
  const derived: [string, number, boolean][] = [
    ['Armour', stats.armour, false], ['Dodge', stats.dodge, true], ['Defense', stats.defense, true], ['Initiative', stats.initiative, false],
    ['Ranged', stats.ranged, true], ['Weaponry', stats.weaponry, true], ['Brawl', stats.brawl, true],
    ['Reiatsu modifier', stats.reiatsuModifier, true], ['Reishi modifier', stats.reishiModifier, true], ['Max burden', stats.maxBurden, false],
  ]
  const spiritWeaponUses = data.Development.Metaphysical.spiritWeapon ?? 0
  const kido = data.Spells.filter((spell) => spell.Path === 'Kido')
  const hado = data.Spells.filter((spell) => spell.Path === 'Hado')

  return (
    <div className="essence-sheet">
      {developmentOpen && development && (
        <DevelopmentDialog
          campaignName={development.campaignName}
          onCancel={() => setDevelopmentOpen(false)}
          onSubmit={(request) => {
            setDevelopmentOpen(false)
            development.onRequest(request)
          }}
        />
      )}
      {pending && onChange && (
        <ChangeDialog
          data={data}
          role={role}
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={(change) => {
            setPending(null)
            onChange(change)
          }}
        />
      )}
      <CombatBar
        stats={stats}
        current={current}
        onCurrentChange={(patch) => setCurrent((values) => ({ ...values, ...patch }))}
        derived={derived}
        onOpen={() => setCombatOpen(true)}
      />
      <EssenceCombatModule
        data={data}
        stats={stats}
        current={current}
        onCurrentChange={(patch) => setCurrent((values) => ({ ...values, ...patch }))}
        reseroStage={reseroStage}
        onReseroChange={setReseroStage}
        open={combatOpen}
        onClose={() => setCombatOpen(false)}
      />

      <nav className="sheet-tabs" role="tablist" aria-label="Character sheet sections">
        {TABS.map((item) => (
          <button type="button" role="tab" key={item.id} aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <SheetArt kind={tab} />

      {tab === 'basic' && (
        <>
          <section className="essence-panel">
            <h2>Basic Info</h2>
            <div className="essence-facts">
              <span>Player <strong>{data.PlayerName}</strong></span>
              <span>Concept <strong>{data.Concept}</strong></span>
              <span>Age <strong>{data.Age}</strong></span>
              <span>Race <strong>{data.Race}</strong></span>
              <span>Spirit weapon <strong>{data.SpiritWeaponCategory}</strong></span>
              <span>Zodiac <strong>{data.Zodiac.Name} · {data.Zodiac.Essence}</strong></span>
            </div>
          </section>
          <InjuriesPanel data={data} onEdit={isDm ? onEditData : undefined} />
        </>
      )}

      {tab === 'equipment' && (
        <>
          <ArmourPanel data={data} onEdit={isDm ? onEditData : undefined} />
          <section className="essence-panel">
            <h2>Special wearables</h2>
            <div className="essence-skill-list">
              {(['mask', 'badge', 'talisman', 'pouch', 'charm'] as const).map((slot) => (
                <div className="essence-skill-row" key={slot}>
                  <strong>{slot[0].toUpperCase() + slot.slice(1)}</strong>
                  <small>{data.Wearables[slot] === 0 ? 'Nothing' : 'Equipped'}</small>
                  <span>{signed(data.Wearables[slot])}</span>
                  <small />
                </div>
              ))}
            </div>
          </section>
          <InventoryPanel data={data} maxBurden={stats.maxBurden} onEdit={isDm ? onEditData : undefined} />
        </>
      )}

      {tab === 'attributes' && (
        <>
      <section className="essence-panel">
        <h2>Points</h2>
        <p className="essence-note">
          {points.attributesInvested} attribute + {points.skillsInvested} skill = {points.totalInvested} of {points.issued} issued · {points.available} Universal Skill Points available
        </p>
      </section>

      {ATTRIBUTE_GROUPS.map((group) => (
        <section className="essence-panel" key={group.Id}>
          <h2>{group.Label}</h2>
          <div className="essence-attribute-list">
            {ESSENCE_ATTRIBUTES.filter((attribute) => attribute.Group === group.Id).map((attribute) => (
              <article className="essence-attribute" key={attribute.Id} title={attribute.Description}>
                <div><strong>{attribute.Name}</strong><small>{attribute.Tag.toUpperCase()}</small></div>
                <span className="score-value"><Stepper value={data.Attributes[attribute.Id]} label={attribute.Name} onOpen={open?.('Attributes', attribute.Id, attribute.Name)} showDecrease={isDm} canIncrease={canSpend} increaseHint={noPointsHint} /></span>
              </article>
            ))}
          </div>
          <div className="essence-skill-list">
            {ESSENCE_SKILLS.filter((skill) => skill.Group === group.Id).map((skill) => {
              const cap = skillCap(data, skill)
              return (
                <div className="essence-skill-row" key={skill.Id}>
                  <strong>{skill.Name}</strong>
                  <small>{skill.Governors.map(tagName).join(' / ')}</small>
                  <span><Stepper value={data.Skills[skill.Id]} label={skill.Name} onOpen={open?.('Skills', skill.Id, skill.Name)} showDecrease={isDm} canIncrease={canSpend} increaseHint={noPointsHint} /> / {cap}</span>
                  <small />
                </div>
              )
            })}
          </div>
        </section>
      ))}
        </>
      )}

      {tab === 'techniques' && (
        <>
      <section className="essence-panel">
        <h2>Spirit weapons</h2>
        {data.SpiritWeapons.map((weapon) => (
          <details className="essence-detail" key={weapon.Name} open>
            <summary><strong>{weapon.Name}</strong> · {weapon.Category} · {weapon.Damage}</summary>
            <div className="essence-facts">
              <span>Summon <strong>{weapon.CostToSummon}</strong></span>
              <span>Maintain <strong>{weapon.CostToMaintain}</strong></span>
              <span>To hit <strong>{weapon.ToHit}</strong></span>
              <span>Action <strong>{weapon.ActionType}</strong></span>
              <span>Range <strong>{weapon.Range}</strong></span>
              {toRoll(weapon.Name, 'Damage', weapon.Damage) && <span>Damage <strong>{weapon.Damage}</strong> <RollButton roll={toRoll(weapon.Name, 'Damage', weapon.Damage)!} /></span>}
            </div>
            {weapon.Details && <p>{weapon.Details}</p>}
            {weapon.Pact.Name && <p><strong>Pact: {weapon.Pact.Name}.</strong> {weapon.Pact.Description} {weapon.Pact.Effect}</p>}
            {weapon.Curse.Name && <p><strong>Curse: {weapon.Curse.Name}.</strong> {weapon.Curse.Description} {weapon.Curse.Effect}</p>}
          </details>
        ))}
      </section>

      <section className="essence-panel">
        <h2>Resero <span className="essence-sub">Mastery {data.Mastery} · Potential {data.PotentialStored} / {stats.resero.maxPotential}</span></h2>
        <p className="essence-note">
          Damage bonus {stats.resero.damageBonus} · armour bonus {stats.resero.armourBonus} · roll bonus +{stats.resero.rollBonus} · {spiritWeaponUses} spirit weapon uses
        </p>
        {data.Resero.map((stage) => {
          const unlocked = spiritWeaponUses >= stage.RequiredSpiritWeaponUses && points.allocated >= stage.RequiredSkillPoints
          return (
            <details className="essence-detail" key={stage.Stage}>
              <summary>
                <strong>{stage.Stage}: {stage.Name}</strong>
                <span className={unlocked ? 'event-complete' : 'event-pending'}>{unlocked ? 'Unlocked' : 'Locked'}</span>
              </summary>
              <div className="essence-facts">
                <span>Needs <strong>{stage.RequiredSpiritWeaponUses} uses · {stage.RequiredSkillPoints} points</strong></span>
                <span>Action <strong>{stage.Action}</strong></span>
                <span>DC <strong>{stage.DC}</strong></span>
                <span>Trigger <strong>{stage.CostToTrigger}</strong></span>
                <span>Maintain <strong>{stage.CostToMaintain}</strong></span>
                <span>Bonus <strong>HP {stage.BonusHP} · Rei {stage.BonusReiryoku} · Armour {stage.BonusArmour}</strong></span>
                <span>Aligned <strong>{stage.AlignedEssence} ({stage.EssenceInvested})</strong></span>
              </div>
              <p>{stage.Details}</p>
            </details>
          )
        })}
      </section>

      <section className="essence-panel">
        <h2>Kido and Hado</h2>
        {[['Kido', kido], ['Hado', hado]].map(([label, spells]) => (
          <div key={label as string}>
            <h3>{label as string}</h3>
            {data.DisabledSpellPaths?.includes(label as 'Kido' | 'Hado') && (
              <p className="essence-note">{label as string} is disabled for this character.</p>
            )}
            {(spells as typeof kido).map((spell) => (
              <details className={`essence-detail${data.DisabledSpellPaths?.includes(spell.Path) ? ' essence-disabled' : ''}`} key={spell.Name}>
                <summary>
                  <strong>{spell.Name}</strong> <small>{spell.Pronunciation}</small>
                  <span>{spell.Uses} / {spell.RequiredUses} uses</span>
                </summary>
                <div className="essence-facts">
                  <span>Reiryoku <strong>{spell.MinReiryoku}–{spell.MaxReiryoku}</strong></span>
                  <span>Reiatsu required <strong>{spell.ReiatsuRequired}</strong></span>
                  <span>DC <strong>{spell.ReiatsuDC}</strong></span>
                  <span>Range <strong>{spell.Range}</strong></span>
                  <span>Essence <strong>{spell.Essence}</strong></span>
                </div>
                <p>{spell.Effect}</p>
              </details>
            ))}
          </div>
        ))}
      </section>

      <section className="essence-panel">
        <h2>Known techniques <span className="essence-sub">{data.Techniques.length}</span></h2>
        {data.Techniques.map((technique) => (
          <details className="essence-detail" key={technique.Name}>
            <summary><strong>{technique.Name}</strong> <small>{damageLabel(technique.Damage)}</small></summary>
            <div className="essence-facts">
              <span>Reiryoku <strong>{technique.MinReiryoku}–{technique.MaxReiryoku}</strong></span>
              <span>Min skill <strong>{technique.MinSkill}</strong></span>
              <span>DC <strong>{technique.DC}</strong></span>
              <span>Action <strong>{technique.Action}</strong></span>
              <span>Range <strong>{technique.Range}</strong></span>
              {toRoll(technique.Name, 'Damage', technique.Damage) && <span>Damage <strong>{technique.Damage}</strong> <RollButton roll={toRoll(technique.Name, 'Damage', technique.Damage)!} /></span>}
            </div>
            <p>{technique.Details}</p>
          </details>
        ))}
      </section>
        </>
      )}

      {tab === 'essence' && (
        <>
      <section className="essence-panel">
        <h2>Zodiac of {data.Zodiac.Essence} <span className="essence-sub">{data.Zodiac.Name}</span></h2>
        <h3>Passive</h3>
        {toParagraphs(data.Zodiac.Passive).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <h3>Active</h3>
        {toParagraphs(data.Zodiac.Active).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </section>

      <EssenceTree holdings={data.Essences} techniques={data.Techniques} role={role} onChange={onEssenceChange} />
        </>
      )}

      {tab === 'development' && (
        <>
          <section className="essence-panel">
            <h2>{development ? <button type="button" className="heading-button" onClick={() => setDevelopmentOpen(true)}>Development</button> : 'Development'}</h2>
            {development && <p className="essence-note">Click Development to spend development on something new.</p>}
            <h3>Metaphysical uses</h3>
            <div className="essence-stat-grid">
              {Object.entries(data.Development.Metaphysical).map(([key, value]) => (
                <div key={key}><span>{METAPHYSICAL_LABELS[key] ?? key}</span><strong>{value}</strong></div>
              ))}
            </div>
            <h3>Other statistics</h3>
            <div className="essence-stat-grid">
              {Object.entries(data.Development.Stats).map(([key, value]) => (
                <div key={key}><span>{STAT_LABELS[key] ?? key}</span><strong>{value}</strong></div>
              ))}
            </div>
          </section>
          {ATTRIBUTE_GROUPS.map((group) => (
            <section className="essence-panel" key={`uses-${group.Id}`}>
              <h2>{group.Label} uses</h2>
              <div className="essence-skill-list">
                {ESSENCE_ATTRIBUTES.filter((attribute) => attribute.Group === group.Id).map((attribute) => (
                  <div className="essence-skill-row" key={attribute.Id}>
                    <strong>{attribute.Name}</strong>
                    <small>attribute</small>
                    <span><Stepper value={data.Development.AttributeUses[attribute.Id] ?? 0} label={`${attribute.Name} uses`} onOpen={open?.('AttributeUses', attribute.Id, attribute.Name)} showDecrease={isDm} /></span>
                    <small />
                  </div>
                ))}
                {ESSENCE_SKILLS.filter((skill) => skill.Group === group.Id).map((skill) => (
                  <div className="essence-skill-row" key={skill.Id}>
                    <strong>{skill.Name}</strong>
                    <small>skill</small>
                    <span><Stepper value={data.Development.SkillUses[skill.Id] ?? 0} label={`${skill.Name} uses`} onOpen={open?.('SkillUses', skill.Id, skill.Name)} showDecrease={isDm} /></span>
                    <small />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {tab === 'notes' && (
        <>
      <section className="essence-panel">
        <h2>Notes</h2>
        {data.Notes.map((note) => (
          <details className="essence-detail" key={note.Title}>
            <summary><strong>{note.Title}</strong></summary>
            <p>{note.Body}</p>
          </details>
        ))}
      </section>

      <section className="essence-panel">
        <h2>Rules reference</h2>
        {ESSENCE_RULES.map((rule) => (
          <details className="essence-detail" key={rule.Title}>
            <summary><strong>{rule.Title}</strong></summary>
            <p>{rule.Body}</p>
          </details>
        ))}
      </section>
        </>
      )}
    </div>
  )
}

type UseKind = 'attribute' | 'skill' | 'metaphysical'

export function EssenceActions({
  data,
  onChange,
}: {
  data: EssenceCharacterData
  onChange: (mutate: (draft: EssenceCharacterData) => void) => Promise<void>
}) {
  const [kind, setKind] = useState<UseKind>('skill')
  const [attributeId, setAttributeId] = useState(ESSENCE_ATTRIBUTES[0].Id)
  const [skillId, setSkillId] = useState(ESSENCE_SKILLS[0].Id)
  const [metaId, setMetaId] = useState(Object.keys(data.Development.Metaphysical)[0] ?? '')
  const [amount, setAmount] = useState(1)
  const [points, setPoints] = useState(10)
  const stats = computeEssenceStats(data)

  const logUse = () => onChange((draft) => {
    const bucket = kind === 'attribute' ? draft.Development.AttributeUses
      : kind === 'skill' ? draft.Development.SkillUses
        : draft.Development.Metaphysical
    const key = kind === 'attribute' ? attributeId : kind === 'skill' ? skillId : metaId
    bucket[key] = Math.max(0, (bucket[key] ?? 0) + amount)
  })

  return (
    <section className="dm-action-block">
      <h3>Essence actions</h3>
      <label className="dm-field-label">Log development uses
        <span className="dm-inline-control">
          <select value={kind} onChange={(event) => setKind(event.currentTarget.value as UseKind)}>
            <option value="skill">Skill</option>
            <option value="attribute">Attribute</option>
            <option value="metaphysical">Metaphysical</option>
          </select>
          {kind === 'skill' && (
            <select value={skillId} onChange={(event) => setSkillId(event.currentTarget.value)}>
              {ESSENCE_SKILLS.map((skill) => {
                const group = ATTRIBUTE_GROUPS.find((item) => item.Id === skill.Group)?.Label
                return <option key={skill.Id} value={skill.Id}>{skill.Name} ({group})</option>
              })}
            </select>
          )}
          {kind === 'attribute' && (
            <select value={attributeId} onChange={(event) => setAttributeId(event.currentTarget.value)}>
              {ESSENCE_ATTRIBUTES.map((attribute) => <option key={attribute.Id} value={attribute.Id}>{attribute.Name}</option>)}
            </select>
          )}
          {kind === 'metaphysical' && (
            <select value={metaId} onChange={(event) => setMetaId(event.currentTarget.value)}>
              {Object.keys(data.Development.Metaphysical).map((id) => <option key={id} value={id}>{METAPHYSICAL_LABELS[id] ?? id}</option>)}
            </select>
          )}
          <input type="number" step={1} value={amount} onChange={(event) => setAmount(Number(event.currentTarget.value))} aria-label="Uses to log" />
          <button type="button" onClick={() => void logUse()}>Log uses</button>
        </span>
      </label>
      <label className="dm-field-label">Issue universal points ({stats.points.available} available now)
        <span className="dm-inline-control">
          <input type="number" min={1} step={1} value={points} onChange={(event) => setPoints(Number(event.currentTarget.value))} />
          <button type="button" onClick={() => void onChange((draft) => { draft.DMIssuedPoints += points })}>Issue points</button>
        </span>
      </label>
    </section>
  )
}
