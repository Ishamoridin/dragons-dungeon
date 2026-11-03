import { z } from 'zod'

// Event log: a record of every event a DM fired, who it hit, and what changed on each sheet. Players see the entries
// that touched their characters; a player who joins a campaign's sharing pool also sees what happened to the other
// sharers. Joining locks sharing on for a week so nobody peeks and leaves.

export const SHARING_LOCK_MS = 7 * 24 * 60 * 60 * 1000

// Kept in step with PAGE_SKINS in src/character/PageSkin.ts (the server cannot import TypeScript).
export const PAGE_SKIN_IDS = ['basalt', 'tideglass', 'wildwood', 'moonstone', 'matrix', 'sao', 'startrek', 'stone', 'moonsilver', 'steel', 'arcane', 'rust']

export const eventSkin = z.object({
  skin: z.enum(PAGE_SKIN_IDS),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  banner: z.object({
    DataUrl: z.string().startsWith('data:image/').max(820_000),
    Palette: z.record(z.string().max(40), z.string().max(400)),
    UpdatedAt: z.string().max(40),
  }).nullable().optional(),
}).strict()

const appliedEffect = z.object({ type: z.string().min(1).max(40), Summary: z.string().max(300) }).passthrough()

export const eventLogInput = z.object({
  CampaignName: z.string().trim().min(1).max(100),
  Title: z.string().trim().min(1).max(120),
  Description: z.string().max(20_000),
  Skin: eventSkin,
  Source: z.enum(['manual', 'scheduled']),
  CampaignTime: z.string().max(40).optional(),
  ScheduledEventId: z.string().max(100).optional(),
  Targets: z.array(z.object({
    CharacterId: z.string().min(1).max(100),
    Effects: z.array(appliedEffect).max(50),
    Error: z.string().max(300).optional(),
  }).strict()).min(1).max(100),
}).strict()

export const sharingInput = z.object({ campaign: z.string().trim().min(1).max(100), sharing: z.boolean() }).strict()

// Turning sharing on starts (or keeps) a week-long lock; turning it off is refused while the lock holds.
export function applySharingToggle(current, wanted, now = new Date()) {
  const lockedUntil = current?.LockedUntil ? new Date(current.LockedUntil) : null
  const locked = Boolean(current?.Sharing) && lockedUntil && lockedUntil.getTime() > now.getTime()
  if (wanted) {
    return { ok: true, next: { Sharing: true, LockedUntil: locked ? lockedUntil : new Date(now.getTime() + SHARING_LOCK_MS) } }
  }
  if (locked) return { ok: false, lockedUntil }
  return { ok: true, next: { Sharing: false, LockedUntil: null } }
}

export const isSharing = (row) => Boolean(row?.Sharing)

// Everyone who should hear about an entry: the DM and the owner of every targeted character.
export const eventRecipients = (entry) => [...new Set([entry.DMId, ...entry.Targets.map((target) => target.OwnerId)])]

// What one user may see of an entry, or null when nothing. `sharerIds` holds the user ids currently sharing in the
// entry's campaign.
export function visibleEntryFor(user, entry, sharerIds = new Set()) {
  if (!user) return null
  const acknowledged = entry.AcknowledgedBy ?? []
  // GenerationCost is bookkeeping on seeded journal entries; no client ever receives it.
  const { AcknowledgedBy, GenerationCost, _id, ...record } = entry
  if (user.SecondaryOwner || (user.Role === 'dm' && entry.DMId === user.Id)) {
    return { ...record, Acknowledgements: acknowledged.length, Unread: false }
  }
  const own = entry.Targets.filter((target) => target.OwnerId === user.Id)
  if (own.length === 0) return null
  const targets = sharerIds.has(user.Id)
    ? entry.Targets.filter((target) => target.OwnerId === user.Id || sharerIds.has(target.OwnerId))
    : own
  return { ...record, Targets: targets, Unread: !acknowledged.includes(user.Id) }
}
