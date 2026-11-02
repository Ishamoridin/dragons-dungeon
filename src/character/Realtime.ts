import { apiOrigin } from './Api'

// Live updates. The API announces every committed write over a WebSocket at /api/events; this module keeps one
// connection open while a user is signed in and re-broadcasts each message as a `data-changed` window event
// carrying { kind, id, action, version, actorId }. Views listen for that and re-fetch through the usual routes.

export type DataChange = { type: 'change'; kind: string; id: string; action: 'create' | 'update' | 'delete'; version: number; actorId: string | null }

const MAX_BACKOFF_MS = 30_000

let socket: WebSocket | null = null
let wanted = false
let attempts = 0
let retry: number | null = null

export const realtimeUrl = (): string => {
  const base = apiOrigin || window.location.origin
  return `${base.replace(/^http/, 'ws')}/api/events`
}

function open() {
  if (socket || !wanted || typeof WebSocket === 'undefined') return
  const ws = new WebSocket(realtimeUrl())
  socket = ws
  ws.onopen = () => { attempts = 0; window.dispatchEvent(new Event('realtime-connected')) }
  ws.onmessage = (event) => {
    let message: Partial<DataChange> | null = null
    try { message = JSON.parse(String(event.data)) } catch { return }
    if (message?.type === 'change' && message.kind && message.id) {
      window.dispatchEvent(new CustomEvent<DataChange>('data-changed', { detail: message as DataChange }))
    }
  }
  ws.onerror = () => ws.close()
  ws.onclose = () => {
    if (socket === ws) socket = null
    window.dispatchEvent(new Event('realtime-disconnected'))
    if (!wanted) return
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 5))
    attempts += 1
    retry = window.setTimeout(() => { retry = null; open() }, delay)
  }
}

export function connectRealtime(): void {
  wanted = true
  open()
}

export function disconnectRealtime(): void {
  wanted = false
  if (retry !== null) { window.clearTimeout(retry); retry = null }
  socket?.close()
  socket = null
}

// Coalesces a burst of change events into one callback.
export function onDataChanged(handler: (changes: DataChange[]) => void, delayMs = 200): () => void {
  let pending: DataChange[] = []
  let timer: number | null = null
  const listener = (event: Event) => {
    pending.push((event as CustomEvent<DataChange>).detail)
    if (timer !== null) return
    timer = window.setTimeout(() => { timer = null; const batch = pending; pending = []; handler(batch) }, delayMs)
  }
  window.addEventListener('data-changed', listener)
  return () => { window.removeEventListener('data-changed', listener); if (timer !== null) window.clearTimeout(timer) }
}
