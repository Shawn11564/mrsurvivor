# Existing Lab content promoted to the main game

Requested by the owner on 2026-10-25. This promotes implemented features only; unfinished design
ideas in older Lab plans are not new commitments.

Every solo and co-op run now uses the existing Lab gameplay registry. The old device setting no
longer gates runs or menu features. Internal names, candy saves and starting-move picks stay
compatible. New runs use ordinary progression and leaderboard routing; explicitly tagged old
queued Lab records retain their category, and earlier scores remain under Lab archive.

## Inventory

- Species learnsets, coverage, signature moves and animations; one ability per run.
- All implemented move kinds, movement traits, close-range protection, move identity, status
  converters, marks, persistent hazards, trade-off boosters, decoys, taunt, attract and combos.
- Branches, sets, synergy cards, bond recipes and co-op support moves.
- Evolution, Everstone, Eviolite and species items, underdog XP, candy and candy stat points.
- Contracts, gems, upgrade reset, Upgrade all, extra daily TMs and the promoted starting pickers.
- Shiny/radiant extras, missing-Legendary pull selection, revive cards, Overhealth and run resume.
- Wild legendaries, Mega/Primal rifts, boss slots, XP pace, elite affixes, boss power scaling,
  endless level-up rewards, threat scaling, sites, relics, Eternatus and Necrozma.
- Normal missions, achievements, records, stats and regular solo/group leaderboard submissions.

The Lab switch, Experimental tab and Lab-only player notices have been retired. The existing
100-gem prestige cost now applies to everyone; this is recorded as a nerf in the change log.

## Verification

Use an isolated server to avoid other sessions' listeners:

```powershell
$env:TEST_PORT = '8188'
node fork/serve.cjs
# In another terminal with TEST_PORT set to the same value:
node fork/test-promotion.cjs
node fork/test-promotion.cjs --release
node fork/test-promotion-ranking.cjs
node fork/test-gameplay.cjs
node fork/test-builds.cjs
node fork/test-lab-mech.cjs
node fork/test-builds-coop.cjs
node fork/test-lab-support.cjs
node fork/test-eternatus.cjs
node fork/test-necrozma.cjs
node fork/test-english.cjs --no-walk
node fork/test-changes.cjs --no-page
```

The promotion test starts through the real Play button with the saved Lab preference off, checks
signature pools, normal end-run stats, achievement credit and resume. The release check uses the
actual sealed production bundle through its UI, including candy, gems, ability HUD and pause pool;
it also asserts that `window.G` stays private. Co-op build/support checks run with the host's old
preference off. Ranking checks use the real Firebase SDK and local emulator rules.

The isolated server's edited registry, shiny module, badge module and production bundle were
compared byte for byte with disk. After incorporating the latest main (including bursting Spikes
and the Requests panel), the rebuilt release is `46f2c0c1c8`.

Passed: promotion source and sealed release UI, standard end-run stats and achievement credit,
ranking routing and the four-hour boundary, the full gameplay harness, builds, move mechanics,
co-op builds, co-op support, both raid suites, English checks and change-log coverage.

Separate existing check limitation: `node fork/test-sync.cjs` fails before reaching the merge
exercise because its throwaway fixture omits `js/fork/en-names.js`, now read by `fork/english.cjs`.
No sync implementation was changed for this task. Older mode-isolation harnesses still describe
pre-promotion behavior; use the promotion regression for the current run-mode contract.

## Approved rule deployment

`fork/promotion-firestore.patch` records the approved, applied one-line change: raise the maximum
accepted regular-board run from 2,700 to 14,400 seconds, matching the existing Lab limit. All
ownership, ban, field, level, kill, timestamp and team checks stay unchanged. The emulator regression
first reproduced the old rejection, then confirmed that a one-hour regular run is accepted and
a score exceeding four hours is rejected after loading the approved rules.

The owner explicitly authorized applying the rule change and pushing. The Firebase CLI compiled
and released `firestore.rules` to project `mrsurvivor` successfully on 2026-10-25, before publishing
the game. The incoming Requests rules and all other validations were retained.
