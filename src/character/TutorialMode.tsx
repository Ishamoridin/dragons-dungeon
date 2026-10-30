import { useEffect, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

export type TutorialGuide = { Id: string; Title: string; Intro: string; Steps: string[] }
// A probe keeps detection testable without a DOM: has() checks a selector, selectedTab() reads the active tab label.
export type ScreenProbe = { has: (selector: string) => boolean; selectedTab: () => string }

const guide = (Id: string, Title: string, Intro: string, Steps: string[]): TutorialGuide => ({ Id, Title, Intro, Steps })

const DIALOG_GUIDES: { Selector: string; Guide: TutorialGuide }[] = [
  {
    Selector: '.register-modal',
    Guide: guide('dialog:register', 'Registration', 'Create a new account for this campaign server.', [
      'Choose DM or Player mode; DMs manage campaigns, players own character sheets.',
      'Enter an email and an account login (letters, numbers, dot, dash, underscore).',
      'The wand button suggests a strong 24-character password; the eye shows or hides it.',
      'Create Account returns you to Sign in with your login prefilled.',
    ]),
  },
  {
    Selector: '.new-system-modal',
    Guide: guide('dialog:new-system', 'New System', 'Define a stat system and the campaigns that use it.', [
      'Name and describe the system.',
      'Pick the rules template its sheets will use (Essence or Private).',
      'List campaign names, one per line; names must not belong to another system.',
      'Create System saves it to your account and selects it immediately.',
    ]),
  },
  {
    Selector: '.technique-modal',
    Guide: guide('dialog:technique', 'Technique editor', 'Edit a technique’s stats and description.', [
      'Fill the cost, skill, DC, action, range, and damage fields; damage like “1d100+50” becomes a Roll button.',
      'Flavour, Passive Effect, and Active Effect combine into the main description on save.',
      'Delete asks for confirmation before removing a library technique.',
    ]),
  },
  {
    Selector: '.revision-dialog',
    Guide: guide('dialog:conflict', 'Resolve conflicting copies', 'Two saves changed the same record; choose what survives.', [
      'Both versions are shown with their version numbers.',
      'For each differing field, keep either the submitted copy or the latest saved copy.',
      'Fields changed by only one side merge automatically.',
      'Save Resolved Copy writes the merged record as a new version.',
    ]),
  },
  {
    Selector: '.essence-adjustment-modal',
    Guide: guide('dialog:essence-adjust', 'Add or Remove Essence', 'Adjust a character’s tracked essence quantities.', [
      'Pick the essence; its current amount is shown.',
      'Choose Add or Remove and enter a whole-number quantity.',
      'Removal cannot exceed what the character holds.',
      'Notes are kept in the development log for player changes.',
    ]),
  },
  {
    Selector: '.essence-combat-head',
    Guide: guide('dialog:combat', 'Combat actions', 'Everything usable in a fight, grouped by action type.', [
      'Filter by Major, Minor, Full Turn, or Reaction; costs show Reiryoku and Willpower.',
      'Roll buttons copy to-hit and damage rolls for Roll20.',
      'Resero toggles a transformation stage; lower stages keep applying beneath it.',
      'End turn and Restore pools reset per-turn state and resources.',
    ]),
  },
  {
    Selector: '.settings-menu-panel',
    Guide: guide('dialog:settings', 'Settings', 'Account and appearance options.', [
      'Account mode switches between DM and Player without losing any data.',
      'Skin changes the page theme and is saved to your account.',
      'Connect Google account links Google sign-in to this account.',
      'Sign out revokes the current session.',
    ]),
  },
]

const DM_TAB_GUIDES: Record<string, TutorialGuide> = {
  Players: guide('dm:players', 'DM · Players', 'Your campaign roster.', [
    'Click a character card for actions: log development uses, issue universal points, open or delete the sheet.',
    'Log shows that character’s development history; new player entries are highlighted.',
    'Deleted characters lists soft-deleted sheets and can restore them.',
    'The top bar’s Undo reverts your last save; Conflicts reviews competing edits.',
  ]),
  Factions: guide('dm:factions', 'DM · Factions', 'The campaign’s groups and their members.', [
    'Click a faction for its description, attributes, player members, and NPCs.',
    'Sovereign and Zodiac cards open their passive and active powers.',
    'Player names link to sheets in the current roster.',
  ]),
  NPCs: guide('dm:npcs', 'DM · NPCs', 'Non-player characters by faction.', [
    'Click an NPC to open their sheet.',
    'All fields, items, and techniques are editable in place.',
  ]),
  Techniques: guide('dm:techniques', 'DM · Techniques', 'Every technique across characters, NPCs, and your library.', [
    'Click an entry to edit it where it lives.',
    'New technique adds one to your DM library.',
    'Techniques from deleted characters stay in the library marked with their origin.',
  ]),
  Items: guide('dm:items', 'DM · Items', 'The armour catalog, grouped by slot.', [
    'Click an item to edit its stats; Add item creates a new catalog entry.',
    'Players equip catalog items by right-clicking a paperdoll slot on their sheet.',
  ]),
  Events: guide('dm:events', 'DM · Events', 'Schedule happenings for the campaign.', [
    'Pick a target character, then choose an event template.',
    'Set the time and actions (XP, skill progress, level ups).',
    'Events apply when campaign time passes them on the Timeline.',
  ]),
  Timeline: guide('dm:timeline', 'DM · Timeline', 'Campaign time and pending events.', [
    'Set a future date and advance; due events apply their actions to characters.',
    'Time never moves backwards.',
  ]),
}

const PLAYER_TAB_GUIDES: Record<string, TutorialGuide> = {
  'Basic Info and Injuries': guide('player:basic', 'Sheet · Basic Info', 'Identity, resources, and injuries.', [
    'The combat bar is always visible: edit current pools, use the ± quick adjust, or open Combat for actions and Resero.',
    'Combat tiles copy a Roll20 /roll command on click; right-click copies a macro.',
    'Wound results like “Strength -2; maximum HP -100” apply to stats automatically and reverse when the injury is removed.',
    'Unrecognized wound text is listed under Manual review instead of being guessed.',
  ]),
  'Equipment and Inventory': guide('player:equipment', 'Sheet · Equipment', 'Worn armour and carried items.', [
    'Click a paperdoll slot to see the piece’s full stats; hover for a summary.',
    'DMs right-click a slot to equip from the item catalog.',
    'Burden counts carried inventory only; equipped armour is free.',
  ]),
  'Attributes and Skills': guide('player:attributes', 'Sheet · Attributes', 'Core values and governed skills.', [
    'The + stepper spends Universal Skill Points issued by the DM; DMs can also decrease.',
    'A skill is capped by the higher of its two governing attributes.',
    '“Effective” values appear when injuries modify a stat; purchased values are unchanged.',
  ]),
  Development: guide('player:development', 'Sheet · Development', 'Usage counts that unlock growth.', [
    'Log uses per attribute, skill, or metaphysical track.',
    'Click Development to send a spend request to the DM’s log.',
  ]),
  Techniques: guide('player:techniques', 'Sheet · Techniques', 'Powers, weapons, and spells.', [
    'Expand a spirit weapon, Resero stage, spell, or technique for its rules.',
    'Roll buttons copy the damage roll for Roll20.',
    'Long-term tracking under each power stores charges, stacks, and ranks; DMs can edit them.',
  ]),
  Essence: guide('player:essence', 'Sheet · Essence', 'Zodiac powers and essence holdings.', [
    'The Zodiac panel lists your passive and once-per-session active.',
    'The tree shows refinement paths; lit lines connect essences you hold.',
    'Click a node to add or remove quantities.',
  ]),
  'Other Notes': guide('player:notes', 'Sheet · Notes', 'Freeform reference notes.', [
    'Notes are saved with the character and visible to the DM.',
  ]),
}

const LOGIN_GUIDE = guide('login', 'Sign in', 'Access your account.', [
  'Enter your account login and password; sessions last up to 30 days.',
  'Register creates a new DM or Player account.',
  'Continue with Google is available once the server has Google credentials configured.',
])

const DM_OVERVIEW = guide('dm:overview', 'DM Campaign desk', 'Run campaigns from one screen.', [
  'The top bar picks the stat system; New System creates your own.',
  'Choose a campaign, then use the page tabs: Players, Factions, NPCs, Techniques, Items, Events, Timeline.',
  'The cog opens Settings; Undo and Conflicts sit in the top toolbar.',
])

const PLAYER_OVERVIEW = guide('player:overview', 'Character sheet', 'Your character, organized by tabs.', [
  'Tabs cover info, equipment, attributes, development, techniques, essence, and notes.',
  'The combat bar stays visible on every tab.',
  'The cog opens Settings; the sheet picker switches characters.',
])

const LEGACY_GUIDE = guide('legacy', 'Default sheet', 'The simple six-attribute sheet.', [
  'Click an attribute card to open its substats.',
  'Search skills by name, flag, or attribute.',
])

const GENERAL_GUIDE = guide('general', 'Tutorial mode', 'Help follows you between screens.', [
  'Keep this panel open; it updates as you move around the app.',
  'Undo in the top bar reverts your last saved change.',
  'Click ? again to turn tutorial mode off.',
])

export function allTutorialGuides(): TutorialGuide[] {
  return [
    ...DIALOG_GUIDES.map((entry) => entry.Guide),
    ...Object.values(DM_TAB_GUIDES),
    ...Object.values(PLAYER_TAB_GUIDES),
    LOGIN_GUIDE, DM_OVERVIEW, PLAYER_OVERVIEW, LEGACY_GUIDE, GENERAL_GUIDE,
  ]
}

export function detectTutorialGuide(probe: ScreenProbe): TutorialGuide {
  for (const entry of DIALOG_GUIDES) if (probe.has(entry.Selector)) return entry.Guide
  if (probe.has('.login-shell')) return LOGIN_GUIDE
  if (probe.has('.dm-console-shell')) return DM_TAB_GUIDES[probe.selectedTab()] ?? DM_OVERVIEW
  if (probe.has('.essence-sheet')) return PLAYER_TAB_GUIDES[probe.selectedTab()] ?? PLAYER_OVERVIEW
  if (probe.has('.sheet-shell')) return LEGACY_GUIDE
  return GENERAL_GUIDE
}

const STORAGE_KEY = 'dragons-dungeon:tutorial-mode'

const documentProbe: ScreenProbe = {
  has: (selector) => document.querySelector(selector) !== null,
  selectedTab: () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '',
}

export default function TutorialMode() {
  const [enabled, setEnabled] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
  })
  const [guideId, setGuideId] = useState('')

  useEffect(() => {
    if (!enabled) return
    const sync = () => setGuideId(detectTutorialGuide(documentProbe).Id)
    sync()
    // setState bails out when the id is unchanged, so observer loops settle immediately.
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] })
    return () => observer.disconnect()
  }, [enabled])

  const toggle = () => {
    setEnabled((previous) => {
      const next = !previous
      try { window.localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* preference only */ }
      return next
    })
  }

  const active = enabled ? detectTutorialGuide(documentProbe) : null
  void guideId

  return (
    <>
      <button
        type="button"
        className="tutorial-toggle"
        title={enabled ? 'Turn off tutorial mode' : 'Turn on tutorial mode'}
        aria-label="Toggle tutorial mode"
        aria-pressed={enabled}
        onClick={toggle}
      >
        <HelpCircle size={19} />
      </button>
      {active && (
        <aside className="tutorial-panel" aria-label="Tutorial" aria-live="polite">
          <header>
            <strong>{active.Title}</strong>
            <button type="button" title="Close tutorial" aria-label="Close tutorial" onClick={toggle}><X size={14} /></button>
          </header>
          <p>{active.Intro}</p>
          <ol>
            {active.Steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </aside>
      )}
    </>
  )
}
