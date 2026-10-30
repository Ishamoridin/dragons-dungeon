export const PRIMARY_ATTRIBUTE_NAMES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Mental',
  'Social',
  'Mana',
] as const

export type PrimaryAttributeName = (typeof PRIMARY_ATTRIBUTE_NAMES)[number]
export type AttributeGrowth = Record<PrimaryAttributeName, number>

export class PlayerClass {
  public readonly Name: string
  public readonly AttributeGrowth: Readonly<AttributeGrowth>

  constructor(name: string, attributeGrowth: AttributeGrowth) {
    this.Name = name
    this.AttributeGrowth = Object.freeze({ ...attributeGrowth })
  }

  public GrowthFor(attributeName: PrimaryAttributeName): number {
    return this.AttributeGrowth[attributeName]
  }
}

export const COMMONER = new PlayerClass('Commoner', {
  Strength: 1,
  Dexterity: 1,
  Constitution: 1,
  Mental: 1,
  Social: 1,
  Mana: 1,
})
