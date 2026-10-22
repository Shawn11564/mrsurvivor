# MrSurvivor work list

The one work list (plan E2). Design and reasons: `fork/PLAN-2026-10-22.md` (its section G has the
owner's answers). Standing decisions: `CLAUDE.local.md` ("Standing decisions").

How to use it:
- Claim an item before starting it: put `(claimed: <session or agent>)` after it, commit, push.
- Tick it when it's pushed: `- [x] ... (abc1234)`.
- Tags: `[bug] [feat] [lab] [ui] [coop] [infra]`. `!` = do first, `[?]` = ask the owner first.
- New items from the owner's notes come in through `/intake` or `/notes`, at the end of "Inbox".

## Inbox

(empty)

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
- [ ] 18. [lab] C1.1: boss slots after 15:00 (18, 21, 24, 27, then every 3 min past 30 in endless) (38b813c)
- [x] 19. [lab] C1.2: XP per kill keeps pace after 8:20 (a1051fe)

## Phase 2: control and identity (Lab)

### Close range (stream A)
- [ ] 20. [lab] A2 policy (a): mobility moves go the way you walk (else the aim), hit along the line, return you to the start (claimed: stream A)
- [ ] 21. [ui] A2.4: "Mobility moves fire by hand" setting (Accessibility, off by default) (claimed: stream A)
- [ ] 22. [lab] A3: pivots (U-turn, Volt Switch, Flip Turn, Parting Shot), Flame Charge, leaps (Fly/Bounce, Dig/Dive, Phantom Force), melee traits, Counter/Mirror Coat/Metal Burst as Aegis (claimed: stream A)
- [ ] 23. [lab] A4: survival-lab rows for every change; targets Karate Chop ≥ 200 s, Quick Attack ≥ 180 s, no close build < 150 s (claimed: stream A)
- [ ] 24. [feat] G12: once 23's targets are met, promote the Phase 9 close-range kit and the spin/dash/recoil cut to normal runs (claimed: stream A)

### Move diversity (stream B)
- [ ] 25. [lab] B1: honest evolutions (Future Sight, Stealth Rock, Venoshock, Belly Drum, Avalanche, Endeavor, Tailwind) (claimed: stream B-moves)
- [ ] 26. [lab] B1: the 26 field-less moves get one field each (spins and shoves first) (claimed: stream B-moves)

## Phase 3: builds

### Move diversity (stream B)
- [x] 27. [lab] B2: branching upgrades at level 3 (1ddbefb)
- [x] 28. [lab] B3.1 mark + detonate (9944067)
- [x] 29. [lab] B3.2 persistent hazard fields (370e8a7)
- [ ] 30. [lab] B3.3 status converters (claimed: stream B-moves)
- [ ] 31. [lab] B3.4 trade-off buffs (claimed: stream B-moves)
- [ ] 32. [lab] B3.5 decoy / aggro (claimed: stream B-moves)
- [ ] 33. [lab] B3.6 Taunt / Attract (claimed: stream B-moves)
- [ ] 34. [lab] B3.7 combos (claimed: stream B-moves)
- [x] 35. [lab] B4: set bonuses (c6ef6dc)
- [x] 36. [lab] B4: synergy cards (22e17dc)
- [x] 37. [lab] B4: bond recipes (6567ff1)

### Run structure (stream C)
- [ ] 38. [lab] C1.3: elite affixes (Shielded, Swift, Vampiric, Splitting, Explosive) (1490485)
- [ ] 39. [lab] C1.4: late-hand decisions (Speed 9+ / Reflexes 11+ for max HP; post-cap EV card with auto-pick) (3e6818e)
- [x] 40. [lab] C1.5: per-Pokémon contracts (5e16f22)

### Kecleon (stream D)
- [ ] 41. [ui] D6: the ability shown in every run (claimed: stream D)
- [ ] 42. [lab] D7: Kecleon sells Lab TMs with Lab on (9th daily slot); taught Lab moves stay Lab-only (claimed: stream D)
- [ ] 43. [infra] D11: `fork/test-kecleon.cjs` (buy mint/capsule/TM in the real UI, teach, run with it) (claimed: stream D)

## Later (phases 4-5, not started)

C2.6 endless regime (Lab, then normal as a choice at 30:00) · C2.7 seals, with C2.8 Hyper as a preset ·
C2.9 pick-your-rift + gem shop · D9 training view (half-price mints in Lab, candy on the card and in
the ledger) · B3.8-B3.15 · B5 · C3 daily seed, biome threats, quests/mastery · E4 test tiers ·
heal cap only if upstream merges PR #276.
