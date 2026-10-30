import type { EssenceTechnique } from './EssenceTypes'

// Origin names the character a technique was kept from when that character was deleted; OriginId lets a restore remove the copies.
export type LibraryTechnique = EssenceTechnique & { Id: string; Origin?: string; OriginId?: string }

export type TechniqueDescriptionParts = { Flavour: string; PassiveEffect: string; ActiveEffect: string }

export function techniqueDescriptionParts(technique: EssenceTechnique): TechniqueDescriptionParts {
  const structured = [technique.Flavour, technique.PassiveEffect, technique.ActiveEffect].some((value) => value !== undefined)
  return {
    Flavour: technique.Flavour ?? (structured ? '' : technique.Details),
    PassiveEffect: technique.PassiveEffect ?? '',
    ActiveEffect: technique.ActiveEffect ?? '',
  }
}

export function composeTechniqueDescription(parts: TechniqueDescriptionParts): string {
  const flavour = parts.Flavour.trim()
  const passive = parts.PassiveEffect.trim()
  const active = parts.ActiveEffect.trim()
  return [flavour, passive ? `Passive Effect:\n${passive}` : '', active ? `Active Effect:\n${active}` : ''].filter(Boolean).join('\n\n')
}

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
