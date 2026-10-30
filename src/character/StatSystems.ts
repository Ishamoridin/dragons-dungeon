export type StatSystem = {
  Id: string
  Name: string
  description: string
  CampaignNames: string[]
}

export const STAT_SYSTEMS: StatSystem[] = [
  {
    Id: 'default',
    Name: 'Default',
    description: 'Six core attributes with derived Mana, Stamina, and Health.',
    CampaignNames: ['Ashen Vale', 'The Shattered Coast'],
  },
  {
    Id: 'frontier',
    Name: 'Frontier',
    description: 'A grittier ruleset for low-magic frontier campaigns.',
    CampaignNames: ['Dustwater Run'],
  },
  {
    Id: 'essence',
    Name: 'Essence',
    description: 'Twelve attributes in three groups (Mental, Physical, Spiritual), thirty governed skills, Reiryoku, Essences and Resero.',
    CampaignNames: ['Welcome to the Sprawl'],
  },
]

export const DEFAULT_STAT_SYSTEM_ID = STAT_SYSTEMS[0].Id
