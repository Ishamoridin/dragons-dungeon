export type MonsterThreat = 'low' | 'moderate' | 'high' | 'deadly'

export type MonsterOptions = {
  Id?: string
  Name: string
  Species: string
  Level: number
  Threat: MonsterThreat
  Count?: number
  description: string
  Tags?: string[]
}

export class Monster {
  public readonly Id: string
  public Name: string
  public Species: string
  public Level: number
  public Threat: MonsterThreat
  public Count: number
  public description: string
  public Tags: string[]

  constructor(options: MonsterOptions) {
    this.Id = options.Id ?? createMonsterId(options.Name)
    this.Name = options.Name
    this.Species = options.Species
    this.Level = options.Level
    this.Threat = options.Threat
    this.Count = options.Count ?? 1
    this.description = options.description
    this.Tags = [...(options.Tags ?? [])]
  }

  public clone(): Monster {
    return new Monster({
      Id: this.Id,
      Name: this.Name,
      Species: this.Species,
      Level: this.Level,
      Threat: this.Threat,
      Count: this.Count,
      description: this.description,
      Tags: this.Tags,
    })
  }
}

let nextMonsterId = 1

function createMonsterId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `monster-${slug}-${(nextMonsterId++).toString(36)}`
}
