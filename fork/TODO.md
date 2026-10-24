# MrSurvivor work list

The one work list (plan E2). Design and reasons: `fork/PLAN-2026-10-22.md` (its section G has the
owner's answers). Standing decisions: `CLAUDE.local.md` ("Standing decisions").

How to use it:
- Claim an item before starting it: put `(claimed: <session or agent>)` after it, commit, push.
- Tick it when it's pushed: `- [x] ... (abc1234)`.
- Tags: `[bug] [feat] [lab] [ui] [coop] [infra]`. `!` = do first, `[?]` = ask the owner first.
- New items from the owner's notes come in through `/intake` or `/notes`, at the end of "Inbox".

## Inbox

- [x] 44. [feat][coop] A player who's down in a rift boss fight is revived the moment the boss dies (they were already revived on leaving the rift; this makes it clear) · rift · co-op (f66160a)
- [x] 45. [feat][coop] Fairer rift boss rewards: not decided by who's closest to the drops when it dies; e.g. everyone gets their own roll for a held item instead of one item dropping · rift · co-op (f66160a)
- [x] 46. [lab][coop] Co-op-only moves that help teammates (heal or shield an ally, draw enemies off them, team buffs), so a build can turn into a support or a tank; only offered in co-op level-up cards · Lab (e4e5368)
- [x] 47. [feat][ui] The 3 s count-in interrupts less: after picking a reward (level-up card, held item), solo too, only when the pick took over 10 s; closing the pause menu within 10 s of opening it skips it · everyone (6ebf929)
- [ ] 48. [bug] Sturdy can't trigger in a page's first ~90 s: upstream's `sturdyAt = -999` is compared with `performance.now()` · everyone (found by stream D)
- [ ] 49. [bug][lab] Resuming a Lab run that evolved restarts as the evolved species, which rolls its own nature and ability; Sheer Force / Skill Link / Prankster move changes are lost on resume (`js/fork/lab/resume.js`) · Lab (found by stream D)
- [ ] 50. [infra] Checks lose pages that stall on the boot screen when the machine is busy (test-gameplay once, survival-lab often; survival-lab now retries): find why boot waits, don't retry
- [ ] 51. [?] G12 follow-up: close builds can't beat the 3:00 boss alone (they must stand next to it), so 24's survival targets aren't met even with a 45 % cut or +50 % damage. Owner: change the targets, or give melee a way past the boss?
- [x] 52. [ui][infra] Admin Change Log: every change to the game by day (new / buff / nerf / changed / removed / fixed, Lab or everyone, was → now numbers), backfilled from the whole history, and a check that every game commit adds its lines · admin (47482d7)
- [x] 53. [feat][lab] Lab leaderboard: the same boards as the regular one (solo/group; today, week, month, all-time, per Pokémon), counting only Lab runs (a0dc40b)
- [x] 54. [ui] Boss health bars: one bar per boss alive (late runs have several), only for bosses within a wide radius of you so it stays uncluttered · everyone (b48d672)
- [x] 55. [infra][ui] Performance: FPS in late runs (many enemies, effects, bosses) and memory that grows over a long session in the Chrome tab · everyone (31db99f: the run's whole cast of sprite sheets stayed loaded, ~70 MB less now; FPS measured, not fixed: 1.5 ms of JS a frame at 1:00, 2.7-3.4 ms at 25:00 with 64 enemies here, 14.5 ms with the CPU slowed 4x, spread over every system with no single hot spot; no JS heap or DOM leak over 8 runs back to back; numbers in fork/test-perf.cjs)
- [x] 56. [feat][ui] Move dex: a tab that lists every move and what it does · everyone (050245e)
- [x] 57. [feat] Choice Band: picking it up asks which move to lock into (it locked to whatever slot was active) · everyone (15181d3)
- [x] 58. [bug][lab][coop] Auto-pick EV cards: still opened the menu and didn't pick (co-op never auto-picked; ticking it left the open hand); co-op should skip the menu and wait for the others · Lab (e850c9d)
- [x] 59. [feat][coop] End run: a button in the pause menu from 20:00 that ends the run with the usual screens; in co-op everyone votes and all must say yes · everyone (0a261a9)
- [x] 60. [feat] Bond "Keep them apart": +2.5% damage (was +10%), and the bonus only the first 5 times · everyone (673462d)
- [x] 61. [ui] Gacha machine: the Skip button under the machine instead of next to it (the Radiant Ritual uses the same machine) · everyone (9aa381c)
- [ ] 62. [infra] fork/test-radiant-ritual.cjs fails 7 checks: it assumes a fixed pool of 3 radiants (Arcanine, Mewtwo, Eternatus), but the artist's publishes have made it 13, so its banner and odds numbers no longer hold; make it set up its own pool (found 2026-10-23)
- [x] 63. [ui] Kecleon shop: always show a TM's move description, even when your partner can learn it (the "can learn it" line replaced it) · everyone (d778a03)
- [x] 64. [lab][bug] Contracts: reward coins and 1 candy of the Pokémon; check the progress tracking (e.g. 15:00 with 3+ moves of its own type); the Upgrades screen should make the contract coin balance clear · Lab (bda575b)
- [x] 65. [ui] Main menu: a gem count in the same bubble as the coin balance · everyone (21de947)
- [ ] 66. [bug][ui] Phone held upright (390 px and 360 px): the main menu top bar pushes the coin, ticket and user bubbles off the left edge of the screen (seen 2026-10-23, with or without the gem count) · everyone
- [x] 67. [lab] Late game: the horde gets stronger and faster from 20:00 and exponentially past 30:00 (Megabonk-style), so endless runs end even with a strong build · Lab (59abc01e)
- [x] 68. [lab][bug] Late bosses (boss slots, rift and wild legendaries) were one-shot at 45:00: HP that keeps up with the team's damage, a per-hit cap, harder hits · Lab (f782e412)
- [x] 69. [lab] Eternatus raid harder: someone beat it without breaking the obelisks; obelisks must matter, phases · Lab (900fd198)
- [x] 70. [lab][coop] A second raid at 45:00, like Eternatus's but with its own mechanic, solo and co-op · Lab (944646e8, Necrozma)
- [x] 71. [lab][coop] Rare map sites from 20:00 (temples, dungeons): travel there and fight a strong guardian with a mechanic; rewards that help the run; solo and co-op · Lab (23c531f0)
- [x] 72. [ui] English review: every text in menus, runs, moves, items and Pokémon names in correct, natural English ("Choose de Partner", Spanish names like Bramaluna for Roaring Moon, "Fill with the commonest") · everyone (7056b24, d7afdd2, d0fe4b3)
- [x] 73. [feat][ui] Trading Pokémon between friends: a request from the main menu (popup like a party invite), a window to search, filter and pick, both offers shown, Lv. 1 stats on hover, both confirm + a 3 s countdown either can stop, a chat; traded Pokémon arrive without upgrades or TMs; no duplicates, nothing lost on reload or leaving · everyone (dd0e39d; the firestore.rules "trading" part must be deployed before it works live)
- [x] 74. [bug][ui] Collection: every Pokémon's cell shows the form you use (shiny or radiant), not only the partner's; you had to click it to see its shiny · everyone (ccbd25d)
- [x] 75. [bug][ui] Tall menus overlap the main menu's top bar (coins, tickets, user): a screen taller than the space below the bar must sit under it or scroll, never cover it · everyone (094b9e9)
- [x] 76. [lab] Flying types fly over water without the movement speed penalty · Lab (a2d8c7c)
- [x] 77. [ui] Audio plays only while the tab is open and focused (silent in a background tab or another window) · everyone (e2575a2)
- [x] 78. [lab] A berry from the level-up rewards that would heal past max HP gives the rest as Overhealth, which can't be regenerated once lost · Lab (18a70ea)
- [x] 79. [ui] The player's health bar in the top left of the HUD, next to their Pokémon's name · everyone (b7e7c26)
- [x] 80. [ui] A level-up reward popup soon after another one opens without the delay before you can pick · everyone (d172b67)
- [ ] 81. [lab] Ancient Temple (Regigigas and the other Regis): the rune plates take about as long to light as a revive · Lab

## Phase 1: fixes and cheap tuning

### Workflow
- [x] 1. [infra] E1: `fork/pw.cjs` finds Playwright by absolute path; a port per worktree (`fork/serve.cjs`); the build skips `.claude/` (4d74db6)
- [x] 2. [infra] E1: start-of-session worktree rule and E3 standing decisions in `CLAUDE.local.md` (4d74db6)
- [x] 3. [infra] E2: this file, `/intake`, `/notes` (the idle `/loop` stops by itself and dies with its session) (477978d)

### Kecleon, natures, abilities (stream D)
- [x] 4. [lab][bug] D1: Lab's `poolFor` wrapper forwards `natural`; D10: Lab pools scored on `G.DEX_BY[dex]`, not the nature-modified copy (d31e433)
- [x] 5. [lab][bug] D2: one ability resolver (resolver A): Lab's version of upstream's rolled/capsuled ability, never both (687ca1f)
- [x] 6. [lab][bug] D3: evolution keeps nature and ability slot, re-resolves the ability (00d69c5)
- [x] 7. [lab][bug] D4: taught TMs join the Lab pool, pause list and Lab start picks (b1637f3)
- [x] 8. [lab] Pool bloat: bans 3 → 5, TM cards weighted lower until two slots are filled (adc25bd)
- [x] 9. [lab][bug] D5: second starting move gets a Lab twin (`save.pstartLab2`) (6496928)

### Close range (stream A)
- [x] 10. [lab] A1.1: spin, dash and recoil get the 25 % close-range cut (3e77ed1)
- [x] 11. [lab] A1.2: 0.5 s relocation grace after dash/leap/recoil/roll that hazards can't bypass (3e77ed1)
- [x] 12. [lab] A1.3: leap invulnerability `dur + 0.6`, blast on landing (3e77ed1)
- [x] 13. [lab] A1.4: recoil self-damage capped per second (8 % max HP/s), half refunded on a KO (3e77ed1)
- [x] 14. [lab] A1.5: ramp stacks decay one per 1.5 s; roll approach capped at 30 px, skipped when walking away (3e77ed1)
- [x] 15. [lab][bug] A1.6: melee aims at the nearest enemy in reach (boss only when in reach) (333bd61)
- [x] 16. [lab][bug] A1.7: movers never fire at rocks or chests (333bd61)

### Run structure (stream C)
- [x] 17. [feat] Legendary upgrade card ×3 → ×2 (`js/fork/card-rarity.js`, everyone) (d920725)
- [x] 18. [lab] C1.1: boss slots after 15:00 (18, 21, 24, 27, then every 3 min past 30 in endless) (38b813c)
- [x] 19. [lab] C1.2: XP per kill keeps pace after 8:20 (a1051fe)

## Phase 2: control and identity (Lab)

### Close range (stream A)
- [x] 20. [lab] A2 policy (a): mobility moves go the way you walk (else the aim), hit along the line, return you to the start (878f68c)
- [x] 21. [ui] A2.4: "Mobility moves fire by hand" setting (Accessibility, off by default) (293c9d2)
- [x] 22. [lab] A3: pivots (U-turn, Volt Switch, Flip Turn, Parting Shot), Flame Charge, leaps (Fly/Bounce, Dig/Dive, Phantom Force), melee traits, Counter/Mirror Coat/Metal Burst as Aegis (290c83a)
- [x] 23. [lab] A4: survival-lab rows for every change; targets Karate Chop ≥ 200 s, Quick Attack ≥ 180 s, no close build < 150 s (545f41c; targets not met, see 24)
- [ ] 24. [feat] G12: once 23's targets are met, promote the Phase 9 close-range kit and the spin/dash/recoil cut to normal runs (stream A: not promoted, 23's targets not met after tuning: Karate Chop 174 s, Quick Attack 148 s, 12 close builds under 150; numbers in fork/LAB.md "Close range and mobility")

### Move diversity (stream B)
- [x] 25. [lab] B1: honest evolutions (Future Sight, Stealth Rock, Venoshock, Belly Drum, Avalanche, Endeavor, Tailwind) (009bec2)
- [x] 26. [lab] B1: the 26 field-less moves get one field each (spins and shoves first) (983bb1d)

## Phase 3: builds

### Move diversity (stream B)
- [x] 27. [lab] B2: branching upgrades at level 3 (1ddbefb)
- [x] 28. [lab] B3.1 mark + detonate (9944067)
- [x] 29. [lab] B3.2 persistent hazard fields (370e8a7)
- [x] 30. [lab] B3.3 status converters (3f8cb11)
- [x] 31. [lab] B3.4 trade-off buffs (c6aa396)
- [x] 32. [lab] B3.5 decoy / aggro (15a3c31)
- [x] 33. [lab] B3.6 Taunt / Attract (ed31289)
- [x] 34. [lab] B3.7 combos (dd47f73)
- [x] 35. [lab] B4: set bonuses (c6ef6dc)
- [x] 36. [lab] B4: synergy cards (22e17dc)
- [x] 37. [lab] B4: bond recipes (6567ff1)

### Run structure (stream C)
- [x] 38. [lab] C1.3: elite affixes (Shielded, Swift, Vampiric, Splitting, Explosive) (1490485)
- [x] 39. [lab] C1.4: late-hand decisions (Speed 9+ / Reflexes 11+ for max HP; post-cap EV card with auto-pick) (3e6818e)
- [x] 40. [lab] C1.5: per-Pokémon contracts (5e16f22)

### Kecleon (stream D)
- [x] 41. [ui] D6: the ability shown in every run (594605a)
- [x] 42. [lab] D7: Kecleon sells Lab TMs with Lab on (9th daily slot); taught Lab moves stay Lab-only (961d802)
- [x] 43. [infra] D11: `fork/test-kecleon.cjs` (buy mint/capsule/TM in the real UI, teach, run with it) (961d802)

## Later (phases 4-5, not started)

C2.6 endless regime (Lab, then normal as a choice at 30:00) · C2.7 seals, with C2.8 Hyper as a preset ·
C2.9 pick-your-rift + gem shop · D9 training view (half-price mints in Lab, candy on the card and in
the ledger) · B3.8-B3.15 · B5 · C3 daily seed, biome threats, quests/mastery · E4 test tiers ·
heal cap only if upstream merges PR #276.
