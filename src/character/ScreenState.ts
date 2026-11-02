import { api, apiUrl } from './Api'

// Session memory and activity.
//
// Screen: which screen is open (DM console page, selected campaign, open character, sheet tab...), remembered on
// the server-side session so a reload lands back where the user was.
//
// Activity: everything the user does in the session (screen changes, sign-in, every write to the API), buffered
// here and appended to the session's log on the server in batches: every 30 seconds, when the buffer fills, when
// the tab is hidden or closed (via a beacon), and finally with the sign-out request that closes the log.

export type ScreenState = Record<string, string | number | boolean | null>
export type ActivityEvent = { t: string; kind: string; detail?: string }

let screen: ScreenState = {}
let screenTimer: ReturnType<typeof setTimeout> | undefined
let buffer: ActivityEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | undefined
let flushing = false
const ACTIVITY_PATH = '/auth/session/activity'
const FLUSH_INTERVAL_MS = 30_000
const FLUSH_AT = 40

export function setScreenState(initial: ScreenState | null | undefined): void {
  screen = { ...(initial ?? {}) }
}

export function clearScreenState(): void {
  screen = {}
  if (screenTimer) clearTimeout(screenTimer)
  screenTimer = undefined
}

export function getScreen<T extends string | number | boolean>(key: string): T | undefined {
  const value = screen[key]
  return value === null || value === undefined ? undefined : (value as T)
}

// Merges a change and saves shortly afterwards; rapid navigation collapses into one request and one log entry.
export function rememberScreen(patch: ScreenState): void {
  let changed = false
  for (const [key, value] of Object.entries(patch)) {
    if (screen[key] !== value) { screen[key] = value; changed = true }
  }
  if (!changed) return
  recordActivity('screen', Object.entries(patch).map(([key, value]) => `${key}=${value ?? ''}`).join(' '))
  if (screenTimer) clearTimeout(screenTimer)
  screenTimer = setTimeout(() => {
    screenTimer = undefined
    void api('/auth/screen', 'PUT', { screen }).catch(() => { /* remembering the screen is best effort */ })
  }, 400)
}

export function recordActivity(kind: string, detail?: string): void {
  buffer.push({ t: new Date().toISOString(), kind: kind.slice(0, 40), ...(detail ? { detail: detail.slice(0, 300) } : {}) })
  if (buffer.length >= FLUSH_AT) void flushActivity('buffer')
  ensureFlushLoop()
}

// Hands the buffered events to the caller (used by sign-out so they travel with the final request).
export function drainActivity(): ActivityEvent[] {
  const events = buffer
  buffer = []
  return events
}

export async function flushActivity(reason: string, { beacon = false } = {}): Promise<void> {
  if (!buffer.length || flushing) return
  const events = drainActivity()
  const payload = JSON.stringify({ events, reason })
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // text/plain keeps the beacon a simple request, which is the only kind a closing tab can still send.
    if (!navigator.sendBeacon(apiUrl(ACTIVITY_PATH), new Blob([payload], { type: 'text/plain' }))) buffer = [...events, ...buffer]
    return
  }
  flushing = true
  try { await api(ACTIVITY_PATH, 'POST', { events, reason }) }
  catch { buffer = [...events, ...buffer].slice(-500) }
  finally { flushing = false }
}

function ensureFlushLoop() {
  if (flushTimer || typeof window === 'undefined') return
  flushTimer = setInterval(() => { void flushActivity('interval') }, FLUSH_INTERVAL_MS)
  const onHide = () => { if (document.visibilityState === 'hidden') void flushActivity('hidden', { beacon: true }) }
  window.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', () => { void flushActivity('pagehide', { beacon: true }) })
}

export function stopActivityTracking(): void {
  if (flushTimer) clearInterval(flushTimer)
  flushTimer = undefined
  buffer = []
}
