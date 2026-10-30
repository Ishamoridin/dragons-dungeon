import { useState, type ReactNode } from 'react'
import { ClipboardCheck, ClipboardX } from 'lucide-react'
import { attemptRoll20, toChatCommand, toMacro, type Roll } from './Roll20'

type CopyState = 'idle' | 'chat' | 'macro' | 'failed'

export default function RollButton({ roll, text = 'Roll', children, className = '', attemptRoll = false }: { roll: Roll; text?: string; children?: ReactNode; className?: string; attemptRoll?: boolean }) {
  const [state, setState] = useState<CopyState>('idle')
  const [delivery, setDelivery] = useState('')

  const activate = async () => {
    const command = toChatCommand(roll)
    const clipboard = copy(command, 'chat')
    if (attemptRoll) {
      setDelivery('Checking Roll20...')
      const result = await attemptRoll20(command)
      setDelivery(result.sent > 0 ? `Sent to ${result.sent} Roll20 tab${result.sent === 1 ? '' : 's'}.` : result.reason)
    }
    await clipboard
  }

  const copy = async (text: string, next: CopyState) => {
    try {
      await navigator.clipboard.writeText(text)
      setState(next)
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 1500)
  }

  const labels: Record<CopyState, string> = { idle: text, chat: 'Copied', macro: 'Macro copied', failed: 'Copy failed' }

  return (
    <button
      type="button"
      className={`roll-button ${className}`.trim()}
      data-copy-state={state}
      title={`Click: copy ${toChatCommand(roll)} · Right-click: copy macro${state === 'idle' ? '' : ` · ${labels[state]}`}${delivery ? ` · ${delivery}` : ''}`}
      aria-label={`Roll ${roll.name} ${roll.label}`}
      onClick={() => void activate()}
      onContextMenu={(event) => {
        event.preventDefault()
        void copy(toMacro(roll), 'macro')
      }}
    >
      {children ?? labels[state]}
      {children && state !== 'idle' && <span className="combat-roll-indicator" aria-hidden="true">{state === 'failed' ? <ClipboardX size={12} /> : <ClipboardCheck size={12} />}</span>}
      {children && <small className="combat-roll-feedback" role="status">{state === 'idle' ? '' : labels[state]}{delivery ? ` ${delivery}` : ''}</small>}
    </button>
  )
}
