import type { Attribute } from '../Attribute'

const Force: Attribute = {
  value: 1,
  type: 'basic',
}

const Control: Attribute = {
  value: 1,
  type: 'basic',
}

const Recovery: Attribute = {
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

class Strength implements Attribute {
  value: number
  type: 'derived'
  subAttributes: Attribute[]

  constructor() {
    this.value = calculateRootMeanSquare([
      Force.value,
      Control.value,
      Recovery.value,
    ])
    this.type = 'derived'
    this.subAttributes = [Force, Control, Recovery]
  }
}

export default Strength
