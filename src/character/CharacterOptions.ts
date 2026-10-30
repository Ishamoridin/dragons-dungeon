export type InventoryItem = {
  Id: string
  Name: string
  description: string
  Quantity: number
  flags: string[]
}

export type EquipmentItem = {
  Id: string
  Name: string
  description: string
  Slot: 'head' | 'body' | 'hands' | 'feet' | 'main-hand' | 'off-hand' | 'accessory'
  Weight: number
  flags: string[]
}

export type Injury = {
  Id: string
  Name: string
  description: string
  Severity: 'minor' | 'moderate' | 'severe'
  RecoveryDays: number
  flags: string[]
}

export type Augmentation = {
  Id: string
  Name: string
  description: string
  Category: 'arcane' | 'biological' | 'mechanical' | 'alchemical'
  SlotCost: number
  flags: string[]
}

export const INVENTORY_OPTIONS: InventoryItem[] = [
  { Id: 'healing-draught', Name: 'Healing draught', description: 'Restorative tonic for minor wounds.', Quantity: 1, flags: ['consumable', 'medicine'] },
  { Id: 'field-rations', Name: 'Field rations', description: 'A day of preserved food and water.', Quantity: 1, flags: ['consumable', 'travel'] },
  { Id: 'torch', Name: 'Torch', description: 'A hand-held source of flame and light.', Quantity: 1, flags: ['consumable', 'light'] },
  { Id: 'hemp-rope', Name: 'Hemp rope', description: 'Fifteen meters of sturdy climbing rope.', Quantity: 1, flags: ['tool', 'travel'] },
  { Id: 'antitoxin', Name: 'Antitoxin', description: 'A dose that counters common venoms.', Quantity: 1, flags: ['consumable', 'medicine'] },
  { Id: 'lockpicks', Name: 'Lockpicks', description: 'A compact set of fine entry tools.', Quantity: 1, flags: ['tool', 'stealth'] },
]

export const EQUIPMENT_OPTIONS: EquipmentItem[] = [
  { Id: 'iron-sword', Name: 'Iron sword', description: 'A balanced, single-handed blade.', Slot: 'main-hand', Weight: 3, flags: ['weapon', 'melee'] },
  { Id: 'shortbow', Name: 'Shortbow', description: 'A light bow for quick ranged attacks.', Slot: 'main-hand', Weight: 2, flags: ['weapon', 'ranged'] },
  { Id: 'buckler', Name: 'Buckler', description: 'A small shield for agile defense.', Slot: 'off-hand', Weight: 2, flags: ['armor', 'shield'] },
  { Id: 'leather-armor', Name: 'Leather armor', description: 'Flexible armor with modest protection.', Slot: 'body', Weight: 8, flags: ['armor', 'light'] },
  { Id: 'travel-cloak', Name: 'Travel cloak', description: 'A weather-resistant cloak with a deep hood.', Slot: 'body', Weight: 2, flags: ['clothing', 'travel'] },
  { Id: 'arcane-focus', Name: 'Arcane focus', description: 'A tuned crystal used to guide spellwork.', Slot: 'accessory', Weight: 1, flags: ['magic', 'focus'] },
]

export const INJURY_OPTIONS: Injury[] = [
  { Id: 'bruised-ribs', Name: 'Bruised ribs', description: 'A painful impact that limits hard exertion.', Severity: 'minor', RecoveryDays: 3, flags: ['blunt', 'torso'] },
  { Id: 'sprained-ankle', Name: 'Sprained ankle', description: 'A twisted joint that slows movement.', Severity: 'moderate', RecoveryDays: 7, flags: ['mobility', 'leg'] },
  { Id: 'deep-cut', Name: 'Deep cut', description: 'An open wound requiring treatment.', Severity: 'moderate', RecoveryDays: 5, flags: ['bleeding', 'wound'] },
  { Id: 'burned-hand', Name: 'Burned hand', description: 'A burn that makes fine work difficult.', Severity: 'moderate', RecoveryDays: 8, flags: ['burn', 'hand'] },
  { Id: 'fractured-arm', Name: 'Fractured arm', description: 'A broken bone that limits use of the arm.', Severity: 'severe', RecoveryDays: 30, flags: ['fracture', 'arm'] },
  { Id: 'concussion', Name: 'Concussion', description: 'A head injury that disrupts focus and balance.', Severity: 'severe', RecoveryDays: 14, flags: ['head', 'focus'] },
]

export const AUGMENTATION_OPTIONS: Augmentation[] = [
  { Id: 'mana-conduit', Name: 'Mana conduit', description: 'A rune lattice that improves magical channeling.', Category: 'arcane', SlotCost: 1, flags: ['mana', 'channeling'] },
  { Id: 'night-vision-lens', Name: 'Night-vision lens', description: 'A fitted lens that improves low-light sight.', Category: 'mechanical', SlotCost: 1, flags: ['senses', 'vision'] },
  { Id: 'reinforced-tendons', Name: 'Reinforced tendons', description: 'Alchemical fibers that improve strength and stability.', Category: 'biological', SlotCost: 2, flags: ['mobility', 'strength'] },
  { Id: 'dermal-plating', Name: 'Dermal plating', description: 'Protective plates integrated beneath the skin.', Category: 'mechanical', SlotCost: 2, flags: ['defense', 'armor'] },
  { Id: 'memory-lattice', Name: 'Memory lattice', description: 'A mnemonic matrix that sharpens recall.', Category: 'arcane', SlotCost: 1, flags: ['mental', 'memory'] },
  { Id: 'adrenal-compound', Name: 'Adrenal compound', description: 'A regulated dose that accelerates physical response.', Category: 'alchemical', SlotCost: 1, flags: ['reflex', 'consumable'] },
]
