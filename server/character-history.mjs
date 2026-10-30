import { randomUUID } from 'node:crypto'

export const withoutMongoId = (document) => {
  if (!document) return null
  const { _id, ...data } = document
  return data
}

export const versionFilter = (version) => version === 0
  ? { $or: [{ Version: 0 }, { Version: { $exists: false } }] }
  : { Version: version }

export async function saveRevision(db, { kind, before, after, actor, conflictId }) {
  const session = db.client.startSession()
  try {
    await session.withTransaction(async () => {
      const scope = kind === 'characters' ? { Id: (before ?? after).Id } : { Id: (before ?? after).Id, OwnerId: (before ?? after).OwnerId }
      const collection = db.collection(kind)
      if (before) {
        const filter = { ...scope, ...versionFilter(before.Version ?? 0) }
        const result = after
          ? await collection.replaceOne(filter, after, { session })
          : await collection.deleteOne(filter, { session })
        if (!(result.matchedCount ?? result.deletedCount)) throw Object.assign(new Error('A newer change exists. Refresh before continuing.'), { status: 409 })
      } else {
        await collection.insertOne({ ...after }, { session })
      }
      await db.collection('changeHistory').insertOne({
        Id: randomUUID(), ActorId: actor.Id, ActorName: actor.Username, Kind: kind,
        TargetId: (after ?? before).Id, Before: withoutMongoId(before), After: withoutMongoId(after),
        CreatedAt: new Date(), Undone: false,
      }, { session })
      if (conflictId) {
        const result = await db.collection('conflicts').updateOne({ Id: conflictId, Resolved: false }, { $set: { Resolved: true, ResolvedAt: new Date(), ResolvedBy: actor.Id } }, { session })
        if (!result.matchedCount) throw Object.assign(new Error('This conflict has already been resolved.'), { status: 409 })
      }
    })
  } finally { await session.endSession() }
}

export async function recordConflict(db, { kind, current, local, base, actor }) {
  const conflict = {
    Id: randomUUID(), Kind: kind, TargetId: current.Id,
    DMId: kind === 'characters' ? current.DMId : current.OwnerId,
    SubmittedBy: actor.Username, SubmittedRole: actor.Role,
    Base: base ?? null, Local: local, Server: withoutMongoId(current),
    CreatedAt: new Date(), Resolved: false,
  }
  await db.collection('conflicts').insertOne(conflict)
  return withoutMongoId(conflict)
}

export async function undoLatest(db, actor) {
  const history = await db.collection('changeHistory').findOne({ ActorId: actor.Id, Undone: false }, { sort: { CreatedAt: -1, _id: -1 } })
  if (!history) throw Object.assign(new Error('No saved change to undo.'), { status: 404 })
  const session = db.client.startSession()
  let restored
  try {
    await session.withTransaction(async () => {
      const snapshot = history.After ?? history.Before
      const scope = history.Kind === 'characters' ? { Id: history.TargetId } : { Id: history.TargetId, OwnerId: snapshot.OwnerId }
      const collection = db.collection(history.Kind)
      const current = await collection.findOne(scope, { session })
      const accessible = actor.SecondaryOwner || (history.Kind === 'characters'
        ? (actor.Role === 'dm' ? snapshot.DMId === actor.Id : snapshot.OwnerId === actor.Id)
        : snapshot.OwnerId === actor.Id && actor.Role === 'dm')
      if (!accessible) throw Object.assign(new Error('You no longer have permission to undo this change.'), { status: 403 })
      if (history.After ? !current || (current.Version ?? 0) !== history.After.Version : current) {
        throw Object.assign(new Error('A newer change exists. Undo would overwrite it.'), { status: 409 })
      }
      restored = history.Before ? { ...history.Before, Version: (current?.Version ?? history.Before.Version ?? 0) + 1, UpdatedAt: new Date().toISOString() } : null
      if (restored) {
        if (current) await collection.replaceOne({ ...scope, ...versionFilter(current.Version ?? 0) }, restored, { session })
        else await collection.insertOne({ ...restored }, { session })
      } else if (current) await collection.deleteOne({ ...scope, ...versionFilter(current.Version ?? 0) }, { session })
      const result = await db.collection('changeHistory').updateOne({ Id: history.Id, Undone: false }, { $set: { Undone: true, UndoneAt: new Date() } }, { session })
      if (!result.matchedCount) throw Object.assign(new Error('Change already undone.'), { status: 409 })
    })
  } finally { await session.endSession() }
  return { kind: history.Kind, id: history.TargetId, record: restored }
}