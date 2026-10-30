import type { Attribute } from '../Attribute'

const Charisma: Attribute = {
  value: 1,
  type: 'basic',
}

const Control: Attribute = {
  value: 1,
  type: 'basic',
}

const Character: Attribute = {
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

class Social implements Attribute {
  value: number
  type: 'derived'
  subAttributes: Attribute[]

  constructor() {
    this.value = calculateRootMeanSquare([
      Charisma.value,
      Control.value,
      Character.value,
    ])
    this.type = 'derived'
    this.subAttributes = [Charisma, Control, Character]
  }
}

export default Social
