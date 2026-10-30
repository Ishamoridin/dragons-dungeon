import { useId, useState, type ReactNode } from 'react'
import type { EssenceArmourPiece, EssenceCharacterData } from './EssenceTypes'
import { listItemCatalog, type ArmourCatalogEntry } from './EssenceItemCatalog'

// Body locations from the workbook's long-term injury table.
export const INJURY_LOCATIONS = [
  'Brain', 'Skull', 'Eyes', 'Mouth', 'Neck', 'Throat', 'Ribs', 'Vascular', 'Respiratory', 'Digestive', 'Kidneys',
  'Liver', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg', 'Muscle', 'Skin', 'Aura', 'Essence', 'Soul',
]

type Edit = (mutate: (draft: EssenceCharacterData) => void) => void

const fmt = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
const signed = (value: number): string => (value > 0 ? `+${fmt(value)}` : fmt(value))

function LabeledField({ label, value, set, type = 'text' }: { label: string; value: string; set: (value: string) => void; type?: string }) {
  const id = useId()
  return (
    <label className="essence-field" htmlFor={id}>
      <span className="essence-field-label">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => set(event.currentTarget.value)}
      />
    </label>
  )
}

// A humanoid "ragdoll" layout used to lay armour and injuries out by body part.
type RagdollArea = 'head' | 'neck' | 'torso' | 'larm' | 'rarm' | 'lhand' | 'rhand' | 'lleg' | 'rleg' | 'lfoot' | 'rfoot'

const RAGDOLL_LAYOUT: { area: RagdollArea; label: string }[] = [
  { area: 'head', label: 'Head' },
  { area: 'neck', label: 'Neck' },
  { area: 'larm', label: 'L. Arm' },
  { area: 'rarm', label: 'R. Arm' },
  { area: 'torso', label: 'Torso' },
  { area: 'lhand', label: 'L. Hand' },
  { area: 'rhand', label: 'R. Hand' },
  { area: 'lleg', label: 'L. Leg' },
  { area: 'rleg', label: 'R. Leg' },
  { area: 'lfoot', label: 'L. Foot' },
  { area: 'rfoot', label: 'R. Foot' },
]

function Ragdoll({ parts, onSelect, onEquip, titles, hideArms = false }: {
  parts: Partial<Record<RagdollArea, ReactNode[]>>
  onSelect?: (area: RagdollArea) => void
  onEquip?: (area: RagdollArea) => void
  titles?: Partial<Record<RagdollArea, string>>
  hideArms?: boolean
}) {
  return (
    <div className="ragdoll">
      {RAGDOLL_LAYOUT.map(({ area, label }) => {
        if (hideArms && (area === 'larm' || area === 'rarm')) return null
        const content = parts[area] ?? []
        const className = `ragdoll-part ragdoll-${area} ${content.length ? 'ragdoll-part-filled' : 'ragdoll-part-empty'}`
        const contextMenu = onEquip
          // Deferred via setTimeout so the browser's own post-contextmenu "auxclick" (fired for the
          // right mouse button at the same screen position) lands before the picker modal mounts,
          // instead of immediately selecting whatever row happens to render under the cursor.
          ? (event: React.MouseEvent) => { event.preventDefault(); setTimeout(() => onEquip(area), 0) }
          : undefined
        if (onSelect && content.length > 0) {
          return (
            <button type="button" className={`${className} ragdoll-slot-button`} key={area}
              title={titles?.[area]} aria-label={`${label}: ${titles?.[area] ?? 'Equipment'}`}
              onClick={() => onSelect(area)} onContextMenu={contextMenu}>
              <span className="ragdoll-part-label">{label}</span>
              {content}
            </button>
          )
        }
        return (
          <div className={className} key={area} onContextMenu={contextMenu}
            title={onEquip ? `Right-click to equip ${label}` : undefined}>
            <span className="ragdoll-part-label">{label}</span>
            {content.length > 0 ? content : <small className="essence-note">Bare</small>}
          </div>
        )
      })}
    </div>
  )
}

// Maps a free-text armour slot name (set by the DM) onto the ragdoll area(s) it covers.
function armourAreas(slot: string): RagdollArea[] {
  const key = slot.toLowerCase()
  if (/helm|head|hood|mask|hat|crown/.test(key)) return ['head']
  if (/neck|collar|gorget|cape|cloak/.test(key)) return ['neck']
  if (/chest|torso|body|cuirass|breastplate|tunic|robe|vest|jacket/.test(key)) return ['torso']
  if (/pauldron|shoulder|bracer|vambrace|sleeve/.test(key)) return ['larm', 'rarm']
  if (/glove|gauntlet|hand/.test(key)) return ['lhand', 'rhand']
  if (/greave|legging|pant|thigh/.test(key)) return ['lleg', 'rleg']
  if (/boot|sabaton|shoe|foot|feet/.test(key)) return ['lfoot', 'rfoot']
  return []
}

// Maps a long-term injury location onto a single ragdoll area, or 'general' for systemic effects
// (Muscle, Skin, Aura, Essence, Soul) that don't correspond to one body part.
const INJURY_AREA: Record<string, RagdollArea | 'general'> = {
  Brain: 'head', Skull: 'head', Eyes: 'head', Mouth: 'head',
  Neck: 'neck', Throat: 'neck',
  Ribs: 'torso', Vascular: 'torso', Respiratory: 'torso', Digestive: 'torso', Kidneys: 'torso', Liver: 'torso',
  'Left Arm': 'larm', 'Right Arm': 'rarm',
  'Left Leg': 'lleg', 'Right Leg': 'rleg',
  Muscle: 'general', Skin: 'general', Aura: 'general', Essence: 'general', Soul: 'general',
}

// A small outline-icon per ragdoll area, so equipped armour reads as silhouette pieces on a
// paperdoll rather than text, no matter what the DM named the underlying slot.
function slotIcon(area: RagdollArea) {
  switch (area) {
    case 'head':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7v4a2 2 0 0 0-1 1.7V17a2 2 0 0 0 2 2h1v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V19h1a2 2 0 0 0 2-2v-2.3A2 2 0 0 0 19 13V9a7 7 0 0 0-7-7Z" /></svg>
      )
    case 'neck':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9c2.5 2.3 5 3.4 8 3.4S17.5 11.3 20 9v3c-2.6 2.3-5.2 3.4-8 3.4S6.6 14.3 4 12Z" /></svg>
      )
    case 'torso':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2 6 4v3L3 9v11a1 1 0 0 0 1 1h4v-6h8v6h4a1 1 0 0 0 1-1V9l-3-2V4l-2-2-2 2-1 1-1-1Z" /></svg>
      )
    case 'larm':
    case 'rarm':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h8l2 5-3 2-1-3H9l-1 3-3-2Z" /><rect x="9" y="8" width="6" height="12" rx="2" /></svg>
      )
    case 'lhand':
    case 'rhand':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2a1.5 1.5 0 0 1 3 0v6a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-5c0-.9.6-1.6 1.4-1.9L9 8.6Z" /></svg>
      )
    case 'lleg':
    case 'rleg':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="9" rx="2" /><rect x="7" y="12" width="5" height="10" rx="1.5" /><rect x="12" y="12" width="5" height="10" rx="1.5" /></svg>
      )
    case 'lfoot':
    case 'rfoot':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h6v9.5l5.2 2.3A3 3 0 0 1 18 20.5V21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /></svg>
      )
    default:
      return null
  }
}

const RAGDOLL_LABELS: Record<RagdollArea, string> = Object.fromEntries(
  RAGDOLL_LAYOUT.map(({ area, label }) => [area, label]),
) as Record<RagdollArea, string>

function ArmourPickerModal({ area, equipped, onPick, onClose }: {
  area: RagdollArea
  equipped?: EssenceArmourPiece
  onPick: (entry: ArmourCatalogEntry | null) => void
  onClose: () => void
}) {
  const options = listItemCatalog().filter((entry) => armourAreas(entry.Slot).includes(area))
  const label = RAGDOLL_LABELS[area]
  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal armour-picker-modal" role="dialog" aria-modal="true" aria-labelledby="armour-picker-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">Equip · {label}</p>
            <h2 id="armour-picker-title">Choose armour</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        <div className="armour-picker-list">
          <button type="button" className={`armour-picker-row ${!equipped ? 'armour-picker-row-active' : ''}`} onClick={() => onPick(null)}>
            <strong>Nothing</strong>
            <small>Unequip this slot</small>
          </button>
          {options.map((item) => (
            <button
              type="button"
              key={item.Id}
              className={`armour-picker-row ${equipped?.Name === item.Name ? 'armour-picker-row-active' : ''}`}
              onClick={() => onPick(item)}
            >
              <div className="essence-armour-heading">
                <strong>{item.Name}</strong>
                <span>{item.ArmourValue + item.ArmourMod} armour</span>
              </div>
              <small>{item.Type} · Dodge {signed(item.DodgeMod)} · Def {signed(item.DefenseMod)} · Ath {signed(item.AthleticsMod)} · Rei {signed(item.MaxReiMod)} · Size {item.Burden}</small>
            </button>
          ))}
          {options.length === 0 && <p className="essence-note">No catalogued items for this slot yet. Add some from the DM Screen's Items tab.</p>}
        </div>
      </section>
    </div>
  )
}

function ArmourDetailModal({ piece, onClose }: { piece: EssenceArmourPiece; onClose: () => void }) {
  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal armour-detail-modal" role="dialog" aria-modal="true" aria-labelledby="armour-detail-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{piece.Slot}{piece.Type ? ` · ${piece.Type}` : ''}</p>
            <h2 id="armour-detail-title">{piece.Name}</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        <div className="essence-stat-grid">
          <div><span>Armour</span><strong>{fmt(piece.ArmourValue + piece.ArmourMod)}</strong>{piece.ArmourMod !== 0 && <small>{fmt(piece.ArmourValue)} base, {signed(piece.ArmourMod)} mod</small>}</div>
          <div><span>Dodge</span><strong>{signed(piece.DodgeMod)}</strong></div>
          <div><span>Defense</span><strong>{signed(piece.DefenseMod)}</strong></div>
          <div><span>Athletics</span><strong>{signed(piece.AthleticsMod)}</strong></div>
          <div><span>Max Reiryoku</span><strong>{signed(piece.MaxReiMod)}</strong></div>
          <div><span>Burden</span><strong>{fmt(piece.Burden)}</strong></div>
        </div>
      </section>
    </div>
  )
}

export function ArmourPanel({ data, onEdit }: { data: EssenceCharacterData; onEdit?: Edit }) {
  const [active, setActive] = useState<EssenceArmourPiece | null>(null)
  const [pickerArea, setPickerArea] = useState<RagdollArea | null>(null)
  const parts: Partial<Record<RagdollArea, ReactNode[]>> = {}
  const equipped: Partial<Record<RagdollArea, EssenceArmourPiece>> = {}
  const titles: Partial<Record<RagdollArea, string>> = {}
  const other: EssenceArmourPiece[] = []

  data.Armour.forEach((piece, index) => {
    const areas = armourAreas(piece.Slot)
    if (areas.length === 0) { other.push(piece); return }
    areas.forEach((area) => {
      equipped[area] ??= piece
      titles[area] = titles[area] ? `${titles[area]}, ${piece.Name}` : piece.Name;
      (parts[area] ??= []).push(
        <span
          key={`${area}-${piece.Slot}-${piece.Name}-${index}`}
          className="ragdoll-item ragdoll-item-icon"
        >
          {slotIcon(area)}
        </span>,
      )
    })
  })

  const equip = (area: RagdollArea, entry: ArmourCatalogEntry | null) => {
    if (!onEdit) return
    const current = equipped[area]
    const affected = current ? armourAreas(current.Slot) : entry ? armourAreas(entry.Slot) : [area]
    onEdit((draft) => {
      draft.Armour = draft.Armour.filter((piece) => !armourAreas(piece.Slot).some((area) => affected.includes(area)))
      if (entry) {
        draft.Armour.push({
          Slot: entry.Slot,
          Name: entry.Name,
          Type: entry.Type,
          ArmourValue: entry.ArmourValue,
          DodgeMod: entry.DodgeMod,
          DefenseMod: entry.DefenseMod,
          AthleticsMod: entry.AthleticsMod,
          MaxReiMod: entry.MaxReiMod,
          Burden: entry.Burden,
          ArmourMod: entry.ArmourMod,
        })
      }
    })
    setPickerArea(null)
  }

  return (
    <section className="essence-panel ragdoll-panel">
      <h2>Armour</h2>
      <Ragdoll
        hideArms
        parts={parts}
        titles={titles}
        onSelect={(area) => setActive(equipped[area] ?? null)}
        onEquip={onEdit ? (area) => setPickerArea(area) : undefined}
      />
      {onEdit && <p className="essence-note">Right-click a body part to equip or change its armour.</p>}
      {other.length > 0 && (
        <>
          <h3>Other gear</h3>
          <div className="essence-skill-list">
            {other.map((piece, index) => (
              <button
                type="button"
                className="essence-armour-row essence-armour-row-button"
                key={`${piece.Slot}-${piece.Name}-${index}`}
                title={piece.Name}
                onClick={() => setActive(piece)}
              >
                <div className="essence-armour-heading">
                  <strong>{piece.Name}</strong>
                  <span>{piece.ArmourValue + piece.ArmourMod} armour</span>
                </div>
                <small>{piece.Slot} · {piece.Type}</small>
                <small>Dodge {signed(piece.DodgeMod)} · Def {signed(piece.DefenseMod)} · Ath {signed(piece.AthleticsMod)} · Rei {signed(piece.MaxReiMod)}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {active && <ArmourDetailModal piece={active} onClose={() => setActive(null)} />}
      {pickerArea && (
        <ArmourPickerModal
          area={pickerArea}
          equipped={equipped[pickerArea]}
          onPick={(entry) => equip(pickerArea, entry)}
          onClose={() => setPickerArea(null)}
        />
      )}
    </section>
  )
}

export function InjuriesPanel({ data, onEdit }: { data: EssenceCharacterData; onEdit?: Edit }) {
  const injuries = data.Injuries ?? []
  const statuses = data.Statuses ?? []
  const [location, setLocation] = useState(INJURY_LOCATIONS[0])
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('')
  const [result, setResult] = useState('')
  const [statusName, setStatusName] = useState('')
  const [statusDuration, setStatusDuration] = useState('')
  const [statusRules, setStatusRules] = useState('')

  const parts: Partial<Record<RagdollArea, ReactNode[]>> = {}
  const general: typeof injuries = []
  injuries.forEach((injury, index) => {
    const area = INJURY_AREA[injury.Location]
    const node = (
      <div className="ragdoll-item" key={`${injury.Location}-${injury.Name}-${index}`}>
        <strong>{injury.Name}</strong>
        <small>{injury.Duration || 'No duration set'}</small>
      </div>
    )
    if (!area || area === 'general') { general.push(injury); return }
    ;(parts[area] ??= []).push(node)
  })

  return (
    <section className="essence-panel">
      <h2>Injuries</h2>
      <h3>Long-term injuries</h3>
      {injuries.length === 0 && <p className="essence-note">No long-term injuries.</p>}
      {injuries.length > 0 && (
        <div className="ragdoll-panel">
          <Ragdoll parts={parts} />
          {general.length > 0 && (
            <>
              <h3>Systemic effects</h3>
              <div className="essence-chips">
                {general.map((injury, index) => (
                  <span className="essence-record" key={`${injury.Location}-${injury.Name}-${index}`}>
                    <strong>{injury.Location}: {injury.Name}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {injuries.map((injury, index) => (
        <div className="essence-record" key={`${injury.Location}-${index}`}>
          <strong>{injury.Location}: {injury.Name}</strong>
          <small>{injury.Duration || 'No duration set'}</small>
          {injury.Result && <p>{injury.Result}</p>}
          {onEdit && <button type="button" onClick={() => onEdit((draft) => { draft.Injuries = (draft.Injuries ?? []).filter((_, i) => i !== index) })}>Remove</button>}
        </div>
      ))}
      {onEdit && (
        <div className="essence-record-form">
          <label className="essence-field">
            <span className="essence-field-label">Injury location</span>
            <select value={location} onChange={(event) => setLocation(event.currentTarget.value)}>
              {INJURY_LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <LabeledField label="Injury name" value={name} set={setName} />
          <LabeledField label="Duration" value={duration} set={setDuration} />
          <LabeledField label="Wound result" value={result} set={setResult} />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              const injury = { Location: location, Name: name.trim(), Duration: duration.trim(), Result: result.trim() }
              onEdit((draft) => { draft.Injuries = [...(draft.Injuries ?? []), injury] })
              setName(''); setDuration(''); setResult('')
            }}
          >
            Add injury
          </button>
        </div>
      )}

      <h3>Special status</h3>
      {statuses.length === 0 && <p className="essence-note">No special status.</p>}
      {statuses.map((status, index) => (
        <div className="essence-record" key={`${status.Name}-${index}`}>
          <strong>{status.Name}</strong>
          <small>{status.Duration || 'No duration set'}</small>
          {status.Rules && <p>{status.Rules}</p>}
          {onEdit && <button type="button" onClick={() => onEdit((draft) => { draft.Statuses = (draft.Statuses ?? []).filter((_, i) => i !== index) })}>Remove</button>}
        </div>
      ))}
      {onEdit && (
        <div className="essence-record-form">
          <LabeledField label="Status name" value={statusName} set={setStatusName} />
          <LabeledField label="Status duration" value={statusDuration} set={setStatusDuration} />
          <LabeledField label="Status rules" value={statusRules} set={setStatusRules} />
          <button
            type="button"
            disabled={!statusName.trim()}
            onClick={() => {
              const status = { Name: statusName.trim(), Duration: statusDuration.trim(), Rules: statusRules.trim() }
              onEdit((draft) => { draft.Statuses = [...(draft.Statuses ?? []), status] })
              setStatusName(''); setStatusDuration(''); setStatusRules('')
            }}
          >
            Add status
          </button>
        </div>
      )}
    </section>
  )
}

// Always show at least 8 slots, in rows of 4, with at least one free slot after the last item
// so the backpack always reads as a grid rather than a bare list.
function backpackSlotCount(itemCount: number): number {
  return Math.max(8, Math.ceil((itemCount + 1) / 4) * 4)
}

export function InventoryPanel({ data, maxBurden, onEdit }: { data: EssenceCharacterData; maxBurden: number; onEdit?: Edit }) {
  const items = data.Inventory ?? []
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [size, setSize] = useState('1')
  const [burden, setBurden] = useState('1')
  const carried = items.reduce((total, item) => total + item.Burden, 0)
  const worn = data.Armour.reduce((total, piece) => total + piece.Burden, 0)
  const currentBurden = carried + worn
  const slotCount = backpackSlotCount(items.length)

  return (
    <section className="essence-panel backpack-panel">
      <h2>Inventory</h2>
      <p className="essence-note">Current burden {currentBurden} / {maxBurden} · inventory {carried} · armour {worn}</p>
      <div className="backpack-grid">
        {Array.from({ length: slotCount }, (_, slot) => {
          const item = items[slot]
          if (!item) {
            return <div className="backpack-slot backpack-slot-empty" key={`empty-${slot}`} aria-hidden="true" />
          }
          return (
            <div className="backpack-slot backpack-slot-filled" key={`${item.Name}-${slot}`}>
              <strong>{item.Name}</strong>
              <small>Size {item.Size}</small>
              <span>x{item.Quantity}</span>
              <small>
                Burden {item.Burden}
                {onEdit && <button type="button" className="essence-inline-button" onClick={() => onEdit((draft) => { draft.Inventory = (draft.Inventory ?? []).filter((_, i) => i !== slot) })}>Remove</button>}
              </small>
            </div>
          )
        })}
      </div>
      {onEdit && (
        <div className="essence-record-form">
          <LabeledField label="Item name" value={name} set={setName} />
          <LabeledField label="Quantity" value={quantity} set={setQuantity} type="number" />
          <LabeledField label="Size" value={size} set={setSize} type="number" />
          <LabeledField label="Burden" value={burden} set={setBurden} type="number" />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              const item = { Name: name.trim(), Quantity: Number(quantity) || 1, Size: Number(size) || 0, Burden: Number(burden) || 0 }
              onEdit((draft) => { draft.Inventory = [...(draft.Inventory ?? []), item] })
              setName('')
            }}
          >
            Add item
          </button>
        </div>
      )}
    </section>
  )
}
