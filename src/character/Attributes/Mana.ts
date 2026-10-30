import type { Attribute } from '../Attribute'

const Potency: Attribute = {
  value: 1,
  type: 'basic',
}

const Quantity: Attribute = {
  value: 1,
  type: 'basic',
}

const Generation: Attribute = {
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

class Mana implements Attribute {
  value: number
  type: 'derived'
  subAttributes: Attribute[]

  constructor() {
    this.value = calculateRootMeanSquare([
      Potency.value,
      Quantity.value,
      Generation.value,
    ])
    this.type = 'derived'
    this.subAttributes = [Potency, Quantity, Generation]
  }
}

export default Mana
