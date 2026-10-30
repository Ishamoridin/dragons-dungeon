import { DM, Player, type User } from './User'
import { api, ApiError, clearResources, loadResources } from './Api'

export const DEMO_PLAYER = new Player('player:player', 'player')
export const DEMO_DM = new DM('dm:dm', 'dm')

async function prepareUser(data: User): Promise<User> {
  await loadResources(data.Role)
  return data.Role === 'dm'
    ? new DM(data.Id, data.Username, data.PreferredSkin)
    : new Player(data.Id, data.Username, data.PreferredSkin)
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  try {
    return await prepareUser(await api<User>('/auth/login', 'POST', { username, password }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function restoreSession(): Promise<User | null> {
  try { return await prepareUser(await api<User>('/auth/me')) }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function signOut(): Promise<void> {
  await api('/auth/logout', 'POST', {})
  clearResources()
}
