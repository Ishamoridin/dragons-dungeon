import { DM, Player, type User, type UserRole } from './User'
import { api, ApiError, clearResources, loadResources } from './Api'
import { clearScreenState, drainActivity, recordActivity, setScreenState, stopActivityTracking, type ScreenState } from './ScreenState'

export const DEMO_PLAYER = new Player('player:player', 'player')
export const DEMO_DM = new DM('dm:dm', 'dm')

type UserPayload = User & { Screen?: ScreenState | null }

async function prepareUser(data: UserPayload): Promise<User> {
  await loadResources(data.Role)
  const user = data.Role === 'dm'
    ? new DM(data.Id, data.Username, data.PreferredSkin)
    : new Player(data.Id, data.Username, data.PreferredSkin)
  user.Email = data.Email
  user.GoogleLinked = data.GoogleLinked
  // Only session-bearing responses (login, restore) carry the remembered screen; others leave it untouched.
  if (data.Screen !== undefined) setScreenState(data.Screen)
  return user
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  try {
    const user = await prepareUser(await api<UserPayload>('/auth/login', 'POST', { username, password }))
    recordActivity('login', user.Username)
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function restoreSession(): Promise<User | null> {
  try {
    const user = await prepareUser(await api<UserPayload>('/auth/me'))
    recordActivity('resume', user.Username)
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export type RegistrationResult = { ok: true; email: string; delivered: boolean; previewLink?: string }

// Registration is two steps: the request emails a link, and opening the link creates the account and signs in.
export async function requestRegistration(input: { email: string; username: string; password: string; role: UserRole }): Promise<RegistrationResult> {
  return api<RegistrationResult>('/auth/register', 'POST', input)
}

export async function completeRegistration(token: string): Promise<User> {
  const user = await prepareUser(await api<UserPayload>('/auth/register/complete', 'POST', { token }))
  recordActivity('register', user.Username)
  return user
}

export async function signOut(): Promise<void> {
  // The remaining activity travels with the sign-out, which closes the session's log on the server.
  recordActivity('logout')
  await api('/auth/logout', 'POST', { events: drainActivity(), reason: 'logout' })
  clearResources()
  clearScreenState()
  stopActivityTracking()
}

export async function switchRole(role: UserRole): Promise<User> {
  const data = await api<User>('/auth/role', 'POST', { role })
  clearResources()
  return prepareUser(data)
}
