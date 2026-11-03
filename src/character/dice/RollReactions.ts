import type { RollReactionKind } from '../RollApi'

// Reactions to a natural 20 (celebrate it, envy it, or dismiss it as luck) and to a natural 1 (laugh, mock,
// or commiserate). `phrase` builds the toast shown to the table: "Riko laughs at your Natural 1".
export const REACTION_META: Record<RollReactionKind, { emoji: string; label: string; phrase: (owner: string) => string }> = {
  celebrate: { emoji: '🎉', label: 'Celebrate', phrase: (owner) => `celebrates ${owner} Natural 20!` },
  envy: { emoji: '😒', label: 'Envy', phrase: (owner) => `envies ${owner} Natural 20` },
  lucky: { emoji: '🍀', label: 'Just luck', phrase: (owner) => `says ${owner} Natural 20 was just luck` },
  laugh: { emoji: '😂', label: 'Laugh', phrase: (owner) => `laughs at ${owner} Natural 1` },
  mock: { emoji: '😏', label: 'Mock', phrase: (owner) => `mocks ${owner} Natural 1` },
  commiserate: { emoji: '🫂', label: 'Commiserate', phrase: (owner) => `commiserates with ${owner} Natural 1` },
}

export const NAT20_REACTIONS: RollReactionKind[] = ['celebrate', 'envy', 'lucky']
export const NAT1_REACTIONS: RollReactionKind[] = ['laugh', 'mock', 'commiserate']

export const reactionsForNatural = (natural: number | null): RollReactionKind[] =>
  natural === 20 ? NAT20_REACTIONS : natural === 1 ? NAT1_REACTIONS : []
