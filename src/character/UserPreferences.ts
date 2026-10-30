import { DEFAULT_PAGE_SKIN, isPageSkin, type PageSkin } from './PageSkin'

const skinStorageKey = (userId: string) => `vibesheet:user:${userId}:preferred-skin`

export function loadPreferredSkin(userId: string): PageSkin {
  try {
    const savedSkin = localStorage.getItem(skinStorageKey(userId))
    return isPageSkin(savedSkin) ? savedSkin : DEFAULT_PAGE_SKIN
  } catch {
    return DEFAULT_PAGE_SKIN
  }
}

export function savePreferredSkin(userId: string, skin: PageSkin): void {
  try {
    localStorage.setItem(skinStorageKey(userId), skin)
  } catch {
    return
  }
}
