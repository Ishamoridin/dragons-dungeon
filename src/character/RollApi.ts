// Dice roll client: posting a roll command (the server rolls the dice) and reading the shared roll log.
import { api } from './Api'

export type RollTokenValue = { Name: string; Value: number }

export type RollReactionKind = 'celebrate' | 'envy' | 'lucky' | 'laugh' | 'mock' | 'commiserate'

export type RollReaction = { UserId: string; Username: string; Reaction: RollReactionKind; CreatedAt: string }

export type RollLogEntry = {
  Id: string
  CampaignName: string
  DMId: string
  RollerId: string
  RollerName: string
  CharacterId?: string
  CharacterName?: string
  Command: string
  Formula: string
  Label: string
  Tokens: RollTokenValue[]
  Rolls: { sides: number; results: number[] }[]
  Total: number
  // The same formula with every die at its highest face; the result animation scales against it.
  MaxTotal: number
  Secret: boolean
  CreatedAt: string
  // Reactions other users left on a natural 20 or natural 1; one per user.
  Reactions?: RollReaction[]
}

export type RollInput = {
  CampaignName: string
  Command: string
  Formula: string
  Label: string
  Tokens: RollTokenValue[]
  CharacterId?: string
  Secret: boolean
}

export const postRoll = (input: RollInput) => api<RollLogEntry>('/rolls', 'POST', input)

export const postRollReaction = (id: string, reaction: RollReactionKind) =>
  api<{ reactions: RollReaction[] }>(`/rolls/${encodeURIComponent(id)}/react`, 'POST', { reaction })

export const fetchRolls = (campaign?: string, limit = 50) =>
  api<{ rolls: RollLogEntry[] }>(`/rolls?limit=${limit}${campaign ? `&campaign=${encodeURIComponent(campaign)}` : ''}`)
