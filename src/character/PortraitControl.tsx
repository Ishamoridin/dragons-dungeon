import { useId, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { readPortraitFile, type Portrait } from './Portrait'
import './portrait.css'

// Shows a character's portrait and, when editable, lets the viewer upload or remove it. The palette sampled from
// the image is what themes the surrounding sheet.
export default function PortraitControl({ portrait, name, onChange, compact = false }: {
  portrait: Portrait | null | undefined
  name: string
  onChange?: (portrait: Portrait | null) => void
  compact?: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (file: File | undefined) => {
    if (!file || !onChange) return
    setBusy(true); setError('')
    try { onChange(await readPortraitFile(file)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to read that image.') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }

  return (
    <figure className={`portrait-control${compact ? ' portrait-control-compact' : ''}${portrait ? '' : ' portrait-control-empty'}`}>
      <div className="portrait-frame" aria-hidden={!portrait}>
        {portrait
          ? <img src={portrait.DataUrl} alt={`Portrait of ${name}`} />
          : <span className="portrait-placeholder">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'}</span>}
      </div>
      {onChange && (
        <figcaption className="portrait-actions">
          <input ref={inputRef} id={inputId} type="file" accept="image/*" hidden disabled={busy} onChange={(event) => void pick(event.currentTarget.files?.[0])} />
          <label htmlFor={inputId} className={`portrait-upload${busy ? ' portrait-upload-busy' : ''}`} role="button" tabIndex={busy ? -1 : 0}
            onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !busy) { event.preventDefault(); inputRef.current?.click() } }}>
            <ImagePlus size={16} aria-hidden="true" />{busy ? 'Reading image...' : portrait ? 'Replace image' : 'Upload image'}
          </label>
          {portrait && <button type="button" className="portrait-remove" disabled={busy} onClick={() => onChange(null)}><Trash2 size={14} aria-hidden="true" />Remove</button>}
          {error && <small className="portrait-error" role="alert">{error}</small>}
        </figcaption>
      )}
    </figure>
  )
}
