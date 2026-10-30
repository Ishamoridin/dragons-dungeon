import { useEffect, useRef, useState } from 'react'
import './App.css'
import Person from './character/Person'
import type { Attribute } from './character/Attribute'
import { SKILLS, type Skill } from './character/Skills'
import { refreshCharacterSheets, updateCharacterSheet, displayName, type CharacterSheetRecord } from './character/CharacterSheetDatabase'
import { applyEssenceChange, applySheetChange, logDevelopmentRequest, type DevelopmentRequest, type EssenceChange, type SheetChange } from './character/essence/EssenceChanges'
import { EssenceSheetBody } from './character/essence/EssenceViews'
import { spiritWeaponLabel } from './character/essence/EssenceSystem'
import { authenticateUser, DEMO_DM, restoreSession, signOut } from './character/MockAuth'
import LoginScreen from './character/LoginScreen'
import { DM, type User } from './character/User'
import DMConsole from './character/DMConsole'
import SettingsMenu from './character/SettingsMenu'
import { api } from './character/Api'
import { DEFAULT_PAGE_SKIN, type PageSkin } from './character/PageSkin'
import { savePreferredSkin } from './character/UserPreferences'

type SubStat = {
  label: string
  value: string
  note: string
}

type Effect = {
  label: string
  value: string
}

type AttributeDefinition = {
  id: string
  name: string
  icon: string
  score: number
  role: string
  description: string
  isUpdated: boolean
  subStats: SubStat[]
  effects: Effect[]
}

const formatScore = (score: number) =>
  Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/\.?0+$/, '')
const skillMatches = (skill: Skill, query: string) => {
  const searchText = [
    skill.Name,
    skill.description,
    skill.flags.join(' '),
    skill.attributes.join(' '),
  ].join(' ').toLowerCase()

  return searchText.includes(query.trim().toLowerCase())
}

const getAttributeValues = (character: Person): Record<string, number> => ({
  Strength: character.Strength.value,
  Dexterity: character.Dexterity.value,
  Constitution: character.Constitution.value,
  Mental: character.Mental.value,
  Social: character.Social.value,
  Mana: character.Mana.value,
})

const attributeMeta = [
  {
    id: 'Strength',
    name: 'Strength',
    icon: '⚔️',
    role: 'Force of movement',
    description: 'Raw force, melee damage, and the ability to break through resistance.',
    subLabels: ['Force', 'Control', 'Recovery'],
    subNotes: [
      'Attack power and carrying force',
      'Precision under strain',
      'Recovery and resilience',
    ],
  },
  {
    id: 'Dexterity',
    name: 'Dexterity',
    icon: '🏹',
    role: 'Speed of movement',
    description: 'Reflexes, accuracy, and deft movement in tense situations.',
    subLabels: ['Speed', 'Agility', 'Stamina'],
    subNotes: ['Rapid movement and reaction time', 'Poise and evasion', 'Endurance in motion'],
  },
  {
    id: 'Constitution',
    name: 'Constitution',
    icon: '🛡️',
    role: 'Physical resistance',
    description: 'Health, fortitude, and resistance to hardship and poison.',
    subLabels: ['Resilience', 'Toughness', 'Regeneration'],
    subNotes: ['Resistance to strain', 'Physical hardiness', 'Healing and recovery'],
  },
  {
    id: 'Mental',
    name: 'Mental',
    icon: '📚',
    role: 'Power of the mind',
    description: 'Reasoning, memory, and the understanding of arcane systems.',
    subLabels: ['Analysis', 'Perception', 'Recall'],
    subNotes: ['Logical understanding', 'Situational awareness', 'Memory retention'],
  },
  {
    id: 'Social',
    name: 'Social',
    icon: '🎭',
    role: 'Power over others',
    description: 'Charm, authority, and the power to shape social outcomes.',
    subLabels: ['Charisma', 'Control', 'Character'],
    subNotes: ['Presence and influence', 'Social discipline', 'Integrity and tone'],
  },
  {
    id: 'Mana',
    name: 'Mana',
    icon: '✨',
    role: 'Power over Mana',
    description: 'The flow, intensity, and regenerative power of magical energy.',
    subLabels: ['Potency', 'Quantity', 'Generation'],
    subNotes: ['Spell strength', 'Available magical reserve', 'Creation of Mana'],
  },
] as const

const buildAttributes = (
  character: Person,
  loadedValues: Record<string, number>,
): AttributeDefinition[] =>
  attributeMeta.map((attribute) => {
    const source = (character[attribute.id as keyof Person] as Attribute | undefined) ?? {
      value: 1,
      type: 'basic',
      subAttributes: [],
    }

    const subStats: SubStat[] = (source.subAttributes ?? []).map((sub, index) => ({
      label: attribute.subLabels[index] ?? `Substat ${index + 1}`,
      value: String(sub.value),
      note: attribute.subNotes[index] ?? 'Core capability',
    }))

    return {
      id: attribute.id.toLowerCase(),
      name: attribute.name,
      icon: attribute.icon,
      score: source.value,
      role: attribute.role,
      description: attribute.description,
      isUpdated: loadedValues[attribute.id] !== undefined &&
        Math.abs(source.value - loadedValues[attribute.id]) > 0.000001,
      subStats,
      effects: [
        { label: 'Focus', value: source.subAttributes?.length ? `${source.subAttributes.length} substats` : 'Core' },
      ],
    }
  })

function App() {
  const [restoring, setRestoring] = useState(true)
  const [pageSkin, setPageSkin] = useState<PageSkin>(DEFAULT_PAGE_SKIN)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [character, setCharacter] = useState<Person | null>(null)
  const [loadedAttributeValues, setLoadedAttributeValues] = useState<Record<string, number> | null>(null)
  const [activeId, setActiveId] = useState<string | null>('strength')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDevMode, setIsDevMode] = useState(false)
  const [isModifyStatsEnabled, setIsModifyStatsEnabled] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [expandedSkills, setExpandedSkills] = useState<string[]>([])
  const [savedSheetCount, setSavedSheetCount] = useState(0)
  const [databaseRefreshStatus, setDatabaseRefreshStatus] = useState('Signed out')
  const [, setCharacterRevision] = useState(0)
  const [essenceSheets, setEssenceSheets] = useState<CharacterSheetRecord[]>([])
  const [viewedEssenceId, setViewedEssenceId] = useState<string | null>(null)
  const lastRefreshAt = useRef(0)

  useEffect(() => {
    document.documentElement.dataset.skin = pageSkin
  }, [pageSkin])

  useEffect(() => {
    if (!currentUser) {
      return
    }

    const refreshOnInteraction = () => {
      const now = Date.now()
      if (now - lastRefreshAt.current < 10_000) {
        return
      }

      lastRefreshAt.current = now
      setDatabaseRefreshStatus('Refreshing')
      void refreshCharacterSheets(currentUser)
        .then((sheets) => {
          setSavedSheetCount(sheets.length)
          setEssenceSheets(sheets.filter((sheet) => sheet.Essence))
          setDatabaseRefreshStatus(`Synced ${new Date().toLocaleTimeString()}`)
        })
        .catch(() => setDatabaseRefreshStatus('Refresh failed'))
    }

    const interactionEvents: Array<keyof DocumentEventMap> = [
      'click',
      'keyup',
      'input',
      'change',
    ]

    interactionEvents.forEach((eventName) => {
      document.addEventListener(eventName, refreshOnInteraction)
    })
    const restored = () => { lastRefreshAt.current = 0; refreshOnInteraction() }
    window.addEventListener('data-restored', restored)

    return () => {
      window.removeEventListener('data-restored', restored)
      interactionEvents.forEach((eventName) => {
        document.removeEventListener(eventName, refreshOnInteraction)
      })
    }
  }, [currentUser])

  const activateUser = async (authenticatedUser: User): Promise<void> => {
    setPageSkin(authenticatedUser.PreferredSkin)
    setCurrentUser(authenticatedUser)
    const assignedDM = authenticatedUser.Role === 'dm'
      ? new DM(authenticatedUser.Id, authenticatedUser.Username)
      : DEMO_DM
    const loadedCharacter = new Person(authenticatedUser, assignedDM)
    setCharacter(loadedCharacter)
    setLoadedAttributeValues(getAttributeValues(loadedCharacter))
    lastRefreshAt.current = Date.now()
    setDatabaseRefreshStatus('Refreshing')

    try {
      const sheets = await refreshCharacterSheets(authenticatedUser)
      setSavedSheetCount(sheets.length)
      const essence = sheets.filter((sheet) => sheet.Essence)
      setEssenceSheets(essence)
      setViewedEssenceId(essence[0]?.Id ?? null)
      setDatabaseRefreshStatus(`Synced ${new Date().toLocaleTimeString()}`)
    } catch {
      setSavedSheetCount(0)
      setDatabaseRefreshStatus('Refresh failed')
    }

  }

  useEffect(() => {
    let active = true
    void restoreSession().then(async (user) => { if (active && user) await activateUser(user) })
      .catch(() => { if (active) setDatabaseRefreshStatus('Unable to restore session.') })
      .finally(() => { if (active) setRestoring(false) })
    return () => { active = false }
  }, [])

  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    const user = await authenticateUser(username, password)
    if (!user) return false
    await activateUser(user)
    return true
  }

  const handleSkinChange = (skin: PageSkin) => {
    setPageSkin(skin)
    if (currentUser) {
      currentUser.PreferredSkin = skin
      savePreferredSkin(currentUser.Id, skin)
      void api(`/accounts/${currentUser.Id}`, 'PATCH', { PreferredSkin: skin }).catch(() => setDatabaseRefreshStatus('Unable to save page skin.'))
    }
  }

  const handleLogout = async () => {
    try { await signOut() }
    catch { setDatabaseRefreshStatus('Sign out failed. Please retry.'); return }
    setCurrentUser(null)
    setCharacter(null)
    setLoadedAttributeValues(null)
    setSavedSheetCount(0)
    setEssenceSheets([])
    setViewedEssenceId(null)
    setDatabaseRefreshStatus('Signed out')
    setIsDevMode(false)
    setIsModifyStatsEnabled(false)
    lastRefreshAt.current = 0
  }

  if (restoring) return <main className="login-shell"><section className="login-panel"><p role="status">Restoring session...</p></section></main>

  if (!currentUser || !character) {
    return <LoginScreen onLogin={handleLogin} />
  }

  if (currentUser.Role === 'dm') {
    return <DMConsole user={currentUser} onSignOut={handleLogout} skin={pageSkin} onSkinChange={handleSkinChange} onUserChange={activateUser} />
  }

  // State updates first so rapid clicks build on each other; the save follows.
  const persistEssence = async (next: CharacterSheetRecord) => {
    try {
      const saved = await updateCharacterSheet(next.Id, next, currentUser)
      if (saved) setEssenceSheets((sheets) => sheets.map((sheet) => sheet === next ? saved : sheet))
    } catch { setDatabaseRefreshStatus('Save failed. Check the change-history alert.') }
  }

  const editEssence = async (id: string, change: SheetChange) => {
    const record = essenceSheets.find((sheet) => sheet.Id === id)
    if (!record?.Essence) {
      return
    }

    const next: CharacterSheetRecord = { ...record, Essence: structuredClone(record.Essence) }
    try {
      applySheetChange(next.Essence!, change, { name: currentUser.Username, role: 'player' })
    } catch {
      return
    }
    setEssenceSheets((sheets) => sheets.map((sheet) => sheet.Id === id ? next : sheet))
    await persistEssence(next)
  }

  const changeEssence = async (id: string, change: EssenceChange) => {
    const record = essenceSheets.find((sheet) => sheet.Id === id)
    if (!record?.Essence) {
      return
    }

    const next: CharacterSheetRecord = { ...record, Essence: structuredClone(record.Essence) }
    try {
      applyEssenceChange(next.Essence!, change, { name: currentUser.Username, role: 'player' })
    } catch {
      return
    }
    setEssenceSheets((sheets) => sheets.map((sheet) => sheet.Id === id ? next : sheet))
    await persistEssence(next)
  }

  const requestDevelopment = async (id: string, request: DevelopmentRequest) => {
    const record = essenceSheets.find((sheet) => sheet.Id === id)
    if (!record?.Essence) {
      return
    }

    const next: CharacterSheetRecord = { ...record, Essence: structuredClone(record.Essence) }
    try {
      logDevelopmentRequest(next.Essence!, request, { name: currentUser.Username })
    } catch {
      return
    }
    setEssenceSheets((sheets) => sheets.map((sheet) => sheet.Id === id ? next : sheet))
    await persistEssence(next)
  }

  const sheetPicker = essenceSheets.length > 0 && (
    <label className="page-skin-control">
      <span>Sheet</span>
      <select
        aria-label="Character sheet"
        value={viewedEssenceId ?? ''}
        onChange={(event) => setViewedEssenceId(event.currentTarget.value || null)}
      >
        {essenceSheets.map((sheet) => <option key={sheet.Id} value={sheet.Id}>{displayName(sheet)}</option>)}
        <option value="">Hero (default sheet)</option>
      </select>
    </label>
  )
  const viewedEssence = essenceSheets.find((sheet) => sheet.Id === viewedEssenceId)

  if (viewedEssence?.Essence) {
    return (
      <div className="sheet-shell" data-skin={pageSkin}>
        <header className="sheet-topbar">
          <div>
            <p className="eyebrow">{viewedEssence.CampaignName} · Essence</p>
            <h1>{displayName(viewedEssence)}</h1>
          </div>
          <div className="topbar-actions">
            {sheetPicker}
            <div className="summary-pill"><span>{viewedEssence.Essence.Race}</span><span>{spiritWeaponLabel(viewedEssence.Essence)}</span></div>
            <span className="signed-in-user">{currentUser.Username} · {currentUser.Role.toUpperCase()}</span>
            <SettingsMenu user={currentUser} pageSkin={pageSkin} onSkinChange={handleSkinChange} onLogout={handleLogout} onUserChange={activateUser} />
          </div>
        </header>
        <EssenceSheetBody data={viewedEssence.Essence} role="player" onChange={(change) => void editEssence(viewedEssence.Id, change)} onEssenceChange={(change) => void changeEssence(viewedEssence.Id, change)} development={{ campaignName: viewedEssence.CampaignName, onRequest: (request) => void requestDevelopment(viewedEssence.Id, request) }} />
      </div>
    )
  }

  const attributes = buildAttributes(character, loadedAttributeValues ?? {})
  const activeAttribute = attributes.find((attribute) => attribute.id === activeId) ?? attributes[0]
  const visibleSkills = SKILLS.filter((skill) =>
    skillMatches(skill, skillSearch) || skill.subtypes.some((subtype) => skillMatches(subtype, skillSearch)),
  )

  const resources = [
    { name: 'Max Mana', value: Math.round(10 * character.Mana.value), color: 'mana' },
    {
      name: 'Max Stamina',
      value: Math.round(5 * character.Dexterity.value + 3 * character.Constitution.value + 2 * character.Strength.value),
      color: 'stamina',
    },
    {
      name: 'Max Health',
      value: Math.round(4 * character.Constitution.value + 3 * character.Strength.value + 3 * character.Dexterity.value),
      color: 'health',
    },
  ]

  const openAttribute = (id: string) => {
    setActiveId(id)
    setIsModalOpen(true)
  }

  const closeAttribute = () => {
    setIsModalOpen(false)
  }

  const refreshCharacter = () => setCharacterRevision((revision) => revision + 1)

  const changeSubAttribute = (attributeId: string, index: number, change: number) => {
    const definition = attributeMeta.find((attribute) => attribute.id.toLowerCase() === attributeId)
    if (!definition) {
      return
    }

    const rootAttribute = character[definition.id as keyof Person] as Attribute
    character.ModifySubAttribute(rootAttribute, index, change)
    refreshCharacter()
  }

  const toggleSkill = (name: string) => {
    setExpandedSkills((current) =>
      current.includes(name) ? current.filter((skillName) => skillName !== name) : [...current, name],
    )
  }

  return (
    <div className="sheet-shell" data-skin={pageSkin}>
      <header className="sheet-topbar">
        <div>
          <p className="eyebrow">Campaign ledger</p>
          <h1>Character Sheet</h1>
        </div>
        <div className="topbar-actions">
          {sheetPicker}
          <span className="database-status" role="status" aria-live="polite">
            DB · {savedSheetCount} sheets · {databaseRefreshStatus}
          </span>
          <div className="summary-pill">
            <span>Level {character.Level}</span>
            <span>{character.PlayerClass.Name}</span>
          </div>
          <span className="signed-in-user">{currentUser.Username} · {currentUser.Role.toUpperCase()}</span>
          <SettingsMenu user={currentUser} pageSkin={pageSkin} onSkinChange={handleSkinChange} onLogout={handleLogout} onUserChange={activateUser} />
          <label className="dev-mode-toggle">
            <input
              type="checkbox"
              checked={isDevMode}
              onChange={(event) => {
                const enabled = event.currentTarget.checked
                setIsDevMode(enabled)
                if (!enabled) {
                  setIsModifyStatsEnabled(false)
                }
              }}
            />
            <span>Developer mode</span>
          </label>
        </div>
      </header>

      {isDevMode && (
        <section className="dev-toolbar" aria-label="Developer controls">
          <div className="dev-toolbar-title">
            <span className="dev-badge">DEV</span>
            <strong>Character controls</strong>
          </div>
          <label className="modify-stats-toggle">
            <input
              type="checkbox"
              checked={isModifyStatsEnabled}
              onChange={(event) => setIsModifyStatsEnabled(event.currentTarget.checked)}
            />
            <span>Modify stats</span>
          </label>
          <div className="level-controls">
            <button
              type="button"
              onClick={() => {
                character.LevelDown()
                refreshCharacter()
              }}
              disabled={character.Level <= 1}
            >
              Level down
            </button>
            <button
              type="button"
              onClick={() => {
                character.LevelUp()
                refreshCharacter()
              }}
            >
              Level up
            </button>
          </div>
        </section>
      )}

      <main className="sheet-grid">
        <section className="identity-panel">
          <div className="portrait-card">
            <div className="avatar-ring">
              <div className="avatar-core">CS</div>
            </div>
            <div>
              <h2>Hero</h2>
            </div>
          </div>
          <div className="resource-bars" aria-label="Character resources">
            {resources.map((resource) => (
              <div className={`resource-row ${resource.color}`} key={resource.name}>
                <div className="resource-label">
                  <span>{resource.name}</span>
                  <strong>{resource.value} / {resource.value}</strong>
                </div>
                <div
                  className="resource-track"
                  role="progressbar"
                  aria-label={resource.name}
                  aria-valuemin={0}
                  aria-valuemax={resource.value}
                  aria-valuenow={resource.value}
                >
                  <span className="resource-fill" />
                </div>
              </div>
            ))}
          </div>

          <div className="status-box">
            <ul>
              <li>Strength: {formatScore(character.Strength.value)}</li>
              <li>Dexterity: {formatScore(character.Dexterity.value)}</li>
              <li>Social: {formatScore(character.Social.value)}</li>
            </ul>
          </div>
        </section>

        <section className="attribute-panel">
          <div className="panel-header">
            <h2>Attributes</h2>
          </div>

          <div className="attribute-grid">
            {attributes.map((attribute) => {
              return (
                <button
                  key={attribute.id}
                  type="button"
                  className={`attribute-card ${activeAttribute.id === attribute.id ? 'active' : ''}`}
                  onClick={() => openAttribute(attribute.id)}
                >
                  <div className="attribute-head">
                    <span className="attribute-icon">{attribute.icon}</span>
                    <div>
                      <strong>{attribute.name}</strong>
                      <small>{attribute.role}</small>
                    </div>
                  </div>

                  <div className="attribute-score-row">
                    <span className="score-value">{formatScore(attribute.score)}</span>
                    {attribute.isUpdated && <span className="updated-banner">Updated</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </main>

      <section className="skills-panel" aria-labelledby="skills-heading">
        <div className="skills-header">
          <div>
            <p className="eyebrow">Character abilities</p>
            <h2 id="skills-heading">Skills <span>{visibleSkills.length} / {SKILLS.length}</span></h2>
          </div>
          <label className="skills-search">
            <span className="visually-hidden">Search skills</span>
            <input
              type="search"
              placeholder="Search skills, attributes, or tags"
              value={skillSearch}
              onChange={(event) => setSkillSearch(event.currentTarget.value)}
            />
          </label>
        </div>

        <div className="skill-list">
          {visibleSkills.map((skill) => {
            const matchingSubtypes = skill.subtypes.filter((subtype) => skillMatches(subtype, skillSearch))
            const hasSubtypeSearchMatch = skillSearch.trim().length > 0 && matchingSubtypes.length > 0
            const isExpanded = expandedSkills.includes(skill.Name) || hasSubtypeSearchMatch
            const displayedSubtypes = hasSubtypeSearchMatch ? matchingSubtypes : skill.subtypes

            return (
              <article className="skill-entry" key={skill.Name}>
                <div className="skill-entry-main">
                  <div className="skill-identity">
                    <h3>{skill.Name}</h3>
                    <p>{skill.description}</p>
                  </div>
                  <div className="skill-value">
                    <span>Value</span>
                    <strong>{skill.Value}<small> / 100</small></strong>
                  </div>
                  <div className="skill-progress">
                    <div className="skill-progress-label">
                      <span>Progress</span>
                      <strong>{skill.Progress}%</strong>
                    </div>
                    <div
                      className="skill-progress-track"
                      role="progressbar"
                      aria-label={`${skill.Name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={skill.Progress}
                    >
                      <span style={{ width: `${skill.Progress}%` }} />
                    </div>
                  </div>
                  <div className="skill-tier">
                    <span>Tier</span>
                    <strong>{skill.tier}</strong>
                  </div>
                  {skill.subtypes.length > 0 ? (
                    <button
                      type="button"
                      className="subtype-toggle"
                      aria-expanded={isExpanded}
                      onClick={() => toggleSkill(skill.Name)}
                    >
                      {isExpanded ? 'Hide' : 'Show'} {skill.subtypes.length} types
                    </button>
                  ) : <span className="skill-no-subtypes" />}
                </div>

                <div className="skill-tags">
                  <div className="skill-tag-group">
                    <span className="skill-data-label">Attributes</span>
                    {skill.attributes.map((attribute) => (
                      <span className="skill-chip attribute-chip" key={attribute}>{attribute}</span>
                    ))}
                  </div>
                  <div className="skill-tag-group">
                    <span className="skill-data-label">Flags</span>
                    {skill.flags.length > 0
                      ? skill.flags.map((flag) => <span className="skill-chip flag-chip" key={flag}>{flag}</span>)
                      : <span className="skill-empty">None</span>}
                  </div>
                </div>

                {isExpanded && displayedSubtypes.length > 0 && (
                  <div className="skill-subtypes">
                    <h4>Manipulation types</h4>
                    <div className="skill-subtype-list">
                      {displayedSubtypes.map((subtype) => (
                        <div className="skill-subtype-entry" key={subtype.Name}>
                          <div className="subtype-heading">
                            <strong>{subtype.Name}</strong>
                            <span>Value {subtype.Value} / 100 · Tier {subtype.tier}</span>
                          </div>
                          <p>{subtype.description}</p>
                          <div className="subtype-progress-label">
                            <span>Progress</span>
                            <strong>{subtype.Progress}%</strong>
                          </div>
                          <div
                            className="skill-progress-track"
                            role="progressbar"
                            aria-label={`${subtype.Name} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={subtype.Progress}
                          >
                            <span style={{ width: `${subtype.Progress}%` }} />
                          </div>
                          <div className="skill-tags">
                            {subtype.attributes.map((attribute) => (
                              <span className="skill-chip attribute-chip" key={attribute}>{attribute}</span>
                            ))}
                            {subtype.flags.map((flag) => (
                              <span className="skill-chip flag-chip" key={flag}>{flag}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
          {visibleSkills.length === 0 && (
            <p className="skills-empty-state">No skills match “{skillSearch}”.</p>
          )}
        </div>
      </section>

      {isModalOpen && activeAttribute && (
        <div className="attribute-modal-backdrop" onClick={closeAttribute}>
          <div className="attribute-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header-row">
              <div className="modal-heading">
                <span className="attribute-icon large">{activeAttribute.icon}</span>
                <div>
                  <p className="eyebrow">Live calibration</p>
                  <div className="attribute-title-row">
                    <h3>{activeAttribute.name}</h3>
                    {activeAttribute.isUpdated && <span className="updated-banner">Updated</span>}
                  </div>
                </div>
              </div>
              <button type="button" className="modal-toggle" onClick={closeAttribute}>
                Close
              </button>
            </div>

            <div className="modal-body">
              <div className="primary-summary">
                <div className="value-block">
                  <span>Score</span>
                  <strong>{formatScore(activeAttribute.score)}</strong>
                </div>
              </div>

              <p className="attribute-description">{activeAttribute.description}</p>

              <div className="info-grid">
                <div className="detail-card">
                  <h4>Sub-stats</h4>
                  <ul>
                    {activeAttribute.subStats.map((subStat) => (
                      <li key={subStat.label}>
                        <span>{subStat.label}</span>
                        <div className="substat-value">
                          <strong>{subStat.value}</strong>
                          {isDevMode && isModifyStatsEnabled && (
                            <div className="substat-controls">
                              <button
                                type="button"
                                aria-label={`Decrease ${subStat.label}`}
                                onClick={() => changeSubAttribute(activeAttribute.id, activeAttribute.subStats.indexOf(subStat), -1)}
                                disabled={Number(subStat.value) <= 1}
                              >
                                −
                              </button>
                              <button
                                type="button"
                                aria-label={`Increase ${subStat.label}`}
                                onClick={() => changeSubAttribute(activeAttribute.id, activeAttribute.subStats.indexOf(subStat), 1)}
                                disabled={Number(subStat.value) >= 1000}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                        <small>{subStat.note}</small>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="detail-card">
                  <h4>Resulting effects</h4>
                  <ul className="effect-list">
                    {activeAttribute.effects.map((effect) => (
                      <li key={effect.label}>
                        <span>{effect.label}</span>
                        <strong>{effect.value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
