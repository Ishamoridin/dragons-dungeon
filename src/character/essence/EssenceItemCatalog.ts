// Armour reference catalog, seeded from the Items tab of the Essence workbook.
// This is a shared, in-memory store (not scoped per character) so the DM Screen's
// Items tab and every player's armour picker see the same reference list.

export type ArmourCatalogEntry = {
  Id: string
  Slot: string
  Name: string
  Type: string
  ArmourValue: number
  DodgeMod: number
  DefenseMod: number
  AthleticsMod: number
  MaxReiMod: number
  Burden: number
  ArmourMod: number
}

// Canonical slot labels, in paperdoll order. A catalog entry's Slot should be one of these so it
// routes to the right ragdoll area(s) and groups correctly on the DM Screen's Items tab.
export const ARMOUR_SLOTS = ['Helmet', 'Chest', 'Bracer', 'Gloves', 'Greaves', 'Boots', 'Neck accessory', 'Back accessory'] as const

let seq = 0
const nextId = () => `catalog-seed-${(seq++).toString(36)}`

type SeedRow = [name: string, type: string, armourValue: number, dodgeMod: number, defenseMod: number, athleticsMod: number, maxReiMod: number, burden: number, armourMod: number]

function seed(slot: string, rows: SeedRow[]): ArmourCatalogEntry[] {
  return rows.map(([Name, Type, ArmourValue, DodgeMod, DefenseMod, AthleticsMod, MaxReiMod, Burden, ArmourMod]) => ({
    Id: nextId(), Slot: slot, Name, Type, ArmourValue, DodgeMod, DefenseMod, AthleticsMod, MaxReiMod, Burden, ArmourMod,
  }))
}

const HELMETS = seed('Helmet', [
  ["Rag Hood", 'Cloth', 1, 0, -1, 0, 0, 1, 0],
  ["Traveller's Hood", 'Cloth', 5, 1, -1, 1, 5, 1, 0],
  ['Scout Cowl', 'Cloth', 5, 1, 0, 1, 0, 1, 0],
  ["Pilgrim's Cowl", 'Cloth', 3, 1, -1, 1, 10, 2, 0],
  ['Quilted Arming Cap', 'Padded', 7, 0, 0, 0, 0, 2, 0],
  ['Leather Coif', 'Leather', 7, 0, 0, -1, 0, 3, 0],
  ['Scrap Faceguard', 'Scrap', 10, -1, 1, -1, 0, 2, 0],
  ['Kettle Helm', 'Forged', 10, -1, 1, -2, 0, 2, 0],
  ['Nasal Helm', 'Forged', 12, -2, 1, -1, 0, 3, 0],
  ['Half-Helm', 'Plate', 13, -2, 2, -1, 0, 2, 0],
  ['Riot-Helm', 'Polymer', 15, -2, 2, -2, 0, 3, 0],
  ['Barbute', 'Plate', 15, -2, 2, -2, 0, 3, 0],
  ['Visored Full-Helm', 'Plate', 20, -3, 2, -2, 0, 3, 0],
  ['Rushfire Plate Helm', 'Half-Plate', 15, -1, 1, -1, 10, 4, 0],
  ['Rush-Plate Half-Helm', 'Half-Plate', 20, -2, 2, -2, 10, 4, 0],
  ['Highwayman Leather Cap', 'Leather', 8, 0, 1, -1, 0, 3, 0],
])

const CHESTS = seed('Chest', [
  ['Rag Tunic', 'Cloth', 3, 0, -1, 0, 0, 1, 0],
  ["Traveller's Wrap", 'Cloth', 8, 1, -1, 1, 10, 1, 0],
  ['Scout Jacket', 'Cloth', 7, 1, 0, 1, 0, 1, 0],
  ["Pilgrim's Robes", 'Cloth', 5, 1, -1, 1, 20, 2, 0],
  ['Quilted Gambeson', 'Padded', 10, 0, 0, 0, 0, 2, 0],
  ['Leather Jerkin', 'Leather', 12, 0, 0, -1, 0, 3, 0],
  ['Scrap "Breastplate"', 'Scrap', 15, -1, 1, -1, 0, 2, 0],
  ['Brigandine Chain', 'Forged', 16, -1, 1, -2, 0, 2, 0],
  ['Nasal Hauberk', 'Forged', 18, -2, 1, -1, 0, 3, 0],
  ['Custom Leather Jacket', 'Leather', 20, 0, 1, 1, 0, 3, 0],
  ['Half-Plate Harness', 'Plate', 20, -2, 2, -1, 0, 2, 0],
  ['Riot-Vest', 'Polymer', 20, -2, 2, -2, 0, 4, 0],
  ['Half-Plate Cuirass', 'Plate', 25, -2, 2, -2, 0, 3, 0],
  ['Full-Plate Cuirass', 'Plate', 30, -3, 2, -2, 0, 3, 0],
  ['Rushfire Plate Cuirass', 'Half-Plate', 15, -1, 1, -1, 15, 4, 5],
  ['Rush-Plate Cuirass', 'Half-Plate', 20, -2, 2, -2, 10, 4, 5],
  ['Highwayman Leather Longcoat', 'Leather', 8, 0, 1, -1, 0, 3, 5],
])

const GREAVES = seed('Greaves', [
  ['Rag Trousers', 'Cloth', 3, 0, -1, 0, 0, 1, 0],
  ["Traveller's Leggings", 'Cloth', 8, 1, -1, 1, 10, 1, 0],
  ['Scout Trousers', 'Cloth', 7, 1, 0, 1, 0, 1, 0],
  ["Pilgrim's Leggings", 'Cloth', 5, 1, -1, 1, 20, 2, 0],
  ['Quilted Chausses', 'Padded', 10, 0, 0, 0, 0, 2, 0],
  ['Leather Greaves', 'Leather', 12, 0, 0, -1, 0, 3, 0],
  ['Scrap Greaves', 'Scrap', 15, -1, 1, -1, 0, 2, 0],
  ['Brigandine Legguards', 'Forged', 16, -1, 1, -2, 0, 2, 0],
  ['Mail Chausses', 'Forged', 18, -2, 1, -1, 0, 3, 0],
  ['Half-Plate Greaves', 'Plate', 20, -2, 2, -1, 0, 2, 0],
  ['Riot-Greaves', 'Polymer', 20, -2, 2, -2, 0, 4, 0],
  ['Plate Greaves', 'Plate', 25, -2, 2, -2, 0, 3, 0],
  ['Full-Plate Leg Harness', 'Plate', 30, -3, 2, -2, 0, 3, 0],
  ['Rushfire Plate Greaves', 'Half-Plate', 15, -1, 1, -1, 10, 4, 0],
  ['Rush-Plate Greaves', 'Half-Plate', 20, -2, 2, -2, 10, 4, 0],
  ['Highwayman Leather Chaps', 'Leather', 8, 0, 1, -1, 0, 3, 0],
])

const BOOTS = seed('Boots', [
  ['Military Leather', 'Leather', 10, 1, 0, 1, 0, 2, 0],
  ['Rag Shoes', 'Cloth', 1, 0, -1, 0, 0, 1, 0],
  ["Traveller's Boots", 'Cloth', 5, 1, -1, 1, 5, 1, 0],
  ['Scout Boots', 'Cloth', 5, 1, 0, 1, 0, 1, 0],
  ["Pilgrim's Sandals", 'Cloth', 3, 1, -1, 1, 10, 2, 0],
  ['Quilted Boots', 'Padded', 7, 0, 0, 0, 0, 2, 0],
  ['Leather Boots', 'Leather', 7, 0, 0, -1, 0, 3, 0],
  ['Scrap Boots', 'Scrap', 10, -1, 1, -1, 0, 2, 0],
  ['Brigandine Boots', 'Forged', 10, -1, 1, -2, 0, 2, 0],
  ['Marching Boots', 'Forged', 12, -2, 1, -1, 0, 3, 0],
  ['Half-Sabatons', 'Plate', 13, -2, 2, -1, 0, 2, 0],
  ['Riot-Boots', 'Polymer', 15, -2, 2, -2, 0, 3, 0],
  ['Plate Sabatons', 'Plate', 15, -2, 2, -2, 0, 3, 0],
  ['Knightly Sabatons', 'Plate', 20, -3, 2, -2, 0, 3, 0],
  ['Rushfire Plate Sabatons', 'Half-Plate', 15, -1, 1, -1, 10, 4, 0],
  ['Rush-Plate Sabatons', 'Half-Plate', 20, -2, 2, -2, 10, 4, 0],
  ['Highwayman Leather Boots', 'Leather', 8, 0, 1, -1, 0, 3, 0],
])

const GLOVES = seed('Gloves', [
  ['Rag Wraps', 'Cloth', 1, 0, -1, 0, 0, 1, 0],
  ["Traveller's Gloves", 'Cloth', 5, 1, -1, 1, 5, 1, 0],
  ['Scout Gloves', 'Cloth', 5, 1, 0, 1, 0, 1, 0],
  ["Pilgrim's Mitts", 'Cloth', 3, 1, -1, 1, 10, 2, 0],
  ['Quilted Gloves', 'Padded', 7, 0, 0, 0, 0, 2, 0],
  ['Leather Gauntlets', 'Leather', 7, 0, 0, -1, 0, 3, 0],
  ['Scrap Gauntlets', 'Scrap', 10, -1, 1, -1, 0, 2, 0],
  ['Brigandine Gloves', 'Forged', 10, -1, 1, -2, 0, 2, 0],
  ['Mail Mittens', 'Forged', 12, -2, 1, -1, 0, 3, 0],
  ['Half-Gauntlets', 'Plate', 13, -2, 2, -1, 0, 2, 0],
  ['Riot-Gauntlets', 'Polymer', 15, -2, 2, -2, 0, 3, 0],
  ['Plate Gauntlets', 'Plate', 15, -2, 2, -2, 0, 3, 0],
  ['Knightly Gauntlets', 'Plate', 20, -3, 2, -2, 0, 3, 0],
  ['Rushfire Plate Gauntlets', 'Half-Plate', 15, -1, 1, -1, 10, 4, 0],
  ['Rush-Plate Gauntlets', 'Half-Plate', 20, -2, 2, -2, 10, 4, 0],
  ['Highwayman Leather Gauntlets', 'Leather', 8, 0, 1, -1, 0, 3, 0],
])

const BRACERS = seed('Bracer', [
  ['Frayed Cloth Wrap', 'Bracer', 1, 0, 0, 0, 0, 1, 0],
  ['Leather Wrist Wrap', 'Bracer', 2, 0, 0, 0, 0, 1, 0],
  ['Reinforced Leather Bracer', 'Bracer', 3, 0, 0, 0, 0, 1, 0],
  ['Salvaged Wrist Guard', 'Bracer', 4, 0, 0, 0, 0, 1, 0],
  ['Plate Bracer', 'Bracer', 5, -1, 1, -1, 0, 2, 0],
  ['Bone Charm Bracelet', 'Jewellery', 1, 1, -1, 0, 5, 1, 0],
  ['Copper Spirit Band', 'Jewellery', 1, 1, 0, 0, 10, 1, 0],
  ['Spirit Conduit Band', 'Jewellery', 2, 1, 0, 1, 20, 1, 0],
  ['Silver Spirit Band', 'Jewellery', 1, 1, 0, 0, 25, 1, 0],
  ['Midnight Signet Ring', 'Jewellery', 4, 0, 1, 1, 40, 1, 1],
  ['Heart-Steel Signet Ring', 'Jewellery', 5, 1, 1, 1, 50, 1, 2],
  ['Zodiac Signet Ring', 'Jewellery', 5, 1, 1, 1, 7, 1, 5],
])

const SEED_ARMOUR_CATALOG: ArmourCatalogEntry[] = [...HELMETS, ...CHESTS, ...BRACERS, ...GLOVES, ...GREAVES, ...BOOTS]

// In-memory, shared store (same reference data for every DM and player, like a rulebook).
let catalog: ArmourCatalogEntry[] = structuredClone(SEED_ARMOUR_CATALOG)

export const newItemCatalogId = () => `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const listItemCatalog = (): ArmourCatalogEntry[] => structuredClone(catalog)

export function saveItemCatalogEntry(entry: ArmourCatalogEntry): ArmourCatalogEntry[] {
  const index = catalog.findIndex((item) => item.Id === entry.Id)
  if (index >= 0) {
    catalog[index] = structuredClone(entry)
  } else {
    catalog.push(structuredClone(entry))
  }
  return listItemCatalog()
}

export function deleteItemCatalogEntry(id: string): ArmourCatalogEntry[] {
  catalog = catalog.filter((item) => item.Id !== id)
  return listItemCatalog()
}
