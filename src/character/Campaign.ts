import Person from './Person'
import { COMMONER, PRIMARY_ATTRIBUTE_NAMES } from './PlayerClass'
import { DEMO_DM } from './MockAuth'
import { Monster } from './Monster'

export type CampaignAction =
  | { type: 'add-xp'; characterId: string; amount: number }
  | { type: 'add-skill-progress'; characterId: string; skillNames: string[]; amount: number }
  | { type: 'level-up'; characterId: string }
  | { type: 'level-up-skill'; characterId: string; skillName: string }

export type CampaignEventType = 'challenge' | 'raid' | 'ambush' | 'intrigue' | 'quest' | 'training'

export type CampaignEventTemplate = {
  type: CampaignEventType
  title: string
  description: string
  suggestedActions: CampaignAction['type'][]
}

export type NPCFactionGroup = {
  Faction: string
  Description: string
  Attributes: { Name: string; Value: string }[]
  NPCs: Person[]
  // Names of player characters in this faction, matched against the campaign roster.
  PlayerNames: string[]
}

export type MonsterLocationGroup = {
  Location: string
  Monsters: Monster[]
}

export const CAMPAIGN_EVENT_TEMPLATES: CampaignEventTemplate[] = [
  {
    type: 'challenge',
    title: 'Trial at the Glass Arena',
    description: 'A public test of skill, nerve, or magical control.',
    suggestedActions: ['add-xp', 'add-skill-progress'],
  },
  {
    type: 'raid',
    title: 'Raid on Northreach',
    description: 'A nearby settlement reports an organized attack.',
    suggestedActions: ['add-xp', 'level-up'],
  },
  {
    type: 'ambush',
    title: 'Ambush on the Old Road',
    description: 'Hostiles strike while the party crosses exposed ground.',
    suggestedActions: ['add-xp', 'add-skill-progress'],
  },
  {
    type: 'intrigue',
    title: "The Council's Secret Vote",
    description: 'A faction makes a move behind closed doors.',
    suggestedActions: ['add-skill-progress'],
  },
  {
    type: 'quest',
    title: 'Recover the Sunken Seal',
    description: 'A patron offers a reward for a dangerous recovery.',
    suggestedActions: ['add-xp', 'level-up-skill'],
  },
  {
    type: 'training',
    title: 'A Week of Hard Training',
    description: 'Focused practice builds experience in a chosen discipline.',
    suggestedActions: ['add-skill-progress', 'level-up-skill'],
  },
]

export class CampaignEvent {
  public readonly Id: string
  public readonly Type: CampaignEventType
  public readonly Title: string
  public readonly Description: string
  public readonly ScheduledAt: Date
  public readonly Actions: CampaignAction[]
  public Completed: boolean

  constructor(
    type: CampaignEventType,
    title: string,
    description: string,
    scheduledAt: Date,
    actions: CampaignAction[],
    id = createEventId(),
  ) {
    this.Id = id
    this.Type = type
    this.Title = title
    this.Description = description
    this.ScheduledAt = new Date(scheduledAt)
    this.Actions = actions.map((action) => ({ ...action }))
    this.Completed = false
  }
}

export class Campaign {
  public readonly Id: string
  public readonly Name: string
  public currentTime: Date
  public CharacterIds: string[]
  public NPCs: NPCFactionGroup[]
  public Monsters: MonsterLocationGroup[]
  public scheduledEvents: CampaignEvent[]

  constructor(name: string, currentTime = new Date(), characterIds: string[] = []) {
    this.Id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    this.Name = name
    this.currentTime = new Date(currentTime)
    this.CharacterIds = [...characterIds]
    this.NPCs = createExampleNPCs(name)
    this.Monsters = createExampleMonsters(name)
    this.scheduledEvents = []
  }

  public scheduleEvent(
    type: CampaignEventType,
    title: string,
    description: string,
    scheduledAt: Date,
    actions: CampaignAction[],
  ): CampaignEvent {
    if (scheduledAt.getTime() <= this.currentTime.getTime()) {
      throw new Error('Scheduled events must be later than campaign currentTime.')
    }
    if (actions.length === 0) {
      throw new Error('A scheduled event needs at least one action.')
    }

    const event = new CampaignEvent(type, title, description, scheduledAt, actions)
    this.scheduledEvents.push(event)
    this.scheduledEvents.sort((left, right) => left.ScheduledAt.getTime() - right.ScheduledAt.getTime())
    return event
  }

  public advanceTo(time: Date): CampaignEvent[] {
    if (time.getTime() < this.currentTime.getTime()) {
      throw new Error('Campaign currentTime cannot move backwards.')
    }

    this.currentTime = new Date(time)
    const dueEvents = this.scheduledEvents.filter(
      (event) => !event.Completed && event.ScheduledAt.getTime() <= this.currentTime.getTime(),
    )
    dueEvents.forEach((event) => {
      event.Completed = true
    })
    return dueEvents
  }

  public clone(): Campaign {
    const campaign = new Campaign(this.Name, this.currentTime, this.CharacterIds)
    campaign.NPCs = this.NPCs.map((group) => ({ ...group, NPCs: [...group.NPCs] }))
    campaign.Monsters = this.Monsters.map((group) => ({
      ...group,
      Monsters: group.Monsters.map((monster) => monster.clone()),
    }))
    campaign.scheduledEvents = this.scheduledEvents.map((event) => {
      const copied = new CampaignEvent(
        event.Type,
        event.Title,
        event.Description,
        event.ScheduledAt,
        event.Actions,
        event.Id,
      )
      copied.Completed = event.Completed
      return copied
    })
    return campaign
  }
}

function createNPC(name: string, campaignName: string, tags: string[], level: number): Person {
  const npc = new Person(DEMO_DM, DEMO_DM, campaignName, COMMONER, name)
  npc.Level = level
  npc.Tags = [...tags]
  // The attribute classes share their leaf objects between every Person, so each NPC gets its own copy to edit.
  for (const attributeName of PRIMARY_ATTRIBUTE_NAMES) {
    npc[attributeName] = structuredClone(npc[attributeName])
  }
  return npc
}

function createExampleNPCs(campaignName: string): NPCFactionGroup[] {
  if (campaignName === 'Ashen Vale') {
    return [
      {
        Faction: 'Ember Council',
        Description: 'The governing body of the Vale, keeping the archives and the ember-lit wards.',
        Attributes: [{ Name: 'Type', Value: 'Governing council' }, { Name: 'Seat', Value: 'Ember Hall' }, { Name: 'Stance', Value: 'Lawful' }, { Name: 'Influence', Value: 'High' }],
        PlayerNames: [],
        NPCs: [
          createNPC('Elowen Marr', campaignName, ['Archivist', 'Council'], 4),
          createNPC('Soren Kells', campaignName, ['Warden', 'Council'], 5),
        ],
      },
      {
        Faction: 'Free March',
        Description: 'A loose network of guides and couriers who keep the northern roads open.',
        Attributes: [{ Name: 'Type', Value: 'Guides and couriers' }, { Name: 'Territory', Value: 'Northreach' }, { Name: 'Stance', Value: 'Neutral' }, { Name: 'Influence', Value: 'Moderate' }],
        PlayerNames: ['Aria Venn'],
        NPCs: [
          createNPC('Tamsin Vale', campaignName, ['Guide', 'Northreach'], 3),
          createNPC('Cale Rook', campaignName, ['Courier', 'Lantern Guild'], 2),
        ],
      },
    ]
  }

  if (campaignName === 'The Shattered Coast') {
    return [
      {
        Faction: 'Tidebound Compact',
        Description: 'A league of sailors that holds the surviving harbours together.',
        Attributes: [{ Name: 'Type', Value: 'Maritime league' }, { Name: 'Territory', Value: 'The harbours' }, { Name: 'Stance', Value: 'Lawful' }, { Name: 'Influence', Value: 'High' }],
        PlayerNames: ['Mira Sol'],
        NPCs: [
          createNPC('Captain Neris', campaignName, ['Sailor', 'Compact'], 5),
          createNPC('Ilyan Voss', campaignName, ['Envoy', 'Compact'], 4),
        ],
      },
      {
        Faction: 'Salt Road Syndicate',
        Description: 'Smugglers who move goods along the salt roads outside Compact law.',
        Attributes: [{ Name: 'Type', Value: 'Smuggling syndicate' }, { Name: 'Territory', Value: 'Salt roads' }, { Name: 'Stance', Value: 'Criminal' }, { Name: 'Influence', Value: 'Moderate' }],
        PlayerNames: [],
        NPCs: [createNPC('Zella Marr', campaignName, ['Smuggler', 'Syndicate'], 3)],
      },
    ]
  }

  if (campaignName === 'Dustwater Run') {
    return [
      {
        Faction: 'Dustwater Marshals',
        Description: 'The territory\'s thin line of law, stretched across too many miles.',
        Attributes: [{ Name: 'Type', Value: 'Lawmen' }, { Name: 'Territory', Value: 'Dustwater' }, { Name: 'Stance', Value: 'Lawful' }, { Name: 'Influence', Value: 'Low' }],
        PlayerNames: [],
        NPCs: [createNPC('Marshal Odell Hart', campaignName, ['Lawman', 'Marshals'], 4)],
      },
      {
        Faction: 'Redcut Gang',
        Description: 'Outlaws working the canyons around Redcut.',
        Attributes: [{ Name: 'Type', Value: 'Outlaw gang' }, { Name: 'Territory', Value: 'Redcut canyons' }, { Name: 'Stance', Value: 'Criminal' }, { Name: 'Influence', Value: 'Moderate' }],
        PlayerNames: [],
        NPCs: [createNPC('Vera Slate', campaignName, ['Outlaw', 'Redcut'], 3)],
      },
    ]
  }

  if (campaignName === 'Welcome to the Sprawl') {
    return [
      {
        Faction: 'The Zodiac',
        Description: 'Bearers of the Zodiac blessings. "The Zodiac" refers to the animal Zodiac; "zodiac" can refer to the animals plus the Sovereigns.',
        Attributes: [
          { Name: 'Type', Value: 'Blessed order' },
          { Name: 'Sovereigns', Value: 'Flock (Evil), Carrion (Doom), King Hasss (Air), Krag (Earth, deceased)' },
          { Name: 'The Zodiac', Value: 'Frollen (Rabbit of Hope), Clanken (Monkey of Insight), Rella (Koi of Water), Pluck (Rooster of Order), Flit (Tiger of Courage), Malla (Dog of Beast), Lick (Dragon of Fire), Gym (Weasel of Ambition), Sylas (Goat of Nature), Glitz (Snake of Surprise), Unknown (Horse of Drive)' },
        ],
        PlayerNames: ['Giles Yavin Megatron', 'Sylas', 'Glitz'],
        NPCs: [
          createNPC('Flock, Sovereign of Evil', campaignName, ['Sovereign', 'Evil', 'Zodiac'], 1),
          createNPC('Carrion, Sovereign of Doom', campaignName, ['Sovereign', 'Doom', 'Zodiac'], 1),
          createNPC('King Hasss, Sovereign of Air', campaignName, ['Sovereign', 'Air', 'Zodiac'], 1),
          createNPC('Krag, Sovereign of Earth (Deceased)', campaignName, ['Sovereign', 'Earth', 'Deceased', 'Zodiac'], 1),
          createNPC('Frollen, Rabbit of Hope', campaignName, ['Zodiac', 'Hope'], 1),
          createNPC('Clanken, Monkey of Insight', campaignName, ['Zodiac', 'Insight'], 1),
          createNPC('Rella, Koi of Water', campaignName, ['Zodiac', 'Water'], 1),
          createNPC('Pluck, Rooster of Order', campaignName, ['Zodiac', 'Order'], 1),
          createNPC('Flit, Tiger of Courage', campaignName, ['Zodiac', 'Courage'], 1),
          createNPC('Malla, Dog of Beast', campaignName, ['Zodiac', 'Beast'], 1),
          createNPC('Lick, Dragon of Fire', campaignName, ['Zodiac', 'Fire'], 1),
          createNPC('Unknown, Horse of Drive', campaignName, ['Zodiac', 'Drive'], 1),
        ],
      },
      {
        Faction: 'Night-Kin',
        Description: 'The Night-Kin, led by Grand-master Cross.',
        Attributes: [{ Name: 'Leader', Value: 'Grand-master Cross' }],
        PlayerNames: [],
        NPCs: [createNPC('Grand-master Cross', campaignName, ['Night-Kin'], 1)],
      },
      {
        Faction: 'Kingdom of Air exiles',
        Description: 'Exiles of the Kingdom of Air, led by King Rees.',
        Attributes: [{ Name: 'Leader', Value: 'King Rees' }],
        PlayerNames: [],
        NPCs: [createNPC('King Rees', campaignName, ['Exiled king', 'Air'], 1)],
      },
    ]
  }

  return []
}

function createExampleMonsters(campaignName: string): MonsterLocationGroup[] {
  if (campaignName === 'Ashen Vale') {
    return [
      {
        Location: 'Northreach Pass',
        Monsters: [
          new Monster({ Name: 'Frostwolf pack', Species: 'Frostwolf', Level: 3, Threat: 'moderate', Count: 4, description: 'Hunters that shadow caravans through the pass.', Tags: ['beast', 'pack'] }),
          new Monster({ Name: 'Rimeback ogre', Species: 'Ogre', Level: 5, Threat: 'high', description: 'A solitary brute with ice-crusted armor.', Tags: ['giant', 'cold'] }),
        ],
      },
      {
        Location: 'Old Bell Tower',
        Monsters: [new Monster({ Name: 'Ash wraiths', Species: 'Wraith', Level: 4, Threat: 'high', Count: 2, description: 'Restless spirits bound to the ruined bell.', Tags: ['undead', 'spirit'] })],
      },
    ]
  }

  if (campaignName === 'The Shattered Coast') {
    return [
      {
        Location: 'Drowned Causeway',
        Monsters: [new Monster({ Name: 'Drowned dead', Species: 'Undead', Level: 3, Threat: 'moderate', Count: 5, description: 'Waterlogged dead that rise with the tide.', Tags: ['undead', 'water'] })],
      },
      {
        Location: 'Reef of Knives',
        Monsters: [
          new Monster({ Name: 'Glassfin stalker', Species: 'Sea predator', Level: 4, Threat: 'high', Count: 2, description: 'A fast predator concealed among razor coral.', Tags: ['beast', 'aquatic'] }),
          new Monster({ Name: 'Pearl-shell sentinel', Species: 'Construct', Level: 6, Threat: 'deadly', description: 'An ancient guardian of the reef shrine.', Tags: ['construct', 'guardian'] }),
        ],
      },
    ]
  }

  if (campaignName === 'Dustwater Run') {
    return [
      {
        Location: 'Bonepile Mesa',
        Monsters: [new Monster({ Name: 'Dust drakes', Species: 'Drake', Level: 3, Threat: 'moderate', Count: 3, description: 'Scavenging lizards that nest in the mesa cliffs.', Tags: ['beast', 'desert'] })],
      },
    ]
  }

  return []
}

let nextEventId = 1

function createEventId(): string {
  return `event-${Date.now().toString(36)}-${(nextEventId++).toString(36)}`
}
