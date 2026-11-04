# Welcome to the Sprawl — session journal

A narrative record of the campaign, reconstructed from the Roll20 chat archive. It is the source for the entries seeded into the app's event log (`npm run seed:journal`).

## Cast

| Character | Played by | Notes |
| --- | --- | --- |
| Vinnie, later Vinnie (Hollow) | Ishamoridin | Night-aligned smoker and smoke-shaper who died early and returned as a Hollow. Sheet: `Vinnie <Deceased>`. |
| Hotwire the InduDrake | Ishamoridin | What Vinnie became seven weeks after the Doom barrier fell: a Spirit Beast of smoke and iron, still a Hollow, able to use only Steel and Industry essence. Same person, different body, so a separate sheet: `Hotwire <Deceased>`. Fell at Shimmering Sands. |
| Gym (Giles Yavin Megatron), Weasel of Ambition | Ishamoridin | A new character by the same player, joining after Hotwire's death. Brawler whose spirit weapon is himself. |
| Sylas, Goat of Nature | Rangerium (Ranger Drox) | Began under Gloom; a dancer whose rhythm shapes Nature. Later rescinded by Water. |
| Glitz, Snake of Surprise | kbub | Rock-pose spirit weapon (headbang, arms crossed, guitar solo). Married to Aureon of Fire. |
| Crash Vandal | God | Card-deck spirit weapon, cigarettes, panic problem. The player has since left the campaign. Sheet: `Crash Vandal <Deceased>`. |
| The Dungeon Master | Lirril | Also voices every NPC: Verbem, Flock, Kaeris, Lazarus, Director, Aureon, and the rest. |

Vinnie, Hotwire and Crash Vandal have their own sheets in the app, each named with a `<Deceased>` tag and created by `scripts/seed-deceased-characters.mjs` with stats estimated from the roll modifiers in the archive. Vinnie's and Hotwire's sheets are owned by Ishamoridin; Crash's by the DM, since his player left.

## Calendar convention

The archive has no timestamps. The in-game clock is invented from story cues:

- The year **3500** stands in for the "35XX" on Clerk Phiré's receipt, which pins that scene to **4 July 3500**.
- Earlier scenes are counted back a day at a time; later ones advance by cues such as "between weeks" (+7 days), "7 weeks" (the Hotwire interlude) and "Saturday" (the birds in session 18 land on Saturday 6 October 3500).
- Times of day follow the content: camps at night, markets by day.

Real-world play dates are unknown. The seed script stamps entries with ascending synthetic `CreatedAt` values so the Events page keeps story order; only `CampaignTime` carries the in-game calendar.

## File format

One file per play session, named `NN-slug.md`. Each scene is a block the seed script can parse:

```md
## [S03.2] Rush Guard Helmet
- Campaign time: 3500-07-02T23:30
- Present: Vinnie, Sylas, Glitz, Crash Vandal
- Location: Scav camp

Narrative paragraphs. Rolls are written as outcomes, never dice strings.

**Outcomes**
- Items, techniques, essence, injuries.

### Table notes
- Out-of-character events: breaks, rules questions, banter. Never part of the story.
```

Present names map to sheets one to one: Vinnie, Hotwire, Gym, Sylas, Glitz and Crash Vandal each resolve to their own record, and the entry keeps the name used in the scene.

## Re-seeding

```
npm run seed:journal -- --dry-run   # print entries, write nothing
npm run seed:journal                # upsert into the configured database
```

Entry ids are derived from scene ids, so re-running updates text in place instead of duplicating. Every entry carries a hidden `GenerationCost` field (estimated tokens and credits per line) that the UI never renders.
