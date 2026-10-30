import { useState } from 'react'
import { toChatCommand, toMacro, type Roll } from './Roll20'

type CopyState = 'idle' | 'chat' | 'macro' | 'failed'

export default function RollButton({ roll, text = 'Roll' }: { roll: Roll; text?: string }) {
  const [state, setState] = useState<CopyState>('idle')

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
      className="roll-button"
      title={`Click: copy ${toChatCommand(roll)} · Right-click: copy macro`}
      aria-label={`Roll ${roll.name} ${roll.label}`}
      onClick={() => void copy(toChatCommand(roll), 'chat')}
      onContextMenu={(event) => {
        event.preventDefault()
        void copy(toMacro(roll), 'macro')
      }}
    >
      {labels[state]}
    </button>
  )
}
