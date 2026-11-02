import { apiUrl, staticHosting } from './Api'

// Persistent Google login. After a Google sign-in the API lands the browser on the app with `?auth=google`; that is
// remembered here. When a later visit finds no live session, the app sends the browser through Google's silent
// (prompt=none) flow once, which re-issues a session cookie without any clicking as long as the Google account is
// still signed in. A failed silent attempt comes back with `?authSilent=failed` and clears the memory.

const KEY = 'vibesheet:auth:google'

const storage = (): Storage | null => { try { return window.localStorage } catch { return null } }

export const rememberGoogleSignIn = (): void => { storage()?.setItem(KEY, String(Date.now())) }
export const forgetGoogleSignIn = (): void => { storage()?.removeItem(KEY) }
export const hasGoogleSignIn = (): boolean => Boolean(storage()?.getItem(KEY))

// Reads and strips the auth markers the Google callback appends to the URL. Returns what happened.
export function consumeGoogleAuthMarkers(): 'signed-in' | 'silent-failed' | null {
  const url = new URL(window.location.href)
  const auth = url.searchParams.get('auth')
  const silent = url.searchParams.get('authSilent')
  if (!auth && !silent) return null
  url.searchParams.delete('auth')
  url.searchParams.delete('authSilent')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  if (auth === 'google') { rememberGoogleSignIn(); return 'signed-in' }
  if (silent === 'failed') { forgetGoogleSignIn(); return 'silent-failed' }
  return null
}

// True when the app should try a silent Google sign-in instead of showing the login screen.
export function shouldTrySilentGoogleSignIn(): boolean {
  if (staticHosting || !hasGoogleSignIn()) return false
  const params = new URLSearchParams(window.location.search)
  return !params.has('authError') && !params.has('register')
}

export function startSilentGoogleSignIn(): void {
  // Guard against loops: one attempt per visit until Google answers.
  sessionStorage.setItem(`${KEY}:attempted`, '1')
  window.location.assign(apiUrl('/auth/google/start?silent=1'))
}

export const silentGoogleSignInAttempted = (): boolean => sessionStorage.getItem(`${KEY}:attempted`) === '1'
export const clearSilentGoogleSignInAttempt = (): void => sessionStorage.removeItem(`${KEY}:attempted`)
