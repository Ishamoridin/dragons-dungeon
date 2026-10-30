export const ATTRIBUTE_TYPES = ['basic', 'derived', 'skill', 'special'] as const

export type AttributeType = (typeof ATTRIBUTE_TYPES)[number]

export interface Attribute {
  value: number // positive integer; practical cap is 1000
  type: AttributeType
  subAttributes?: Attribute[] // optional tree of child attributes
}