export type TreeNode = {
  name: string
  tier: 1 | 2 | 3 | 4 | 5
  // Vertical slot copied from the workbook's Essence Chart rows (31 to 62).
  row: number
  from: string[]
  // Default refinement: `cost` of each ingredient makes `yield` of this essence. DMs can override per character.
  cost?: number
  yield?: number
  // Fill colour of the essence's name cell in the workbook.
  color: string
}

export type EssenceRecipe = { Cost: number; Yield: number }

export const TREE_NODES: TreeNode[] = [
  { name: 'Fire', tier: 1, row: 32, from: [], color: '#e69138' },
  { name: 'Earth', tier: 1, row: 34, from: [], color: '#85200c' },
  { name: 'Hope', tier: 1, row: 36, from: [], color: '#ffe599' },
  { name: 'Courage', tier: 1, row: 38, from: [], color: '#ffff00' },
  { name: 'Water', tier: 1, row: 40, from: [], color: '#4a86e8' },
  { name: 'Nature', tier: 1, row: 42, from: [], color: '#6aa84f' },
  { name: 'Air', tier: 1, row: 44, from: [], color: '#6fa8dc' },
  { name: 'Insight', tier: 1, row: 46, from: [], color: '#46bdc6' },
  { name: 'Beast', tier: 1, row: 48, from: [], color: '#a64d79' },
  { name: 'Surprise', tier: 1, row: 50, from: [], color: '#bf9000' },
  { name: 'Doom', tier: 1, row: 52, from: [], color: '#990000' },
  { name: 'Gloom', tier: 1, row: 54, from: [], color: '#4c1130' },
  { name: 'Evil', tier: 1, row: 56, from: [], color: '#660000' },
  { name: 'Order', tier: 1, row: 58, from: [], color: '#b4a7d6' },
  { name: 'Determination', tier: 1, row: 60, from: [], color: '#fbbc04' },
  { name: 'Drive', tier: 1, row: 62, from: [], color: '#b7b7b7' },

  { name: 'Steel', tier: 2, row: 33, from: ['Fire', 'Earth'], cost: 100, color: '#d9d2e9' },
  { name: 'Resolve', tier: 2, row: 37, from: ['Hope', 'Courage'], cost: 100, color: '#ea9999' },
  { name: 'Vitality', tier: 2, row: 41, from: ['Water', 'Nature'], cost: 100, color: '#00ff00' },
  { name: 'Light', tier: 2, row: 45, from: ['Air', 'Insight'], cost: 100, color: '#f1c232' },
  { name: 'Violation', tier: 2, row: 47, from: ['Light'], cost: 200, color: '#ff9900' },
  { name: 'Night', tier: 2, row: 49, from: ['Beast', 'Surprise'], cost: 100, color: '#000000' },
  { name: 'Despair', tier: 2, row: 53, from: ['Doom', 'Gloom'], cost: 100, color: '#741b47' },
  { name: 'Corruption', tier: 2, row: 57, from: ['Evil', 'Order'], cost: 100, color: '#274e13' },
  { name: 'Ambition', tier: 2, row: 61, from: ['Determination', 'Drive'], cost: 100, color: '#990000' },

  // The chart lists Magma above Miracle with no arrow into it; Dragon is refined from it at 500:1.
  { name: 'Magma', tier: 3, row: 31, from: [], color: '#ff9900' },
  { name: 'Dragon', tier: 3, row: 33, from: ['Magma'], cost: 500, color: '#cc0000' },
  { name: 'Miracle', tier: 3, row: 35, from: ['Steel', 'Resolve'], cost: 100, color: '#ffff00' },
  { name: 'Magic', tier: 3, row: 43, from: ['Vitality', 'Light'], cost: 100, color: '#ff00ff' },
  { name: 'Improbable', tier: 3, row: 51, from: ['Night', 'Despair'], cost: 100, color: '#a4c2f4' },
  { name: 'Inevitable', tier: 3, row: 59, from: ['Corruption', 'Ambition'], cost: 100, color: '#351c75' },
  // The chart shows Inevitability beside Ambition with no arrow into it.
  { name: 'Inevitability', tier: 3, row: 61, from: [], color: '#9fc5e8' },

  { name: 'Creation', tier: 4, row: 39, from: ['Miracle', 'Magic'], cost: 100, color: '#3d85c6' },
  // The chart repeats Miracle in the Tier 4 column above Absolution: Miracle refines into Absolution at 50:1.
  { name: 'Absolution', tier: 4, row: 46, from: ['Miracle'], cost: 50, color: '#38761d' },
  { name: 'Entropy', tier: 4, row: 55, from: ['Improbable', 'Inevitable'], cost: 100, color: '#4c1130' },

  { name: 'Breach', tier: 5, row: 44, from: ['Harmony'], cost: 1, color: '#ff00ff' },
  { name: 'Harmony', tier: 5, row: 46, from: ['Creation', 'Entropy'], cost: 100, color: '#fff2cc' },
]

export const treeNode = (name: string): TreeNode | undefined => TREE_NODES.find((node) => node.name === name)

export const combinesInto = (name: string): TreeNode[] => TREE_NODES.filter((node) => node.from.includes(name))

// The chart's default ratio for a refined essence.
export const defaultRecipe = (node: TreeNode): EssenceRecipe => ({ Cost: node.cost ?? 100, Yield: node.yield ?? 1 })

// The ratio in force for a character: the DM's override when one exists, otherwise the chart's.
export function recipeFor(node: TreeNode, overrides?: Record<string, EssenceRecipe>): EssenceRecipe {
  const override = overrides?.[node.name]
  return override && override.Cost > 0 && override.Yield > 0 ? override : defaultRecipe(node)
}

export function rateLabel(node: TreeNode, recipe: EssenceRecipe = defaultRecipe(node)): string {
  if (node.from.length === 0) return 'Base essence'
  const inputs = node.from.map(() => recipe.Cost.toLocaleString()).join(' + ')
  return `${inputs} → ${recipe.Yield.toLocaleString()}`
}

// Readable text colour for a workbook fill.
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#1a1013' : '#ffffff'
}
