import type { Attribute } from '../Attribute';

const Resilience: Attribute = {
  value: 1,
  type: 'basic',
}

const Toughness: Attribute = {
  value: 1,
  type: 'basic',
}

const Regeneration: Attribute = {
  value: 1,
  type: 'basic',
}

const calculateRootMeanSquare = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }

  const sumSquares = values.reduce((total, value) => total + value * value, 0)
  return Math.sqrt(sumSquares / values.length)
}

class Constitution implements Attribute {
  value: number
  type: 'derived'
  subAttributes: Attribute[]

  constructor() {
    this.value = calculateRootMeanSquare([
      Resilience.value,
      Toughness.value,
      Regeneration.value,
    ])
    this.type = 'derived'
    this.subAttributes = [Resilience, Toughness, Regeneration]
  }
}

export default Constitution