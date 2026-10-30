export class ApiError extends Error {
  public readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

// A remote API origin lets static hosts such as GitHub Pages use a separately deployed account service.
export const apiOrigin = (import.meta.env?.PUBLIC_API_ORIGIN ?? '').trim().replace(/\/+$/, '')
export const staticHosting = import.meta.env?.PUBLIC_STATIC_HOST === 'true' && !apiOrigin
export const apiUrl = (path: string) => `${apiOrigin}/api${path}`

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (staticHosting) throw new ApiError('Account service unavailable on this static deployment.', 503)
  const response = await fetch(apiUrl(path), {
    method,
    credentials: apiOrigin ? 'include' : 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => ({ error: 'Server unavailable.' }))
  if (!response.ok) {
    const error = new ApiError(result.error ?? 'Request failed.', response.status)
    if (result.conflict) window.dispatchEvent(new CustomEvent('api-conflict', { detail: result.conflict }))
    if (!path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('api-error', { detail: error.message }))
    throw error
  }
  if (['/auth/login', '/auth/logout', '/auth/role'].includes(path)) window.dispatchEvent(new Event('session-changed'))
  if (method !== 'GET' && /\/(characters|resources|conflicts|history)\b/.test(path)) window.dispatchEvent(new Event('data-saved'))
  return result as T
}

export type ResourceKind = 'campaigns' | 'items' | 'techniques' | 'development' | 'systems'
type Resource = { Id: string; OwnerId: string; Data: Record<string, unknown>; Version: number }
const resources = new Map<ResourceKind, Resource[]>()
const pending = new Map<string, Promise<unknown>>()

export function clearResources() { resources.clear(); pending.clear() }

export async function loadResources(role: string) {
  const kinds: ResourceKind[] = role === 'dm' ? ['campaigns', 'items', 'techniques', 'development', 'systems'] : ['items', 'development']
  await Promise.all(kinds.map(async (kind) => resources.set(kind, await api<Resource[]>(`/resources/${kind}`))))
}

export function resourceList<T>(kind: ResourceKind): T[] {
  return structuredClone((resources.get(kind) ?? []).map((entry) => entry.Data)) as T[]
}

export function saveResource<T extends object>(kind: ResourceKind, id: string, data: T): Promise<void> {
  const key = `${kind}:${id}`
  const operation = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const rows = resources.get(kind) ?? []
    const existing = rows.find((entry) => entry.Id === id)
    const saved = await api<Resource>(`/resources/${kind}/${encodeURIComponent(id)}`, 'PUT', { data, version: existing?.Version ?? 0, base: existing?.Data })
    resources.set(kind, [...(resources.get(kind) ?? []).filter((entry) => entry.Id !== id), saved])
  })
  pending.set(key, operation)
  return operation
}

export async function deleteResource(kind: ResourceKind, id: string): Promise<void> {
  await pending.get(`${kind}:${id}`)
  const existing = resources.get(kind)?.find((entry) => entry.Id === id)
  if (!existing) return
  await api(`/resources/${kind}/${encodeURIComponent(id)}`, 'DELETE', { version: existing.Version })
  resources.set(kind, (resources.get(kind) ?? []).filter((entry) => entry.Id !== id))
}