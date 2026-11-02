import { WebSocketServer } from 'ws'
import { canAccessCharacter } from './security.mjs'

// Live updates. Every write that goes through saveRevision (and undo, and sheet sync) emits a change; connected
// clients that may see the record get a small message naming the kind and id, then re-fetch through the normal
// scoped GET routes. Nothing sensitive travels over the socket: no record bodies, only identifiers.

const HEARTBEAT_MS = 30_000

export function describeChange({ kind, before, after, actor }) {
  const record = after ?? before
  return {
    type: 'change',
    kind,
    id: record.Id,
    action: !before ? 'create' : !after ? 'delete' : 'update',
    version: record.Version ?? 0,
    actorId: actor?.Id ?? null,
    // Routing only; stripped before sending.
    record: { Id: record.Id, OwnerId: record.OwnerId, DMId: record.DMId },
  }
}

export function canSeeChange(user, event) {
  if (!user) return false
  if (event.kind === 'characters') return event.record ? canAccessCharacter(event.record, user) : true
  // Resources belong to a DM; that DM and the players they manage share them.
  if (user.SecondaryOwner || user.Role !== 'dm') return true
  return !event.record?.OwnerId || event.record.OwnerId === user.Id
}

export function createRealtime() {
  const clients = new Set()
  let heartbeat = null

  function publish(event) {
    const { record, ...wire } = event
    const payload = JSON.stringify(wire)
    for (const client of clients) {
      if (client.socket.readyState !== 1 || !canSeeChange(client.user, event)) continue
      client.socket.send(payload, (error) => { if (error) client.socket.terminate() })
    }
  }

  // `authenticate(req)` resolves the session cookie on the upgrade request to a user, or null.
  function attach(server, { authenticate, path = '/api/events' }) {
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      let pathname
      try { pathname = new URL(req.url, 'http://localhost').pathname } catch { pathname = '' }
      if (pathname !== path) return
      Promise.resolve().then(() => authenticate(req)).catch(() => null).then((user) => {
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          const client = { socket: ws, user, alive: true }
          clients.add(client)
          ws.on('pong', () => { client.alive = true })
          ws.on('close', () => clients.delete(client))
          ws.on('error', () => ws.terminate())
          ws.send(JSON.stringify({ type: 'hello', userId: user.Id }))
        })
      })
    })
    heartbeat = setInterval(() => {
      for (const client of clients) {
        if (!client.alive) { client.socket.terminate(); clients.delete(client); continue }
        client.alive = false
        client.socket.ping()
      }
    }, HEARTBEAT_MS)
    heartbeat.unref?.()
    return wss
  }

  function close() {
    if (heartbeat) clearInterval(heartbeat)
    for (const client of clients) client.socket.terminate()
    clients.clear()
  }

  return { publish, attach, close, clients }
}
