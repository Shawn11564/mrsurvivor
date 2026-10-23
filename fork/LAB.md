# Lab mode and the move overhaul: plan and tracking

MrSurvivor-only. New move systems are tested in an opt-in **Lab** mode before they go into the
normal game. This file is the source of truth for what's planned, decided and done. Update the
status table as work lands.

## Decisions

| Date | Decision |
|---|---|
| 2026-10-20 | Lab is a normal **Settings** option, visible to everyone (Settings → Experimental). |
| 2026-10-20 | Experimental is its own Settings tab (before Account); `lab.js` adds the tab button. |
| 2026-10-20 | In co-op the **host's** setting decides for the whole run; guests don't need it on. |
| 2026-10-20 | Lab runs give **coins, tickets and shinies** as usual, but don't count for **leaderboards, missions, achievements or personal records/stats**. |
| 2026-10-22 | Lab runs **count for missions** too (the owner's call: missions didn't move for players who play Lab); still not for leaderboards, achievements or records/stats. |
| 2026-10-20 | Phases go in the listed order. |
| 2026-10-20 | Lab texts are **English only** (no other translations); in other languages they show in English. |
| 2026-10-20 | All Lab code lives in `js/fork/lab/`; upstream files only get one-line hooks (merge conflicts, see `CLAUDE.local.md`). |
| 2026-10-20 | **Mega Evolution is a Lab feature**: the stone only drops, and only works, in Lab runs; the "can Mega Evolve" marks only show with the Lab setting on. |
| 2026-10-20 | Promotion to the normal game (phase 8) is per move (`promote: true`), and **nothing is promoted yet**: that is the owner's call, after play-testing and the balance report. |
| 2026-10-21 | **Move badges** in Lab: same-type arrow only when it adds damage (one type); weak side yellow from 65 %, red under; the enemy arrows redrawn in the same colours (x4 magenta). |
| 2026-10-21 | The badges are the **4 plain arrows only**, drawn by the artist (18×18, own size); the symbols version and its setting are gone. |
| 2026-10-21 | Every arrow at **half size** (the 18×18 PNGs at 9); over an enemy with no health bar yet (full health, not a boss), **centred above it**. |
| 2026-10-23 | Lab runs have their own **Lab leaderboard** (the owner's ask): every board the regular one has (solo / group; today, week, month, all-time, all-time per Pokémon), counting only Lab runs. Lab runs still never reach the regular boards. |

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Lab framework: setting, per-run flag, co-op flag, protections, Lab-only test move (Swift), tests | **done** 2026-10-20 |
| 1 | Data from PokeAPI and SpriteCollab (learnsets, abilities, move power, animation list) | **done** 2026-10-20 |
| 2 | Per-species move pools (learnset-based, plus coverage moves) | **done** 2026-10-20 |
| 3 | Abilities as passives (70 implemented; 73% of species get one that does something) | **done** 2026-10-20 |
| 4 | New move kinds: leap, recoil, ramp, guard/counter, sleep, confusion, weather and terrain setters, wave (Surf), Metronome, Transform (45 moves) | **done** 2026-10-20 |
| 5 | Signature moves for 70 lines and legendaries, with their own PMD animations where SpriteCollab has them | **done** 2026-10-20 |
| 6 | Lower tiers: in-run evolution (and Everstone), Eviolite and species items, underdog XP, duplicate candies | **done** 2026-10-20 |
| 7 | Shinies: move colours from the shiny sprite, +1 reroll (and +10% XP and coins until 2026-10-22) | **done** 2026-10-20 |
| 8 | Balance script (`fork/balance-lab.cjs`) and the `promote` switch; nothing promoted yet | **done** 2026-10-20 (promotion: owner's call) |
| 9 | Close range and sustain: 50 official moves, 7 new kinds (grab, bind, focus, heal, screen, shout, endure) and hit effects (drain, revenge, reversal, HP cut...), the survival bot | **done** 2026-10-21 (not play-tested yet) |
| 10 | Move identity (plan B1, B3.1-B3.7): Lab fields and steps for the normal game's moves, honest evolutions, marks, hazard fields, converters, trade-off buffs, decoys, taunt/attract, combos | **done** 2026-10-22 (not play-tested yet) |
| 11 | Builds (plan B2, B4): branching upgrades, set bonuses, synergy cards, bond recipes | **done** 2026-10-22 (not play-tested yet) |
| 12 | Co-op support moves (TODO 46): Heal Pulse, Aromatherapy, Wide Guard, Block, Helping Hand, on co-op cards only | **done** 2026-10-22 (not play-tested yet) |

## Files

| File | What |
|---|---|
| `js/fork/lab/lab.js` | `G.Lab`: the setting, per-run flag, Lab pools, signature pools and cards, promotion, protections, co-op messages, badges, the pause block |
| `js/fork/lab/abilities.js` | `G.LabAbilities`: the ability table and its hooks |
| `js/fork/lab/kinds.js` | `G.LabKinds`: the new move kinds (phase 4), their ladders and evolutions, sleep and confusion, co-op messages |
| `js/fork/lab/mobility.js` | `G.LabMobility`: policy (a) for dash, recoil and roll, Lab's dash, pivots and Flame Charge's speed, the mover grace (section "Close range and mobility") |
| `js/fork/lab/move-traits.js` | `G.LabTraits`: the close-range and mobility moves' traits in `G.LabMech.ID`, parry, the swap of a run's first moves for their Lab copies |
| `js/fork/lab/kinds2.js` | `G.LabKinds2`: phase 9's kinds (grab, bind, focus, heal, screen, shout, endure), the hit effects (leech, seed, revenge, reversal, cut, power, flinch), multi-stat buffs, the close-range damage cut |
| `js/fork/lab/mech.js` | `G.LabMech`: phase 10, move identity (each normal move's Lab fields, steps and evolution) and the new mechanics (mark...) |
| `js/fork/lab/lab-moves.js` | `G.LabMoves`: moves that only exist in Lab (data only; phases 4 and 5) |
| `js/fork/lab/anims.js` | `G.LabAnims`: signature moves' own PMD animations (phase 5) |
| `js/fork/lab/growth.js` | `G.LabGrowth`: in-run evolution, Everstone, items, underdog XP, candies (phase 6) |
| `js/fork/lab/candy-ui.js` | `G.LabCandyUI`: the candy panel in Upgrades (spend on a stat, Reset) |
| `js/fork/lab/shiny.js` | `G.LabShiny`: shiny move colours and bonuses (phase 7) |
| `js/fork/lab/underdog.js` | `G.LabUnderdog`: the underdog XP shown on the XP bar, the ladder before a Lab run and the tag on the Play button (phase 6) |
| `js/fork/lab/evo-hud.js` | `G.LabEvoHud`: the progress to the next evolution, on screen right under the HP bar, before the stat boosts (buffs and altar power move down for it through `G.HUD.belowHp` in `js/ui/hud.js`) (phase 6) |
| `js/fork/lab/badges.js` | `G.LabBadges`: the move badges (good/bad arrows on level-up cards, the move tooltip and the enemy type arrows) |
| `js/fork/lab/badge-art.js` | `G.LabBadgeArt`: the 4 arrows' code drawings (`G.Icons.UI`), apart so the Asset Admin's gallery can draw them without the game; the artist's PNGs replace them (`js/fork/asset-overrides.js`) |
| `js/fork/lab/variant-bonus.js` | `G.VariantBonus`: what the shiny or radiant gives, under the stats in the collection's detail (phase 7) |
| `js/fork/lab/boss-slots.js` | `G.LabBossSlots`: bosses at 18, 21, 24, 27 minutes and every 3 minutes from 33:00 in endless (plan C1.1) |
| `js/fork/lab/xp-pace.js` | `G.LabXpPace`: regular enemies' XP × (1 + max(0, t − 500)/600) (plan C1.2) |
| `js/fork/lab/branches.js` | `G.LabBranches`: branching upgrades at move level 3 (phase 11) |
| `js/fork/lab/late-hand.js` | `G.LabLateHand`: Carrera/Reflejos past their cap for max HP, EV cards and auto-pick in endless (plan C1.4) |
| `js/fork/lab/contracts.js` | `G.LabContracts`: per-Pokémon contracts paid in coins for that Pokémon's upgrades (plan C1.5) |
| `js/fork/lab/affixes.js` | `G.LabAffixes`: elite affixes, Shielded, Swift, Vampiric, Splitting, Explosive (plan C1.3) |
| `js/fork/lab/boss-power.js` | `G.LabPower`: the team's damage meter, late bosses' HP floors, the per-hit cap and their clock past 30:00 |
| `js/fork/lab/endgame.js` | `G.LabEndgame`: the horde's late-game curve (HP, damage, speed, elites and affixes from 20:00, exponential past 30:00) and the THREAT label (plan C2.6, part) |
| `js/fork/lab/hits.js` | `G.LabHits`: after each of your hits in a Lab run (phase 11's sets, synergies, recipes) |
| `js/fork/lab/sets.js` | `G.LabSets`: set bonuses from what your slots hold (phase 11) |
| `js/fork/lab/synergy.js` | `G.LabSynergy`: synergy cards (phase 11) |
| `js/fork/lab/recipes.js` | `G.LabRecipes`: bond recipes (phase 11) |
| `js/fork/lab/support.js` | `G.LabSupport`: co-op support moves and their co-op card (phase 12) |
| `js/fork/lab/lab-data.js` | generated by `fork/fetch-lab.cjs`, don't edit |
| `js/fork/lab/lab-anims.js` | generated by `fork/fetch-lab-anims.py`, don't edit |
| `fork/fetch-lab.cjs` | downloads PokeAPI's CSVs and SpriteCollab's tracker into `tools/cache/lab/` (gitignored), writes `lab-data.js` |
| `fork/fetch-lab-anims.py` | downloads the signature moves' extra animations into `assets/pokemon/{dex}/lab/`, writes `lab-anims.js` and `CREDITS-LAB.md` |
| `fork/balance-lab.cjs` | the balance check (phase 8); writes `fork/BALANCE-LAB.md` |
| `fork/survival-lab.cjs` | how long a build lasts in a real Lab run, played by a bot (phase 9) |
| `css/brand.css` | the teal "LAB" tag, the pause/summary blocks, the gold ring on signature moves |

Upstream touches: the `tab === 'lab'` branch (`G.Lab.settingsRow`) in `js/ui/settings-ui.js`, the script tags in
`dev.html`, the family registry in `js/systems/combat.js` (`EXTRA`: one line each in `run`,
`needsTarget` and `reach`, an `over` line at the top of `run` for Lab's dash (`js/fork/lab/mobility.js`), plus `run`/`hit`/`reach`/`spotFor`/`segDist2`/`inArc` exported) and
`KIND_GLYPH` exported from `js/ui/icons.js`, and one line in `js/ui/hud.js` `drawTip` (`G.LabBadges.tipLine`). Everything else wraps functions the game already calls
as `G.X.y`.

## Phase 0: how Lab works

- **Setting:** `G.Settings.get('lab')`, saved per device like the other settings.
- **Per run:** `G.Game.startRun` is wrapped (installed on `DOMContentLoaded`, because `game.js`
  loads after the fork files). Solo runs follow the setting. In co-op the host's `start` message
  gets `lab` and `labV` (the Lab content version), added by a wrapper on `G.Net.broadcast`;
  guests take the host's choice. A guest whose `labV` differs gets a toast to reload.
- **`G.Lab.active`** is true only while a Lab run has a player. Menus outside a run never see Lab
  pools, so Lab moves can't reach the starting-move picker, the ban list or the save.
- **Lab leaderboard** (2026-10-23): the run is no longer tainted. `lab.js` wraps
  `G.Ranking.submitSolo` / `submitGroup` to add `lab: true` (from `begin()`'s flag), and
  `js/net/ranking.js` then writes the Lab copy of each board: the period id with an `L` in front
  (`s_Ld20261023r`, `g_Lall3`, `s_Lall3_p25`; modes `'ls'` / `'lg'`). `firestore.rules` needed no
  change: it only reads the `s_` / `g_` prefix. game.js's anti-cheat `clean()` applies as usual, and
  a resumed run (`debugTime`) or one the admin dropped into is still tainted and goes nowhere. The
  leaderboard screen has a **LAB** switch after Solo / Group (starts as the Lab setting). The
  moderation screen names a Lab board "Lab · Solo · ..." and deletes from the Lab boards. Check:
  `node fork/test-lab-ranking.cjs` (Firebase emulator: the real SDK and rules).
- **Protections:** a Lab run never reaches the regular leaderboards (above).
  `G.Progress.event/kill/checkAch` do nothing during it, and `save.stats` is put back at the end
  (on the `runEnd` event, right after `endRun` writes it). The summary shows no time record and a
  "Lab run" note. Coins, tickets and shinies are kept.
- **Co-op lobby:** the host sends `{ k:'lab', on, v }` to each guest when they connect and when
  the setting changes (peer-to-peer only, no database writes). The lobby shows a "LAB" line.
- **HUD:** a "LAB · ability" tag at the top during a Lab run; the ability is announced at the start.
- **Lab-only moves** (`lab-moves.js`) are registered in `G.Moves.BY_ID` in every game, so a
  teammate's Lab move is drawn on your screen (`Combat.ghostCast`), but not in `G.Moves.ALL` or
  `G.Moves.POOL`. `look` sets their graphics (wraps `G.VFX.forMove`); upgrades come from an
  existing move of the same kind.

## Phase 1: data

`node fork/fetch-lab.cjs` (add `--fresh` to download again, `--stats` for pool-size numbers).
It loads `moves.js`, `pokedex.js` and `lab-moves.js` the way the game does and writes:
- each species' learnable moves, limited to moves the game has, grouped by how it learns them
  (level-up | egg | tutor | TM). Game moves that stand for a differently named real move are in
  `REAL` (our `giga-drain` is Grass Knot, `leaf-storm` is Petal Blizzard)
- each move's power in the games (`POWER`, for Technician)
- each species' abilities, in slot order, hidden ones marked
- the PMD animations each species has on SpriteCollab (67 kinds), for Phase 5

**Rerun it after upstream adds moves**, otherwise new moves are missing from the learnsets (they
can still appear through top-ups).

## Phase 2: per-species pools

In a Lab run, `G.Moves.poolFor(mon)` returns (`labPool` in `lab.js`):
- the Normal moves the species can learn in the games
- its own-type moves it can learn, topped up to at least 4 from its type pool
- up to 2 coverage moves of other types it can learn (different types): level-up moves first,
  then egg/tutor, then TM; moves on its stronger side (physical/special) first
- if still under 6, more of its types, then Normal moves

The pool is fixed per species: the same Pokémon always gets the same list. For example,
Charmander gets Metal Claw and Dragon Rage as coverage (both level-up moves in the games), and
Caterpie's three real moves are topped up with Bug moves.

Since 2026-10-22 the list is scored on the species itself (`G.DEX_BY`), never on the run's copy with its
nature applied: the nature moved which side fits, and whichever copy was asked for first fixed the list
for the session (550 of 966 species differed between an Adamant and a Modest first call). And the wrapper
passes upstream's `natural` flag on, so `G.Mons.natural` (Kecleon's "already knows it") leaves taught TMs out.
`node fork/test-lab-pools.cjs` (server).

**Taught TMs (2026-10-22, plan D4).** TMs taught at Kecleon's (`G.Mons.taught`, `save.ptm`) join the Lab list
as they join the normal one (`labList` in `lab.js`, also `G.Lab.poolFor`): level-up cards, the pause menu
(marked TM), the Lab start picks. After a Lab evolution, the TMs taught to the species the run started as
still count. `node fork/test-lab-pools.cjs` part 3.

## Phase 3: abilities

Until 2026-10-22 (see "One ability per run" below), each species got the first of its abilities (slot order, hidden last) that is implemented. If
none is, it shows its first ability as "No effect in this game yet". 70 abilities are implemented
(`abilities.js`), and 702 of 966 species (73%) get one that does something. Groups:
- pinch boosts (Blaze, Torrent, Overgrow, Swarm), weather speed/healing/dodging (Swift Swim,
  Chlorophyll, Sand Rush, Slush Rush, Rain Dish, Ice Body, Sand Veil, Snow Cloak, Solar Power,
  Sand Force, Dry Skin)
- damage taken (Intimidate, Levitate, Thick Fat, Heatproof, Filter, Solid Rock, Prism Armor,
  Multiscale, Shadow Shield, Magic Guard, Wonder Guard, Sturdy) and type absorbs (Water/Volt
  Absorb, Flash Fire, Lightning Rod, Storm Drain, Motor Drive, Sap Sipper)
- reactions to hits (Rattled, Justified, Weak Armor) and contact (Static, Poison Point, Flame
  Body, Cute Charm, Effect Spore, Rough Skin, Iron Barbs, Pressure)
- move boosts (Technician, Iron Fist, Strong Jaw, Mega Launcher, Sharpness, Tough Claws, Huge/Pure
  Power, Adaptability, Sheer Force, Skill Link, Prankster, Simple)
- over time (Speed Boost, Moxie, Beast Boost, Shed Skin, Limber), on switching moves (Regenerator,
  Natural Cure) and for the run (Unburden, Pickup, Super Luck)

Toned down from the games: Huge/Pure Power ×1.6 instead of ×2; Wonder Guard halves max HP
(Shedinja has 1 HP in the games). Everything that affects enemies uses `applyStun`,
`applyPoison` and `hurt`, which a co-op guest already forwards to the host.

Added with phase 4: Rock Head (recoil moves cost no HP) and Reckless (recoil moves ×1.2), so 70.

**One ability per run (2026-10-22, plan D2, resolver A).** A Lab run uses the ability upstream picked
(`G.Mons.abilityOf`: rolled per save, Ability Capsules, 1 in 20 hidden). `abilities.js` wraps
`G.Player.prototype.setAbility`: if Lab implements that id, Lab's version runs and upstream's doesn't
(`pl.abil = null`); otherwise upstream's runs and Lab adds nothing. Before, `lab.js` attached Lab's on top
of upstream's: Blaze ×1.5 × ×1.35 = ×2.0, Thick Fat ×0.5 × ×0.6 = ×0.3, two Sturdies. The cost (accepted, G4):
Lab no longer skips to a species' first implemented slot, so 197 species run upstream's ability instead.
The LAB tag and pause block name upstream's ability when Lab has none; with the Lab setting on, the
collection card adds "In Lab: ..." under an ability Lab has its own version of.
`node fork/test-lab-abilities.cjs` (server).

## Mega Evolution (Lab first, in every run since 2026-10-21)

Promoted (from doofcraft's list, "the Lab way"): the Mega Stone drops in normal runs too, by the same rule,
and the "can Mega Evolve" marks show with Lab off (`js/fork/mega.js`; `fork/test-gameplay.cjs` checks it in a
normal run).


`js/fork/mega.js`. A won rift can offer your Pokémon's Mega Stone only in a Lab run (from minute 5,
1 in 30), and holding one only Mega Evolves in a Lab run (`G.Lab.active`). The "can Mega Evolve"
chip, cell badge and detail line only show with the Lab setting on. The admin menu can still drop
a stone anywhere ("Item: Mega Stone (Lab runs only)"); in a normal run it does nothing.

## Phase 4: new move kinds

`js/fork/lab/kinds.js` registers each kind in `G.Combat.EXTRA` (run, reach, needs a target) and
gives it an upgrade ladder and an evolution (`LADDERS`, `EVO`; `G.Moves.evoInfo/evolve` are
wrapped for them). The moves are in `lab-moves.js`, with their PokeAPI ids, so learnsets pick them up.

| Kind | Moves | What it does |
|---|---|---|
| leap | Fly, Dig, Bounce, Dive, Phantom Force | you're gone for `dur` s (can't be hit), then the blast lands on the target; a leap that comes down by the target (on it, or Dig/Dive's 70 px short) keeps you untouchable 0.6 s more, within 60% of its recharge in all; where you come down is the move's `land`: Fly and Bounce don't move you (you keep walking in the air; holding you at the take-off point froze you a third of the run), Dig and Dive 70 px in front of the target, Phantom Force 60 px behind where you were; with `chain` (Shadow Force) it vanishes again and lands on the nearest enemy not hit yet, up to `chain` strikes (`chainLeap`) |
| recoil | Double-Edge, Take Down, Flare Blitz, Brave Bird, Wild Charge, Wood Hammer, Head Smash, Submission | a hard charge along the way you walk that leaves you where you were (policy (a), see "Close range and mobility"); it costs `recoil` × the damage done, at most 3% of your max HP in any second, never KO; a cast that knocks an enemy out gives half its recoil back |
| ramp | Rollout, Ice Ball, Fury Cutter, Fury Swipes | each hit in a row is stronger (`step`, up to `stacks`); without hits the stacks fade one per 1.5 s; a roll doesn't move you and swings at the target |
| guard | Protect, Detect, Counter, Mirror Coat, Metal Burst | Protect: nothing hurts you for `dur` s. Counter, Mirror Coat, Metal Burst (the Aegis): hits of its category (Metal Burst: all) are blocked and stored, others halved; then a blast with `mult` × what it blocked |
| sleep | Hypnosis, Sing, Sleep Powder, Spore, Yawn | a marked zone; enemies there sleep `stun` s; a hit wakes them (a burn or poison tick doesn't) |
| (confusion) | Confuse Ray, Supersonic, Teeter Dance, Sweet Kiss | old kinds with `conf`: the enemy staggers, doesn't attack you and hits its neighbours |
| weather | Rain Dance, Sunny Day, Sandstorm, Snowscape | a zone of that weather around you (`wxzone`, it follows you) for `dur` (4) s every `cd` (14) s: rain / sun ×1.3 to Water / Fire moves used inside, sand chips the enemies inside (`dmg` every 0.5 s), snow slows them. Never the arena's weather (until 2026-10-21 it started `G.Weather` for everyone, 16 s of every 22: nearly always on, too strong) |
| terrain | Electric, Grassy, Psychic, Misty Terrain | a circle for `dur` s: Electric/Psychic moves ×1.3, healing, or 25% less damage, for anyone inside |
| wave | Surf, Muddy Water, Sludge Wave | a wide wave that rolls forward, hitting and carrying enemies |
| metronome | Metronome | a random move from the whole game each cast (co-op sees the same one) |
| transform | Transform | becomes the nearest enemy for `dur` s (look and types) and uses its move |

guard, weather and terrain cast on their own from any slot (`PASSIVE`): a slot that only shields
or sets the weather would otherwise mean no attacks while it's the active one. A guard goes up
only when an enemy or an enemy shot is close, in the active slot too (its own timer, `_gt`; the
game's own targeting never casts it, since its target can be a rock or a chest).

Co-op: sleep and confusion change what the host owns. A guest sends `{ k:'labst', id,
s:'z'|'c', v }` to the host; the host applies them and sends `{ k:'labes',
z, c }` (who's asleep or confused) every 0.3 s while there are any. The wave, like the vortex,
carries enemies on the host, also with a guest's ghost.

## Phase 5: signature moves

70 moves in `lab-moves.js` with `sig`: `{ line: dex }` (the whole evolution line), `{ final: [...] }`
(only the last stage of those lines: the starter finishers Frenzy Plant, Blast Burn and Hydro
Cannon, earned by evolving during the run, phase 6) or `{ dex: [...] }` (legendaries, Eevee...).
Giratina's Shadow Force isn't a stronger Phantom Force: it chains through up to three enemies in
turn, untouchable throughout (`chain: 3`, 2026-10-20). They're always in that line's Lab pool and come up as a gold "Signature" card; when one could be
learned and isn't in the hand, it takes the last new-move card's place in 1 of 3 hands. At their
top level they evolve with no condition ("Blast Burn ★"): without it they fell well behind evolved
normal moves (`fork/balance-lab.cjs`).

Animations: each signature lists the PMD animations it wants (`anim: ['Kick', 'Attack']`).
`fork/fetch-lab-anims.py` reads each species' AnimData.xml (the tracker misses many, e.g. Gengar)
and downloads the first one it has that isn't one of the 7 standard sheets: 35 sheets for 35
species (712 KB, `assets/pokemon/{dex}/lab/`, artists in `CREDITS-LAB.md`). `G.LabAnims` adds them
to `G.SPRITE_META` as `lab/{Anim}`, preloads them at the start of a Lab run and `Player.cast` plays
them. A shiny without that sheet (most) uses the next choice.

## Phase 6: lower tiers

`js/fork/lab/growth.js`:
- **Evolving during the run.** At its run level (the games' level × 0.45, 5–26; no level, e.g. a
  stone: 10, or 18 for a second stage) a gold "Evolve into X" card comes first in the hand (two at
  most, Eevee picks among two), with an **Everstone** card: stay as you are for the run with 15%
  less damage taken and 15% more HP. Evolving brings the new species' stats, sprite, Lab pool and
  ability. In co-op, `{ k:'labevo', u, dex }` through the host: everyone sees it.
  Since 2026-10-22 (plan D3) the new form keeps the run's **nature** (built like `G.Mons.monFor`, with
  the pre-evolution's nature) and its **ability slot** (`pl._labSlot`: 0, 1 or hidden 2), re-resolved
  like at the start (`G.LabAbilities.evolve`): the old ability is taken off first (Lab's `unlearn` on the
  moves, and whatever either engine's start changed: crits, regen, coins, magnet, cooldowns, max HP).
  Before, the nature vanished and Lab attached its first implemented ability on top of upstream's.
  `node fork/test-lab-abilities.cjs` part 8.
- **Items** (`ITEMS`, not in chests outside Lab): Eviolite (while it can evolve: -25% damage taken,
  +20% HP), Light Ball (Pikachu ×1.6), Thick Club (Cubone/Marowak, physical ×1.6), Leek and Lucky
  Punch (+25% crit), Metal Powder / Quick Powder (Ditto), Deep Sea Tooth / Scale (Clamperl), Soul
  Dew, Adamant / Lustrous / Griseous Orb. In a Lab run, 1 in 3 chest or boss items is one of yours.
- **Underdog XP:** up to +60% XP for low base stats ((480 - BST) / 480 × 1.1): Caterpie +60%,
  Charmander +39%, Charizard none. Players see it (`underdog.js`): the bonus's share of the XP bar
  (k / (1 + k) of the fill, since it multiplies all XP) is gold, with "Underdog Bonus +N%" under it
  (beside the LAB tag, not on it). Pressing Play or Random Pokémon with Lab on (solo) first shows a
  ladder by rarity (each rarity's range from `G.DEX`: Common +37–60%, Uncommon +16–37%, Rare up to
  +16%, Epic and Legendary none, even the few weak ones like Cosmog: `underdogK` gives 0 from rarity 4 up), the player's rarity highlighted with
  its exact bonus, and Start run. It shows once per Pokémon: after a run starts from it, it doesn't
  come back until you play a different one (`G.Settings` 'underdogSeen'; Back doesn't count). "Show
  this when I play a different Pokémon" turns it off (`G.Settings` 'underdogLadder'). The Play
  button always says "LAB · Underdog +N% XP" for your partner (with Lab on and a bonus). Co-op and
  direct `G.Game.startRun` calls skip the ladder.
- **Candies:** with the Lab setting on, every duplicate from the gacha gives a candy for that
  species (`save.lab.candy`, kept with the rest of the save; when two devices' saves are merged, the
  newer one's candies win). Since 2026-10-21 they are spent in Upgrades (Lab on), in a panel under
  the list (`js/fork/lab/candy-ui.js`): pick the stat, up to 10 points per evolution line
  (`save.lab.cpts[line]`); point n of a stat costs n candies, and Reset gives them all back. In a Lab
  run, per point: HP +3%, Attack +3% to physical moves, Sp. Atk +3% to special ones, Defense +2%
  damage cut, Speed +2% (until then each candy was +3% HP and damage, chosen for you).
  `node fork/test-candy.cjs` (server) checks the panel, the costs, the 10 points, Reset and the bonuses.

## Phase 7: shinies

`js/fork/lab/shiny.js`. A shiny in a Lab run gets its own move colours: the pixels that change
between the normal and the shiny Idle sheet give a hue, and a 5-tone palette from it goes into
`G.VFX.PAL` (`shiny{dex}`) and onto its moves (`m.look.pal`; a teammate's ghosts too). Plus one more
card reroll (`BONUS`); a radiant two (`RBONUS`), not the shiny's. (Until 2026-10-22 also +10% / +20% XP
and coins; since then shinies and radiants roll stat boosts in every run instead, `js/fork/variant-stats.js`:
N of 6 stats +10% / +20%, N by rarity.) The collection's detail shows both under the stats
(`variant-bonus.js`): the stat roll as six pips, N in the shiny's (cyan) or radiant's (orange) colour, and
rerolls as pips (the Pokémon's bought ones grey); dimmed when you view the normal form, and on the shiny
it says when its radiant, also yours, gives more.

The hue is the one a person would call the standout colour (`paletteFrom`, 2026-10-20), like the
wool colour of Pokeblocks' pokédolls (`ColorFactory.sampleDominantWools`): each changed pixel votes
with 0.05 + chroma² (chroma = max - min of RGB, so bright and vivid at once), true greys (chroma
under 0.06) vote apart and only win when there's hardly any colour (then the palette is grey), and
the winner is the best 30° window of hues, wrapping round (reds at 355° and 5° count together),
with its circular mean. Before, every pixel voted 0.25 + saturation into 15° bins, so a big dark
body beat a small vivid accent. Of the 958 shinies, 90 changed hue by more than 30°: shiny Charizard
now throws orange-red flames (its red wings) instead of near-black ones, the Metagross line gold
instead of grey, Rayquaza and Slugma grey. A radiant (`js/fork/radiant.js`) gets its palette the
same way from `r/Idle.png` (`radiant{dex}`), without the shiny's extras, and doesn't count as shiny
while it's used.

## Phase 8: balance and promotion

- `node fork/balance-lab.cjs` measures every move's damage per second in the real combat code (Mew's
  stats with no type, typeless dummies that don't move, 12 around you and 1 close) and writes
  `fork/BALANCE-LAB.md`. Each move is compared with the normal game's moves of its kind (new kinds
  with the nearest one: recoil as dash, ramp as melee, leap as meteor, sleep as stun, wave as beam)
  and flagged over ×1.6 or under ×0.6. After the first report, the 23 strongest signatures were
  scaled down to about ×1.45 of their kind. Sleep and confusion moves stay low on damage on purpose.
  (Fixed 2026-10-21: the script didn't stop the Judgment, and at the default 6 s a move it passes 30
  game minutes during the signature moves: Arceus's arena took the player away and ~50 signatures
  measured near 0. The report of 2026-10-20 used 4 s and finished before. Moves with `cut` are flagged
  "HP cut": against billion-HP dummies their numbers mean nothing. Shell Trap shows 0 because the
  player there can't be hit.)
- **Promotion**: `promote: true` on a Lab move puts it in the normal game (its type's pool, the
  start-move picker and the bans; a signature only in its line's pool). New kinds work in normal
  runs as is (`kinds.js` is always loaded). Nothing is promoted yet. Abilities, in-run evolution,
  items and shiny colours have no switch: they'd need a decision about the normal game first.

## Phase 9: close range and sustain

Asked for 2026-10-21: moves that work in more different ways (not more balls, beams and swipes),
close-range builds that hold up, and longer runs. `fork/survival-lab.cjs` measured the problem
first: in a real Lab run with a fixed build (results below), close-range builds died well before the
best ranged one, and the Lab's ramp kind (Fury Cutter) worst of all, because only the old `melee`
kind got the game's 25% less damage taken while active (`player.js`).

50 official moves in `lab-moves.js` (section "fase 9"), learned through their real learnsets (rerun
`fork/fetch-lab.cjs` after adding more). New kinds in `js/fork/lab/kinds2.js`:

| Kind | Moves | What it does |
|---|---|---|
| grab | Seismic Toss, Circle Throw, Dragon Tail | grab the nearest enemy and throw it (`knock`): it hits every enemy it flies into (`splash` × the damage) and lands stunned. Seismic Toss adds `perLvl` × your level. Bosses aren't thrown |
| bind | Wrap, Bind, Infestation, Snap Trap, Thunder Cage | hold `count` enemies (2, +1 per count upgrade) for `dur` s (stunned: no moving, no contact damage) and hit them every 0.5 s |
| focus | Focus Punch, Shell Trap | charge `charge` s. Focus Punch: you brace (30% less damage taken), then a huge punch across your front, 35% weaker for each hit you took while charging (30% at least). Losing it all on any hit made it useless in a swarm (51 s in `survival-lab.cjs`). Shell Trap (`mode: 'trap'`): a blast around you the moment you're hit |
| heal | Recover, Soft-Boiled, Roost, Morning Sun, Shore Up, Rest, Wish, Strength Sap, Heal Order | from any slot, when HP drops below `below` (50%): heal `amount` × max HP. `wx` ×1.5 in that weather (Morning Sun ×0.5 in others); Rest heals fully but you sleep `rest` s; Wish arrives after `delay`; Strength Sap also weakens the strongest enemy near |
| screen | Reflect, Light Screen, Aurora Veil | from any slot when enemies are near: `amount` less damage of that category (`screen`; Aurora Veil both, longer in snow) for `dur` s, for you and teammates within `radius` |
| shout | Growl, Baby-Doll Eyes, Feather Dance, Noble Roar, Leer, Screech, Fake Tears, Metal Sound, Scary Face | from any slot with 2+ enemies near: marks them `dur` s. `meek`: they deal less (their `dmg` is scaled while marked); `weak`: they take more (of `weakCat`); `slow` |
| endure | Endure | a hit that would knock you out leaves you at 1 HP, untouchable `dur` s; recharges `cd` s |

Hit effects for any kind (applied in `Enemy.hurt` right after Combat's `G.RunStats.tag`, so they
count in the move's damage and the summary):

| Field | Moves | Effect |
|---|---|---|
| `leech` | Drain Punch, Horn Leech, Mega Drain, Bitter Blade (Ceruledge) | heal that share of the damage, at most 5% of max HP a second (`LEECH_CAP`) |
| `seed` | Leech Seed | the enemy loses HP every 0.5 s for `seed` s and you heal half |
| `revenge` | Revenge, Payback | × that if you were hit in the last 1.5 s |
| `reversal` | Reversal, Flail | × (1 + reversal × missing HP share) |
| `cut` | Super Fang, Nature's Madness, Ruination (Treasures of Ruin) | at least that share of the HP it has left (bosses 8% of it) |
| `power` | Stored Power, Power Trip | × (1 + power × your stacked boosts) |
| `flinch` | Fake Out | the first hit on each enemy stuns it that long |

Buffs with `also` raise several stats at once (Bulk Up, Calm Mind, Coil, Shift Gear, Work Up);
`drum` (Fillet Away) costs that share of HP to fill every stack at once. Bulk Up was Dragon Dance's
evolved name: Dragon Dance now evolves into Clangorous Soul (`js/fork/evo-names.js`), in every game.

With a grab, bind, focus, ramp or recoil move active you take 25% less, like melee (`kinds2.js` `CLOSE`); in Lab runs with a spin or dash too (since 2026-10-22, see "Close range and mobility").
Iron Fist now also matches "Punch", Strong Jaw "Fang", and Tough Claws counts grab and bind as contact.
Metronome and Transform never call the support kinds or focus.

Survival (`fork/survival-lab.cjs`, 2026-10-21, median seconds of 6 runs, after tuning; the spread
between runs is ±20-30 s, so small gaps mean nothing):

| Build | Before phase 9 | After |
|---|---|---|
| far: Aura Sphere | 196 | 200 |
| far: Aura Sphere, Recover | | 229 |
| far: Aura Sphere, Light Screen, Recover, Endure | | 238 |
| close: Karate Chop | 138 | 144 |
| close: Fury Cutter (ramp; now with the close-range 25%) | 78 | 111 (3 runs) |
| close: Drain Punch | | 157 |
| close: Karate Chop, Recover / Endure / Reflect / Growl | | 172 / 167 / 150 / 142 |
| close: Drain Punch, Growl, Reflect, Endure | | 205 |
| close: Focus Punch (before / after the brace change) | | 51 / 111 |
| close: Circle Throw / Bind alone | | 116 / 101 |

So a close-range kit now lasts as long as the best ranged move alone, though ranged still gains
just as much from the same support moves. Grab and bind alone stay short: they handle one or two
enemies while the rest of the crowd keeps hitting, so they're for pairing with a main attack.

Co-op: hits, stuns and slows go through `hit`, `applyStun` and `applySlow`, which a guest forwards.
Screens and shouts reach teammates as ghost casts: a teammate's Reflect protects you when you're
near them, and a teammate's Growl marks your copies of the enemies too. Healing is your own. Not
checked with two players yet.

## Phase 10: move identity (2026-10-22)

Plan `fork/PLAN-2026-10-22.md` B1 and B3: two moves of the same kind should feel different, and an
evolved name should do what it says. `js/fork/lab/mech.js` (`G.LabMech`), Lab only.

**Identity of the normal game's moves.** In a Lab run `G.Moves.instance` gives a move listed in
`G.LabMech.ID` its Lab identity (`labify`): extra fields (`add`), its own upgrade steps where its
kind's don't fit (`upsAt`, the kind's ladder stays the default) and its own evolution (`evo`:
`{ t, m: ×, add: +, set: = }`, applied by the `G.Moves.evoInfo/evolve` wrappers before the kinds'
own). A Lab move can bring `labEvo` the same way. The instance gets its own copy of its `def`, so the
normal game's data never changes. What it does is said in English under the type in the move's box
(`note` / `evoNote` through `G.MoveText.tipNotes`, teal), on its new-move card and on the evolution card.

**Honest evolutions (B1).** Seven evolved names promised something their kind's evolution doesn't
do; in Lab they do it: Future Sight (Psybeam) marks, Stealth Rock (Rock Slide) leaves stones,
Venoshock (Acid Spray) uses poison up, Belly Drum (Swords Dance) pays half your HP for every stack
(rows below), and:
- **Avalanche** (Hail): ×1.6 damage, +2 hailstones, and ×2 if an enemy hit you in the last 1.5 s
  (kinds2.js's `revenge`; "Avalanche ×2" shows when it applies).
- **Endeavor** (Flail, a Lab move; `labEvo` in lab-moves.js): ×1.6 damage, 360°, and each hit brings
  the enemy down to at least your share of HP left (B3.12 style; a boss loses at most 8% of what it
  has; kinds2.js's reversal still multiplies the hit, and the extra is sized for it).
- **Tailwind** (Whirlwind): ×1.8 damage, a wider gust, and +30% speed for 4 s on each cast (wind
  streaks behind you), for teammates within 160 px too (they get it from your ghost cast).

**A field each for the moves that had none (B1).** The plan counted 26 of the normal game's moves
with no field beyond their kind's numbers (27 attacking ones by our count, without the boosters);
in Lab each now has one, said in its box. Thunderbolt is left to its B2 branches
(`js/fork/lab/branches.js`) and U-turn to stream A's pivots. The spins and shoves, interchangeable
before, come first:

| Move | Lab field |
|---|---|
| Rapid Spin | +20% speed for 1.5 s a spin (`haste`; its own level-5 step: the burst lasts 3 s) |
| Rolling Kick | the first kick on each enemy stuns it 0.5 s (`flinch`) |
| Outrage | ×1.5 if you were hit in the last 1.5 s (`revenge`) |
| Gyro Ball | slows 0.35 |
| Night Slash | what it cuts takes +20% from physical moves for 4 s (`weakHit`) |
| Extrasensory | the first wave on each enemy stuns it 0.6 s (`flinch`) |
| Whirlwind | blows away the enemy shots around you (`gust`) |
| Vacuum Wave | up to ×1.6 point-blank (`close: 0.6`; ×2 measured ×1.67 of its kind in balance-lab) |
| Disarming Voice | the enemies it hits deal 25% less for 4 s (`meekHit`) |
| Hydro Pump, Hyper Beam, Dazzling Gleam | knock enemies back (`labKnock` 180 / 220 / 70: their kinds pass none) |
| Razor Leaf | +25% crit chance (`crit`) |
| Leaf Storm (Petal Blizzard), Whirlpool | slow 0.25 / 0.35 |
| Giga Drain (Grass Knot), Flash Cannon, Sand Tomb | the enemies they hit deal 15 / 20 / 20% less for 4 s (`meekHit`) |
| Discharge | 8% chance per shock to stun 0.5 s (`para`) |
| Bug Buzz | +15% from special moves for 4 s (`weakHit`) |
| Dragon Rage | burns |
| Fairy Wind | knock 80 |
| Night Shade | + half your level per hit (`levelDmg`) |
| Psybeam, Psycho Cut | confuse 1 / 0.8 s (`conf`) |
| Solar Beam | heals 15% of its damage (`leech`) |
| Ancient Power, Ominous Wind | 10% a hit to raise Attack and Sp. Atk for 5 s (`omni`) |
| Magnitude | a random magnitude each quake, ×0.5 to ×1.8 ("Magnitude 9!") |
| Spikes, Substitute | B3.2 and B3.5 below |

| Mechanic | Moves | What it does |
|---|---|---|
| mark (B3.1) | Psychic (×0.35), Future Sight (Psybeam's evolution, ×1), Doom Desire (×0.8) | a hit stamps the enemy with `mark` × its damage (up to 4 hits' worth, 6 s; a pink eye over it). The next hit on it from **another** move sets the stored damage off on every enemy within 70 px. Its own hits never set it off; marks are per player |
| persistent hazards (B3.2) | Spikes, Toxic Spikes (`persist: 60`), String Shot and its evolution Sticky Web (`web`), Stealth Rock (Rock Slide's evolution, `rocks: 75`) | the mines don't burst: each stays `persist` s and hurts what steps on it (an enemy within 14 px, the step of `combat.js`'s mines) and what's around it, again each second it stays; Toxic Spikes poison; webs slow everything in them (Sticky Web 0.75) and hurt what walks in; each of Stealth Rock's rocks stays 75 s as a pointed stone. At most 10 spikes, 6 webs, 14 stones per move; a teammate's are drawn only |
| status converters (B3.3) | Venoshock (Acid Spray's evolution, `venoshock: 0.5`), Smelling Salts and Wake-Up Slap (new, `salts: 3`; Makuhita, Hariyama, Poliwrath... learn them) | Venoshock: against a poisoned enemy × (1 + 0.5 per poison stack), the poison used up (its own hit poisons again). Salts: ×3 against a stunned or sleeping enemy, which snaps out of it. On a co-op guest the enemy's state comes from the host: poison counts as 2 stacks and nothing is used up or woken. (Hex's × on any status is upstream's.) |
| trade-off boosters (B3.4) | Belly Drum (Swords Dance's evolution, kinds2.js's `drum: 0.5`), Shell Smash (new, `frail: 0.35`), Curse (new, Ghost, `curse: 0.25`) | Belly Drum casts from any slot; when your Attack boost has run out and you're above half HP it costs half your HP and fills every stack. Shell Smash builds Attack, Sp. Atk and Speed in big steps (+12/+12/+8% a step) and you take 35% more while it lasts (a cracked red ring). Curse builds Attack and Defense; every 10 s it casts above 40% HP it costs a quarter of your HP and curses the nearest boss within 600 px (else the toughest enemy within 300): 0.4% of a boss's max HP (5% of another's) every 0.5 s for 10 s, purple wisps over it. Nothing to curse, no cost |
| decoys (B3.5) | Follow Me (new, Normal), Rage Powder (new, Bug; `powder: 0.4`), Substitute (`decoy`) | Follow Me and Rage Powder are shouts: from any slot, when 2+ enemies close in, they leave a beacon (a light column with "!") where you stand for `dur` (4) s; enemies within `decoyR` (220 / 200) of it chase it instead of you; Rage Powder also slows those in its powder. Substitute's doll is a decoy (180) while it stands. Bosses, legendaries and treasure thieves ignore decoys; a confused enemy stays confused. Co-op: the AI runs on the host, which sees a guest's shout or doll as a ghost cast and makes it a decoy there; every screen draws it |
| taunt / attract (B3.6) | Taunt (new, Dark), Attract (new, Normal) | shouts (from any slot when enemies close in). Taunt (220 px, 5 s): enemies that shoot from afar stop keeping their distance and shooting, and charge you (a red "!!"; bosses ignore it). Attract (110 px, 3 s): they're slowed by half and can't hit you by contact (pink rings, the fairy charm look: hearts mean healing; bosses half as long). Each screen marks its own copies, so a teammate's cry (a ghost cast) protects you too; the shooters' AI runs on the host |
| combos (B3.7) | Fusion Flare (Reshiram, Kyurem; meteor) and Fusion Bolt (Zekrom, Kyurem; chain), signatures with `combo`; Grass, Fire and Water Pledge (new, `pledge`; the starters learn them) | a combo move cast within 2 s of its partner (by you, or a teammate's cast as it arrives) does ×2 damage with a ×1.4 radius ("Fusion ×2!"); in one bond the two always combo. A Pledge cast within 2 s of a different one makes a field (90 px, 6 s) where its line lands: Grass + Fire a sea of fire (burns and hurts every 0.5 s), Grass + Water a swamp (slows by half), Fire + Water a rainbow (heals whoever stands in it 1.5% HP a second). The per-cast × goes through `m._castK`, read in `Player.atkFor` |

For other Lab files (stream B-builds' synergy cards...): `G.LabMech.mark(e, pl, m, amount)`,
`detonate(e)`, `hazard(kind, pl, m, x, y, dmg, life)`, `hazards()`, `convert(e, m)`, `curse(pl, m)`, `decoy(pl, m, x, y, life, r)`, `decoys()`, `decoyFor(e)`, `taunt(e, s)`, `attract(e, s)`, `boostCast(m, k, kr)`, `pledges()`, `endeavor(e, pl, amount, m)`, `haste(pl, k, s)`, `noteOf(m)`, `labify(s)`, `noteOf(m)`, `ID`.

`node fork/test-lab-mech.cjs` (server; `--only mark,...`): each mechanic in a real Lab run on dummies,
and that a normal run's moves don't change.

## Close range and mobility (2026-10-22)

Stream A of `fork/PLAN-2026-10-22.md` (section A): a close-range kit should last as long as the best
ranged one, and a mobility move should never take you somewhere you didn't choose.

Every run (`js/fork/close-target.js`, see `fork/README.md`): melee and spin aim at the nearest enemy in
reach, a boss only when it's in reach (#186, #208); a dash never fires at a rock or chest.

Lab runs:
- **Close-range cut** (A1.1): spin, dash and recoil join the 25% less damage taken (`kinds2.js` `CLOSE`;
  spin and dash only in Lab until `G.LabKinds2.promoteCut`). Since A4 the cut is 35% in Lab runs (every
  close kind, melee too: `LAB_CLOSE`), and the move's box says so.
- **Mover grace** (A1.2, `js/fork/lab/mobility.js`): 0.5 s after a dash or recoil (a leap that comes down by
  the target: 0.5 s after it lands; since A4 not Fly/Bounce/Phantom Force, which land away from the crowd, nor a roll) nothing hurts you, hazards and lava included (they set `invuln` to 0 before they hit). A
  new grace starts at most once per 1.2 s, or a fast dash would make you untouchable.
- **Leap** (A1.3): untouchable 0.6 s after landing (was 0.15 s).
- **Recoil** (A1.4): at most 3% of max HP in any second (8% until A4; was 12% a cast: ~10% HP/s against a
  crowd); a KO gives half that cast's recoil back.
- **Ramp** (A1.5): stacks fade one per 1.5 s of game time instead of resetting on a miss or a pause;
  Rollout/Ice Ball close in 30 px at most (was 80) and not while you walk away (since A2 they don't move
  you at all).
- **The way you walk, and back** (A2, policy (a), the owner's G1; `js/fork/lab/mobility.js`): a dash or recoil
  charge goes the way you're walking, or at your target when you stand still (with Manual aim: the
  aim). It hits everything on that line and you stay where you were (Vampire Survivors' whip): no move
  takes you somewhere you didn't choose. It only fires when an enemy is on that line (its clock waits), with
  no camera kick. The dash is Lab's own (`G.Combat.EXTRA.dash.over`, the one-line hook in `combat.js` `run`);
  a teammate's copy is drawn from the aim its cast message carries, as before. The mover grace still
  applies. `fork/survival-lab.cjs` has a "dash" bot for these: it walks at the nearest enemy, then stands
  still so the move goes at it.

- **Identity** (A3, `js/fork/lab/move-traits.js`, entries in `G.LabMech.ID`): the 11 upstream melee moves
  get one trait each from fields that exist (reach: Vine Whip, Wing Attack; heavy knock and a 0.3 s flinch:
  Tackle, Body Slam, Dragon Claw; leech: Bug Bite, Play Rough; flinch: Lick, Bite; parry: Karate Chop, Metal
  Claw, the first hit in the 0.3 s after a swing is blocked and the nearest enemy stunned) and none swings
  360° any more (4th step +50% damage and +20% reach, evolution ×1.9 damage, more reach, a wider arc).
  Pivots (U-turn, and the new Lab moves Volt Switch, Flip Turn, Parting Shot, in their learnsets) hit and
  switch you to your next slot; Parting Shot also makes the enemies it passes deal 20% less for 4 s.
  Flame Charge stacks +8% speed (4 s, up to 3). Leaps come down per `land` (table above); Shadow Force
  keeps its chain. Counter, Mirror Coat and Metal Burst block instead of halving (the Aegis). The run's
  first moves are made before the run is Lab, so they're swapped for their Lab copies right after it
  starts (any `G.LabMech.ID` move). Quick Attack, Extreme Speed and Aqua Step stay plain dashes.

- **Tuning** (A4): the 35% Lab cut; a leap's untouchable time capped at 60% of its recharge and its 0.6 s
  after landing only by the target (an evolved Fly was never hit: 308-332 s); a roll swings at the target
  (the way you walk it missed whoever you circled: Rollout 45 s); recoil 3%/s; ×kind back in range for
  Bounce (28 -> 33 damage), Phantom Force (32 -> 33), Parting Shot (10 -> 21, its mark 30% -> 20%), and signatures that policy (a)
  made stronger (Extreme Speed 22 -> 19, Spectral Thief 32 -> 27, Sunsteel Strike 44 -> 39).
  `fork/survival-lab.cjs` plays dashes and recoil with the "dash" bot and retries a run whose page failed to
  load.

Survival (`fork/survival-lab.cjs`, median of 6; "before" is 2026-10-22 before stream A, "after" the A4
state on the same day's main, with the other streams' Lab changes in, e.g. elite affixes; the first boss at
3:00 is a wall for single builds, ±20-30 s noise):

| Build | Before | After |
|---|---|---|
| far: Aura Sphere | 184 | 205 |
| close: Karate Chop | 143 | 174 |
| close: Karate Chop, Counter | | 326 |
| close: Bite, Counter | 171 | 234 |
| close: Play Rough | 148 | 174 |
| close: Drain Punch | 173 | 155 |
| close: Revenge | 150 | 163 |
| close: Body Slam | 124 | 151 |
| close: Vine Whip | 133 | 132 |
| close: Rapid Spin (spin) | 119 | 139 |
| close: Fury Cutter (ramp) | 105 | 140 |
| close: Rollout (ramp) | 130 | 122 |
| close: Quick Attack (dash; before with the "close" bot) | 121 | 148 |
| close: U-turn (dash) | 130 | 147 |
| close: Flame Charge (dash) | 137 | 125 |
| close: Double-Edge (recoil) | 30 | 109 |
| close: Fly / Dig / Phantom Force (leap) | 135 / 157 / | 133 / 179 / 171 |
| close: Circle Throw / Bind / Focus Punch | 124 / 104 / 106 | 128 / 117 / 118 |

The plan's targets (Karate Chop ≥ 200, Quick Attack ≥ 180, no close build under 150) are not met, so the
close-range kit and the spin/dash cut are not promoted to normal runs (G12). Experiments on the same state
(`EXTRA_JS`-style overrides, not committed): a 45% cut instead of 35% or +25%/+50% damage for every close
kind left Karate Chop at 187-188 s: single close builds die at the 3:00 boss, which they must stand next
to; Karate Chop beats it only with a support move (Counter 326, Recover 264, Bulk Up 303).

`node fork/test-close-range.cjs` checks all of it in real runs.

## Texts and looks match the code (2026-10-21)

A review of every Lab move against its code (and the normal game's, `fork/test-move-truth.cjs`):
- **Texts** now say what happens: Counter / Mirror Coat halve every hit (only the stored part is
  by category); sleep zones hurt and the sleep ends on its own or on a hit; Bounce and Flare Blitz
  always paralyze / burn ("may" was wrong); recoil never knocks you out; confusion also stops the
  enemy attacking you; homing moves "home in" (they can still hit walls, so not "never miss");
  Rest sleeps 2.2 s; Techno Blast pierces one; Shadow Force's three strikes each hit an area; the
  leech moves' 5 %-a-second cap; the stuns of Photon Geyser, Seismic Toss, Circle Throw, Focus Punch.
- **Code** where the text was the intent: Metal Burst stores every hit (`storeAll`); Scary Face's
  "stronger" upgrades also slow more (shouts scale `slow` by `amount`, up to 0.8); King's Shield and
  Baneful Bunker have no attack category (they deal no damage).
- **Own upgrades and evolution** (`ups` / `evoMod` in `lab-moves.js`, read by `lab.js` and
  `kinds2.js`) where the family's did nothing: the protect guards (no "+damage" on a move that deals
  none), Rest (shorter sleep, earlier), Shell Trap (its "charges faster" shortened the trap).
- **Evolution names** that promised something else: Dream Eater → Psychic Noise, Slack Off (yawn) →
  Snore, Sleep Talk → Slack Off (Rest really heals), Focus Energy → Safeguard, Gear Grind → Confide,
  Final Gambit → Low Kick, Healing Wish → Heal Bell, Perish Song → Round, Wave Crash → Water Pulse,
  Prismatic Laser → Lumina Crash, Steel Beam → Spin Out, Drill Run (Dig, same as Magnitude's) →
  Stomping Tantrum.
- **Looks**: Sweet Kiss is a fairy ring (hearts = healing, like Draining Kiss); confused enemies
  show rings, not hearts; sleep zones and shouts draw their `look` (Spore and Sleep Powder puff
  spores, Dark Void shadows, Feather Dance wind...); Wish shows stars when wished and hearts when it
  heals; Sky Attack's beam is light, not fire.

## Revive card (2026-10-21, from doofcraft)

In a Lab run, from level 5, rarely (1 in 100 hands, the Legendary odds of the upgrade cards; it wears
their gold Legendary look) the last level-up card is **Revive**
(`js/fork/lab/revive-card.js`): a revive kept in its own slot (a heart next to your HP). Solo, it
fires in the hit that knocks you out: back up with 50% HP, 3 s untouchable, enemies within 150
thrown back. In co-op you choose: R (or the on-screen button) while down, or wait for a teammate
as before (then it isn't spent). `node fork/test-revive-card.cjs` (server; co-op part with the emulator).

## Toughness and the speed cap (2026-10-21, from doofcraft)

In a Lab run (`js/fork/lab/toughness.js`), defense from every source is **toughness**: you take
1 / (1 + toughness) of the damage, +100% is half, capped at +200% (a third); before, it was taken off
as is, up to 80%, and stacking it made you nearly untouchable. **Speed** stops at ×2.5 of your own
(upgrades, cards and buffs together; abilities like Swift Swim still on top), and once there the
speed card no longer comes up. The defense card says "toughness". Hooks: the `reduction` and `spd`
getters, `G.LevelUp.offer`. `node fork/test-toughness.cjs` (server).

## Gems (2026-10-21, from doofcraft)

A rare currency from Lab runs (`js/fork/lab/gems.js`, `save.gems`, in the save's currency ledger as
`gm`): 0.7% of enemies drop one, bosses always one, legendaries two. In Upgrades (Lab on): 100 gems
reset a Pokémon's upgrades and give back every coin they cost (`save.ureset[dex]` counts resets), and
prestige costs 100 gems too. When two copies of the save merge, each Pokémon's upgrades come from the
copy with the later "epoch" (prestige, then resets; `G.forkMerge` in `js/fork/prestige.js`).
`node fork/test-gems.cjs` (server).

## Resume after a reload (2026-10-21, from doofcraft)

A solo Lab run is saved in the browser every 5 s and when the tab closes (`js/fork/lab/resume.js`,
`localStorage ms.resume`; not in a rift, before Arceus, or with a choice screen open). Back at the menu,
"Unfinished Lab run" offers **Resume** (time, map seed, position, level, HP, multipliers, cards, moves
with levels and evolutions, slots, item, bonds, coins and the `_lab*` state come back; enemies start
fresh at that hour) or **End run** (since 2026-10-22 the save is just deleted: you stay on the menu and the run never
starts, so no summary and no end-of-run coins; before, it was resumed and quit at once). Tickets were
banked when picked up, so they don't count again. The clock is set with `debugTime` (no leaderboard;
Lab never counts anyway). Co-op can't be resumed: the host runs it. A run that ended can't be
resumed either: the save is deleted the moment you fall (unless the Revive card gets you up; falling
in the rift arena doesn't count) and when the summary shows, quitting included. Before 2026-10-22 it was
only deleted by the 5 s save, so an update that reloaded the page on the summary or the menu brought a
dead run back. `node fork/test-resume.cjs` (server) reloads a real page, including after falling,
fainting and quitting.

## Mega and Primal rift legendaries (2026-10-21, from doofcraft)

In a Lab run, from minute 15 a rift legendary that has a Mega or Primal sprite (Mewtwo, Latias, Latios,
Kyogre, Groudon, Rayquaza...) can come in that form: 5% at 15 min, 15% at 30, 30% at 60 (straight lines
between). It has ×1.3 HP, ×1.2 damage and ×1.2 XP, its sprite and "Mega" / "Primal" in its name
(`js/fork/lab/mega-rift.js`, hooked on `G.EnemyMgr.add`; in co-op the host decides and sends
`{ k:'labmega', id }` for the sprite). `node fork/test-mega-rift.cjs` (server; co-op with the emulator).

## Wild legendaries (2026-10-21, from doofcraft)

In a Lab run, from minute 15 a wild legendary roams the map (not in a rift): one every 75 s while fewer
than 2 are alive, a random rarity-5 Pokémon with a sprite, 650-850 px from a player. It's a boss (HP
bar, boss rewards) with its own HP and damage, which grow with the minute (more HP in co-op), but not a
rift legend (beating it doesn't count as beating that legendary), and not a boss fight
(`G.EnemyMgr.bossAlive` skips it, or rifts, events and surges would stop for the rest of the run).
None in a rift or during Arceus. The host decides; guests get it like any enemy
(`js/fork/lab/wild-legends.js`). `node fork/test-wild-legends.cjs` (server; co-op with the emulator).

## The Eternatus raid (2026-10-21, from doofcraft)

In a Lab run, Arceus's Judgment never comes: at 30:00 everyone goes to a dark arena against **Eternatus**
(`js/fork/lab/eternatus.js`).
- 3 obelisks (still enemies that don't move or hit, drawn as stone pillars with HP bars) each heal it
  1.5% of its HP a second until broken; red tethers show which still do.
- Every 15 s (the first after 10) it stands still and charges the **Eternabeam** for 3 s, then hits the
  whole arena: 75% of your HP, pure, unless a crystal (solid, 6 of them) or one of the arena's stone
  pillars is between you and it. While it charges, the safe shadow behind each crystal shows in green.
- 3 minutes. Beat it: a ×25 rainbow ticket each, back to the map, and the run goes on (Arceus never
  comes, rifts open again, `pl._labEternatus` so a resumed run doesn't fight it twice). Time runs out:
  the run ends (everyone knocked out by "Eternatus (time ran out)"). Falling in the arena is falling.
- Its HP: 3× a rift legendary's, or 45 s of your best single-target damage (measured as the Judgment
  does), whichever is more; each obelisk 8% of that floor or 5 s of your damage.
- While it lasts `G.Judgment.active` is true, so waves, events, weather, biome changes and wild
  legendaries stop, and the Judgment's soft speed cap applies.
- Co-op: the host runs it (`{ k:'labeter', a: start | ids | beam | win | lose | back }`); Eternatus
  and the obelisks are ordinary enemies; each player checks the beam against their own Pokémon.

`node fork/test-eternatus.cjs` (server; co-op with the emulator): no raid at 29:50; at 30:00 the raid
instead of Arceus; healing and broken obelisks; the beam in the open and behind a crystal; winning
(ticket, back, no Arceus, rifts again); losing (the run ends); a normal run still gets Arceus; co-op.

## Bosses after 15:00 (2026-10-22, plan C1.1)

Upstream's boss slots end at 15:00. In a Lab run there are four more, at **18, 21, 24 and 27 minutes**,
and in the endless after Eternatus **one every 3 minutes from 33:00** (`js/fork/lab/boss-slots.js`).
`G.Enemies.rollRun` picks them itself (the extra slots are pushed onto `BOSS_SLOTS` for that call): a
non-legendary in the 600-700 BST band (else 580+), never one already in the run, with rollRun's ×1.35 HP
and ×1.2 damage. Their base numbers continue upstream's table from its 15:00 slot at the table's own
trend (least-squares slope: +3500 HP, +8 damage, +374 XP per 3 minutes), and `bossScale(t)` applies when
they spawn, as for every boss:

| Slot | 15:00 (upstream) | 18:00 | 21:00 | 24:00 | 27:00 | 33:00 | 60:00 |
|---|---|---|---|---|---|---|---|
| HP on spawn | 54 000 | 73 700 | 96 300 | 121 600 | 149 900 | 214 800 | 647 300 |
| Contact damage | 205 | 255 | 313 | 381 | 448 | 602 | 1603 |
| XP | 1800 | 2170 | 2550 | 2920 | 3300 | 4040 | 7410 |

rollRun can pick 10 extra without running out of 580+ Pokémon (16 with a sprite); later endless slots
reuse one of them with that slot's numbers. They join the bosses array on the first spawner update of a
Lab run, so normal runs keep upstream's five. A run that starts late (a resumed run) drops the slots
already more than 10 s past, upstream's included: before, resuming at 21:00 spawned all seven earlier
bosses in the first frames. The spawner only runs on the host; guests get the bosses like any enemy.
`node fork/test-boss-slots.cjs` (server): the slots, picks and numbers; the 18:00 boss spawning with
bossScale; 33:00 and 60:00 in endless; a real resume at 21:05 getting only the 21:00 boss; a normal run.

## XP that keeps pace (2026-10-22, plan C1.2)

An enemy's XP had no time term while its HP grows ×(1 + t/95) and the spawn cap binds from about
minute 8, so XP per second fell off after the last tier (8:20) and levels dried up. In a Lab run every
regular enemy (cast, hordes, summoned, shiny) now carries **XP × (1 + max(0, t − 500)/600)** from the
moment it joins (`js/fork/lab/xp-pace.js`, a `G.EnemyMgr.add` wrapper like `rift-scaling.js`, on the
machine that runs the enemies): ×1 until 8:20, **×1.67 at 15:00, ×2.67 at 25:00**, ×3.17 at 30:00.
Bosses (their table grows already), rift and wild legendaries, Arceus's Judgment and Eternatus's
obelisks keep their own numbers. It multiplies with the player's `xpMul` in `Player.gainXp`, as every
XP source does, so the Underdog bonus keeps its share: Charmander (+39 %) gets ×2.32 at 15:00 and
×3.71 at 25:00 of a normal run's XP per kill; a Caterpie (+60 %) ×2.67 and ×4.27.
`node fork/test-xp-pace.cjs` (server): real spawns at 5, 15 and 25 minutes in Lab and at 25 in a normal
run; a boss and a wild legendary unchanged; a real kill's orb and what picking it up gives with Underdog.

## Elite affixes (2026-10-22, plan C1.3)

Near the spawn cap (55+ enemies alive, from about minute 8) the spawner sends elites: ×1.6 HP, ×1.25
damage, ×1.6 XP, with nothing on screen to say so. In a Lab run **one elite in three** also gets an affix,
its name over it in its colour and a ring of that colour at its feet (`js/fork/lab/affixes.js`):

| Affix | What it does |
|---|---|
| Shielded | a shield of 60 % of its HP that doesn't wear off (the shielder's blue bubble) |
| Swift | ×1.4 speed |
| Vampiric | each touch that lands heals it 10 % of its max HP |
| Splitting | when it falls, two copies at 30 % of its HP, 60 % of its damage and 25 % of its XP (no affix) |
| Explosive | when it falls, a 70 px blast after a 0.8 s warning on the ground, for its contact damage |

Regular enemies only (no bosses, legendaries, obelisks, Meowth/Gholdengo or split copies). Rolled in a
`G.EnemyMgr.add` wrapper with the spawner's own elite rule (`G.Spawner.CAP × 0.85`); effects through
`G.Enemy.prototype` `strike`, `die` and `draw` (the label draws itself: `G.LabBadges.enemyMark` only runs
for enemies with a type-chart arrow). Co-op: the host rolls and sends `{ k:'labaffix', a:'set', id, x }`;
splits and blasts happen only on the host and reach guests as new enemies and a hazard; a guest touched by
a Vampiric one sends `{ a:'drain', id }` and the host heals it.
`node fork/test-affixes.cjs` (server; co-op part with the emulator, `--solo` skips it): about a third of the
elites at the real cap and none below it, none in a normal run; each effect on a real enemy and the label;
in co-op the guest sees the affixes, a Splitting one the guest knocks out splits once (the same two copies
on both screens), an Explosive one blows up once on each screen, a Vampiric one touching the guest heals on
the host. Not measured with survival-lab: its bots fall before the cap binds.

## Late-hand decisions (2026-10-22, plan C1.4)

Late in a run the hand collapses to the same few cards (`js/fork/lab/late-hand.js`, loaded before
`card-rarity.js`):
- **Past the cap, at a price.** Carrera (speed, cap 8) and Reflejos (cooldown, cap 10) keep coming after
  their cap, up to 4 more each (a 1 in 4 chance per hand, over a common upgrade card), and each of those
  cards costs **4 % of your max HP** (said on the card). It carries its own cap (`c.capMax`), so
  `card-rarity.js` rolls and paints its rarity (an Epic one: ×2 speed, still −4 %); its `apply` and `desc`
  are accessors, so the cost survives whatever rarity writes. Lab's speed cap (`toughness.js`) still
  hides Carrera at ×2.5.
- **EV cards in endless.** Once Eternatus is beaten every hand has one "+1 EV" card: +2 % max HP, +2 %
  damage, +2 % damage reduction (toughness), −1.5 % cooldown or +0.3 HP/s (`pl._labEV` counts them).
  Under the cards, **"Auto-pick EV cards in endless (no menu)"** (`G.Settings` `labEvAuto`, this device):
  ticked, an endless run's level-ups take the EV card by themselves (its name pops over you) and the
  menu never opens. Ticking it with a hand open takes that hand's EV card at once. In co-op too
  (2026-10-23): your cards don't open, the EV card is your pick, and a small banner says which and who
  you're waiting for until everyone has picked (`fork/test-ev-auto-coop.cjs`, emulator). A Lab evolution's
  hand has no EV card and still opens: that one is a real choice.
`node fork/test-late-hand.cjs` (server): Carrera past 8 and Reflejos past 10 (offered, the cost said and
paid, the stat given), never past cap + 4, an Epic one, none in a normal run; EV cards in every endless
hand and none before; the toggle on the real level-up screen (ticking it takes the open hand's EV card),
three real level-ups auto-picked with no menu, and the menu still there before Eternatus falls.

## Per-Pokémon contracts (2026-10-22, plan C1.5)

Goals for one Pokémon, paid in **coins for that Pokémon's upgrades** and, since 2026-10-23, **1 candy** of
it (`save.lab.candy`, the same candies as gacha duplicates) (`js/fork/lab/contracts.js`):

| Contract | Goal | Contract coins | Candy |
|---|---|---|---|
| side20 | Reach 20:00 with 3 physical (or special: its strong side) moves | 1500 | 1 |
| mono15 | Reach 15:00 with 3 moves of its own type (other moves may come too) | 1200 | 1 |
| rift | Win a rift fight without switching your active move | 1000 | 1 |

mono15 until 2026-10-23: 3+ moves and *every* one of its type, so a single Normal move (Tackle) or a TM
blocked it for the run; and only the first species' types counted. Now 3 of its type are enough, and a type
its Lab evolution brings counts too. Progress: for the two timed ones `prog` is the furthest the clock got
(÷ its time) while you had the 3 moves; Missions shows the bar and "Best: 9:12 of 20:00 with the 3 moves",
and the Lab pause menu says where each stands ("3/3 moves ✓, 10:00 of 15:00").

Lab first: they show (Missions, a "Contracts" block for your partner) and progress only with the Lab on,
for the Pokémon the run started with (a Lab evolution keeps its contracts). Claim in Missions; the
Upgrades screen with that Pokémon selected has a banner over the list with **your coins and its contract
coins side by side** (a teal coin, never the gold one; with Lab on also at 0, saying where they come from),
and its buy buttons spend them first and say so ("contract", or "1200 contract" when they pay part)
(menu.js's own buy does the purchase; the coins are added just for it and taken back if it fails). The
save: `save.contracts[dex][id] = { prog, done, claimed }` and `save.cspent[dex]`; the balance is what the
claimed ones paid minus `cspent`, so `G.forkMerge` keeps either copy's done/claimed and the larger
`cspent`. The defs are also in `G.MissionDefs` (`contracts`, `BY`), never drawn as daily or weekly missions.
`node fork/test-contracts.cjs` (server): the block with the Lab on and not off; side20 and mono15 in real
Lab runs (not a second early, not in a normal run), mono15 with Tackle beside 3 Fire moves and not with 2,
the 67 % bar and "Best: 10:00 of 15:00", the pause line; a real rift won without switching (not with one,
not in a normal run); Claim (1500 contract coins and 1 candy), the Upgrades banner, then an upgrade bought
with contract coins and none of yours; `G.DB.merge` of two copies both ways.

## Starting move in Lab runs (2026-10-22)

Upgrades → Starting move keeps a separate pick for Lab runs (`save.pstartLab`, next to upstream's `pstart`;
`js/fork/lab/start-move.js`). With the Lab setting on, the picker lists the Lab list (Scorbunny's Pyro Ball,
marked LAB when the normal list doesn't have it) and writes the Lab pick. A Lab run starts with its Lab pick,
else the normal pick if the Lab list has it, else the default. Before, a Lab run checked the normal pick
against the Lab list and silently gave the default (6 of Scorbunny's 14 picks), and the picker never showed
Lab moves. Merged like `pstart` (the newer copy wins per Pokémon). `node fork/test-start-move.cjs` (server).

The **second** starting move (Upgrades → Second starting move, with Repertorio) works the same way since
2026-10-22 (plan D5): `save.pstartLab2` next to upstream's `pstart2` (`''` = random, so the normal pick doesn't
come back), `G.startMove2Of` wrapped, a one-line hook in `start2Picker` (`js/ui/menu.js`), merged per Pokémon in
`G.forkMerge`. Before, the picker with Lab on wrote upstream's `pstart2`, so a Lab-only pick (Pyro Ball) was
silently dropped in normal runs. `node fork/test-start-move.cjs` part 5.

## Phase 11: builds (2026-10-22)

Plan B2 and B4 (`fork/PLAN-2026-10-22.md`): choices that make a *build*, not just bigger numbers.

### Branching upgrades (`js/fork/lab/branches.js`)

In a Lab run, 12 moves (`TABLE`: Flamethrower, Thunderbolt, Ember, Water Gun, Vine Whip, Thunder Shock,
Confusion, Bite, Karate Chop, Ice Beam, Shadow Ball, Sludge) don't get a plain upgrade from level 3 to 4:
the hand shows two "Branch · Lv.4" cards for the move instead (keys `up:<id>:a` / `up:<id>:b`; the second
card takes the place of a stat card, else a new-move card). The branch you take changes how the move works
for the rest of the run (`m.branch`, `m.branchName`); the move keeps its id, name, type and category.
Each move has three branches, and a run only ever offers two of them (Halls of Torment's rule), rolled the
first time and kept (`pl._labBrPair`), so a reroll can't fish for the third.

| Move | a | b | c |
|---|---|---|---|
| Flamethrower | Fire Spin: a burning Fire bind (Wrap's) | Heat Wave: ×2 spread, +4 flames | Fire Blast: burns 3 stacks, +1 pierce |
| Thunderbolt | Discharge: an aura (Discharge's) | Volt Switch: switching to it casts at once, ×1.6 | Thunder: +2 hops, ×1.6 on statused enemies (`hex`) |
| Ember | Flame Burst: +2 pierce, bigger | Mystical Fire: +1, homing | Searing Shot: a nova (Heat Wave's) |
| Water Gun | Hydro Pump: a beam | Bubble Beam: +1 shot, slows | Scald: burns, +15 % |
| Vine Whip | Power Whip: +50 % reach | Horn Leech: `leech` 0.4 | Bullet Seed: bounces (Seed Bomb's) |
| Thunder Shock | Nuzzle: `flinch` 0.6 | Shock Wave: +1, homing | Charge Beam: a beam (Flash Cannon's) |
| Confusion | Psybeam: a beam | Psywave: `conf` 1.5 s | Psychic: a homing nova |
| Bite | Hyper Fang: `flinch` 0.7 | Jaw Lock: a bind (Bind's) | Assurance: `revenge` 1.6 |
| Karate Chop | Low Sweep: slows | Vital Throw: a grab (Circle Throw's) | Brick Break: `cut` 0.08 |
| Ice Beam | Frost Breath: a slowing cone | Freezing Glare: `flinch` 0.8 | Blizzard: hail (meteor) |
| Shadow Ball | Shadow Vortex: a vortex | Astral Barrage: +1, homing | Shadow Shackle: slows by half |
| Sludge | Sludge Bomb: poisons 3, bigger | Toxic Trap: mines (Toxic Spikes') | Gunk Shot: bounces (Acid Spray's) |

- A field branch (`mul` / `add` / `set`) comes on top of the move's own level 4 upgrade; the card says both.
- A `like` branch becomes that move: its kind and numbers at level 4 (`G.Moves.instance(like, 4)`), and its
  later upgrades (`G.Moves.levelUp` / `nextUpText` are wrapped). It evolves with its new kind's evolution.
- `k` (× damage) puts each branch near the plain move: `node fork/balance-lab.cjs --branches` measures every
  branch at the top level against the plain move (score = √(×crowd · ×single)). 2026-10-22: median 1.00, all
  0.88-1.25 except Toxic Trap (0.2: the dummies never step on mines) and Brick Break (HP cut, meaningless on
  dummies). Before `k` and the level 4 upgrade, field branches lost ~25 % and beams and novas measured 0.4-0.55.
- Volt Switch (`pivot`): `Player.setActive` puts its cooldown at 0 and the cast in that frame hits ×`pivot`.
- `G.Moves.instance(id, lvl, br)` builds a branched move; `resume.js` saves and rebuilds `br`.
- Co-op: `G.Coop.cast` sends the branch in the level's tens (lvl + 10 × 1/2/3) and `G.Combat.ghostCast` reads it
  back, so a teammate's branched move is drawn as it is (Fire Spin as a bind, Heat Wave's fan).
- The Pokémon's Lab evolution keeps its moves, branch included. The move tooltip and the pause block name it.

Checks: `node fork/test-builds.cjs --only branches` (the real hand, the real level-up screen, Fire Spin holding
and burning, its bind upgrades and evolution, Heat Wave's numbers, Volt Switch ×1.6, evolution and resume)
and `node fork/test-builds-coop.cjs` (Firebase emulator: the guest's Heat Wave, Fire Spin and evolved Fire
Spin drawn as they are on the host, and its bind holding the host's enemies).

### Set bonuses (`js/fork/lab/sets.js`, `js/fork/lab/hits.js`)

In a Lab run, what your slots hold turns bonuses on for as long as they hold it (Brotato's sets):

| Set | Needs | Bonus |
|---|---|---|
| Fire | 3 damaging Fire moves | every Fire hit adds one more burn stack |
| Water | 3 Water moves | Water hits slow enemies (30 % for 1.5 s) |
| Electric | 3 Electric moves | Electric hits jump to one more enemy within 120 px for 35 % of the move's damage (at most 6 jumps a second) |
| Grass | 3 Grass moves | Grass moves heal you 12 % of their damage |
| Fighting | 3 Fighting moves | +20 % physical damage, and the 25 % close-range cut with any move active (not twice with melee or Lab's close kinds) |
| Physical | 3 physical moves | lifesteal: 8 % of your physical damage |
| Priority | 2 of Quick Attack, Extreme Speed, Ice Shard, Shadow Sneak, Sucker Punch, Vacuum Wave, Fake Out, Jet Punch, Water Shuriken... | a switch leaves at most 10 % of the move's cooldown (the game's switch leaves 35 %) |

Set healing is capped at 3 % of max HP a second. The active sets are chips under the HP bar
(`G.HUD.belowHp`), the pause block names them and the ones a move away, and a new-move card that would
complete a set says so. `G.LabHits.on(f)` (`hits.js`) runs f(pl, e, m, dmg) after each of your hits in a
Lab run (tagged in `G.RunStats.tag`, acted on in `Enemy.hurt`, like kinds2.js); what f does to other
enemies doesn't come back into f. Synergy cards and recipes use it too. Co-op: each player's own sets;
burns, slows and jumps go through applyBurn / applySlow / Combat.hit, which a guest forwards.

| Build (`node fork/survival-lab.cjs --runs 6 --only "set ("`) | Sets on | `--no-sets` |
|---|---|---|
| far: Fire set (Ember + Flamethrower + Heat Wave) | 219 | 207 |
| close: Fighting set (Karate Chop + Dynamic Punch + Rolling Kick; also the Physical set) | 185 | 122 |
| close: Physical set (Bite + Body Slam + Tackle) | 166 | 127 |

(2026-10-22, median seconds of 6 runs, one or two runs of 6 lost to page errors with `--no-sets`; ±20-30 s is noise. The
Fire set's extra burn is within the noise; the close sets lift close builds into the range of the best ranged ones.)

Checks: `node fork/test-builds.cjs --only sets` (each set one move short and then complete, on real hits; the
chip, the pause line, the card note) and `test-builds-coop.cjs` (the guest's Fire set burns the host's enemies more).

### Synergy cards (`js/fork/lab/synergy.js`)

A red-bordered "Synergy" level-up card (20 Minutes Till Dawn) only exists once you own its two
prerequisites; taken, it adds a rule for the rest of the run (`pl._labSyn`, kept by a resume). At most one
per hand, in 1 of 2 hands while one is open to you, in a stat card's place (else a new-move card's); each
once per run. The border and chip are painted after `G.RunUI.showLevelUp` / `reroll`, like card-rarity.js.

| Card | Needs | Rule |
|---|---|---|
| Frost Fire | an Ice move + a Fire move | your Ice hits also burn |
| Overload | Thunder Wave, Zap Cannon or Thunder Cage + another Electric attack | Electric hits on a stunned enemy explode around it for 50 % (once per enemy per 0.6 s) |
| Steam Burst | Water + Fire | Water hits on a burning enemy deal 50 % more |
| Wildfire | Grass + Fire | Grass hits on a burning enemy spread the burn to 2 enemies near it |
| Toxic Drain | Poison + Grass | Grass hits on a poisoned enemy heal you 15 % of the damage (≤ 1 % HP a hit) |
| Shatter | Ice + a Rock, Steel or Fighting physical move | physical hits on a slowed enemy deal 35 % more |
| Quicksand | Ground + Water | Ground hits on a slowed enemy stop it for 0.5 s (once per 3 s) |
| Nightmare | Ghost + a sleep move | Ghost hits on a sleeping or confused enemy deal 60 % more |

Built on fields that exist (burn, slow, stun, Lab sleep/confusion), through `G.LabHits`. "Frozen" in the
plan's Frost Fire is the game's Ice slow, so the rule is "Ice hits burn". A guest's copies read the host's
status bits (`e.net.st`). Neighbours are deduplicated: upstream's `EnemyMgr.queryCircle` lists an enemy
twice where two grid cells' hash keys collide (cells (1,-1) and (-1,1) near the world's origin, `enemy.js`
`key`), which made Overload hit a neighbour twice; recipes' jumps do the same. Check: `node fork/test-builds.cjs --only synergy`.

### Bond recipes (`js/fork/lab/recipes.js`)

A bond (a legendary's reward: `game.js` offerBond → `Player.fuse`) puts moves in one slot so they cast
together. In a Lab run, some pairs in the same slot also change how a move works (Vampire Survivors'
unions), for as long as they share the slot:

| Pair | Recipe | What changes |
|---|---|---|
| Sunny Day + Solar Beam | Solar Flare | Solar Beam fires at once: charge 0.05 s |
| Rain Dance + Thunder Shock | Thunderstorm | the bolts home in (never miss) and each hit jumps to the 2 nearest enemies within 140 px for 40 % |
| Will-O-Wisp + Hex | Infernal Hex | Hex's chain burns every enemy it hits, so its later hops get Hex's ×1.7 on statused enemies |
| Snowscape + Ice Beam | Deep Freeze | Ice Beam's hits stop enemies 0.5 s (once every 2 s each) |
| Leech Seed + Giga Drain | Root Network | Giga Drain plants Leech Seed (3 s) on everything it touches |

The bond screen marks the picks that make a recipe (pink border and a "Recipe:" line under the card's bond
note, on both steps; a MutationObserver on `#bond-cards` since its second step renders inside run-ui.js).
Each frame (`Combat.tick`) the slots are checked and a recipe's move gets `m._recipe` and its change once,
so a resumed run gets it back by itself. The move's box and the pause block name it. Co-op: the recipe
travels in the cast's level hundreds (next to branches' tens), so a teammate's Solar Beam fires at once
on your screen too. Not measured with survival-lab: bonds come from legendaries in the rift, which the bot
never fights. Check: `node fork/test-builds.cjs --only recipes` and `test-builds-coop.cjs`.

## Lab TMs at Kecleon's (2026-10-22, plan D7)

With the Lab setting on, Kecleon's shop has a 9th daily TM (`js/fork/lab/lab-tms.js`): one of the 52 Lab moves that
species learn by TM in the games and upstream doesn't sell (Revenge, Protect, Reflect, Surf, Fly...; built from
`G.LabData.learn`'s TM group, signatures left out), the same for everyone each day (`G.Shop.today`), priced with
upstream's formula (300 + 6 × its power in the games, status moves 400). It's taught from the collection card like
any TM (`G.TM_OF` lists it with Lab on, unless the species' Lab list already has it), and it stays **Lab-only** (G5):
it joins the Lab list (D4) and `lab.js` keeps Lab moves out of a normal run's list. Its shop row is tagged LAB
with "Lab TM: the move works in Lab runs only." `shop.js` buy() checks its own list, so `G.Shop.buy` is wrapped
for today's Lab TM (same steps). `node fork/test-kecleon.cjs` part 4.

## Phase 12: co-op support moves (2026-10-22, TODO 46)

Moves that help teammates, so a build in a co-op run can drift into a support or a tank
(`js/fork/lab/support.js`, `G.LabSupport`). Not a role picker and no new mode: just moves.

**Where they show up.** Only in a **co-op Lab run**, only on the level-up cards: while you have a free slot,
1 hand in 2 has a co-op card ("New · Co-op · Psychic") for one of them your species learns in the games
(learnsets through `fork/fetch-lab.cjs`, every method, TMs too: 614 species learn at least one), in the
last new-move card's place (else the last stat card's). Never in solo or normal runs. They carry `coop` in
`lab-moves.js`: `lab.js` keeps them out of every species' Lab list (so solo pools, the pause list and the Lab
start picks are exactly as before: checked for all 966 species), `lab-tms.js` doesn't sell them and Metronome
never calls them. In a co-op Lab run the pause block lists the ones your species can learn.

| Move | Type | What it does (level 1) | Who learns it |
|---|---|---|---|
| Heal Pulse | Psychic | when a teammate within 300 px falls below 60% HP: every teammate in reach (not you) gets 22% of their max HP back. cd 10 s. Evolves into Purify (×1.3 healing, -20% recharge) | 33 (Chansey, Blissey, Ralts line, Audino, Lucario, Latias/Latios...) |
| Aromatherapy | Grass | when you or a teammate within 220 px falls below 75%: you and every teammate in reach heal 3% of max HP a second for 5 s. cd 12 s. Evolves into Teatime | 48 (Chikorita line, Vileplume, Parasect, Roselia, Roserade, Shaymin...) |
| Wide Guard | Rock | when enemies are near the team: you and every teammate within 220 px block the next 2 hits within 8 s ("Blocked!", not Arceus's pure damage). cd 14 s. Evolves into Mat Block (×1.5 hits) | 63 (Machamp, Kingler, Hitmonlee, Mr. Mime, Mantine...) |
| Block | Normal | when 2+ enemies close in on a teammate within 300 px: you stand guard 5 s, the enemies within 240 px of you come for you instead (a decoy that follows you, B3.5's; bosses ignore it) and you take 35% less (up to 60% with upgrades). cd 10 s. Evolves into Shelter | 118 (Snorlax, Sudowoodo, Nosepass, Bastiodon, Bronzong...) |
| Helping Hand | Normal | when a teammate within 250 px is fighting: every teammate in reach (not you) deals 30% more damage for 6 s (up to 60%). cd 8 s. Evolves into Coaching | 560 |

All of them go off on their own from any slot (kind `ally`, each on its own clock), like Lab's heals and
screens; their upgrades raise the healing, hits blocked, reach, duration or cut the recharge.

**Co-op.** Each player owns their HP and damage, so nothing new travels: the caster's cast reaches every other
screen as a ghost cast (`Combat.ghostCast`; the host passes a guest's on to the other guests), and there the
move applies itself to that screen's player if it stands in reach of the caster (+40 px for the lag), like
Tailwind. A teammate's guard, boost and healing are drawn on every screen (a stone hexagon with one pip per hit
left, a blue ring for Block, gold and green sparkles). Block's decoy is made on every screen; the enemies' AI
that follows it runs on the host.

To free the names, Roost's Lab evolution is now Swallow (was Heal Pulse) and Reflect's is Barrier (was Wide Guard).

`node fork/test-lab-support.cjs` (server + Firebase emulator; `--solo` without it): registration, learnsets,
no Lab list has them, 300 solo Lab and 300 normal hands with no co-op card; in a real co-op Lab run about half
the hands hold one (only moves the species learns) and taking it adds the move; the guest's Heal Pulse heals the
host and not itself, the host's heals the guest, not from 600 px; the guest's Helping Hand ×1.30 for the host;
the host's Wide Guard blocks the guest's next 2 hits; the guest's Block pulls the host's walkers to the guest
(the host stands still) and the guest takes ×0.65; the host's Aromatherapy heals both 50% → 65%.

## The endgame wall (2026-10-23, plan C2.6 in part)

The horde's numbers grow linearly (`G.Enemies.scale(t)`) while a strong build's damage grows far faster,
so after Eternatus a good run could go on for ever. In a Lab run every regular enemy that joins the fight
from 20:00 on gets, on top of the spawner's numbers (`js/fork/lab/endgame.js`, a `G.EnemyMgr.add` wrapper on
the machine that runs the enemies, loaded after `affixes.js` so a Shielded shield is 60 % of the new HP):

| | 25:00 | 30:00 | 35:00 | 40:00 | 45:00 | 50:00 | 60:00 |
|---|---|---|---|---|---|---|---|
| HP × (1 + (t − 20:00)/10 min) × 1.2^((t − 30:00)/2 min) | 1.5 | 2 | 3.9 | 7.5 | 13.7 | 24.8 | 77 |
| damage × (1 + (t − 20:00)/30 min) × 1.12^((t − 30:00)/2 min) | 1.17 | 1.33 | 2.0 | 2.9 | 4.3 | 6.2 | 12.8 |
| speed × (1 + 0.3 (t − 20:00)/30 min + 0.3 (t − 30:00)/30 min), at most 1.6 | 1.05 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 | 1.6 |
| extra elites (×1.6 HP, ×1.25 damage) / extra affixes | 0 / 0 | 0 / 0 | 8 / 5 % | 17 / 10 % | 25 / 15 % | 33 / 20 % | 50 / 30 % |

XP is × √(the HP factor), so levels keep coming but fall behind the horde. The exponential terms only start
at 30:00, the regime change: like Megabonk or Vampire Survivors' late game, it doesn't stop until you do.
Measured on the real spawner (Charizard, 2026-10-23): a regular enemy averages 17 900 HP and 270 contact
damage at 45:00 before this, so ~245 000 HP and ~1 160 damage after. The HUD shows the HP factor next to the
clock from 20:00 (`THREAT ×4.1`, red and pulsing past 30:00), read from the shared clock, so guests see it
too. Regular enemies only: bosses, legendaries, obelisks, split copies, thieves and anything marked
`_noScale` keep their numbers (late bosses: `js/fork/lab/boss-power.js`).
`node fork/test-endgame.cjs` (server): the same enemy joining a Lab and a normal run at 15, 25, 30, 45 and
60 minutes; the curve's values; what keeps its own numbers; extra elites and affixes from real spawns only
past 30:00; the THREAT label. `test-xp-pace.cjs` counts the √ factor at 25:00.

## Late bosses keep up (2026-10-23)

A strong build one-shot rift and wild legendaries at 45:00: their HP grows with the clock (the rift's
3200 + 9 HP a second, a wild one's 2600 + 6) while a build's damage grows far faster. In a Lab run, on the
machine that runs the enemies (`js/fork/lab/boss-power.js`):

- **The power meter.** Every hit already lands in `G.Judgment.noteDmg` (Enemy.hurt calls it where the enemies
  run, the guests' hits included), so each second keeps the most damage one enemy took and the biggest single
  hit. `G.LabPower.power()` is the mean of the 5 best seconds of the last 60 (the team's single-target damage
  per second, overkill included), `maxHit()` the biggest hit of the last 60 s.
- **HP floors from 15:00.** A boss that joins the fight gets at least `power() × S` seconds of HP, and never
  less than 8 of your biggest hits. S grows with the clock, u = (t − 15:00)/30 min, at most 1.5:

| | S | 30:00 | 45:00 | 60:00 |
|---|---|---|---|---|
| boss slot | 10 + 14u | 17 s | 24 s | 31 s |
| wild legendary | 7 + 9u | 11.5 s | 16 s | 20.5 s |
| rift legendary | 14 + 16u | 22 s | 30 s | 38 s |

- **No bursting from 20:00.** One hit takes at most 10 % of a boss's max HP. The file loads before every Lab
  file that multiplies a hit (`kinds.js`, `kinds2.js`, `mech.js`), so the cap is on the final number.
- **The clock past 30:00**, like the horde (`endgame.js`): HP × 1.2^((t − 30:00)/2 min) (×3.9 at 45:00,
  ×15.4 at 60:00), damage × √(the horde's damage factor) (×2.1 at 45:00, ×3.6 at 60:00), XP × √(the HP gained),
  at most ×3. Wild legendaries also get the bosses' own clock they lacked: HP × (1 + t/10 min), damage ×
  (1 + t/30 min) (rift-scaling.js's for the rift): at 45:00 a wild one has 406 000 HP and 715 damage with an
  empty meter (was 18 800 and 138).

Not for Arceus's Judgment, Eternatus and its obelisks, or a raid's or site's guardian (`_noPower`): those set
their own HP from `power()`. Load order: before `rift-scaling.js` (its `G.EnemyMgr.add` wrapper is inner, so
the floor sees what rift-scaling and a Mega made of the legendary). Co-op: the host's meter counts the whole
team; the HP travels in `'ne'`, and a guest's hit reaches the host's copy, where the cap applies.
`node fork/test-boss-power.cjs [--solo]` (server; co-op part with the emulator): the meter; the three floors at
45:00 with a huge meter; the clock with an empty one; the cap at 25:00 and none at 18:00; nothing before 15:00
or in a normal run; in co-op the guest sees the full max HP and its one-shot takes 10 % on the host.
`test-wild-legends.cjs` and `test-boss-slots.cjs` count the new clock.

## Move badges

The enemy arrows (half size, centred until the enemy has a health bar) are in every run since
2026-10-21, not only Lab; the move arrows (cards, tooltip) stay Lab-only.

In a Lab run, each thing that makes a move better or worse for **your** Pokémon gets a small arrow
next to the word it judges: "New · Fire ▲ · Special ▲" on a level-up card's chip, and the same in
the move tooltip (`badges.js`). There are 4 arrows (`badge-art.js`, 13×13 code drawings in
`G.Icons.UI`: `lb-g`, `lb-m`, `lb-y`, `lb-r`); the art players see is the artist's, 18×18 PNGs
published from the Asset Admin (`js/fork/icon-overrides.json`), shown at **half size** (9×9) everywhere.
Over an enemy the arrow sits left of its health bar; before it has one (full health, not a boss) it is
centred above it, where the bar will be, or above the heart / shield / friends icon of a support
enemy (one-line hook in `js/entities/enemy.js`: `G.LabBadges.enemyMark`).

| Arrow | When |
|---|---|
| green ▲ after the type | the move is your type and you have one type (+20 %, `Player.monoType`) |
| green ▲ after Physical / Special | 95 %+ of your damage (`G.Stats.fit`), or an Attack / Sp. Atk buff for your strong side |
| yellow ▼ | 65-95 %, or a buff for your weak side (Swords Dance on Gengar) |
| red ▼ | under 65 % (8 Pokémon, Stonjourner the lowest at 58 %) |
| over enemies: magenta ▲ x4, green ▲ x2, yellow ▼ 1/2, red ▼ 1/4 and immune | the type-chart arrow, recoloured (no number) |

Speed, Defense and healing buffs get nothing (they help everyone the same). Only new-move cards get
arrows, not upgrade cards. The existing "Your type" chip and the text notes are still there.
(2026-10-21: the version with symbols inside the arrows, and the setting to switch, were dropped.)

## Checks

- `node fork/test-badges.cjs` (server; `SHOTS=<dir>` for screenshots): the 4 arrows, which ones
  real Pokémon get (Charmander, Charizard, a 65-95 % and the under-65 % case, Gengar's buffs), the
  level-up cards (each arrow in the chip after its word, nothing with Lab off, no setting left),
  the tooltip with a real mouse (each arrow after its word), the size (9 on cards, tooltip and
  enemies), where the enemy arrow lands (centred at full health, above a healer's heart, left of the
  bar once hurt), and the built
  `index.html` (no setting; its CSS for the arrows).

- `node fork/test-close-range.cjs` (server): close range and mobility (see that section): melee aims in reach
  and dashes ignore props in a normal run; the Lab cut, relocation grace, leap landing, recoil cap and KO
  refund, ramp fade and roll step.
- `node fork/test-lab-close.cjs` (server): phase 9. Every move registered, real pools get them, no
  evolution sharing a name; a throw that bowls over the one behind, Seismic Toss by level; Bind
  holding and hurting, two at level 2; Focus Punch landing or lost, Shell Trap going off; Recover
  only below half, Rest, Wish, Morning Sun in sun; Reflect ×0.6 physical only; Growl ×0.7 and back,
  Screech ×1.4; Drain Punch, Leech Seed, Revenge ×2, Reversal ×2.5 at 25% HP, Super Fang half (a
  boss far less), Power Trip, Fake Out once; Bulk Up, Fillet Away; Endure once then recharging; the
  close-range 25%; Metronome, a grab's evolution, Iron Fist.
- `node fork/survival-lab.cjs [--runs 3] [--only name]` (server): seconds a build lasts in a real
  Lab run (bot, Mew's stats, no XP). Not a pass/fail test: rerun it after tuning phase 9 moves.
- `node fork/test-lab.cjs` (server on 8123): the setting; Lab off offers only normal pools and
  is sent to the leaderboard; Lab on offers only the Lab pool, Swift casts, ability and HUD tag,
  pause block; protections (no leaderboard, stats/missions/achievements unchanged, coins kept,
  no record); 12 ability behaviours and all of them in a real run; every new kind's behaviour and
  every Lab move at its top level; signatures (pools, card, animation, evolution); in-run
  evolution, Everstone, items, underdog XP, candies; shiny colours and bonuses; Mega Evolution;
  promotion; the **built** `index.html` through the UI.
- `node fork/test-lab-abilities.cjs` (server): one ability per run. Blaze ×1.5 on a real Ember hit (not ×2.0),
  a capsuled Thick Fat ×0.5 (not ×0.3), one Sturdy save, the hidden roll (Solar Power), Cursed Body runs
  upstream's and is named on the tag and pause screen, Lab off, the card's "In Lab" line.
  Evolving: the nature, one Blaze, the shiny's rolls, the hidden slot kept, Pickup and Compound Eyes taken off.
- `node fork/test-lab-pools.cjs` (server): `natural` reaches upstream's poolFor through Lab's wrapper; every
  species' Lab list is the same with an Adamant or a Modest nature.
  A taught TM is in a Lab run's list, cards, pause menu, after evolving, and in the Lab start picks.
- `node fork/test-underdog.cjs` (server): the ladder (ranges, the highlighted rarity, Back/Escape,
  Start run, Random Pokémon, Lab off, the setting off, once per Pokémon), the Play button's tag,
  the gold share of the XP bar and its label, and no gold or label for a Pokémon with no bonus.
- `node fork/test-shadow-force.cjs` (server): Phantom Force strikes once, Shadow Force all three
  dummies in turn (untouchable until the last), only Giratina learns it, and that no evolved move
  is named after a Lab move (`js/fork/evo-names.js`; Fly's Lab evolution is Dual Wingbeat).
- `node fork/test-evo-hud.cjs` (server): the evolution indicator (next form and its level, the bar
  from where this form started with the current level's XP, right under the HP bar with the buff and
  altar-power chips under it, READY at the level,
  after evolving, nothing with the Everstone, without an evolution or with Lab off, Eevee's "+N more").
- `node fork/test-variant-bonus.cjs` (server): the shiny and radiant bonus boxes in the collection
  (numbers, bar ends, pips, dimmed, "radiant gives more", Lab off), and the bonuses in Lab runs
  (shiny ×1.1 and +1 reroll, radiant ×1.2 and +2) and on the pause screen.
- `node fork/test-lab-coop.cjs` (server + Firebase emulator): host on / guest off gives a Lab run
  for both with the lobby line, each with their own ability; the guest's Swift is drawn and deals
  damage on the host; the guest's sleep and confusion reach the host's enemies, its Follow Me lures them (phase 10), its Rain Dance is
  rain around the guest on the host's screen (not the arena's weather); its Fly, evolution and Mega Evolution are seen on the host; no group leaderboard. Host
  off / guest on gives a normal run.
- `node fork/test-lab-support.cjs [--solo]` (server + Firebase emulator): phase 12, see its section.
- `node fork/test-builds.cjs [--only branches]` (server) and `node fork/test-builds-coop.cjs` (server +
  Firebase emulator): phase 11, see its section.
- `node fork/test-gameplay.cjs` checks Mega Evolution in a normal run; `test-admin.cjs` that an
  admin's Mega Stone Mega Evolves a friend in a normal co-op run, seen by everyone.
- `node fork/test-endgame.cjs` (server): the endgame wall, see its section.
- `node fork/test-boss-power.cjs [--solo]` (server + Firebase emulator): late bosses, see their section.
- `node fork/test-moves.cjs`, `test-coop.cjs` and `test-sync.cjs` still pass with Lab loaded.

Known flakiness, not caused by Lab (seen 2026-10-20):
- one co-op run stuck on the boot screen before any Lab code ran
- (fixed 2026-10-20) `test-gameplay.cjs`' "Second Nature … casts by itself" failed about one run in
  four: XP from its own kills opened real level-up cards during the 2.5 s it waits, freezing the
  world. It now turns XP off for those seconds.
