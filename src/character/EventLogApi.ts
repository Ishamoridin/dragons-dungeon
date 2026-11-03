// Event log client: recording fired events (DM), reading the log, acknowledging entries, and the sharing pool.
import { api } from './Api'
import type { AppliedEffect, EventSkin } from './EventEffects'

export type EventLogTarget = { CharacterId: string; CharacterName: string; OwnerId: string; Effects: AppliedEffect[]; Error?: string }

export type EventLogEntry = {
  Id: string
  DMId: string
  DMName: string
  CampaignName: string
  Title: string
  Description: string
  Skin: EventSkin
  Source: 'manual' | 'scheduled'
  CampaignTime?: string
  ScheduledEventId?: string
  CreatedAt: string
  Targets: EventLogTarget[]
  Unread: boolean
  // DM view only: how many recipients have acknowledged the event.
  Acknowledgements?: number
}

export type EventLogInput = {
  CampaignName: string
  Title: string
  Description: string
  Skin: EventSkin
  Source: 'manual' | 'scheduled'
  CampaignTime?: string
  ScheduledEventId?: string
  Targets: { CharacterId: string; Effects: AppliedEffect[]; Error?: string }[]
}

export type SharingState = { sharing: boolean; lockedUntil: string | null; sharers: { UserId: string; Username: string }[] }

export const recordEvent = (input: EventLogInput) => api<EventLogEntry>('/event-log', 'POST', input)

export const fetchEventLog = (campaign?: string) =>
  api<{ entries: EventLogEntry[]; unread: number }>(`/event-log${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ''}`)

export const acknowledgeEvent = (id: string) => api<{ ok: true }>(`/event-log/${encodeURIComponent(id)}/ack`, 'POST', {})

export const fetchSharing = (campaign: string) => api<SharingState>(`/event-log/sharing?campaign=${encodeURIComponent(campaign)}`)

export const setSharing = (campaign: string, sharing: boolean) =>
  api<{ sharing: boolean; lockedUntil: string | null }>('/event-log/sharing', 'PUT', { campaign, sharing })

export const lockDateLabel = (iso: string | null | undefined): string | null =>
  iso && new Date(iso).getTime() > Date.now() ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null
