export type UserRole = 'player' | 'dm'
import { DEFAULT_PAGE_SKIN, type PageSkin } from './PageSkin'

export class User {
  public readonly Id: string
  public readonly Username: string
  public readonly Role: UserRole
  public PreferredSkin: PageSkin

  constructor(id: string, username: string, role: UserRole, preferredSkin: PageSkin = DEFAULT_PAGE_SKIN) {
    this.Id = id
    this.Username = username
    this.Role = role
    this.PreferredSkin = preferredSkin
  }
}

export class Player extends User {
  constructor(id: string, username: string, preferredSkin: PageSkin = DEFAULT_PAGE_SKIN) {
    super(id, username, 'player', preferredSkin)
  }
}

export class DM extends User {
  constructor(id: string, username: string, preferredSkin: PageSkin = DEFAULT_PAGE_SKIN) {
    super(id, username, 'dm', preferredSkin)
  }
}
