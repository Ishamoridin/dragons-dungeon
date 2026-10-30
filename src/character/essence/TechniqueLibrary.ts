import type { EssenceTechnique } from './EssenceTypes'

// Origin names the character a technique was kept from when that character was deleted; OriginId lets a restore remove the copies.
export type LibraryTechnique = EssenceTechnique & { Id: string; Origin?: string; OriginId?: string }

// In-memory, per DM, like the rest of the mock database.
const library = new Map<string, LibraryTechnique[]>()

export const newTechniqueId = () => `technique-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const listLibraryTechniques = (dmId: string): LibraryTechnique[] => structuredClone(library.get(dmId) ?? [])

export function saveLibraryTechnique(dmId: string, technique: LibraryTechnique): LibraryTechnique[] {
  const list = library.get(dmId) ?? []
  const index = list.findIndex((item) => item.Id === technique.Id)
  if (index >= 0) {
    list[index] = structuredClone(technique)
  } else {
    list.push(structuredClone(technique))
  }
  library.set(dmId, list)
  return listLibraryTechniques(dmId)
}

export function deleteLibraryTechnique(dmId: string, id: string): LibraryTechnique[] {
  library.set(dmId, (library.get(dmId) ?? []).filter((item) => item.Id !== id))
  return listLibraryTechniques(dmId)
}

export function deleteLibraryTechniquesFrom(dmId: string, originId: string): LibraryTechnique[] {
  library.set(dmId, (library.get(dmId) ?? []).filter((item) => item.OriginId !== originId))
  return listLibraryTechniques(dmId)
}
