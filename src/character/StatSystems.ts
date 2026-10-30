export type StatSystem = {
  Id: string
  Name: string
  description: string
  CampaignNames: string[]
  Ruleset: 'private' | 'essence'
  Hidden?: boolean
}

export const STAT_SYSTEMS: StatSystem[] = [
  {
    Id: 'default',
    Name: 'Private',
    description: 'Six core attributes with derived Mana, Stamina, and Health.',
    CampaignNames: ['Ashen Vale', 'The Shattered Coast'],
    Ruleset: 'private',
    Hidden: true,
  },
  {
    Id: 'essence',
    Name: 'Essence',
    description: 'Twelve attributes in three groups (Mental, Physical, Spiritual), thirty governed skills, Reiryoku, Essences and Resero.',
    CampaignNames: ['Welcome to the Sprawl'],
    Ruleset: 'essence',
  },
]

export const DEFAULT_STAT_SYSTEM_ID = 'essence'
