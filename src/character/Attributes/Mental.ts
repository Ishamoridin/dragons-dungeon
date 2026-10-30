import type { Attribute } from '../Attribute'

const Analysis: Attribute = {
  value: 1,
  type: 'basic',
}

const Perception: Attribute = {
  value: 1,
  type: 'basic',
}

const Recall: Attribute = {
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

class Mental implements Attribute {
  value: number
  type: 'derived'
  subAttributes: Attribute[]

  constructor() {
    this.value = calculateRootMeanSquare([
      Analysis.value,
      Perception.value,
      Recall.value,
    ])
    this.type = 'derived'
    this.subAttributes = [Analysis, Perception, Recall]
  }
}

export default Mental
