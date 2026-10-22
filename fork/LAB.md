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
| 2026-10-20 | Phases go in the listed order. |
| 2026-10-20 | Lab texts are **English only** (no other translations); in other languages they show in English. |
| 2026-10-20 | All Lab code lives in `js/fork/lab/`; upstream files only get one-line hooks (merge conflicts, see `CLAUDE.local.md`). |
| 2026-10-20 | **Mega Evolution is a Lab feature**: the stone only drops, and only works, in Lab runs; the "can Mega Evolve" marks only show with the Lab setting on. |
| 2026-10-20 | Promotion to the normal game (phase 8) is per move (`promote: true`), and **nothing is promoted yet**: that is the owner's call, after play-testing and the balance report. |
| 2026-10-21 | **Move badges** in Lab: same-type arrow only when it adds damage (one type); weak side yellow from 65 %, red under; the enemy arrows redrawn in the same colours (x4 magenta). |
| 2026-10-21 | The badges are the **4 plain arrows only**, drawn by the artist (18×18, own size); the symbols version and its setting are gone. |
| 2026-10-21 | Every arrow at **half size** (the 18×18 PNGs at 9); over an enemy with no health bar yet (full health, not a boss), **centred above it**. |

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
| 7 | Shinies: move colours from the shiny sprite, +10% XP and coins, +1 reroll | **done** 2026-10-20 |
| 8 | Balance script (`fork/balance-lab.cjs`) and the `promote` switch; nothing promoted yet | **done** 2026-10-20 (promotion: owner's call) |
| 9 | Close range and sustain: 50 official moves, 7 new kinds (grab, bind, focus, heal, screen, shout, endure) and hit effects (drain, revenge, reversal, HP cut...), the survival bot | **done** 2026-10-21 (not play-tested yet) |

## Files

| File | What |
|---|---|
| `js/fork/lab/lab.js` | `G.Lab`: the setting, per-run flag, Lab pools, signature pools and cards, promotion, protections, co-op messages, badges, the pause block |
| `js/fork/lab/abilities.js` | `G.LabAbilities`: the ability table and its hooks |
| `js/fork/lab/kinds.js` | `G.LabKinds`: the new move kinds (phase 4), their ladders and evolutions, sleep and confusion, co-op messages |
| `js/fork/lab/kinds2.js` | `G.LabKinds2`: phase 9's kinds (grab, bind, focus, heal, screen, shout, endure), the hit effects (leech, seed, revenge, reversal, cut, power, flinch), multi-stat buffs, the close-range damage cut |
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
| `js/fork/lab/lab-data.js` | generated by `fork/fetch-lab.cjs`, don't edit |
| `js/fork/lab/lab-anims.js` | generated by `fork/fetch-lab-anims.py`, don't edit |
| `fork/fetch-lab.cjs` | downloads PokeAPI's CSVs and SpriteCollab's tracker into `tools/cache/lab/` (gitignored), writes `lab-data.js` |
| `fork/fetch-lab-anims.py` | downloads the signature moves' extra animations into `assets/pokemon/{dex}/lab/`, writes `lab-anims.js` and `CREDITS-LAB.md` |
| `fork/balance-lab.cjs` | the balance check (phase 8); writes `fork/BALANCE-LAB.md` |
| `fork/survival-lab.cjs` | how long a build lasts in a real Lab run, played by a bot (phase 9) |
| `css/brand.css` | the teal "LAB" tag, the pause/summary blocks, the gold ring on signature moves |

Upstream touches: the `tab === 'lab'` branch (`G.Lab.settingsRow`) in `js/ui/settings-ui.js`, the script tags in
`dev.html`, the family registry in `js/systems/combat.js` (`EXTRA`: one line each in `run`,
`needsTarget` and `reach`, plus `run`/`hit`/`reach`/`spotFor`/`segDist2`/`inArc` exported) and
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
- **Protections:** the run is tainted (`G.Game.taint()`), so it never reaches the leaderboards.
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

## Phase 3: abilities

Each species gets the first of its abilities (slot order, hidden last) that is implemented. If
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
| leap | Fly, Dig, Bounce, Dive, Phantom Force | you're gone for `dur` s (can't be hit), then land on the target with an area hit; with `chain` (Shadow Force) it vanishes again and lands on the nearest enemy not hit yet, up to `chain` strikes (`chainLeap`) |
| recoil | Double-Edge, Take Down, Flare Blitz, Brave Bird, Wild Charge, Wood Hammer, Head Smash, Submission | a hard dash that costs `recoil` × the damage done, at most 12% of your HP, never KO |
| ramp | Rollout, Ice Ball, Fury Cutter, Fury Swipes | each hit in a row is stronger (`step`, up to `stacks`); a miss or a pause starts over |
| guard | Protect, Detect, Counter, Mirror Coat, Metal Burst | Protect: nothing hurts you for `dur` s. Counter: half damage, then a blast with `mult` × what you took |
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
`G.VFX.PAL` (`shiny{dex}`) and onto its moves (`m.look.pal`; a teammate's ghosts too). Plus +10%
XP, +10% coins and one more card reroll (`BONUS`). A radiant gets more: +20% XP, +20% coins and two
more rerolls (`RBONUS`), not the shiny's. The collection's detail shows them under the stats
(`variant-bonus.js`): XP and coins as bars whose end is in the shiny's (cyan) or radiant's (orange)
colour, rerolls as pips (the Pokémon's bought ones grey); dimmed when you view the normal form, and
on the shiny it says when its radiant, also yours, gives more.

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

With a grab, bind, focus or ramp move active you take 25% less, like melee (`kinds2.js` `CLOSE`).
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

## Starting move in Lab runs (2026-10-22)

Upgrades → Starting move keeps a separate pick for Lab runs (`save.pstartLab`, next to upstream's `pstart`;
`js/fork/lab/start-move.js`). With the Lab setting on, the picker lists the Lab list (Scorbunny's Pyro Ball,
marked LAB when the normal list doesn't have it) and writes the Lab pick. A Lab run starts with its Lab pick,
else the normal pick if the Lab list has it, else the default. Before, a Lab run checked the normal pick
against the Lab list and silently gave the default (6 of Scorbunny's 14 picks), and the picker never showed
Lab moves. Merged like `pstart` (the newer copy wins per Pokémon). `node fork/test-start-move.cjs` (server).

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
  damage on the host; the guest's sleep and confusion reach the host's enemies, its Rain Dance is
  rain around the guest on the host's screen (not the arena's weather); its Fly, evolution and Mega Evolution are seen on the host; no group leaderboard. Host
  off / guest on gives a normal run.
- `node fork/test-gameplay.cjs` checks Mega Evolution in a normal run; `test-admin.cjs` that an
  admin's Mega Stone Mega Evolves a friend in a normal co-op run, seen by everyone.
- `node fork/test-moves.cjs`, `test-coop.cjs` and `test-sync.cjs` still pass with Lab loaded.

Known flakiness, not caused by Lab (seen 2026-10-20):
- one co-op run stuck on the boot screen before any Lab code ran
- (fixed 2026-10-20) `test-gameplay.cjs`' "Second Nature … casts by itself" failed about one run in
  four: XP from its own kills opened real level-up cards during the 2.5 s it waits, freezing the
  world. It now turns XP off for those seconds.
