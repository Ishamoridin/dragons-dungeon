import { useMemo, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { Campaign, CampaignEventType, TargetEffects } from './Campaign'
import { CAMPAIGN_EVENT_TEMPLATES } from './Campaign'
import type { CharacterSheetRecord } from './CharacterSheetDatabase'
import { displayName } from './CharacterSheetDatabase'
import EventCard from './EventCard'
import {
  DEFAULT_EVENT_SKIN, EFFECT_TYPE_LABELS, describeEffect, effectsForRuleset, flattenSkills, isHexColour,
  type EventEffect, type EventEffectType, type EventSkin, type ResourcePool,
} from './EventEffects'
import type { EventLogTarget } from './EventLogApi'
import { PAGE_SKINS } from './PageSkin'
import { readPortraitFile } from './Portrait'
import type { StepKind } from './essence/EssenceChanges'
import { ATTRIBUTE_GROUPS, ESSENCE_ATTRIBUTES, ESSENCE_SKILLS } from './essence/EssenceSystem'
import { TREE_NODES } from './essence/EssenceTreeData'
import { METAPHYSICAL_LABELS, STAT_LABELS } from './essence/EssenceViews'

// Banners travel inside the campaigns resource and the event-log entry, so they stay well under the portrait budget.
export const MAX_EVENT_BANNER_BYTES = 300 * 1024

export type EventDraft = {
  type: CampaignEventType
  title: string
  description: string
  skin: EventSkin
  targetIds: string[] | 'all'
  effects: EventEffect[]
  targetEffects: TargetEffects[]
}

export const localDateTime = (date: Date): string => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

const STEP_KINDS: { id: StepKind; label: string }[] = [
  { id: 'Attributes', label: 'Attribute' },
  { id: 'Skills', label: 'Skill' },
  { id: 'AttributeUses', label: 'Attribute uses' },
  { id: 'SkillUses', label: 'Skill uses' },
  { id: 'MetaphysicalUses', label: 'Metaphysical uses' },
  { id: 'Stats', label: 'Statistic' },
]
const POOLS: { id: ResourcePool; label: string }[] = [{ id: 'hp', label: 'HP' }, { id: 'reiryoku', label: 'Reiryoku' }, { id: 'willpower', label: 'Willpower' }]

export default function EventComposerModal({ campaign, characters, isEssence, initialTargetIds, initialType, onClose, onSend, onSchedule }: {
  campaign: Campaign
  characters: CharacterSheetRecord[]
  isEssence: boolean
  initialTargetIds?: string[]
  initialType?: CampaignEventType
  onClose: () => void
  onSend: (draft: EventDraft) => Promise<void>
  onSchedule: (draft: EventDraft, scheduledAt: Date) => void
}) {
  const template = CAMPAIGN_EVENT_TEMPLATES.find((item) => item.type === initialType)
  const [type, setType] = useState<CampaignEventType>(template?.type ?? 'quest')
  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [skin, setSkin] = useState<EventSkin>(DEFAULT_EVENT_SKIN)
  const [targetIds, setTargetIds] = useState<string[] | 'all'>(initialTargetIds?.length ? initialTargetIds : 'all')
  const [effects, setEffects] = useState<EventEffect[]>([])
  const [targetEffects, setTargetEffects] = useState<TargetEffects[]>([])
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState(() => localDateTime(new Date(campaign.currentTime.getTime() + 60 * 60_000)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bannerError, setBannerError] = useState('')
  const bannerInput = useRef<HTMLInputElement>(null)

  const resolvedTargets = targetIds === 'all' ? characters : characters.filter((record) => targetIds.includes(record.Id))
  const toggleTarget = (id: string) => setTargetIds((current) => {
    const list = current === 'all' ? characters.map((record) => record.Id) : current
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
  })

  const draft: EventDraft = { type, title: title.trim(), description, skin, targetIds, effects, targetEffects }
  const effectsForTarget = (id: string) => [...effects, ...targetEffects.filter((entry) => entry.CharacterId === id).flatMap((entry) => entry.Effects)]
  const previewTargets: EventLogTarget[] = resolvedTargets.map((record) => ({
    CharacterId: record.Id, CharacterName: displayName(record), OwnerId: record.OwnerId,
    Effects: effectsForTarget(record.Id).map((effect) => ({ ...effect, Summary: describeEffect(effect) })),
  }))

  const addEffect = (effect: EventEffect, characterId: string | 'all') => {
    if (characterId === 'all') setEffects((current) => [...current, effect])
    else setTargetEffects((current) => {
      const existing = current.find((entry) => entry.CharacterId === characterId)
      return existing
        ? current.map((entry) => entry.CharacterId === characterId ? { ...entry, Effects: [...entry.Effects, effect] } : entry)
        : [...current, { CharacterId: characterId, Effects: [effect] }]
    })
  }
  const removeShared = (index: number) => setEffects((current) => current.filter((_, i) => i !== index))
  const removeOwn = (characterId: string, index: number) => setTargetEffects((current) =>
    current.map((entry) => entry.CharacterId === characterId ? { ...entry, Effects: entry.Effects.filter((_, i) => i !== index) } : entry).filter((entry) => entry.Effects.length > 0))

  const pickBanner = async (file: File | undefined) => {
    if (!file) return
    setBannerError('')
    try { setSkin((current) => ({ ...current, banner: null })); const banner = await readPortraitFile(file, MAX_EVENT_BANNER_BYTES); setSkin((current) => ({ ...current, banner })) }
    catch (failure) { setBannerError(failure instanceof Error ? failure.message : 'Unable to read that image.') }
    finally { if (bannerInput.current) bannerInput.current.value = '' }
  }

  const submit = async () => {
    setError('')
    if (!draft.title) { setError('Give the event a title.'); return }
    if (resolvedTargets.length === 0) { setError('Choose at least one character.'); return }
    setBusy(true)
    try {
      if (mode === 'now') await onSend(draft)
      else onSchedule(draft, new Date(scheduledAt))
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to send the event.')
    } finally { setBusy(false) }
  }

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal event-composer" role="dialog" aria-modal="true" aria-labelledby="event-composer-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{campaign.Name} · Campaign time {campaign.currentTime.toLocaleString()}</p>
            <h2 id="event-composer-title">Compose event</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        <div className="event-composer-layout">
          <form className="event-composer-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <div className="event-composer-row">
              <label className="dm-field-label">Type
                <select value={type} onChange={(event) => setType(event.currentTarget.value as CampaignEventType)}>
                  {CAMPAIGN_EVENT_TEMPLATES.map((item) => <option key={item.type} value={item.type}>{item.type[0].toUpperCase() + item.type.slice(1)}</option>)}
                </select>
              </label>
              <label className="dm-field-label event-title-field">Title
                <input value={title} maxLength={120} required onChange={(event) => setTitle(event.currentTarget.value)} />
              </label>
            </div>
            <label className="dm-field-label">Description <small>{description.length.toLocaleString()} / 20,000</small>
              <textarea value={description} maxLength={20_000} rows={8} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="What the players learn, see, or suffer. Blank lines separate paragraphs." />
            </label>

            <fieldset className="event-skin-fields">
              <legend>Skin</legend>
              <label className="dm-field-label">Style
                <select value={skin.skin} onChange={(event) => setSkin((current) => ({ ...current, skin: event.currentTarget.value as EventSkin['skin'] }))}>
                  {PAGE_SKINS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="dm-field-label">Accent
                <span className="dm-inline-control">
                  <input type="color" value={isHexColour(skin.accent) ? skin.accent : '#c9a45c'} onChange={(event) => setSkin((current) => ({ ...current, accent: event.currentTarget.value }))} aria-label="Accent colour" />
                  <button type="button" disabled={!skin.accent} onClick={() => setSkin(({ accent, ...current }) => current)}>Use skin colour</button>
                </span>
              </label>
              <div className="dm-field-label">Banner
                <span className="dm-inline-control">
                  <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(event) => void pickBanner(event.currentTarget.files?.[0])} />
                  <button type="button" onClick={() => bannerInput.current?.click()}><ImagePlus size={14} aria-hidden="true" />{skin.banner ? 'Replace banner' : 'Upload banner'}</button>
                  {skin.banner && <button type="button" onClick={() => setSkin((current) => ({ ...current, banner: null }))}><Trash2 size={14} aria-hidden="true" />Remove</button>}
                </span>
                {bannerError && <small role="alert">{bannerError}</small>}
              </div>
            </fieldset>

            <fieldset className="event-target-fields">
              <legend>Recipients</legend>
              <label className="event-target-option"><input type="checkbox" checked={targetIds === 'all'} onChange={() => setTargetIds((current) => current === 'all' ? [] : 'all')} /> All players in {campaign.Name}</label>
              <div className="event-target-grid">
                {characters.map((record) => (
                  <label className="event-target-option" key={record.Id}>
                    <input type="checkbox" checked={targetIds === 'all' || targetIds.includes(record.Id)} onChange={() => toggleTarget(record.Id)} /> {displayName(record)} <small>{record.OwnerName}</small>
                  </label>
                ))}
                {characters.length === 0 && <p className="campaign-empty-message">No player characters in this campaign.</p>}
              </div>
            </fieldset>

            <fieldset className="event-effect-fields">
              <legend>Effects</legend>
              {effects.length > 0 && (
                <div className="event-effect-group">
                  <strong>Everyone</strong>
                  <span className="event-effect-list">{effects.map((effect, index) => <button type="button" className="skill-chip event-effect-chip" key={index} title="Remove" onClick={() => removeShared(index)}>{describeEffect(effect)} ×</button>)}</span>
                </div>
              )}
              {targetEffects.map((entry) => (
                <div className="event-effect-group" key={entry.CharacterId}>
                  <strong>{displayName(characters.find((record) => record.Id === entry.CharacterId) ?? { Name: entry.CharacterId })}</strong>
                  <span className="event-effect-list">{entry.Effects.map((effect, index) => <button type="button" className="skill-chip event-effect-chip" key={index} title="Remove" onClick={() => removeOwn(entry.CharacterId, index)}>{describeEffect(effect)} ×</button>)}</span>
                </div>
              ))}
              <EffectBuilder isEssence={isEssence} targets={resolvedTargets} onAdd={addEffect} />
            </fieldset>

            <fieldset className="event-when-fields">
              <legend>When</legend>
              <label className="event-target-option"><input type="radio" name="event-when" checked={mode === 'now'} onChange={() => setMode('now')} /> Send now</label>
              <label className="event-target-option"><input type="radio" name="event-when" checked={mode === 'schedule'} onChange={() => setMode('schedule')} /> Schedule at campaign time</label>
              {mode === 'schedule' && <input type="datetime-local" min={localDateTime(campaign.currentTime)} value={scheduledAt} onChange={(event) => setScheduledAt(event.currentTarget.value)} required aria-label="Campaign time" />}
            </fieldset>

            {error && <p className="schedule-error" role="alert">{error}</p>}
            <button type="submit" className="dm-primary-action" disabled={busy}>{busy ? 'Sending...' : mode === 'now' ? `Send to ${resolvedTargets.length} character${resolvedTargets.length === 1 ? '' : 's'}` : 'Schedule event'}</button>
          </form>
          <aside className="event-composer-preview" aria-label="Preview">
            <p className="eyebrow">Preview</p>
            <EventCard title={title} description={description} skin={skin} campaignName={campaign.Name} meta={type} targets={previewTargets} />
          </aside>
        </div>
      </section>
    </div>
  )
}

// One effect at a time: choose the kind, fill its fields, add it for everyone or for one character.
function EffectBuilder({ isEssence, targets, onAdd }: { isEssence: boolean; targets: CharacterSheetRecord[]; onAdd: (effect: EventEffect, characterId: string | 'all') => void }) {
  const types = effectsForRuleset(isEssence)
  const [type, setType] = useState<EventEffectType>(types[0])
  const [who, setWho] = useState<string>('all')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [skillNames, setSkillNames] = useState<string[]>([])
  const [error, setError] = useState('')
  const field = (key: string, fallback = '') => fields[key] ?? fallback
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFields((current) => ({ ...current, [key]: event.currentTarget.value }))

  const essenceSample = targets.find((record) => record.Essence)?.Essence
  const metaKeys = useMemo(() => [...new Set(targets.flatMap((record) => Object.keys(record.Essence?.Development.Metaphysical ?? {})))], [targets])
  const statKeys = useMemo(() => [...new Set([...Object.keys(STAT_LABELS), ...targets.flatMap((record) => Object.keys(record.Essence?.Development.Stats ?? {}))])], [targets])
  const classicSkills = useMemo(() => [...new Set(targets.flatMap((record) => flattenSkills(record.Skills).map((skill) => skill.Name)))].sort(), [targets])
  const essenceNames = useMemo(() => [...new Set([...TREE_NODES.map((node) => node.name), ...targets.flatMap((record) => (record.Essence?.Essences ?? []).map((holding) => holding.Name))])], [targets])

  const number = (key: string, fallback: number) => { const value = Number(field(key, String(fallback))); return Number.isFinite(value) ? value : NaN }
  const whole = (key: string, fallback: number) => { const value = number(key, fallback); return Number.isInteger(value) ? value : NaN }

  const build = (): EventEffect | string => {
    switch (type) {
      case 'sheet-change': {
        const kind = (field('kind', 'Attributes')) as StepKind
        const options = sheetTargets(kind)
        const id = field('id', options[0]?.id ?? '')
        const amount = whole('amount', 1)
        if (!id) return 'Choose what to change.'
        if (!amount) return 'Enter a whole number other than zero.'
        return { type, kind, id, name: options.find((option) => option.id === id)?.label ?? id, amount }
      }
      case 'essence-adjust': {
        const name = field('name', essenceNames[0] ?? '')
        const delta = whole('delta', 100)
        if (!name) return 'Choose an essence.'
        if (!delta) return 'Enter a whole number other than zero.'
        return { type, name, delta, ...(field('note').trim() ? { note: field('note').trim() } : {}) }
      }
      case 'dm-points': { const amount = whole('amount', 10); return amount ? { type, amount } : 'Enter a whole number other than zero.' }
      case 'add-status': return field('name').trim() ? { type, status: { Name: field('name').trim(), Duration: field('duration').trim(), Rules: field('rules').trim() } } : 'Name the status.'
      case 'add-injury': return field('name').trim() ? { type, injury: { Location: field('location').trim(), Name: field('name').trim(), Duration: field('duration').trim(), Result: field('result').trim() } } : 'Name the injury.'
      case 'add-item': {
        const quantity = whole('quantity', 1)
        if (!field('name').trim()) return 'Name the item.'
        if (!(quantity > 0)) return 'Quantity must be a whole number above zero.'
        return { type, item: { Name: field('name').trim(), Quantity: quantity, Size: Math.max(0, number('size', 1) || 0), Burden: Math.max(0, number('burden', 0) || 0) } }
      }
      case 'resource-delta': { const delta = whole('delta', -5); return delta ? { type, pool: (field('pool', 'hp')) as ResourcePool, delta } : 'Enter a whole number other than zero.' }
      case 'add-note': return field('title').trim() ? { type, note: { Title: field('title').trim(), Body: field('body').trim() } } : 'Give the note a title.'
      case 'add-xp': { const amount = whole('amount', 100); return amount ? { type, amount } : 'Enter a whole number other than zero.' }
      case 'add-skill-progress': {
        const amount = number('amount', 10)
        if (skillNames.length === 0) return 'Choose at least one skill.'
        if (!amount) return 'Enter an amount other than zero.'
        return { type, skillNames, amount }
      }
      case 'level-up': return { type }
      case 'level-up-skill': { const skillName = field('skillName', classicSkills[0] ?? ''); return skillName ? { type, skillName } : 'Choose a skill.' }
    }
  }

  const sheetTargets = (kind: StepKind): { id: string; label: string }[] => {
    switch (kind) {
      case 'Attributes': case 'AttributeUses': return ESSENCE_ATTRIBUTES.map((attribute) => ({ id: attribute.Id, label: attribute.Name }))
      case 'Skills': case 'SkillUses': return ESSENCE_SKILLS.map((skill) => ({ id: skill.Id, label: `${skill.Name} (${ATTRIBUTE_GROUPS.find((group) => group.Id === skill.Group)?.Label ?? skill.Group})` }))
      case 'MetaphysicalUses': return (metaKeys.length ? metaKeys : Object.keys(essenceSample?.Development.Metaphysical ?? METAPHYSICAL_LABELS)).map((id) => ({ id, label: METAPHYSICAL_LABELS[id] ?? id }))
      case 'Stats': return statKeys.map((id) => ({ id, label: STAT_LABELS[id] ?? id }))
    }
  }

  const add = () => {
    const result = build()
    if (typeof result === 'string') { setError(result); return }
    setError('')
    onAdd(result, who)
  }

  const kind = field('kind', 'Attributes') as StepKind
  return (
    <div className="effect-builder">
      <div className="event-composer-row">
        <label className="dm-field-label">Effect
          <select value={type} onChange={(event) => { setType(event.currentTarget.value as EventEffectType); setFields({}); setError('') }}>
            {types.map((item) => <option key={item} value={item}>{EFFECT_TYPE_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="dm-field-label">Applies to
          <select value={who} onChange={(event) => setWho(event.currentTarget.value)}>
            <option value="all">Every recipient</option>
            {targets.map((record) => <option key={record.Id} value={record.Id}>{displayName(record)}</option>)}
          </select>
        </label>
      </div>
      <div className="event-composer-row effect-fields">
        {type === 'sheet-change' && <>
          <label className="dm-field-label">Kind<select value={kind} onChange={(event) => setFields((current) => ({ ...current, kind: event.currentTarget.value, id: '' }))}>{STEP_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="dm-field-label">Target<select value={field('id', sheetTargets(kind)[0]?.id ?? '')} onChange={set('id')}>{sheetTargets(kind).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="dm-field-label">Amount<input type="number" step={1} value={field('amount', '1')} onChange={set('amount')} /></label>
        </>}
        {type === 'essence-adjust' && <>
          <label className="dm-field-label">Essence<select value={field('name', essenceNames[0] ?? '')} onChange={set('name')}>{essenceNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="dm-field-label">Amount<input type="number" step={1} value={field('delta', '100')} onChange={set('delta')} /></label>
          <label className="dm-field-label">Note<input value={field('note')} maxLength={120} onChange={set('note')} /></label>
        </>}
        {type === 'dm-points' && <label className="dm-field-label">Points<input type="number" step={1} value={field('amount', '10')} onChange={set('amount')} /></label>}
        {type === 'add-status' && <>
          <label className="dm-field-label">Status<input value={field('name')} maxLength={80} onChange={set('name')} /></label>
          <label className="dm-field-label">Duration<input value={field('duration')} maxLength={80} onChange={set('duration')} /></label>
          <label className="dm-field-label">Rules<input value={field('rules')} maxLength={400} onChange={set('rules')} /></label>
        </>}
        {type === 'add-injury' && <>
          <label className="dm-field-label">Location<input value={field('location')} maxLength={80} onChange={set('location')} placeholder="e.g. Left arm" /></label>
          <label className="dm-field-label">Injury<input value={field('name')} maxLength={80} onChange={set('name')} /></label>
          <label className="dm-field-label">Duration<input value={field('duration')} maxLength={80} onChange={set('duration')} /></label>
          <label className="dm-field-label">Result<input value={field('result')} maxLength={400} onChange={set('result')} placeholder="e.g. -2 Agility" /></label>
        </>}
        {type === 'add-item' && <>
          <label className="dm-field-label">Item<input value={field('name')} maxLength={80} onChange={set('name')} /></label>
          <label className="dm-field-label">Quantity<input type="number" min={1} step={1} value={field('quantity', '1')} onChange={set('quantity')} /></label>
          <label className="dm-field-label">Size<input type="number" min={0} step={0.5} value={field('size', '1')} onChange={set('size')} /></label>
          <label className="dm-field-label">Burden<input type="number" min={0} step={0.5} value={field('burden', '0')} onChange={set('burden')} /></label>
        </>}
        {type === 'resource-delta' && <>
          <label className="dm-field-label">Pool<select value={field('pool', 'hp')} onChange={set('pool')}>{POOLS.map((pool) => <option key={pool.id} value={pool.id}>{pool.label}</option>)}</select></label>
          <label className="dm-field-label">Change<input type="number" step={1} value={field('delta', '-5')} onChange={set('delta')} /></label>
        </>}
        {type === 'add-note' && <>
          <label className="dm-field-label">Title<input value={field('title')} maxLength={120} onChange={set('title')} /></label>
          <label className="dm-field-label">Body<input value={field('body')} maxLength={2000} onChange={set('body')} /></label>
        </>}
        {type === 'add-xp' && <label className="dm-field-label">XP<input type="number" step={1} value={field('amount', '100')} onChange={set('amount')} /></label>}
        {type === 'add-skill-progress' && <>
          <label className="dm-field-label">Skills<select multiple size={Math.min(5, Math.max(2, classicSkills.length))} value={skillNames} onChange={(event) => setSkillNames(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{classicSkills.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="dm-field-label">Progress per skill<input type="number" min={0.1} max={100} step={0.1} value={field('amount', '10')} onChange={set('amount')} /></label>
        </>}
        {type === 'level-up-skill' && <label className="dm-field-label">Skill<select value={field('skillName', classicSkills[0] ?? '')} onChange={set('skillName')}>{classicSkills.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
        <button type="button" className="dm-secondary-action" onClick={add} disabled={targets.length === 0}>Add effect</button>
      </div>
      {error && <small className="schedule-error" role="alert">{error}</small>}
    </div>
  )
}
