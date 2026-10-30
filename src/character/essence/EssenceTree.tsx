import { useState } from 'react'
import type { EssenceHolding, EssenceTechnique } from './EssenceTypes'
import type { EssenceChange } from './EssenceChanges'
import { combinesInto, textOn, treeNode, TREE_NODES, type TreeNode } from './EssenceTreeData'

const NODES = TREE_NODES

const NODE_W = 172
const NODE_H = 38
const GAP_X = 56
const ROW_H = 24
const FIRST_ROW = 32
const LAST_ROW = 62

const left = (node: TreeNode) => (node.tier - 1) * (NODE_W + GAP_X)
const top = (node: TreeNode) => (node.row - FIRST_ROW) * ROW_H

const WIDTH = 5 * NODE_W + 4 * GAP_X
const HEIGHT = (LAST_ROW - FIRST_ROW) * ROW_H + NODE_H

const byName = new Map(NODES.map((node) => [node.name, node]))

// Lines run from each ingredient to what it combines into; same-tier links (Light to Violation, Harmony to Breach) run vertically.
function edgePath(parent: TreeNode, child: TreeNode): string {
  if (parent.tier === child.tier) {
    const x = left(parent) + NODE_W / 2
    const goingDown = child.row > parent.row
    const y1 = goingDown ? top(parent) + NODE_H : top(parent)
    const y2 = goingDown ? top(child) : top(child) + NODE_H
    return `M ${x} ${y1} L ${x} ${y2}`
  }
  const x1 = left(parent) + NODE_W
  const y1 = top(parent) + NODE_H / 2
  const x2 = left(child)
  const y2 = top(child) + NODE_H / 2
  const bend = (x2 - x1) / 2
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

type TemperingNote = { title: string; text: string }

// Tempering descriptions come from the character's own "Tempered by ..." techniques.
function temperingNotes(name: string, techniques: EssenceTechnique[]): TemperingNote[] {
  const word = new RegExp(`\\b${name}\\b`, 'i')
  return techniques
    .filter((technique) => /temper/i.test(technique.Name) && word.test(technique.Name))
    .map((technique) => ({ title: technique.Name, text: technique.Details }))
}

function QuantityDialog({
  title,
  max,
  askNote,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  max?: number
  askNote: boolean
  confirmLabel: string
  onCancel: () => void
  onConfirm: (amount: number, note: string) => void
}) {
  const [amount, setAmount] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  return (
    <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={onCancel}>
      <form
        className="dm-character-modal change-dialog"
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="essence-quantity-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!Number.isInteger(amount) || amount < 1) {
            setError('Enter a whole number above zero.')
          } else if (max !== undefined && amount > max) {
            setError(`Only ${max} is available.`)
          } else {
            onConfirm(amount, note)
          }
        }}
      >
        <h2 id="essence-quantity-title">{title}</h2>
        <label className="dm-field-label">Quantity
          <input
            type="number"
            min={1}
            max={max}
            step={1}
            value={amount}
            autoFocus
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber
              setAmount(Number.isNaN(value) ? 0 : value)
              setError('')
            }}
          />
        </label>
        {askNote && (
          <label className="dm-field-label">Note (optional)
            <textarea
              rows={2}
              value={note}
              onChange={(event) => {
                const value = event.currentTarget.value
                setNote(value)
              }}
            />
          </label>
        )}
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <div className="change-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="dm-primary-action">{confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}

function EssenceDialog({
  node,
  holding,
  techniques,
  playerView,
  onSelect,
  onChange,
  onClose,
}: {
  node: TreeNode
  holding?: EssenceHolding
  techniques: EssenceTechnique[]
  playerView: boolean
  onSelect: (name: string) => void
  onChange?: (change: EssenceChange) => void
  onClose: () => void
}) {
  const [quantity, setQuantity] = useState<'add' | 'remove' | null>(null)
  const amount = holding?.Amount ?? 0
  const into = combinesInto(node.name)
  const notes = temperingNotes(node.name, techniques)

  const link = (name: string) => (
    <button type="button" className="essence-link" key={name} style={{ background: treeNode(name)?.color, color: textOn(treeNode(name)?.color ?? '#000000') }} onClick={() => onSelect(name)}>
      {name}
    </button>
  )

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal essence-dialog" role="dialog" aria-modal="true" aria-labelledby="essence-dialog-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div className="essence-dialog-title">
            <span className="essence-swatch" style={{ background: node.color }} aria-hidden="true" />
            <div>
              <p className="eyebrow">Tier {node.tier}{holding?.Tempered ? ' \u00b7 Tempered' : ''}</p>
              <h2 id="essence-dialog-title">{node.name}</h2>
            </div>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>

        <div className="essence-amount">
          <span>Available</span>
          <strong>{amount.toLocaleString()}</strong>
          {onChange && (
            <span className="essence-amount-actions">
              <button type="button" onClick={() => setQuantity('add')}>Add</button>
              <button type="button" onClick={() => setQuantity('remove')} disabled={amount === 0}>Remove</button>
            </span>
          )}
        </div>

        <div className="essence-dialog-block">
          <h3>Combines from</h3>
          {node.from.length === 0 ? <p className="essence-note">A base essence; it is harvested, cultivated or looted rather than combined.</p> : (
            <>
              <div className="essence-link-row">{node.from.map(link)}</div>
              <p className="essence-note">Refinement rate {node.rate}</p>
            </>
          )}
        </div>

        <div className="essence-dialog-block">
          <h3>Combines into</h3>
          {into.length === 0 ? <p className="essence-note">Nothing further.</p> : (
            <>
              <div className="essence-link-row">{into.map((target) => link(target.name))}</div>
              {into.map((target) => <p className="essence-note" key={target.name}>{target.from.join(' + ')} makes {target.name} ({target.rate})</p>)}
            </>
          )}
        </div>

        <div className="essence-dialog-block">
          <h3>Tempering</h3>
          {notes.length === 0 ? (
            <p className="essence-note">{holding?.Tempered ? 'Tempered, but this character has no description for it.' : 'No tempering description is recorded for this essence.'}</p>
          ) : notes.map((note) => (
            <details className="essence-detail" key={note.title} open>
              <summary><strong>{note.title}</strong></summary>
              {toTempParagraphs(note.text).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </details>
          ))}
        </div>
      </section>

      {quantity && onChange && (
        <QuantityDialog
          title={`${quantity === 'add' ? 'Add' : 'Remove'} ${node.name}`}
          max={quantity === 'remove' ? amount : undefined}
          askNote={playerView}
          confirmLabel={quantity === 'add' ? 'Add' : 'Remove'}
          onCancel={() => setQuantity(null)}
          onConfirm={(value, note) => {
            setQuantity(null)
            onChange({ name: node.name, delta: quantity === 'add' ? value : -value, note })
          }}
        />
      )}
    </div>
  )
}

const toTempParagraphs = (text: string): string[] =>
  text.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

export default function EssenceTree({
  holdings,
  techniques,
  role,
  onChange,
}: {
  holdings: EssenceHolding[]
  techniques: EssenceTechnique[]
  role: 'player' | 'dm'
  onChange?: (change: EssenceChange) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const held = new Map(holdings.map((holding) => [holding.Name, holding]))
  const edges = NODES.flatMap((child) => child.from.map((name) => ({ parent: byName.get(name)!, child })))
  const selectedNode = selected ? byName.get(selected) : undefined

  return (
    <section className="essence-panel essence-tree-panel">
      <h2>Essences</h2>
      <p className="essence-note">
        Refinement combines 100 of two essences into 1 of the next tier. Lines run from each ingredient to what it makes; Light also refines into Violation at 200:1, and Harmony converts to Breach at 1:1. T marks a Tempered essence.
      </p>
      <div className="essence-tree-scroll">
        <div className="essence-tree-heads" style={{ width: WIDTH }}>
          {[1, 2, 3, 4, 5].map((tier) => <span key={tier} style={{ left: (tier - 1) * (NODE_W + GAP_X), width: NODE_W }}>Tier {tier}</span>)}
        </div>
        <div className="essence-tree" style={{ width: WIDTH, height: HEIGHT }}>
          <svg className="essence-tree-lines" width={WIDTH} height={HEIGHT} aria-hidden="true">
            {edges.map(({ parent, child }) => (
              <path key={`${parent.name}-${child.name}`} d={edgePath(parent, child)} className={(held.get(parent.name)?.Amount ?? 0) > 0 && (held.get(child.name)?.Amount ?? 0) > 0 ? 'lit' : undefined} />
            ))}
          </svg>
          <ul className="essence-tree-nodes">
            {NODES.map((node) => {
              const holding = held.get(node.name)
              const amount = holding?.Amount ?? 0
              return (
                <li key={node.name} style={{ left: left(node), top: top(node), width: NODE_W, height: NODE_H }}>
                  <button
                    type="button"
                    className={`essence-node tier-${node.tier}${amount === 0 ? ' empty' : ''}${holding?.Tempered ? ' tempered' : ''}`}
                    style={{ background: node.color, color: textOn(node.color) }}
                    title={node.from.length > 0 ? `${node.from.join(' + ')} (${node.rate})` : 'Base essence'}
                    aria-label={`${node.name}: ${amount}${holding?.Tempered ? ', tempered' : ''}`}
                    onClick={() => setSelected(node.name)}
                  >
                    <strong>{node.name}{holding?.Tempered ? ' \u00b7T' : ''}</strong>
                    <span>{amount.toLocaleString()}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      {selectedNode && (
        <EssenceDialog
          node={selectedNode}
          holding={held.get(selectedNode.name)}
          techniques={techniques}
          playerView={role === 'player'}
          onSelect={setSelected}
          onChange={onChange}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}
