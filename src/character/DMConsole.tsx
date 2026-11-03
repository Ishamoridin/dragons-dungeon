import { useEffect, useState } from 'react'
import { BellRing, CalendarClock, Flag, GanttChart, Package, Pencil, Plus, Save, Skull, Swords, Users, type LucideIcon } from 'lucide-react'
import { loadResources, resourceList, saveResource } from './Api'
import { onDataChanged, onEventNotification } from './Realtime'
import EventCard from './EventCard'
import EventComposerModal, { type EventDraft } from './EventComposerModal'
import NewSystemModal from './NewSystemModal'
import ImportSheetModal from './ImportSheetModal'
import PortraitControl from './PortraitControl'
import { portraitShellClass, portraitStyle, type Portrait } from './Portrait'
import { skinArtStyle } from '../skins'
import { getScreen, rememberScreen } from './ScreenState'
import SettingsMenu from './SettingsMenu'
import EssenceAdjustmentModal from './essence/EssenceAdjustmentModal'
import type { CampaignAction, CampaignData, CampaignEventType, NPCFactionGroup } from './Campaign'
import { actionToEffect, applyEventEffect, describeEffect, flattenSkills, type AppliedEffect, type EventEffect, type EventTargetResult } from './EventEffects'
import { fetchEventLog, recordEvent, type EventLogEntry } from './EventLogApi'
import type Person from './Person'
import { PlayerClass, PRIMARY_ATTRIBUTE_NAMES } from './PlayerClass'
import { AUGMENTATION_OPTIONS, EQUIPMENT_OPTIONS, INJURY_OPTIONS, INVENTORY_OPTIONS } from './CharacterOptions'
import { CAMPAIGN_EVENT_TEMPLATES, Campaign, type CampaignEvent } from './Campaign'
import {
  refreshCharacterSheets,
  updateCharacterSheet,
  createCharacterSheet,
  placeholderAttributes,
  placeholderGrowth,
  displayName,
  softDeleteCharacterSheet,
  listDeletedCharacterSheets,
  restoreCharacterSheet,
  syncCharacterSheetWithGoogleSheets,
  type CharacterSheetData,
  type CharacterSheetRecord,
  type SheetSource,
} from './CharacterSheetDatabase'
import TransferModal from './TransferModal'
import TimelineBoard from './TimelineBoard'
import type { User } from './User'
import PageSkinSelector from './PageSkinSelector'
import type { PageSkin } from './PageSkin'
import { DEFAULT_STAT_SYSTEM_ID, STAT_SYSTEMS, type StatSystem } from './StatSystems'
import { EssenceActions, EssenceMiniSheet, EssenceSheetBody, type TabId } from './essence/EssenceViews'
import { computeEssenceStats, damageLabel, ESSENCE_ZODIACS, RESERO_ORDER, blankEssenceCharacter, spiritWeaponLabel, toParagraphs, ZODIAC_ACTIVE_COST } from './essence/EssenceSystem'
import type { EssenceCharacterData, EssenceTechnique } from './essence/EssenceTypes'
import TechniqueModal from './essence/TechniqueModal'
import ArmourCatalogModal from './essence/ArmourCatalogModal'
import {
  deleteLibraryTechnique,
  deleteLibraryTechniquesFrom,
  listLibraryTechniques,
  newTechniqueId,
  saveLibraryTechnique,
  type LibraryTechnique,
} from './essence/TechniqueLibrary'
import {
  ARMOUR_SLOTS,
  deleteItemCatalogEntry,
  listItemCatalog,
  newItemCatalogId,
  saveItemCatalogEntry,
  type ArmourCatalogEntry,
} from './essence/EssenceItemCatalog'
import { applyEssenceChange, applySheetChange, unseenLogCount, type EssenceChange, type SheetChange } from './essence/EssenceChanges'
import '../App.css'

type DMConsoleProps = {
  user: User
  onSignOut: () => void
  skin: PageSkin
  onSkinChange: (skin: PageSkin) => void
  onUserChange: (user: User) => Promise<void>
}

const CAMPAIGN_PAGES = ['Players', 'Factions', 'NPCs', 'Techniques', 'Items', 'Events', 'Timeline'] as const
// Tabs show these icons instead of their names so all seven fit on one row; the name remains the tooltip and label.
const CAMPAIGN_PAGE_ICONS: Record<(typeof CAMPAIGN_PAGES)[number], LucideIcon> = {
  Players: Users, Factions: Flag, NPCs: Skull, Techniques: Swords, Items: Package, Events: CalendarClock, Timeline: GanttChart,
}
type CampaignPage = (typeof CAMPAIGN_PAGES)[number]

// Saved records override built-ins with the same Id, e.g. a reassigned Essence system.
const mergeSystems = (saved: StatSystem[]): StatSystem[] =>
  [...new Map([...STAT_SYSTEMS, ...saved].map((system) => [system.Id, system])).values()]

type TechniqueSource =
  | { kind: 'character'; characterId: string; index: number; label: string }
  | { kind: 'npc'; npc: Person; index: number; label: string }
  | { kind: 'library'; id: string; label: string }

type TechniqueEntry = { key: string; technique: EssenceTechnique; source: TechniqueSource }

const BLANK_TECHNIQUE: EssenceTechnique = {
  Name: '',
  MinReiryoku: '',
  MaxReiryoku: '',
  MinSkill: '',
  DC: '',
  Action: '',
  Range: '',
  Damage: '',
  Details: '',
}

const BLANK_ARMOUR_ITEM: ArmourCatalogEntry = {
  Id: '',
  Slot: ARMOUR_SLOTS[0],
  Name: '',
  Type: '',
  ArmourValue: 0,
  DodgeMod: 0,
  DefenseMod: 0,
  AthleticsMod: 0,
  MaxReiMod: 0,
  Burden: 0,
  ArmourMod: 0,
}

const formatTechniqueCost = (technique: EssenceTechnique): string => {
  const min = String(technique.MinReiryoku)
  const max = String(technique.MaxReiryoku)
  if (!min && !max) return '\u2014'
  return min === max || !max ? min : !min ? max : `${min}\u2013${max}`
}

const toCharacterSheetData = (record: CharacterSheetRecord): CharacterSheetData => ({
  Version: record.Version,
  SystemId: record.SystemId,
  Essence: record.Essence ? structuredClone(record.Essence) : undefined,
  Name: record.Name,
  Level: record.Level,
  XP: record.XP,
  CampaignName: record.CampaignName,
  Tags: [...record.Tags],
  DMId: record.DMId,
  DMName: record.DMName,
  PlayerClass: structuredClone(record.PlayerClass),
  Attributes: structuredClone(record.Attributes),
  Skills: structuredClone(record.Skills),
})

type FactionRosterCard = {
  key: string
  title: string
  subtitle: string
  detail?: string
  essence?: string
}

type FactionRosterBlessing = {
  key: string
  title: string
  subtitle: string
  detail?: string
  essence?: string
  passive: string
  active: string
  artSrc?: string
}

const splitFactionRoster = (value: string): string[] => {
  const items: string[] = []
  let current = ''
  let parenDepth = 0

  for (const ch of value) {
    if (ch === '(') {
      parenDepth += 1
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
    }

    if (ch === ',' && parenDepth === 0) {
      const trimmed = current.trim()
      if (trimmed) items.push(trimmed)
      current = ''
      continue
    }

    current += ch
  }

  const trimmed = current.trim()
  if (trimmed) items.push(trimmed)
  return items
}

const essenceClassName = (essence: string | undefined): string => {
  const wanted = (essence ?? '').trim().toLowerCase()
  if (!wanted) return 'essence-unknown'
  return `essence-${wanted.replace(/[^a-z0-9]+/g, '-')}`
}

const parseSovereigns = (value: string): FactionRosterCard[] =>
  splitFactionRoster(value).map((entry) => {
    const match = entry.match(/^(.+?)\s*\((.+)\)$/)
    const name = (match?.[1] ?? entry).trim()
    const inner = (match?.[2] ?? '').trim()
    const [domainRaw, ...extraParts] = inner.split(',').map((part) => part.trim()).filter(Boolean)
    const domain = domainRaw || undefined
    const extra = extraParts.join(', ')

    return {
      key: entry,
      title: name,
      subtitle: domain ? `Sovereign of ${domain}` : 'Sovereign',
      detail: extra || undefined,
      essence: domain,
    }
  })

const parseZodiacBearers = (value: string): FactionRosterCard[] =>
  splitFactionRoster(value).map((entry) => {
    const match = entry.match(/^(.+?)\s*\((.+)\)$/)
    const bearer = (match?.[1] ?? entry).trim()
    const inner = (match?.[2] ?? '').trim()
    const ofIndex = inner.toLowerCase().lastIndexOf(' of ')
    const animal = ofIndex >= 0 ? inner.slice(0, ofIndex).trim() : inner
    const essence = ofIndex >= 0 ? inner.slice(ofIndex + 4).trim() : undefined

    return {
      key: entry,
      title: animal || inner || bearer,
      subtitle: essence ? `Essence · ${essence}` : 'Zodiac',
      detail: `Bearer · ${bearer}`,
      essence,
    }
  })

const normalizeFactionCardKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const ZODIAC_CARD_ART: Record<string, string> = {
  rat: `${import.meta.env.BASE_URL}zodiac-cards/rat.png`,
  ox: `${import.meta.env.BASE_URL}zodiac-cards/ox.png`,
  tiger: `${import.meta.env.BASE_URL}zodiac-cards/tiger.png`,
  rabbit: `${import.meta.env.BASE_URL}zodiac-cards/rabbit.png`,
  dragon: `${import.meta.env.BASE_URL}zodiac-cards/dragon.png`,
  snake: `${import.meta.env.BASE_URL}zodiac-cards/snake.png`,
  horse: `${import.meta.env.BASE_URL}zodiac-cards/horse.png`,
  goat: `${import.meta.env.BASE_URL}zodiac-cards/goat.png`,
  monkey: `${import.meta.env.BASE_URL}zodiac-cards/monkey.png`,
  rooster: `${import.meta.env.BASE_URL}zodiac-cards/rooster.png`,
  dog: `${import.meta.env.BASE_URL}zodiac-cards/dog.png`,
  koi: `${import.meta.env.BASE_URL}zodiac-cards/koi.png`,
  weasel: `${import.meta.env.BASE_URL}zodiac-cards/weasel-ambition.svg`,
}

const SOVEREIGN_CARD_ART: Record<string, string> = {
  evil: `${import.meta.env.BASE_URL}zodiac-cards/sovereign-evil.svg`,
  doom: `${import.meta.env.BASE_URL}zodiac-cards/sovereign-doom.svg`,
  air: `${import.meta.env.BASE_URL}zodiac-cards/sovereign-air.svg`,
  earth: `${import.meta.env.BASE_URL}zodiac-cards/sovereign-earth.svg`,
}

const SOVEREIGN_POWERS: Record<string, { passive: string; active: string }> = {
  evil: {
    passive: 'Once per session, after you see the result of a Social or Manipulation roll, you may add +2.',
    active: 'For one scene, you may spend a minor action to impose Disadvantage on one enemy social roll (max 3 times).',
  },
  doom: {
    passive: 'Once per session, when you would be reduced to 0 in any bar, remain at 1 instead.',
    active: 'Mark one target: until the end of the scene, your first hit against them deals +25 and cannot be reduced below +10.',
  },
  air: {
    passive: 'Ignore difficult terrain and gain +25% move distance for one scene, once per session.',
    active: 'Create a 15ft gust: push or pull creatures/objects 1 tile, and extinguish non-magical flames in the area.',
  },
  earth: {
    passive: 'Gain +10 armour until you next rest, twice per session.',
    active: 'Raise a 10ft barrier of stone (cover) for one scene; it has 150 HP and counts as inert Reishi.',
  },
}

const describeEssenceFactionEntry = (data: EssenceCharacterData): string => {
  const { points } = computeEssenceStats(data)
  const spiritWeaponUses = data.Development.Metaphysical.spiritWeapon ?? 0
  const unlockedStages = new Set(
    data.Resero
      .filter((stage) => spiritWeaponUses >= stage.RequiredSpiritWeaponUses && points.allocated >= stage.RequiredSkillPoints)
      .map((stage) => stage.Stage),
  )
  const highestResero = [...RESERO_ORDER].reverse().find((stage) => unlockedStages.has(stage)) ?? 'Off'

  const weaponsByType = new Map<string, string[]>()
  data.SpiritWeapons.forEach((weapon) => {
    const list = weaponsByType.get(weapon.Category) ?? []
    list.push(weapon.Name)
    weaponsByType.set(weapon.Category, list)
  })
  const weaponSummary = [...weaponsByType.entries()]
    .map(([category, names]) => names.length > 0 ? `${category} (${names.join(', ')})` : category)
    .join(' · ')

  const identity = `${data.Race} · ${spiritWeaponLabel(data)}`
  const weapons = weaponSummary ? ` · Weapons: ${weaponSummary}` : ''
  return `${identity} · Resero: ${highestResero}${weapons}`
}

const getResources = (record: CharacterSheetRecord) => [
  { name: 'Mana', value: Math.round(10 * record.Attributes.Mana.value), color: 'mana' },
  {
    name: 'Stamina',
    value: Math.round(5 * record.Attributes.Dexterity.value + 3 * record.Attributes.Constitution.value + 2 * record.Attributes.Strength.value),
    color: 'stamina',
  },
  {
    name: 'Health',
    value: Math.round(4 * record.Attributes.Constitution.value + 3 * record.Attributes.Strength.value + 3 * record.Attributes.Dexterity.value),
    color: 'health',
  },
]

const formatValue = (value: number): string => value.toFixed(1).replace(/\.0$/, '')

function MiniSheet({ record, onEssenceEdit }: { record: CharacterSheetRecord; onEssenceEdit?: (mutate: (draft: EssenceCharacterData) => void) => Promise<void> }) {
  if (record.Essence) {
    return <EssenceMiniSheet data={record.Essence} name={displayName(record)} onEdit={onEssenceEdit} />
  }

  const topSkills = flattenSkills(record.Skills)
    .sort((left, right) => right.Value - left.Value)
    .slice(0, 4)

  return (
    <section className="mini-sheet" aria-label={`${record.Name} summary`}>
      <div className="mini-sheet-resources">
        {getResources(record).map((resource) => (
          <div className={`resource-row ${resource.color}`} key={resource.name}>
            <div className="resource-label"><span>{resource.name}</span><strong>{resource.value}</strong></div>
            <div className="resource-track" role="progressbar" aria-label={resource.name} aria-valuemin={0} aria-valuemax={resource.value} aria-valuenow={resource.value}>
              <span className="resource-fill" />
            </div>
          </div>
        ))}
      </div>
      <div className="mini-sheet-attributes">
        {Object.entries(record.Attributes).map(([name, attribute]) => (
          <div key={name}><span>{name.slice(0, 3)}</span><strong>{formatValue(attribute.value)}</strong></div>
        ))}
      </div>
      <div className="mini-sheet-skills">
        {topSkills.map((skill) => (
          <div key={skill.Name}>
            <span>{skill.Name}</span>
            <strong>{skill.Value}</strong>
            <div className="skill-progress-track" role="progressbar" aria-label={`${skill.Name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={skill.Progress}>
              <span style={{ width: `${skill.Progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const localDateTime = (date: Date): string => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

function PlayerSheetView({
  record,
  onBack,
  skin,
  onSkinChange,
  onEssenceChange,
  onEssenceEdit,
  onEssenceAmount,
  onPortraitChange,
}: {
  record: CharacterSheetRecord
  onBack: () => void
  skin: PageSkin
  onSkinChange: (skin: PageSkin) => void
  onEssenceChange?: (change: SheetChange) => Promise<void>
  onEssenceEdit?: (mutate: (draft: EssenceCharacterData) => void) => Promise<void>
  onEssenceAmount?: (change: EssenceChange) => Promise<void>
  onPortraitChange?: (portrait: Portrait | null) => Promise<void>
}) {
  const attributeEntries = Object.entries(record.Attributes)
  const resources = getResources(record)
  const shellStyle = { ...skinArtStyle(skin), ...portraitStyle(record.Portrait) }

  if (record.Essence) {
    return (
      <div className={portraitShellClass('sheet-shell player-preview-shell', record.Portrait)} data-skin={skin} style={shellStyle}>
        <header className="sheet-topbar">
          <div>
            <p className="eyebrow">{record.CampaignName} · Essence · Player sheet</p>
            <h1>{record.Name}</h1>
          </div>
          <div className="topbar-actions">
            <PageSkinSelector value={skin} onChange={onSkinChange} />
            <div className="summary-pill"><span>{record.Essence.Race}</span><span>{spiritWeaponLabel(record.Essence)}</span></div>
            <button type="button" className="sign-out-button" onClick={onBack}>Back to campaign desk</button>
          </div>
        </header>
        <EssenceSheetBody data={record.Essence} role="dm" initialTab={getScreen<TabId>('dmSheetTab')} onTabChange={(dmSheetTab) => rememberScreen({ dmSheetTab })} onChange={onEssenceChange ? (change) => void onEssenceChange(change) : undefined} onEditData={onEssenceEdit ? (mutate) => void onEssenceEdit(mutate) : undefined} onEssenceChange={onEssenceAmount ? (change) => void onEssenceAmount(change) : undefined} portrait={record.Portrait} onPortraitChange={onPortraitChange ? (portrait) => void onPortraitChange(portrait) : undefined} />
      </div>
    )
  }

  return (
    <div className={portraitShellClass('sheet-shell player-preview-shell', record.Portrait)} data-skin={skin} style={shellStyle}>
      <header className="sheet-topbar">
        <div>
          <p className="eyebrow">{record.CampaignName} · Player sheet</p>
          <h1>{record.Name}</h1>
        </div>
        <div className="topbar-actions">
          <PageSkinSelector value={skin} onChange={onSkinChange} />
          <div className="summary-pill">
            <span>Level {record.Level}</span>
            <span>{record.PlayerClass.Name}</span>
          </div>
          <button type="button" className="sign-out-button" onClick={onBack}>Back to campaign desk</button>
        </div>
      </header>

      <div className="player-preview-meta">
        <span>{record.XP} XP</span>
        {record.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}
      </div>

      <main className="sheet-grid">
        <section className="identity-panel">
          <PortraitControl portrait={record.Portrait} name={record.Name} onChange={onPortraitChange ? (portrait) => void onPortraitChange(portrait) : undefined} />
          <h2>Resources</h2>
          <div className="resource-bars">
            {resources.map((resource) => (
              <div className={`resource-row ${resource.color}`} key={resource.name}>
                <div className="resource-label">
                  <span>{resource.name}</span>
                  <strong>{resource.value} / {resource.value}</strong>
                </div>
                <div className="resource-track" role="progressbar" aria-label={resource.name} aria-valuemin={0} aria-valuemax={resource.value} aria-valuenow={resource.value}>
                  <span className="resource-fill" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="attribute-panel">
          <div className="panel-header"><h2>Attributes</h2></div>
          <div className="attribute-grid">
            {attributeEntries.map(([name, attribute]) => (
              <article className="attribute-card preview-attribute" key={name}>
                <div className="attribute-head"><strong>{name}</strong></div>
                <div className="attribute-score-row"><span className="score-value">{attribute.value.toFixed(1).replace(/\.0$/, '')}</span></div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <section className="skills-panel">
        <div className="skills-header"><div><p className="eyebrow">Character abilities</p><h2>Skills <span>{record.Skills.length}</span></h2></div></div>
        <div className="preview-skill-list">
          {flattenSkills(record.Skills).map((skill) => (
            <div className="preview-skill-row" key={skill.Name}>
              <strong>{skill.Name}</strong>
              <span>{skill.Value} / 100</span>
              <span>{skill.Progress}% progress</span>
              <span>Tier {skill.tier}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function DeleteCharacterControl({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return confirming ? (
    <div className="delete-character" role="group" aria-label="Confirm delete">
      <p>Delete {name}? They are tagged (Deleted) and hidden everywhere; their techniques stay in the Techniques tab.</p>
      <span>
        <button type="button" className="dev-log-delete" onClick={onDelete}>Confirm delete</button>
        <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
      </span>
    </div>
  ) : (
    <button type="button" className="dev-log-delete" onClick={() => setConfirming(true)}>Delete character</button>
  )
}

// Shows where a linked character came from and lets the DM pull the workbook on demand.
function SheetSyncControl({ source, onSync }: { source: SheetSource; onSync?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const synced = new Date(source.SyncedAt)
  return (
    <div className="sheet-sync-control">
      <small>
        Linked to <a href={source.Url} target="_blank" rel="noreferrer">Google Sheet{source.Title ? `: ${source.Title}` : ''}</a>
        {' · '}synced {Number.isNaN(synced.getTime()) ? 'never' : synced.toLocaleString()}
        {source.LastError ? ` · last error: ${source.LastError}` : ''}
      </small>
      {onSync && (
        <button type="button" className="dm-secondary-action" disabled={busy} onClick={() => {
          setBusy(true); setMessage('')
          onSync().then(() => setMessage('Synced with the sheet.')).catch((failure) => setMessage(failure instanceof Error ? failure.message : 'Sync failed.')).finally(() => setBusy(false))
        }}>{busy ? 'Syncing...' : 'Sync with Google Sheet'}</button>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  )
}

// Renames the character in the app by editing its alias; the sheet's own name is untouched and returns when the alias is cleared.
function EditableName({ record, onSave }: { record: CharacterSheetRecord; onSave: (alias: string | undefined) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = displayName(record)
  if (!editing) {
    return (
      <div className="dm-modal-title-row">
        <h2 id="character-modal-title">{name}</h2>
        <button type="button" className="rename-button" title="Rename" aria-label="Rename character" onClick={() => { setText(name); setError(''); setEditing(true) }}><Pencil size={15} /></button>
      </div>
    )
  }
  const trimmed = text.trim()
  const dirty = trimmed !== name
  return (
    <form className="rename-form" onSubmit={(event) => {
      event.preventDefault()
      if (!dirty) { setEditing(false); return }
      setBusy(true)
      setError('')
      onSave(trimmed && trimmed !== record.Name ? trimmed : undefined)
        .then(() => setEditing(false))
        .catch((failure) => setError(failure instanceof Error ? failure.message : 'Unable to rename this character.'))
        .finally(() => setBusy(false))
    }}>
      <div className="dm-modal-title-row">
        <input
          id="character-modal-title"
          type="text"
          autoFocus
          maxLength={100}
          aria-label="Character name"
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false) }}
        />
        <button type="submit" className="rename-button" disabled={busy || !dirty} title="Save name" aria-label="Save name"><Save size={15} /></button>
        <button type="button" className="rename-cancel" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
      <small>{record.SheetSource ? `Leave blank to use the sheet name: ${record.Name}` : `Leave blank to use the original name: ${record.Name}`}</small>
      {error && <small role="alert">{error}</small>}
    </form>
  )
}

function CharacterActionModal({
  record,
  campaign,
  onClose,
  onApply,
  onOpenSheet,
  onComposeEvent,
  onApplyEssence,
  onDelete,
  onSyncSheet,
  onTransfer,
}: {
  record: CharacterSheetRecord
  campaign: Campaign
  onClose: () => void
  onApply: (action: CampaignAction) => Promise<void>
  onApplyEssence: (mutate: (draft: EssenceCharacterData) => void) => Promise<void>
  onDelete: () => void
  onOpenSheet: () => void
  onSyncSheet?: () => Promise<void>
  onTransfer?: () => void
  onComposeEvent: () => void
}) {
  const allSkills = flattenSkills(record.Skills)
  const [xpAmount, setXpAmount] = useState(100)
  const [skillName, setSkillName] = useState(allSkills[0]?.Name ?? '')
  const [progressAmount, setProgressAmount] = useState(10)
  const [essenceAdjustmentOpen, setEssenceAdjustmentOpen] = useState(false)
  const characterEvents = campaign.scheduledEvents.filter((event) => event.targets(campaign.CharacterIds).includes(record.Id))
  const scheduleBlock = (
    <section className="dm-action-block schedule-block">
      <div className="schedule-title-row">
        <div><h3>Events</h3><p>Campaign time: {campaign.currentTime.toLocaleString()}</p></div>
        <button type="button" className="dm-secondary-action" onClick={onComposeEvent}>Compose event</button>
      </div>
      {characterEvents.map((event) => (
        <div className="scheduled-event-row" key={event.Id}>
          <span>{event.Title}</span>
          <span>{event.ScheduledAt.toLocaleString()}</span>
          <span className={event.Completed ? 'event-complete' : 'event-pending'}>{event.Completed ? 'Applied' : 'Scheduled'}</span>
        </div>
      ))}
    </section>
  )

  if (record.Essence) {
    return (
      <div className="dm-modal-backdrop" onClick={onClose}>
        <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="character-modal-title" onClick={(event) => event.stopPropagation()}>
          <header className="dm-modal-header">
            <div>
              <p className="eyebrow">{record.CampaignName} · Essence · {record.Essence.Race} · {spiritWeaponLabel(record.Essence)}</p>
              <EditableName record={record} onSave={(alias) => onApplyEssence((draft) => { draft.Alias = alias })} />
              <div className="character-tags">{record.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}</div>
            </div>
            <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
          </header>
          <MiniSheet record={record} onEssenceEdit={onApplyEssence} />
          <div className="dm-action-grid">
            <div className="essence-summary-actions">
              <EssenceActions data={record.Essence} onChange={onApplyEssence} />
              <button type="button" className="dm-secondary-action" onClick={() => setEssenceAdjustmentOpen(true)}>Add or Remove Essence</button>
            </div>
            <section className="dm-action-block">
              <h3>Player sheet</h3>
              <button type="button" className="dm-secondary-action" onClick={onOpenSheet}>Open Player sheet</button>
              {onTransfer && <button type="button" className="dm-secondary-action" onClick={onTransfer}>Transfer</button>}
              {record.SheetSource && <SheetSyncControl source={record.SheetSource} onSync={onSyncSheet} />}
              <DeleteCharacterControl name={displayName(record)} onDelete={onDelete} />
            </section>
            {scheduleBlock}
          </div>
          {essenceAdjustmentOpen && <EssenceAdjustmentModal data={record.Essence} onClose={() => setEssenceAdjustmentOpen(false)} onSave={(change) => onApplyEssence((draft) => applyEssenceChange(draft, change, { name: record.DMName, role: 'dm' }))} />}
        </section>
      </div>
    )
  }

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="character-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{record.CampaignName} · Level {record.Level} · {record.XP} XP</p>
            <h2 id="character-modal-title">{record.Name}</h2>
            <div className="character-tags">{record.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}</div>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>

        <MiniSheet record={record} />
        {record.SheetSource && <SheetSyncControl source={record.SheetSource} onSync={onSyncSheet} />}
        {onTransfer && <div className="dm-action-block"><button type="button" className="dm-secondary-action" onClick={onTransfer}>Transfer</button></div>}

        <div className="dm-action-grid">
          <section className="dm-action-block">
            <h3>Character actions</h3>
            <label className="dm-field-label">Add XP
              <span className="dm-inline-control">
                <input type="number" min={1} step={1} value={xpAmount} onChange={(event) => setXpAmount(Number(event.currentTarget.value))} />
                <button type="button" onClick={() => void onApply({ type: 'add-xp', characterId: record.Id, amount: xpAmount })}>Add XP</button>
              </span>
            </label>
            <label className="dm-field-label">Add progress to skill
              <span className="dm-inline-control">
                <select value={skillName} onChange={(event) => setSkillName(event.currentTarget.value)}>
                  {allSkills.map((skill) => <option key={skill.Name} value={skill.Name}>{skill.Name}</option>)}
                </select>
                <input type="number" min={0.1} max={100} step={0.1} value={progressAmount} onChange={(event) => setProgressAmount(Number(event.currentTarget.value))} />
                <button type="button" disabled={!skillName} onClick={() => void onApply({ type: 'add-skill-progress', characterId: record.Id, skillNames: [skillName], amount: progressAmount })}>Add progress</button>
              </span>
            </label>
            <button type="button" className="dm-primary-action" onClick={() => void onApply({ type: 'level-up', characterId: record.Id })}>Level up character</button>
            <label className="dm-field-label">Level up skill
              <span className="dm-inline-control">
                <select value={skillName} onChange={(event) => setSkillName(event.currentTarget.value)}>
                  {allSkills.map((skill) => <option key={skill.Name} value={skill.Name}>{skill.Name}</option>)}
                </select>
                <button type="button" disabled={!skillName} onClick={() => void onApply({ type: 'level-up-skill', characterId: record.Id, skillName })}>Level up skill</button>
              </span>
            </label>
            <button type="button" className="dm-secondary-action" onClick={onOpenSheet}>Open Player sheet</button>
            <DeleteCharacterControl name={record.Name} onDelete={onDelete} />
          </section>

          {scheduleBlock}
        </div>
      </section>
    </div>
  )
}

const NPC_ATTRIBUTES = ['Strength', 'Dexterity', 'Constitution', 'Mental', 'Social', 'Mana'] as const

function DeletedCharactersModal({
  records,
  onRestore,
  onClose,
}: {
  records: CharacterSheetRecord[]
  onRestore: (record: CharacterSheetRecord) => void
  onClose: () => void
}) {
  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="deleted-characters-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">Hidden from the site</p>
            <h2 id="deleted-characters-title">Deleted characters</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        {records.length === 0 && <p className="campaign-empty-message">No deleted characters.</p>}
        <div className="dev-log-list">
          {records.map((record) => (
            <article className="dev-log-entry" key={record.Id}>
              <div className="dev-log-head">
                <strong>{record.Name}</strong>
                <span>{record.CampaignName}</span>
                <button type="button" className="essence-inline-button" onClick={() => onRestore(record)}>Restore</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function DevelopmentLogModal({
  record,
  seenBefore,
  onClose,
  onDelete,
}: {
  record: CharacterSheetRecord
  seenBefore?: string
  onClose: () => void
  onDelete: (entryId: string) => void
}) {
  const entries = [...(record.Essence?.DevelopmentLog ?? [])].reverse()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="dev-log-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">Development log</p>
            <h2 id="dev-log-title">{displayName(record)}</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        {entries.length === 0 && <p className="campaign-empty-message">No development has been logged.</p>}
        <div className="dev-log-list">
          {entries.map((entry) => {
            const isNew = !seenBefore || entry.Timestamp > seenBefore
            return (
              <article className={`dev-log-entry${isNew ? ' is-new' : ''}`} key={entry.Id}>
                <div className="dev-log-head">
                  <strong>{entry.Target}</strong>
                  <span>{entry.Kind === 'uses' ? `+${entry.Amount} development uses` : entry.Kind === 'points' ? `${entry.Amount} Universal Skill Points spent` : entry.Kind === 'essence' ? `${entry.Amount > 0 ? 'Added' : 'Removed'} ${Math.abs(entry.Amount)} essence` : `Development: ${entry.AsNeeded ? 'as much as needed (X)' : `${entry.Amount} spent`}`}</span>
                  {isNew && <span className="dev-log-new">New</span>}
                  {confirmingId === entry.Id ? (
                    <span className="dev-log-confirm">
                      <button type="button" className="dev-log-delete" onClick={() => { setConfirmingId(null); onDelete(entry.Id) }}>Confirm delete</button>
                      <button type="button" onClick={() => setConfirmingId(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="dev-log-delete"
                      aria-label={`Delete log entry: ${entry.Target}`}
                      onClick={() => setConfirmingId(entry.Id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p>{entry.Purpose || (entry.Kind === 'development' ? 'No description.' : '')}</p>
                <small>{entry.Kind === 'development' ? 'development request' : `${entry.Category} · ${entry.Before} → ${entry.After}`} · {entry.Actor} · {new Date(entry.Timestamp).toLocaleString()}</small>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

type ItemBase = { Id: string; Name: string; description: string }
type NpcItemList = 'Inventory' | 'Equipment' | 'Injury' | 'Augmentation'

const NPC_ITEM_LISTS: { key: NpcItemList; label: string; options: ItemBase[] }[] = [
  { key: 'Inventory', label: 'Inventory', options: INVENTORY_OPTIONS },
  { key: 'Equipment', label: 'Equipment', options: EQUIPMENT_OPTIONS },
  { key: 'Injury', label: 'Injuries', options: INJURY_OPTIONS },
  { key: 'Augmentation', label: 'Augmentations', options: AUGMENTATION_OPTIONS },
]

function NpcItemEditor({
  npc,
  listKey,
  label,
  options,
  onChange,
}: {
  npc: Person
  listKey: NpcItemList
  label: string
  options: ItemBase[]
  onChange: () => void
}) {
  const [choice, setChoice] = useState('')
  const items = npc[listKey] as unknown as ItemBase[]
  const available = options.filter((option) => !items.some((item) => item.Id === option.Id))
  const selected = available.find((option) => option.Id === choice) ?? available[0]

  return (
    <fieldset className="npc-item-editor">
      <legend>{label}</legend>
      {items.length === 0 && <small>None.</small>}
      {items.map((item, index) => (
        <div className="npc-item-row" key={item.Id}>
          <input
            aria-label={`${label} ${index + 1} name`}
            value={item.Name}
            onChange={(event) => {
              const value = event.currentTarget.value
              item.Name = value
              onChange()
            }}
          />
          <input
            aria-label={`${label} ${index + 1} description`}
            value={item.description}
            onChange={(event) => {
              const value = event.currentTarget.value
              item.description = value
              onChange()
            }}
          />
          <button type="button" onClick={() => { items.splice(index, 1); onChange() }}>Remove</button>
        </div>
      ))}
      {selected && (
        <div className="npc-item-row">
          <select aria-label={`Add ${label}`} value={selected.Id} onChange={(event) => setChoice(event.currentTarget.value)}>
            {available.map((option) => <option key={option.Id} value={option.Id}>{option.Name}</option>)}
          </select>
          <button type="button" onClick={() => { items.push(structuredClone(selected)); setChoice(''); onChange() }}>Add</button>
        </div>
      )}
    </fieldset>
  )
}

// Every NPC field is edited in place; onChange re-renders the console so faction cards pick the edit up.
function NpcSheetModal({
  npc,
  onClose,
  onChange,
  hideProgression,
}: {
  npc: Person
  onClose: () => void
  onChange: () => void
  hideProgression?: boolean
}) {
  const [tagsText, setTagsText] = useState(npc.Tags.join(', '))

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="npc-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">NPC · {npc.CampaignName}</p>
            <h2 id="npc-modal-title">{npc.Name}</h2>
            <div className="character-tags">{npc.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}</div>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>

        <div className="npc-fields">
          <label className="dm-field-label">Name
            <input value={npc.Name} onChange={(event) => { const value = event.currentTarget.value; npc.Name = value; onChange() }} />
          </label>
          <label className="dm-field-label">Tags (comma separated)
            <input
              value={tagsText}
              onChange={(event) => {
                const value = event.currentTarget.value
                setTagsText(value)
                npc.Tags = value.split(',').map((tag) => tag.trim()).filter(Boolean)
                onChange()
              }}
            />
          </label>
          {!hideProgression && (
            <>
              <label className="dm-field-label">Class
                <input
                  value={npc.PlayerClass.Name}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    npc.PlayerClass = new PlayerClass(value, { ...npc.PlayerClass.AttributeGrowth })
                    onChange()
                  }}
                />
              </label>
              <label className="dm-field-label">Level
                <input type="number" min={0} step={1} value={npc.Level} onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (!Number.isNaN(value)) { npc.Level = value; onChange() } }} />
              </label>
              <label className="dm-field-label">XP
                <input type="number" min={0} step={1} value={npc.XP} onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (!Number.isNaN(value)) { npc.XP = value; onChange() } }} />
              </label>
            </>
          )}
        </div>

        {!hideProgression && (
          <div className="npc-attribute-editor">
            {NPC_ATTRIBUTES.map((name) => (
              <fieldset key={name}>
                <legend>{name} <strong>{formatValue(npc[name].value)}</strong></legend>
                {(npc[name].subAttributes ?? []).map((leaf, index) => (
                  <input
                    key={index}
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    aria-label={`${name} sub-attribute ${index + 1}`}
                    value={leaf.value}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber
                      if (!Number.isNaN(value)) {
                        npc.ModifySubAttribute(npc[name], index, value - leaf.value)
                        onChange()
                      }
                    }}
                  />
                ))}
              </fieldset>
            ))}
          </div>
        )}

        <div className="npc-item-lists">
          {NPC_ITEM_LISTS.map((list) => (
            <NpcItemEditor key={list.key} npc={npc} listKey={list.key} label={list.label} options={list.options} onChange={onChange} />
          ))}
        </div>
      </section>
    </div>
  )
}

function FactionModal({
  group,
  roster,
  onClose,
  onOpenPlayer,
  onOpenNpc,
}: {
  group: NPCFactionGroup
  roster: CharacterSheetRecord[]
  onClose: () => void
  onOpenPlayer: (id: string) => void
  onOpenNpc: (npc: Person) => void
}) {
  const [selectedBlessing, setSelectedBlessing] = useState<FactionRosterBlessing | null>(null)
  const players = roster.filter((record) => group.PlayerNames.includes(record.Name))
  const sovereignsValue = group.Attributes.find((attribute) => attribute.Name === 'Sovereigns')?.Value ?? ''
  const zodiacValue = group.Attributes.find((attribute) => attribute.Name === 'The Zodiac')?.Value ?? ''
  const sovereigns = sovereignsValue ? parseSovereigns(sovereignsValue) : []
  const zodiacs = zodiacValue ? parseZodiacBearers(zodiacValue) : []
  const summaryAttributes = group.Attributes.filter((attribute) => !['Sovereigns', 'The Zodiac'].includes(attribute.Name))

  const openZodiacBlessing = (card: FactionRosterCard) => {
    const wanted = normalizeFactionCardKey(card.title)
    const zodiac = ESSENCE_ZODIACS.find((entry) => normalizeFactionCardKey(entry.Name) === wanted)
    if (!zodiac) return

    setSelectedBlessing({
      key: card.key,
      title: zodiac.Name,
      subtitle: `Essence · ${zodiac.Essence}`,
      detail: card.detail,
      essence: zodiac.Essence,
      passive: zodiac.Passive,
      active: zodiac.Active,
      artSrc: ZODIAC_CARD_ART[wanted],
    })
  }

  const openSovereignBlessing = (card: FactionRosterCard) => {
    const domainKey = normalizeFactionCardKey(card.essence ?? '')
    const powers = SOVEREIGN_POWERS[domainKey]
    if (!powers) return

    setSelectedBlessing({
      key: card.key,
      title: card.title,
      subtitle: card.subtitle,
      detail: card.detail,
      essence: card.essence,
      passive: powers.passive,
      active: powers.active,
      artSrc: SOVEREIGN_CARD_ART[domainKey],
    })
  }

  const closeBlessing = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.()
    setSelectedBlessing(null)
  }

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal" role="dialog" aria-modal="true" aria-labelledby="faction-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">Faction</p>
            <h2 id="faction-modal-title">{group.Faction}</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        <p className="faction-description">{group.Description}</p>
        <div className="mini-sheet-attributes faction-attributes">
          {summaryAttributes.map((attribute) => <div key={attribute.Name}><span>{attribute.Name}</span><strong>{attribute.Value}</strong></div>)}
          <div><span>Members</span><strong>{group.NPCs.length + players.length}</strong></div>
        </div>

        {(sovereigns.length > 0 || zodiacs.length > 0) && (
          <div className="faction-roster">
            {sovereigns.length > 0 && (
              <section className="faction-roster-section" aria-label="Sovereigns">
                <h3 className="faction-roster-title">Sovereigns</h3>
                <div className="faction-roster-grid">
                  {sovereigns.map((card) => (
                    <button
                      key={card.key}
                      type="button"
                      className={`faction-roster-card sovereign-card has-art ${essenceClassName(card.essence)}`}
                      aria-label={`${card.title} ${card.subtitle}`}
                      onClick={() => openSovereignBlessing(card)}
                    >
                      {card.essence && SOVEREIGN_CARD_ART[normalizeFactionCardKey(card.essence)] && (
                        <img
                          className="faction-roster-card-art"
                          src={SOVEREIGN_CARD_ART[normalizeFactionCardKey(card.essence)]}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                        />
                      )}
                      <div className="faction-roster-card-overlay">
                        <div className="faction-roster-card-head">
                          <strong className="faction-roster-card-title">{card.title}</strong>
                          <span className="faction-roster-card-sigil" aria-hidden="true">{card.essence?.slice(0, 1).toUpperCase() ?? 'S'}</span>
                        </div>
                        <div className="faction-roster-card-sub">{card.subtitle}</div>
                        {card.detail && <div className="faction-roster-card-meta">{card.detail}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {zodiacs.length > 0 && (
              <section className="faction-roster-section" aria-label="The Zodiac">
                <h3 className="faction-roster-title">The Zodiac</h3>
                <div className="faction-roster-grid zodiac-grid">
                  {zodiacs.map((card) => {
                    const artSrc = ZODIAC_CARD_ART[normalizeFactionCardKey(card.title)]
                    return (
                      <button
                        key={card.key}
                        type="button"
                        className={`faction-roster-card zodiac-card has-art ${essenceClassName(card.essence)}`}
                        aria-label={`${card.title} ${card.subtitle}`}
                        onClick={() => openZodiacBlessing(card)}
                      >
                        {artSrc && (
                          <span className={`zodiac-token zodiac-token-${normalizeFactionCardKey(card.title)}`}>
                            <img
                              src={artSrc}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                            />
                          </span>
                        )}
                        <div className="faction-roster-card-overlay">
                          <div className="faction-roster-card-head">
                            <strong className="faction-roster-card-title">{card.title.toUpperCase()}</strong>
                            <span className="faction-roster-card-sigil" aria-hidden="true">{card.title.slice(0, 1).toUpperCase()}</span>
                          </div>
                          <div className="faction-roster-card-sub">{card.subtitle}</div>
                          {card.detail && <div className="faction-roster-card-meta">{card.detail}</div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
        <div className="dm-action-grid">
          <section className="dm-action-block">
            <h3>Player characters</h3>
            {players.length === 0 && <p className="campaign-empty-message">No player characters.</p>}
            {players.map((record) => (
              <button type="button" className="faction-member" key={record.Id} onClick={() => onOpenPlayer(record.Id)}>
                <strong>{displayName(record)}</strong>
                <span>{record.Essence ? describeEssenceFactionEntry(record.Essence) : 'Open Player sheet'}</span>
              </button>
            ))}
          </section>
          <section className="dm-action-block">
            <h3>NPCs</h3>
            {group.NPCs.length === 0 && <p className="campaign-empty-message">No NPCs.</p>}
            {group.NPCs.map((npc) => (
              <button type="button" className="faction-member" key={npc.Name} onClick={() => onOpenNpc(npc)}>
                <strong>{npc.Name}</strong><span>Open NPC sheet</span>
              </button>
            ))}
          </section>
        </div>
      </section>
      {selectedBlessing && (
        <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={closeBlessing}>
          <section
            className={`dm-character-modal zodiac-power-modal ${essenceClassName(selectedBlessing.essence)}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zodiac-power-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="dm-modal-header">
              <div>
                <p className="eyebrow">{selectedBlessing.subtitle}</p>
                <h2 id="zodiac-power-title">{selectedBlessing.title}</h2>
                {selectedBlessing.detail && <p className="zodiac-power-meta">{selectedBlessing.detail}</p>}
              </div>
              <button type="button" className="modal-toggle" onClick={closeBlessing}>Close</button>
            </header>

            <div className="zodiac-power-body">
              <aside className="zodiac-power-side">
                {selectedBlessing.artSrc && (
                  <div className={`zodiac-power-art${selectedBlessing.artSrc.includes('/sovereign-') ? '' : ' zodiac-power-token'}`}>
                    {selectedBlessing.artSrc.includes('/sovereign-')
                      ? <img src={selectedBlessing.artSrc} alt="" aria-hidden="true" />
                      : <span className={`zodiac-token zodiac-token-${selectedBlessing.artSrc.split('/').pop()?.split('.')[0].replace('-ambition', '')}`}>
                          <img src={selectedBlessing.artSrc} alt="" aria-hidden="true" />
                        </span>}
                  </div>
                )}
                <section className="zodiac-power-block">
                  <h3>Active (1/session)</h3>
                  <p className="zodiac-power-cost">Cost: {ZODIAC_ACTIVE_COST.willpower} Willpower · {ZODIAC_ACTIVE_COST.action}</p>
                  {toParagraphs(selectedBlessing.active).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </section>
              </aside>
              <section className="zodiac-power-block zodiac-power-passive">
                <h3>Passive (no cost)</h3>
                {toParagraphs(selectedBlessing.passive).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default function DMConsole({ user, onSignOut, skin, onSkinChange, onUserChange }: DMConsoleProps) {
  const [characters, setCharacters] = useState<CharacterSheetRecord[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [systems, setSystems] = useState<StatSystem[]>(() => mergeSystems(resourceList<StatSystem>('systems')))
  const [newSystemOpen, setNewSystemOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [transferTarget, setTransferTarget] = useState<CharacterSheetRecord | null>(null)
  // Start where this session left off; loadCharacters() drops any remembered value that no longer exists.
  const [selectedSystemId, setSelectedSystemId] = useState(getScreen<string>('dmSystemId') ?? DEFAULT_STAT_SYSTEM_ID)
  const [selectedCampaignName, setSelectedCampaignName] = useState(getScreen<string>('dmCampaign') ?? '')
  const [campaignPage, setCampaignPage] = useState<CampaignPage>(() => { const page = getScreen<string>('dmPage'); return CAMPAIGN_PAGES.includes(page as CampaignPage) ? (page as CampaignPage) : 'Players' })
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(getScreen<string>('dmCharacterId') ?? null)
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(getScreen<string>('dmPreviewId') ?? null)
  const [composer, setComposer] = useState<{ targetIds?: string[]; type?: CampaignEventType } | null>(null)
  const [eventLogEntries, setEventLogEntries] = useState<EventLogEntry[]>([])
  const [openLogEntry, setOpenLogEntry] = useState<EventLogEntry | null>(null)
  const [selectedFactionName, setSelectedFactionName] = useState<string | null>(null)
  const [selectedNpc, setSelectedNpc] = useState<Person | null>(null)
  const [, setNpcRevision] = useState(0)
  const [openLog, setOpenLog] = useState<{ id: string; seenBefore?: string } | null>(null)
  const [deletedList, setDeletedList] = useState<CharacterSheetRecord[] | null>(null)
  const [techniqueLibrary, setTechniqueLibrary] = useState<LibraryTechnique[]>(() => listLibraryTechniques(user.Id))
  const [openTechnique, setOpenTechnique] = useState<{ key: string; source: TechniqueSource | null; technique: EssenceTechnique } | null>(null)
  const [itemCatalog, setItemCatalog] = useState<ArmourCatalogEntry[]>(() => listItemCatalog())
  const [openItem, setOpenItem] = useState<{ key: string; isNew: boolean; entry: ArmourCatalogEntry } | null>(null)
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('Loading campaign records')
  const [error, setError] = useState('')

  const loadCharacters = async () => {
    try {
      const rows = await refreshCharacterSheets(user)
      setCharacters(rows)
      const availableSystems = mergeSystems(resourceList<StatSystem>('systems'))
      setSystems(availableSystems)
      setSelectedSystemId((selected) => availableSystems.some((system) => !system.Hidden && system.Id === selected) ? selected : DEFAULT_STAT_SYSTEM_ID)
      // Campaigns a stat system defines stay listed even when every character in them has been deleted.
      const names = [...new Set([...availableSystems.flatMap((system) => system.CampaignNames), ...rows.map((row) => row.CampaignName)])]
      setSelectedCampaignName((selected) => names.includes(selected) ? selected : names[0] ?? '')
      // The clock and schedule live in the campaigns resource; every change saves there, so it is the source of truth.
      const stored = resourceList<CampaignData>('campaigns')
      setCampaigns((existing) => names.map((name) => {
        const current = existing.find((campaign) => campaign.Name === name)
        const saved = stored.find((data) => data.Name === name)
        const campaign = saved ? Campaign.fromData(saved, name) : current?.clone() ?? new Campaign(name)
        if (saved && current) { campaign.NPCs = current.NPCs; campaign.Monsters = current.Monsters }
        campaign.CharacterIds = rows.filter((row) => row.CampaignName === name).map((row) => row.Id)
        return campaign
      }))
      setStatus(`${rows.length} characters · ${new Date().toLocaleTimeString()}`)
      setError('')
    } catch {
      setStatus('Refresh failed')
      setError('Unable to load campaign records.')
    }
  }

  useEffect(() => {
    void loadCharacters()
    const restored = () => { void loadCharacters() }
    window.addEventListener('data-restored', restored)
    // Live updates: resource changes reload the resource cache first so systems and campaigns stay current.
    const stopLive = onDataChanged((changes) => {
      const resources = changes.some((change) => change.kind !== 'characters')
      void (resources ? loadResources('dm').catch(() => undefined) : Promise.resolve()).then(() => loadCharacters())
    })
    return () => { stopLive(); window.removeEventListener('data-restored', restored) }
  }, [user.Id])

  // Remember the open screen on the session so a reload returns to the same page, campaign, and character.
  useEffect(() => {
    rememberScreen({ dmSystemId: selectedSystemId, dmCampaign: selectedCampaignName, dmPage: campaignPage, dmCharacterId: selectedCharacterId, dmPreviewId: previewCharacterId })
  }, [selectedSystemId, selectedCampaignName, campaignPage, selectedCharacterId, previewCharacterId])

  // Removing the tag brings the character back, so the techniques kept for them are dropped to avoid listing twice.
  const restoreCharacter = async (record: CharacterSheetRecord) => {
    const restored = await restoreCharacterSheet(record.Id, user)
    if (!restored) {
      setError('Unable to restore this character.')
      return
    }

    setTechniqueLibrary(deleteLibraryTechniquesFrom(user.Id, record.Id))
    setDeletedList(await listDeletedCharacterSheets(user))
    setError('')
    void loadCharacters()
  }

  // The tag hides the character everywhere; their techniques are copied to the library so they stay listed.
  const deleteCharacter = async (record: CharacterSheetRecord) => {
    const removed = await softDeleteCharacterSheet(record.Id, user)
    if (!removed) {
      setError('Unable to delete this character.')
      return
    }

    if (record.Essence) {
      let library = techniqueLibrary
      for (const technique of record.Essence.Techniques) {
        library = saveLibraryTechnique(user.Id, { ...structuredClone(technique), Id: newTechniqueId(), Origin: `${displayName(record)} (deleted)`, OriginId: record.Id })
      }
      setTechniqueLibrary(library)
    }

    setCharacters((rows) => rows.filter((row) => row.Id !== record.Id))
    setSelectedCharacterId(null)
    setPreviewCharacterId(null)
    setOpenLog(null)
    setError('')
    void loadCharacters()
  }

  // Applies effects to one sheet and saves it; returns the applied summaries, or an error if the sheet rejected them.
  const applyEffects = async (characterId: string, effects: EventEffect[]): Promise<{ saved: CharacterSheetRecord | null; applied: AppliedEffect[]; error?: string }> => {
    const current = characters.find((record) => record.Id === characterId)
    if (!current) return { saved: null, applied: [], error: 'Character sheet not found.' }

    const draft = toCharacterSheetData(current)
    const applied: AppliedEffect[] = []
    try {
      for (const effect of effects) {
        applyEventEffect(draft, effect, { name: user.Username })
        applied.push({ ...effect, Summary: describeEffect(effect) })
      }
    } catch (actionError) {
      return { saved: null, applied, error: actionError instanceof Error ? actionError.message : 'Unable to apply the effect.' }
    }

    let saved: CharacterSheetRecord | null = null
    try { saved = await updateCharacterSheet(characterId, draft, user) } catch (failure) {
      return { saved: null, applied, error: failure instanceof Error ? failure.message : 'Save failed.' }
    }
    if (!saved) return { saved: null, applied, error: 'This character is not assigned to your campaign or you no longer have access.' }

    setCharacters((records) => records.map((record) => record.Id === saved!.Id ? saved! : record))
    setStatus(`Saved ${displayName(saved)} · ${new Date().toLocaleTimeString()}`)
    setError('')
    return { saved, applied }
  }

  const updateSheet = async (characterId: string, actions: CampaignAction[]) => {
    const result = await applyEffects(characterId, actions.map(actionToEffect))
    if (result.error) setError(result.error)
  }

  const updateEssence = async (characterId: string, mutate: (draft: EssenceCharacterData) => void) => {
    const current = characters.find((record) => record.Id === characterId)
    if (!current?.Essence) {
      setError('Essence character sheet not found.')
      return
    }

    const draft = toCharacterSheetData(current)
    mutate(draft.Essence!)
    const saved = await updateCharacterSheet(characterId, draft, user)
    if (!saved) {
      setError('This character is not assigned to your campaign or you no longer have access.')
      return
    }

    setCharacters((records) => records.map((record) => record.Id === saved.Id ? saved : record))
    setStatus(`Saved ${displayName(saved)} · ${new Date().toLocaleTimeString()}`)
    setError('')
  }

  // Portraits live on the record (not the Essence block) so any ruleset's sheet can carry one.
  const updatePortrait = async (characterId: string, portrait: Portrait | null) => {
    const current = characters.find((record) => record.Id === characterId)
    if (!current) { setError('Character sheet not found.'); return }
    const saved = await updateCharacterSheet(characterId, { ...toCharacterSheetData(current), Portrait: portrait }, user)
    if (!saved) { setError('This character is not assigned to your campaign or you no longer have access.'); return }
    setCharacters((records) => records.map((record) => record.Id === saved.Id ? saved : record))
    setStatus(`${portrait ? 'Updated' : 'Removed'} portrait for ${displayName(saved)} · ${new Date().toLocaleTimeString()}`)
    setError('')
  }

  // Schedule and clock changes replace the campaign in state and save it to the campaigns resource.
  const persistCampaign = (next: Campaign) => {
    setCampaigns((items) => items.map((item) => item.Name === next.Name ? next : item))
    saveResource('campaigns', next.Id, next.toData()).catch(() => setError('Unable to save the campaign schedule.'))
  }

  const scheduleEvent = (campaignName: string, input: Parameters<Campaign['scheduleEvent']>[0]) => {
    const campaign = campaigns.find((item) => item.Name === campaignName)
    if (!campaign) {
      throw new Error('Campaign was not found.')
    }

    const next = campaign.clone()
    const event = next.scheduleEvent(input)
    persistCampaign(next)
    return event
  }

  const cancelEvent = (campaignName: string, eventId: string) => {
    const campaign = campaigns.find((item) => item.Name === campaignName)
    if (!campaign) return
    const next = campaign.clone()
    next.removeEvent(eventId)
    persistCampaign(next)
  }

  // Timeline board drags and keyboard nudges.
  const moveEvent = (campaignName: string, eventId: string, scheduledAt: Date, location: string) => {
    const campaign = campaigns.find((item) => item.Name === campaignName)
    if (!campaign) {
      throw new Error('Campaign was not found.')
    }
    const next = campaign.clone()
    next.moveEvent(eventId, scheduledAt, location)
    persistCampaign(next)
  }

  // Fires every event due by the new time: effects land on each target's sheet and the outcome is recorded per event.
  const advanceCampaign = async (campaignName: string, timeValue: string) => {
    const campaign = campaigns.find((item) => item.Name === campaignName)
    if (!campaign || !timeValue) {
      return
    }

    const next = campaign.clone()
    let dueEvents
    try {
      dueEvents = next.advanceTo(new Date(timeValue))
    } catch (advanceError) {
      setError(advanceError instanceof Error ? advanceError.message : 'Unable to advance campaign time.')
      return
    }

    persistCampaign(next)
    setTimeInputs((inputs) => ({ ...inputs, [campaignName]: localDateTime(next.currentTime) }))
    const roster = characters.filter((record) => record.CampaignName === campaignName && !record.Tags.includes('NPC'))
    for (const event of dueEvents) {
      const targets: EventTargetResult[] = []
      for (const characterId of event.targets(roster.map((record) => record.Id))) {
        const record = characters.find((item) => item.Id === characterId)
        if (!record) continue
        const result = await applyEffects(characterId, event.effectsFor(characterId))
        targets.push({ CharacterId: characterId, CharacterName: displayName(record), OwnerId: record.OwnerId, Effects: result.applied, ...(result.error ? { Error: result.error } : {}) })
      }
      await recordFiredEvent(campaignName, event, targets, next.currentTime)
    }
    setStatus(dueEvents.length > 0
      ? `Applied ${dueEvents.length} scheduled event${dueEvents.length === 1 ? '' : 's'}`
      : `Campaign time advanced · ${next.currentTime.toLocaleString()}`)
  }

  // A fired event becomes a log entry: the server announces it to the DM and every targeted owner.
  const recordFiredEvent = async (campaignName: string, event: CampaignEvent, targets: EventTargetResult[], campaignTime: Date) => {
    if (targets.length === 0) return
    try {
      await recordEvent({
        CampaignName: campaignName, Title: event.Title, Description: event.Description, Skin: event.Skin, Source: 'scheduled',
        CampaignTime: campaignTime.toISOString(), ScheduledEventId: event.Id,
        Targets: targets.map((target) => ({ CharacterId: target.CharacterId, Effects: target.Effects, ...(target.Error ? { Error: target.Error } : {}) })),
      })
    } catch (failure) {
      setError(failure instanceof Error ? `Event applied but not logged: ${failure.message}` : 'Event applied but not logged.')
    }
  }

  const selectedCharacter = characters.find((record) => record.Id === selectedCharacterId) ?? null
  const previewCharacter = characters.find((record) => record.Id === previewCharacterId) ?? null
  const visibleSystems = systems.filter((system) => !system.Hidden)
  const activeSystem = visibleSystems.find((system) => system.Id === selectedSystemId) ?? visibleSystems[0]
  const isEssenceSystem = activeSystem.Ruleset === 'essence'
  const systemCampaigns = campaigns.filter((campaign) => activeSystem.CampaignNames.includes(campaign.Name))
  const selectedCampaign = systemCampaigns.find((campaign) => campaign.Name === selectedCampaignName) ?? systemCampaigns[0] ?? null
  const campaignCharacters = selectedCampaign
    ? characters.filter((record) => record.CampaignName === selectedCampaign.Name)
    : []
  const selectedFaction = selectedCampaign?.NPCs.find((group) => group.Faction === selectedFactionName) ?? null

  // NPC sheets are ordinary character records owned by the DM, tagged NPC and matched by name within the campaign.
  const npcSheetFor = (npc: Person): CharacterSheetRecord | null => selectedCampaign
    ? characters.find((record) => record.CampaignName === selectedCampaign.Name && record.Tags.includes('NPC') && record.Name === npc.Name) ?? null
    : null
  const createNpcSheet = async (npc: Person) => {
    if (!selectedCampaign) return
    const attributes = placeholderAttributes()
    for (const attributeName of PRIMARY_ATTRIBUTE_NAMES) attributes[attributeName] = { ...attributes[attributeName], value: npc[attributeName].value }
    const data: CharacterSheetData = {
      SystemId: activeSystem.Id,
      Essence: isEssenceSystem ? blankEssenceCharacter({ PlayerName: user.Username, Alias: npc.Name, Concept: npc.Tags.join(', ') || 'NPC' }) : undefined,
      Name: npc.Name, Level: npc.Level, XP: npc.XP, CampaignName: selectedCampaign.Name,
      Tags: [...new Set([...npc.Tags, 'NPC'])], DMId: user.Id, DMName: user.Username,
      PlayerClass: { Name: isEssenceSystem ? 'NPC' : npc.PlayerClass.Name, AttributeGrowth: placeholderGrowth() },
      Attributes: attributes, Skills: [],
    }
    try {
      const record = await createCharacterSheet(data, user)
      await loadCharacters()
      setStatus(`Created a sheet for ${npc.Name}`)
      setPreviewCharacterId(record.Id)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create the NPC sheet.')
    }
  }
  const npcSheetControl = (npc: Person) => {
    const sheet = npcSheetFor(npc)
    return sheet
      ? <button type="button" className="essence-inline-button npc-sheet-button" onClick={(event) => { event.stopPropagation(); setPreviewCharacterId(sheet.Id) }}>Open sheet</button>
      : <button type="button" className="essence-inline-button npc-sheet-button" onClick={(event) => { event.stopPropagation(); void createNpcSheet(npc) }}>Create sheet</button>
  }

  // The campaign's event log, refreshed whenever an event lands.
  const loadEventLog = async (campaignName: string | undefined) => {
    if (!campaignName) { setEventLogEntries([]); return }
    try { setEventLogEntries((await fetchEventLog(campaignName)).entries) } catch { /* the log panel shows what it has */ }
  }
  useEffect(() => {
    void loadEventLog(selectedCampaign?.Name)
    const stop = onEventNotification((notification) => { if (notification.campaignName === selectedCampaign?.Name) void loadEventLog(selectedCampaign?.Name) })
    return stop
  }, [selectedCampaign?.Name])

  // Sending now: every recipient's sheet takes the effects, then the outcome is logged and announced.
  const sendEvent = async (campaign: Campaign, draft: EventDraft) => {
    const roster = characters.filter((record) => record.CampaignName === campaign.Name && !record.Tags.includes('NPC'))
    const recipients = draft.targetIds === 'all' ? roster : roster.filter((record) => (draft.targetIds as string[]).includes(record.Id))
    if (recipients.length === 0) throw new Error('Choose at least one character.')
    const targets: EventTargetResult[] = []
    for (const record of recipients) {
      const effects = [...draft.effects, ...draft.targetEffects.filter((entry) => entry.CharacterId === record.Id).flatMap((entry) => entry.Effects)]
      const result = effects.length > 0 ? await applyEffects(record.Id, effects) : { applied: [] as AppliedEffect[], error: undefined }
      targets.push({ CharacterId: record.Id, CharacterName: displayName(record), OwnerId: record.OwnerId, Effects: result.applied, ...(result.error ? { Error: result.error } : {}) })
    }
    await recordEvent({
      CampaignName: campaign.Name, Title: draft.title, Description: draft.description, Skin: draft.skin, Source: 'manual',
      CampaignTime: campaign.currentTime.toISOString(),
      Targets: targets.map((target) => ({ CharacterId: target.CharacterId, Effects: target.Effects, ...(target.Error ? { Error: target.Error } : {}) })),
    })
    const failed = targets.filter((target) => target.Error).length
    setStatus(`Sent "${draft.title}" to ${targets.length} character${targets.length === 1 ? '' : 's'}${failed ? ` · ${failed} could not be updated` : ''}`)
    void loadEventLog(campaign.Name)
  }

  if (previewCharacter) {
    return <PlayerSheetView record={previewCharacter} onBack={() => setPreviewCharacterId(null)} skin={skin} onSkinChange={onSkinChange} onEssenceChange={(change) => updateEssence(previewCharacter.Id, (draft) => applySheetChange(draft, change, { name: user.Username, role: 'dm' }))} onEssenceEdit={(mutate) => updateEssence(previewCharacter.Id, mutate)} onEssenceAmount={(change) => updateEssence(previewCharacter.Id, (draft) => applyEssenceChange(draft, change, { name: user.Username, role: 'dm' }))} onPortraitChange={(portrait) => updatePortrait(previewCharacter.Id, portrait)} />
  }

  const techniqueEntries: TechniqueEntry[] = [
    ...campaignCharacters.flatMap((record) => (record.Essence?.Techniques ?? []).map((technique, index): TechniqueEntry => ({
      key: `character-${record.Id}-${index}`,
      technique,
      source: { kind: 'character', characterId: record.Id, index, label: displayName(record) },
    }))),
    ...(selectedCampaign?.NPCs ?? []).flatMap((group) => group.NPCs.flatMap((npc) => npc.Techniques.map((technique, index): TechniqueEntry => ({
      key: `npc-${npc.Name}-${index}`,
      technique,
      source: { kind: 'npc', npc, index, label: npc.Name },
    })))),
    ...techniqueLibrary.map((technique): TechniqueEntry => ({
      key: `library-${technique.Id}`,
      technique,
      source: { kind: 'library', id: technique.Id, label: technique.Origin ?? 'DM library' },
    })),
  ].sort((left, right) => left.technique.Name.localeCompare(right.technique.Name, undefined, { sensitivity: 'base' }))

  const saveTechnique = (technique: EssenceTechnique) => {
    const source = openTechnique?.source ?? null
    if (!source || source.kind === 'library') {
      const id = source?.kind === 'library' ? source.id : newTechniqueId()
      setTechniqueLibrary(saveLibraryTechnique(user.Id, { ...technique, Id: id }))
    } else if (source.kind === 'character') {
      void updateEssence(source.characterId, (draft) => { draft.Techniques[source.index] = technique })
    } else {
      source.npc.Techniques[source.index] = technique
      setNpcRevision((revision) => revision + 1)
    }
    setOpenTechnique(null)
  }

  const itemsBySlot = ARMOUR_SLOTS.map((slot) => ({
    slot,
    items: itemCatalog.filter((item) => item.Slot === slot).sort((left, right) => left.Name.localeCompare(right.Name, undefined, { sensitivity: 'base' })),
  }))

  const saveItem = (entry: ArmourCatalogEntry) => {
    const id = entry.Id || newItemCatalogId()
    setItemCatalog(saveItemCatalogEntry({ ...entry, Id: id }))
    setOpenItem(null)
  }

  const deleteItem = (id: string) => {
    setItemCatalog(deleteItemCatalogEntry(id))
    setOpenItem(null)
  }

  const openScheduleTemplate = (type: CampaignEventType) => {
    setComposer({ type })
    setError('')
  }

  return (
    <div className="dm-console-shell" data-skin={skin} style={skinArtStyle(skin)}>
      <header className="dm-console-header">
        <div>
          <p className="eyebrow">Dragon's Dungeon · Dungeon master</p>
          <h1>Campaign desk</h1>
        </div>
        <div className="topbar-actions">
          <label className="page-skin-control">
            <span>Stat system</span>
            <select
              aria-label="Stat system"
              value={activeSystem.Id}
              onChange={(event) => {
                setSelectedSystemId(event.currentTarget.value)
                setSelectedCampaignName('')
                setCampaignPage('Players')
              }}
            >
              {visibleSystems.map((system) => <option key={system.Id} value={system.Id}>{system.Name}</option>)}
            </select>
          </label>
          <button type="button" className="new-system-button" onClick={() => setNewSystemOpen(true)}><Plus size={16} aria-hidden="true" />New System</button>
          <span className="database-status" role="status" aria-live="polite">{status}</span>
          <span className="signed-in-user">{user.Username} · DM</span>
          <SettingsMenu user={user} pageSkin={skin} onSkinChange={onSkinChange} onLogout={onSignOut} onUserChange={onUserChange} />
        </div>
      </header>

      {newSystemOpen && <NewSystemModal systems={systems} onClose={() => setNewSystemOpen(false)} onSave={async (system) => {
        await saveResource('systems', system.Id, system)
        setSystems((current) => [...current, system])
        setCampaigns((current) => [...current, ...system.CampaignNames.map((name) => new Campaign(name))])
        setSelectedSystemId(system.Id)
        setSelectedCampaignName(system.CampaignNames[0])
        setCampaignPage('Players')
        setStatus(`Created ${system.Name}`)
        setNewSystemOpen(false)
      }} />}
      {importOpen && <ImportSheetModal
        user={user}
        systems={systems}
        onClose={() => setImportOpen(false)}
        onImported={async (result) => {
          // A newly created system lives in the resource cache, which loadCharacters merges from.
          if (result.system.created) await loadResources('dm')
          await loadCharacters()
          setSelectedSystemId(result.system.Id)
          setSelectedCampaignName(result.record.CampaignName)
          setCampaignPage('Players')
          setSelectedCharacterId(result.record.Id)
          const warnings = result.warnings.length ? ` · ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}: ${result.warnings.slice(0, 3).join('; ')}` : ''
          setStatus(`Imported ${displayName(result.record)}${result.system.created ? ` and created ${result.system.Name}` : ''}${warnings}`)
          setImportOpen(false)
        }}
      />}
      {error && <p className="dm-console-error" role="alert">{error}</p>}
      {systemCampaigns.length === 0 && (
        <div className="dm-empty-state"><h2>No campaigns in the {activeSystem.Name} stat system</h2></div>
      )}

      {selectedCampaign && (
        <>
          <header className="selected-campaign-header">
            <div>
              <p className="eyebrow">Campaign</p>
              <h2>{selectedCampaign.Name}</h2>
              <p className="campaign-time-readout">Current time · {selectedCampaign.currentTime.toLocaleString()}</p>
            </div>
            <button type="button" className="essence-inline-button send-event-button" onClick={() => setComposer({})}><BellRing size={16} aria-hidden="true" />Send event</button>
            <label className="campaign-picker">
              <span>Campaign</span>
              <select value={selectedCampaign.Name} onChange={(event) => setSelectedCampaignName(event.currentTarget.value)}>
                {systemCampaigns.map((campaign) => <option value={campaign.Name} key={campaign.Id}>{campaign.Name}</option>)}
              </select>
            </label>
          </header>

          <nav className="campaign-tabs campaign-tabs-icons" role="tablist" aria-label={`${selectedCampaign.Name} pages`}>
            {CAMPAIGN_PAGES.map((page) => {
              const Icon = CAMPAIGN_PAGE_ICONS[page]
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={campaignPage === page}
                  aria-label={page}
                  title={page}
                  className={campaignPage === page ? 'active' : ''}
                  key={page}
                  onClick={() => setCampaignPage(page)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span className="visually-hidden">{page}</span>
                </button>
              )
            })}
          </nav>

          <main className="campaign-page" role="tabpanel">
            {campaignPage === 'Players' && (
              <section>
                <div className="campaign-page-heading">
                  <div><p className="eyebrow">Roster</p><h3>Players</h3></div>
                  <span>{campaignCharacters.length} characters</span>
                  <button type="button" className="essence-inline-button" onClick={() => setImportOpen(true)}>Import from Google Sheets</button>
                  <button type="button" className="essence-inline-button" onClick={() => void listDeletedCharacterSheets(user).then(setDeletedList)}>Deleted characters</button>
                </div>
                <div className="dm-character-grid">
                  {campaignCharacters.map((record) => {
                    const unseen = record.Essence ? unseenLogCount(record.Essence) : 0
                    return (
                    <div className="dm-character-card-wrap" key={record.Id}>
                    <button className="dm-character-card" type="button" onClick={() => setSelectedCharacterId(record.Id)}>
                      <div className="dm-character-card-heading">
                        {record.Portrait && <img className="dm-character-card-portrait" src={record.Portrait.DataUrl} alt="" />}
                        <strong>{displayName(record)}</strong>
                        <span>{record.Essence ? record.Essence.Race : `Level ${record.Level}`}</span>
                      </div>
                      <span className="dm-character-class">
                        {record.Essence
                          ? `${spiritWeaponLabel(record.Essence)} · ${computeEssenceStats(record.Essence).maxHP} HP`
                          : `${record.PlayerClass.Name} · ${record.XP} XP`}
                      </span>
                      <div className="character-tags">
                        {record.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}
                      </div>
                    </button>
                    {record.Essence && (
                      <button
                        type="button"
                        className="dm-log-button"
                        aria-label={`Development log for ${displayName(record)}${unseen > 0 ? `, ${unseen} new` : ''}`}
                        onClick={() => {
                          const seenBefore = record.Essence?.DevelopmentLogSeenAt
                          setOpenLog({ id: record.Id, seenBefore })
                          if (unseen > 0) {
                            void updateEssence(record.Id, (draft) => { draft.DevelopmentLogSeenAt = new Date().toISOString() })
                          }
                        }}
                      >
                        Log{unseen > 0 && <span className="dm-log-flag" aria-hidden="true">!</span>}
                      </button>
                    )}
                    </div>
                    )
                  })}
                </div>
              </section>
            )}

            {campaignPage === 'Factions' && (
              <section>
                <div className="campaign-page-heading"><div><p className="eyebrow">Relations</p><h3>Factions</h3></div></div>
                {selectedCampaign.NPCs.length > 0 ? (
                  <div className="campaign-world-groups faction-page-grid">
                    {selectedCampaign.NPCs.map((group) => (
                      <article
                        className="faction-group faction-card"
                        key={group.Faction}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${group.Faction}`}
                        onClick={() => setSelectedFactionName(group.Faction)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedFactionName(group.Faction)
                          }
                        }}
                      >
                        <h4>{group.Faction}<span>{group.NPCs.length} members</span></h4>
                        {group.NPCs.map((npc) => (
                          <div className="world-entity-row" key={npc.Name}>
                            <strong>{npc.Name}</strong><span>{isEssenceSystem ? 'NPC' : `Level ${npc.Level} · ${npc.PlayerClass.Name}`}</span>
                            <div className="character-tags">{npc.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}</div>
                            {npcSheetControl(npc)}
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                ) : <p className="campaign-empty-message">No factions recorded.</p>}
              </section>
            )}

            {campaignPage === 'NPCs' && (
              <section className="npcs-page">
                <div className="campaign-page-heading"><div><p className="eyebrow">World roster</p><h3>NPCs and Monsters</h3></div></div>
                <div className="campaign-world-groups">
                  <section className="campaign-world-group">
                    <h3>NPCs</h3>
                    {selectedCampaign.NPCs.map((group) => (
                      <div className="faction-group" key={group.Faction}>
                        <h4>{group.Faction}</h4>
                        {group.NPCs.map((npc) => (
                          <div className="world-entity-row" key={npc.Name}>
                            <strong>{npc.Name}</strong><span>{isEssenceSystem ? 'NPC' : `Level ${npc.Level} · ${npc.PlayerClass.Name}`}</span>
                            <div className="character-tags">{npc.Tags.map((tag) => <span className="skill-chip flag-chip" key={tag}>{tag}</span>)}</div>
                            {npcSheetControl(npc)}
                          </div>
                        ))}
                      </div>
                    ))}
                  </section>
                  <section className="campaign-world-group">
                    <h3>Monsters by location</h3>
                    {selectedCampaign.Monsters.map((group) => (
                      <div className="location-group" key={group.Location}>
                        <h4>{group.Location}</h4>
                        {group.Monsters.map((monster) => (
                          <div className="world-entity-row" key={monster.Id}>
                            <strong>{monster.Name}</strong><span>{monster.Species} · Level {monster.Level} · {monster.Threat} threat</span>
                            <small>{monster.Count} · {monster.description}</small>
                          </div>
                        ))}
                      </div>
                    ))}
                  </section>
                </div>
              </section>
            )}

            {campaignPage === 'Events' && (
              <section>
                <div className="campaign-page-heading"><div><p className="eyebrow">Scheduled activity</p><h3>Events</h3></div><span>{selectedCampaign.scheduledEvents.length} scheduled</span></div>
                <div className="event-page-layout">
                  <section className="campaign-events event-list-panel">
                    <h3>Scheduled events</h3>
                    {selectedCampaign.scheduledEvents.length > 0 ? selectedCampaign.scheduledEvents.map((event) => (
                      <article className="campaign-event-row" key={event.Id}>
                        <span className="event-type-tag">{event.Type}</span>
                        <strong>{event.Title}</strong>
                        <span>{event.ScheduledAt.toLocaleString()}</span>
                        <span className={event.Completed ? 'event-complete' : 'event-pending'}>{event.Completed ? 'Applied' : 'Pending'}</span>
                        <small>{event.Description}</small>
                        <small>{[...event.Effects.map(describeEffect), ...event.Actions.map(actionLabel)].join(' · ') || 'Announcement only'}</small>
                        {!event.Completed && <button type="button" className="essence-inline-button" onClick={() => cancelEvent(selectedCampaign.Name, event.Id)}>Cancel</button>}
                      </article>
                    )) : <p className="campaign-empty-message">No events scheduled for this campaign.</p>}
                  </section>
                  <section className="event-template-panel">
                    <div className="campaign-page-heading"><div><p className="eyebrow">Compose</p><h3>Event templates</h3></div><button type="button" className="essence-inline-button" onClick={() => setComposer({})}>Blank event</button></div>
                    <div className="event-template-grid">
                      {CAMPAIGN_EVENT_TEMPLATES.map((template) => (
                        <article className="event-template-card" key={template.type}>
                          <span className="event-type-tag">{template.type}</span>
                          <h4>{template.title}</h4>
                          <p>{template.description}</p>
                          <small>{template.suggestedActions.map((action) => action.replaceAll('-', ' ')).join(' · ')}</small>
                          <button type="button" onClick={() => openScheduleTemplate(template.type)}>Compose</button>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="campaign-events event-log-panel">
                    <h3>Event log</h3>
                    {eventLogEntries.length > 0 ? eventLogEntries.map((entry) => (
                      <article className="campaign-event-row event-log-row" key={entry.Id}>
                        <span className="event-type-tag">{entry.Source === 'scheduled' ? 'scheduled' : 'sent'}</span>
                        <strong>{entry.Title}</strong>
                        <span>{new Date(entry.CreatedAt).toLocaleString()}{entry.CampaignTime ? ` · campaign ${new Date(entry.CampaignTime).toLocaleString()}` : ''}</span>
                        <span className="event-complete">{entry.Targets.length} character{entry.Targets.length === 1 ? '' : 's'} · {Math.max(0, (entry.Acknowledgements ?? 1) - 1)} acknowledged</span>
                        <small>{entry.Targets.map((target) => `${target.CharacterName}: ${target.Error ? `failed (${target.Error})` : target.Effects.map((effect) => effect.Summary).join(', ') || 'no changes'}`).join(' · ')}</small>
                        <button type="button" className="essence-inline-button" onClick={() => setOpenLogEntry(entry)}>View</button>
                      </article>
                    )) : <p className="campaign-empty-message">No events have fired in this campaign yet.</p>}
                  </section>
                </div>
              </section>
            )}

            {campaignPage === 'Techniques' && (
              <section>
                <div className="campaign-page-heading">
                  <div><p className="eyebrow">Characters, NPCs and the DM library</p><h3>Techniques</h3></div>
                  <span>{techniqueEntries.length} techniques</span>
                  <button type="button" className="dm-primary-action" onClick={() => setOpenTechnique({ key: `new-${Date.now()}`, source: null, technique: BLANK_TECHNIQUE })}>New</button>
                </div>
                {techniqueEntries.length === 0 && <p className="campaign-empty-message">No techniques yet. Use New to add one.</p>}
                <div className="technique-list">
                  {techniqueEntries.map((entry) => (
                    <button
                      type="button"
                      className="technique-row"
                      key={entry.key}
                      onClick={() => setOpenTechnique({ key: entry.key, source: entry.source, technique: entry.technique })}
                    >
                      <strong>{entry.technique.Name}</strong>
                      <span>{entry.technique.Action || '—'}</span>
                      <span>{formatTechniqueCost(entry.technique)}</span>
                      <span>{entry.technique.Range || '—'}</span>
                      <span>{damageLabel(entry.technique.Damage)}</span>
                      <small>{entry.source.label}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {campaignPage === 'Items' && (
              <section>
                <div className="campaign-page-heading">
                  <div><p className="eyebrow">Armour reference catalog</p><h3>Items</h3></div>
                  <span>{itemCatalog.length} items</span>
                  <button type="button" className="dm-primary-action" onClick={() => setOpenItem({ key: `new-${Date.now()}`, isNew: true, entry: BLANK_ARMOUR_ITEM })}>Add Item</button>
                </div>
                {itemCatalog.length === 0 && <p className="campaign-empty-message">No items yet. Use Add Item to add one.</p>}
                <div className="item-catalog-groups">
                  {itemsBySlot.map(({ slot, items }) => (
                    <div className="item-catalog-group" key={slot}>
                      <h4>{slot} <span>{items.length}</span></h4>
                      {items.length === 0
                        ? <p className="campaign-empty-message">No {slot.toLowerCase()} items yet.</p>
                        : (
                          <div className="item-catalog-list">
                            {items.map((item) => (
                              <button
                                type="button"
                                className="item-catalog-row"
                                key={item.Id}
                                onClick={() => setOpenItem({ key: item.Id, isNew: false, entry: item })}
                              >
                                <strong>{item.Name}</strong>
                                <span>{item.Type || '—'}</span>
                                <span>Armour {item.ArmourValue}{item.ArmourMod ? ` (+${item.ArmourMod})` : ''}</span>
                                <span>Burden {item.Burden}</span>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {campaignPage === 'Timeline' && (
              <section>
                <div className="campaign-page-heading"><div><p className="eyebrow">Campaign clock</p><h3>Timeline</h3></div></div>
                <div className="timeline-clock-panel">
                  <p>Current campaign time <strong>{selectedCampaign.currentTime.toLocaleString()}</strong></p>
                  <div className="campaign-clock-control">
                    <label><span>Advance to</span><input type="datetime-local" min={localDateTime(selectedCampaign.currentTime)} value={timeInputs[selectedCampaign.Name] ?? localDateTime(selectedCampaign.currentTime)} onChange={(event) => { const value = event.currentTarget.value; setTimeInputs((inputs) => ({ ...inputs, [selectedCampaign.Name]: value })) }} /></label>
                    <button type="button" onClick={() => void advanceCampaign(selectedCampaign.Name, timeInputs[selectedCampaign.Name] ?? localDateTime(selectedCampaign.currentTime))}>Advance time</button>
                  </div>
                </div>
                <TimelineBoard campaign={selectedCampaign} onMove={(eventId, scheduledAt, location) => moveEvent(selectedCampaign.Name, eventId, scheduledAt, location)} />
                <ol className="campaign-timeline">
                  <li className="timeline-now"><span className="timeline-marker" /><div><strong>Now</strong><p>{selectedCampaign.currentTime.toLocaleString()}</p></div></li>
                  {[...selectedCampaign.scheduledEvents].sort((left, right) => left.ScheduledAt.getTime() - right.ScheduledAt.getTime()).map((event) => (
                    <li className={event.Completed ? 'timeline-event completed' : 'timeline-event'} key={event.Id}>
                      <span className="timeline-marker" />
                      <div><span className="event-type-tag">{event.Type}</span><strong>{event.Title}</strong><p>{event.ScheduledAt.toLocaleString()} · {event.Completed ? 'Applied' : 'Pending'}</p><small>{event.Description}</small></div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </main>
        </>
      )}

      {selectedFaction && (
        <FactionModal
          group={selectedFaction}
          roster={campaignCharacters}
          onClose={() => setSelectedFactionName(null)}
          onOpenPlayer={(id) => {
            setSelectedFactionName(null)
            setPreviewCharacterId(id)
          }}
          onOpenNpc={setSelectedNpc}
        />
      )}
      {deletedList && (
        <DeletedCharactersModal records={deletedList} onRestore={(record) => void restoreCharacter(record)} onClose={() => setDeletedList(null)} />
      )}
      {openTechnique && (
        <TechniqueModal
          key={openTechnique.key}
          technique={openTechnique.technique}
          isNew={openTechnique.source === null}
          sourceLabel={openTechnique.source?.label ?? 'DM library'}
          onSave={saveTechnique}
          onDelete={openTechnique.source?.kind === 'library'
            ? () => {
                setTechniqueLibrary(deleteLibraryTechnique(user.Id, (openTechnique.source as { id: string }).id))
                setOpenTechnique(null)
              }
            : undefined}
          onClose={() => setOpenTechnique(null)}
        />
      )}
      {openItem && (
        <ArmourCatalogModal
          key={openItem.key}
          entry={openItem.entry}
          isNew={openItem.isNew}
          onSave={saveItem}
          onDelete={openItem.isNew ? undefined : () => deleteItem(openItem.entry.Id)}
          onClose={() => setOpenItem(null)}
        />
      )}
      {openLog && characters.some((record) => record.Id === openLog.id) && (
        <DevelopmentLogModal
          record={characters.find((record) => record.Id === openLog.id)!}
          seenBefore={openLog.seenBefore}
          onClose={() => setOpenLog(null)}
          onDelete={(entryId) => void updateEssence(openLog.id, (draft) => {
            draft.DevelopmentLog = (draft.DevelopmentLog ?? []).filter((entry) => entry.Id !== entryId)
          })}
        />
      )}
      {selectedNpc && <NpcSheetModal npc={selectedNpc} onClose={() => setSelectedNpc(null)} onChange={() => setNpcRevision((revision) => revision + 1)} hideProgression={isEssenceSystem} />}

      {transferTarget && (
        <TransferModal
          record={transferTarget}
          systems={systems}
          user={user}
          onClose={() => setTransferTarget(null)}
          onTransferred={async (record) => {
            await loadCharacters()
            setSelectedCampaignName(record.CampaignName)
            setStatus(`Transferred ${displayName(record)} to ${record.OwnerName} · ${record.CampaignName}`)
            setTransferTarget(null)
            setSelectedCharacterId(null)
          }}
        />
      )}
      {selectedCharacter && (
        <CharacterActionModal
          key={selectedCharacter.Id}
          record={selectedCharacter}
          campaign={campaigns.find((campaign) => campaign.Name === selectedCharacter.CampaignName) ?? new Campaign(selectedCharacter.CampaignName)}
          onClose={() => setSelectedCharacterId(null)}
          onApply={(action) => updateSheet(selectedCharacter.Id, [action])}
          onApplyEssence={(mutate) => updateEssence(selectedCharacter.Id, mutate)}
          onDelete={() => void deleteCharacter(selectedCharacter)}
          onOpenSheet={() => {
            setPreviewCharacterId(selectedCharacter.Id)
            setSelectedCharacterId(null)
          }}
          onSyncSheet={selectedCharacter.SheetSource ? async () => {
            const result = await syncCharacterSheetWithGoogleSheets(selectedCharacter.Id)
            await loadCharacters()
            setStatus(result.changed ? `Pulled sheet changes for ${displayName(result.record)}` : `${displayName(result.record)} already matches the sheet${result.pushed ? ` · pushed ${result.pushed} cells` : ''}`)
          } : undefined}
          onTransfer={() => setTransferTarget(selectedCharacter)}
          onComposeEvent={() => { setComposer({ targetIds: [selectedCharacter.Id] }); setSelectedCharacterId(null) }}
        />
      )}
      {composer && selectedCampaign && (
        <EventComposerModal
          campaign={selectedCampaign}
          characters={campaignCharacters.filter((record) => !record.Tags.includes('NPC'))}
          isEssence={isEssenceSystem}
          initialTargetIds={composer.targetIds}
          initialType={composer.type}
          onClose={() => setComposer(null)}
          onSend={(draft) => sendEvent(selectedCampaign, draft)}
          onSchedule={(draft, scheduledAt) => {
            scheduleEvent(selectedCampaign.Name, { type: draft.type, title: draft.title, description: draft.description, scheduledAt, effects: draft.effects, targetIds: draft.targetIds, targetEffects: draft.targetEffects, skin: draft.skin })
            setStatus(`Scheduled "${draft.title}" for ${scheduledAt.toLocaleString()}`)
          }}
        />
      )}
      {openLogEntry && (
        <div className="dm-modal-backdrop" onClick={() => setOpenLogEntry(null)}>
          <section className="dm-character-modal event-log-detail" role="dialog" aria-modal="true" aria-label={openLogEntry.Title} onClick={(event) => event.stopPropagation()}>
            <EventCard title={openLogEntry.Title} description={openLogEntry.Description} skin={openLogEntry.Skin} campaignName={openLogEntry.CampaignName} meta={new Date(openLogEntry.CreatedAt).toLocaleString()} targets={openLogEntry.Targets}>
              <button type="button" className="dm-secondary-action" onClick={() => setOpenLogEntry(null)}>Close</button>
            </EventCard>
          </section>
        </div>
      )}
    </div>
  )
}

function actionLabel(action: CampaignAction): string {
  switch (action.type) {
    case 'add-xp': return `+${action.amount} XP`
    case 'add-skill-progress': return `+${action.amount}% ${action.skillNames.join(', ')}`
    case 'level-up': return 'Level up character'
    case 'level-up-skill': return `Level up ${action.skillName}`
  }
}
