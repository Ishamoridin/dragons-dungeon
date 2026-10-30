export const PAGE_SKINS = [
  { id: 'basalt', label: 'Basalt' },
  { id: 'tideglass', label: 'Tideglass' },
  { id: 'wildwood', label: 'Wildwood' },
  { id: 'moonstone', label: 'Moonstone' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'sao', label: 'Sword Art Online' },
  { id: 'startrek', label: 'Star Trek' },
] as const

export type PageSkin = (typeof PAGE_SKINS)[number]['id']

export const DEFAULT_PAGE_SKIN: PageSkin = 'basalt'

export function isPageSkin(value: string | null): value is PageSkin {
  return PAGE_SKINS.some((skin) => skin.id === value)
}
