import type { Attribute } from '../Attribute'

const Speed: Attribute = {
  value: 1,
  type: 'basic',
}

const Agility: Attribute = {
  value: 1,
  type: 'basic',
}

const Stamina: Attribute = {
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

class Dexterity implements Attribute {
  value: number
  type: 'derived'
  subAttributes: Attribute[]

  constructor() {
    this.value = calculateRootMeanSquare([
      Speed.value,
      Agility.value,
      Stamina.value,
    ])
    this.type = 'derived'
    this.subAttributes = [Speed, Agility, Stamina]
  }
}

export default Dexterity
