# MrSurvivor (fork of PokéSurvivor)

MrSurvivor is a fork of [PokéSurvivor](https://github.com/JPTER78/pokesurvivor) by JPTER78,
used under the PolyForm Noncommercial License 1.0.0 (`LICENSE`, `LICENSE-NONCOMMERCIAL.md`).
It must stay free: no ads, no paid anything. The sprites are CC BY-NC 4.0 (`CREDITS.md`).

## The one rule: don't edit upstream files to rebrand

Upstream ships almost daily. Everything that makes this fork MrSurvivor lives in files
upstream doesn't have, so `git merge upstream/main` never touches it:

| File | What |
|---|---|
| `fork/brand.cjs` | name, domain, contact, credit lines, the find→replace rules |
| `css/brand.css` | mrshawn.dev colours, loaded after upstream's `style.css` |
| `fork/build.cjs` | runs upstream's build with the branding applied |
| `fork/sync.cjs` | merges upstream, rebuilds, commits |
| `.gitattributes` | generated files are `merge=ours`, so merges don't conflict on them |
| `js/core/firebase-config.js` | the one upstream file we edit (our Firebase project) |
| `fork/fetch-megas.py` | downloads the Mega/Primal sprites from SpriteCollab into `assets/pokemon/m{dex}/`, writes `js/fork/mega-sprites.js` and `CREDITS-MEGAS.md` (rerun it to pick up new Megas) |
| `fork/fetch-lab.cjs` | downloads PokeAPI's learnsets/abilities/evolutions and SpriteCollab's animation list into `tools/cache/lab/`, writes `js/fork/lab/lab-data.js` for Lab mode (rerun it when upstream adds moves) |
| `fork/fetch-lab-anims.py` | downloads the extra PMD animations Lab mode's signature moves use into `assets/pokemon/{dex}/lab/`, writes `js/fork/lab/lab-anims.js` and `CREDITS-LAB.md` |
| `fork/balance-lab.cjs` | measures every move's damage per second in headless Edge and writes `fork/BALANCE-LAB.md` (Lab mode, phase 8) |

To change gameplay, editing upstream's source (`dev.html`, `js/**`) is fine. Just keep
the edits small, because those lines can conflict when upstream changes them too.

## Commands

```
node fork/build.cjs          # build (replaces upstream's `node tools/build.js && …`)
node fork/sync.cjs           # pull upstream's updates, rebuild, commit
python -m http.server 8123   # play at http://127.0.0.1:8123/
```

Never run `node tools/build.js` directly: it writes an unbranded `index.html` and
`app.min.js`. If you do, `node fork/build.cjs` fixes it.

Play `index.html` (the branded build). `dev.html` is upstream's raw source page and still
says PokéSurvivor.

## Lab mode

Settings → Experimental → **Lab mode** tries moves and abilities still in testing:
each Pokémon gets the moves it learns in the games and one of its abilities, new kinds of moves
(Fly, Double-Edge, Protect, Hypnosis, Rain Dance, Surf, Metronome...), signature moves for 70
lines, evolving during the run, the games' items for weak Pokémon, candies from duplicates, shiny
move colours, and **Mega Evolution** (Lab only). In co-op the host's setting decides. Lab runs
keep coins, tickets and shinies, but don't count for leaderboards, missions, achievements or
records. The plan, the decisions and what's done are in [`fork/LAB.md`](LAB.md). The code is in
`js/fork/lab/`; `node fork/balance-lab.cjs` compares every move's damage.

## When a sync stops

- **Conflict:** you and upstream edited the same lines of a source file. Fix those
  files, then run `node fork/build.cjs`, `git add -A` and `git commit`. To back out,
  run `git merge --abort`.
- **"brand rules no longer match upstream":** upstream reworded a line the credit hooks
  into. Update that rule's `from` text in `fork/brand.cjs` and re-run the build.

## Check

`node fork/test-sync.cjs` replays a real upstream merge in a throwaway clone. It checks
that the merge has no conflicts, upstream's change lands, and the branding and credit
survive. Run it after changing anything in `fork/`.

`node fork/test-lab.cjs` and `node fork/test-lab-coop.cjs` (the co-op one also needs the
Firebase emulator) check Lab mode: see `fork/LAB.md`.

`node fork/test-cloud-backup.cjs` (with the server and the Firebase emulator running) checks the
cloud saves upstream left to the Save button: an unsaved change goes up by itself after 10 min
and when the tab is hidden (`js/fork/cloud-backup.js`), and every upload merges with the cloud so
two devices don't erase each other's progress (`pushNow` in `js/core/db.js`, a transaction again).

`node fork/test-shiny-gacha.cjs` (server + Firebase emulator) checks shiny by default: a Pokémon
you have the shiny of shows and plays shiny unless you picked Normal for it, which the save keeps
(`save.shinyOff`, `js/fork/shiny-pref.js`, used by `js/ui/menu.js`), and the gacha: Legendary
0.15 % a pull with pity at 220 (`RATES`/`PITY_5` in `js/systems/gacha.js`).

`node fork/test-coop-background.cjs` (server + Firebase emulator) checks that a co-op run keeps
going while the host's tab is hidden: the host's frames come from a Worker then
(`js/fork/coop-background.js`, `js/fork/tick-worker.js`) and `js/net/coop.js` no longer tells the
guests to wait. The host runs in a plain Edge over raw CDP, because Playwright makes every page it
drives look visible. `node fork/test-thief-arrow.cjs` checks the arrow to a Meowth/Gholdengo
thief says how far it is (`drawHud` in `js/systems/events.js`).

`node fork/test-coop-random.cjs` (server + Firebase emulator) checks "Random Pokémon" in a co-op
lobby: it rolls one of yours for that room without changing your partner (`js/fork/coop-random.js`,
`mine()` in `js/net/social.js`, `G.Flow.startCoop` in `js/game.js`), others see it, ready-up works as
usual (no changing while ready) and you play it in the run.

`node fork/test-remember.cjs` (with the server running) checks that Settings and
Missions/Achievements/Profile open on their last tab, and the Pokémon screen keeps its
generation, filters and sort, across reloads and runs (`js/fork/remember.js`, `dexSave` in
`js/ui/menu.js`; all in this device's localStorage, the search box isn't kept).

`node fork/test-gameplay.cjs` (with the server running) plays the game in headless Edge:
- the Power sort in the collection (`js/ui/menu.js`)
- the type-matchup arrows over enemies (`typeMark` in `js/entities/enemy.js`, arrows in
  `js/ui/icons.js`)
- the HUD tooltips, drag-to-reorder and hold-click aiming (`drawTip` in `js/ui/hud.js`,
  `drag`/`mapHeld` in `js/core/touch.js`, `swapSlots`/`handAim` in `js/entities/player.js`)
- the highlighted "your type" level-up cards (`own` in `js/systems/levelup.js`) and the
  "Good for you" note on stat boosts that match your Pokémon's stronger side (`boost`); the
  wording of both card notes: "Good for X: boosts its special moves…" and, for an attack on
  the weaker side, "Weaker for X: only N % damage (it's a special attacker)" (`fitNote`)
- the 3 s "Resuming…" countdown after the pause, with the world still frozen; Esc during it
  goes back to the pause (`resumeRun`/`drawResume` in `js/game.js`); Settings → Graphics →
  "Countdown after pausing" (`pauseCount`, texts in `js/fork/settings-text.js`) turns off only
  that one
- the level-up box keeping its width whatever the cards say (`#scr-levelup .box` in
  `css/style.css`): it used to size itself to the longest description on one line, so Hex
  stretched it across the screen
- the Upgrades screen opening on your current partner (`openUpgrades` in `js/ui/menu.js`)
- the random run under the partner card: only owned Pokémon at or above the chosen rarity,
  partner unchanged (`playRandom`/`renderRandom` in `js/ui/menu.js`, `pick` in `G.Game.startRun`)
- the gacha Skip button beside the slot machine's lever, on any window size (`#slot-wrap` in
  `css/style.css`, `js/ui/gacha-ui.js`, `G.Slots.stop` in `js/ui/slots.js`)
- the icon-size setting (`hudSize`) and the buff timers on their slots (`buffLeft` in `js/ui/hud.js`),
  and the ring at the player's feet draining with the buff's time left (`Player.draw`)
- the solo end-of-run breakdown (`js/fork/run-stats.js`)
- the small "Critical" label over a crit's damage number (`tag` in `G.FX.dmgText`, set in
  `Enemy.showHurt`), so a crit isn't mistaken for a super-effective hit; burn and poison ticks
  never get it
- the very rare "Second Nature" level-up card (`js/fork/rare-cards.js`, about 1 hand in 500, only
  if you have a stat-boosting move, once per run): those moves (Swords Dance, Nasty Plot,
  Agility...) cast on their own from any slot, as if always active (`pl.passiveBuffs` in
  `Combat.tick`; the HUD stops asking you to switch to them). Purple via `.card.rare` in
  `css/brand.css`
- no Mega Evolution outside Lab mode (`js/fork/mega.js`; the Mega checks are in
  `fork/test-lab.cjs`): with Lab off, no "can Mega Evolve" marks, a won rift never offers the
  stone and holding one does nothing
- the 3 s countdown also after picking a bond or an item (`countIn` in `js/game.js`); after a
  rift, the purple flash fades while you pick (it used to stay on screen through the
  countdown) and a second bond opens at once, with one countdown at the end (`bondBusy`)
- the markers to what you can't see (`js/fork/markers.js`, used by `js/ui/hud.js` and
  `js/systems/events.js`), on a 1920×1080 window: on an ellipse around your Pokémon (at most
  440 × 300 px, pointing straight at the target) instead of the far edges; something new off
  screen (a shiny here) pulls them all next to your Pokémon for 2 s; F (Y on a controller) does
  the same while held, or toggles it with Settings → Controls → "Press to switch" (`markerKey`)
- stat moves evolving at their top level with no stat card needed (Swords Dance → Belly Drum,
  `EVO`/`EVO_MODS.buff` in `js/data/moves.js`, texts in `js/fork/buff-evos.js`): evolved, they
  cast on their own from any slot (`m.passive` in `Combat.tick`)

Pass a folder as the second argument to save screenshots, and `TEST_VIEW=1920x1080` to
change the window size.

`node fork/test-moves.cjs` (with the server running) casts moves through the real combat code
in headless Edge:
- every move that burns, poisons, slows or stuns really leaves that state on the enemy
- Hex does ×1.7 to a burned, poisoned, slowed **or stunned** (paralyzed, frozen...) foe
  (`hasStatus` in `js/systems/combat.js`)
- every upgrade step changes the stat it names, and "+1 projectile" adds a fanned shot on
  moves that don't list a `count` (Shadow Sneak, Seed Bomb...: `BASE` in `applyMods`,
  `js/data/moves.js`); with several shots, one always flies straight at the target and the
  rest fan out to the sides (`fanOff` in `js/systems/combat.js`, projectiles and boomerangs)
- the charge ring over your Pokémon for long-wait moves (vortex, turret, charge): fills while
  it recharges, glows during Hyper Beam/Solar Beam's wind-up, flashes on firing
  (`js/fork/charge-meter.js`)
- the buff timer on a slot never shows more than is left and doesn't jump (`buffSecs` in
  `js/ui/hud.js`); two buffs on one stat don't cut each other's time (`Player.addBuff`)
- the move tooltip says what it hits with and what boosts it, and the fixed English move
  descriptions (`js/fork/move-text.js`)
- with the Firebase emulator up (`NO_COOP=1` skips it): a guest's Hex gets the bonus on a foe
  the guest slowed, and the guest sees its stuns (status bits 8/16 in `enemyList`,
  `js/net/coop.js`)

`node fork/test-import.cjs` (with the server running) checks importing a save from the
original PokéSurvivor (`js/fork/import-save.js`, `G.DB.adopt` in `js/core/db.js`). It uses
two origins of the local server: `localhost` plays the original site and `127.0.0.1` plays
MrSurvivor, both with Firebase blocked so no real cloud is touched. Set
`SLOW_FIREBASE=18000` to check it copes with a slow cold start. `fork/pw.cjs` holds the
helpers both tests share.

`node fork/test-coop.cjs` (with the server and the Firebase emulator running:
`npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database`) plays a
real three-player party in headless Edge, connected peer to peer. It uses the emulator, so no
real project is touched, and the real security rules. It checks:
- Ready Up and force start (`LobbyUI` in `js/ui/social-ui.js`, `G.Social.setReady`)
- spectating while down (`watched` in `js/game.js`, the downed-guest enemy list in
  `js/net/coop.js`)
- bonds opening for everyone at once (the host-only arena finish, `'af'`/`ra`, in
  `js/systems/rift.js`), and the 3 s countdown for everyone once the last one has picked
  (`hold` in `js/game.js`); with two bonds for one player, nobody counts down until that
  player's second is picked too (`bondBusy`/`choosing`, `G.Coop.holdSync`)
- "{name} is down!" on the others' screens when a teammate falls, with the markers gathering
  round (`js/fork/markers.js`)
- level-up cards: straight back to playing when picked within 10 s, the countdown for everyone
  when choosing took longer (`LONG_PICK`, `resume` in `js/game.js`)
- the end-of-run team summary and per-move breakdown (`js/fork/run-stats.js`)

`SHOTS=<folder>` saves screenshots.

`node fork/test-admin.cjs` (same emulator and server) checks the admin menu (`js/fork/admin.js`)
in a three-player party where the admin is a guest, so every action goes admin → host → everyone:
- only the admin gets the ADMIN button (bottom left) and the `` ` `` hotkey; typing in the panel
  doesn't walk your Pokémon; admin messages from anyone else are ignored
- body swap (Magikarp, any Pokémon, tiny, giant) on the target and on everyone's copy of them,
  wearing off after the chosen time; reverse controls, ice skates and slow-mo (`G.Admin.steer`,
  hooked in `Player.update`)
- zoomies and drunk walking; upside-down and mirrored screens (CSS on the canvas, undone when
  the run ends); yeet and bring-to-me teleports
- whole run, for everyone: freeze every enemy (stunned on the host, and on the guests' copies so
  touching them doesn't hurt), disco (colours, spotlights, confetti, everyone dances), lights out,
  earthquake, an invasion (every enemy looks like one Pokémon), Thanos snap and a piñata. Drawn
  through `G.Admin.beforeDraw`/`drawScreen` in `render()` (`js/game.js`)
- toggles: with "Until I turn it off" (the default), a lasting effect has no end
  (`G.Admin.ends()` gives `Infinity`); its button stays lit while it's on for the selected target,
  and clicking it lit turns it off (timed ones too). Run ends still clear everything
- fake shiny / legendary / game-over popups and big messages (HTML stays text)
- spawning a horde or any boss next to the target, made by the host and synced
- god mode (`Player.hurt`), drops and level-ups; any of these taint the run (`G.Game.taint`), so it
  isn't sent to the ranking, solo or group
- save edits: coins, tickets, any Pokémon or shiny
- a Mega Stone dropped next to a friend whose Pokémon has a Mega (Lucario): in a normal run it
  holds it and stays Lucario for everyone (Mega Evolution is Lab only; the Lab version is in
  `fork/test-lab-coop.cjs`)

The admin list is `ADMINS` at the top of `js/fork/admin.js` (Firebase Authentication → Users →
User UID). Everyone's game checks it, so a new admin needs a new release. The ranking's hidden
moderation screen (`G.Ranking.isAdmin`) uses the same list. The server's copy is `admin()` in
`firestore.rules` (an upstream file, the one line with the uid): change both, then deploy the rules.

`node fork/test-party-reload.cjs` (same emulator and server) checks that a party survives a
page reload (`resume`, `away` and `dropAway` in `js/net/social.js`): a guest and then the host
reload and land back in the same lobby, connected; leaving with the button stays left; someone
who closes the tab for good is dropped after the grace period, and a host who never comes back
has the room deleted by a guest (the rule for that is in `database.rules.json`; restart the
emulator, or PUT the rules to it, after changing them).

`node fork/measure-audio.cjs` (with the server running) measures how loud the game is at
the speakers with the default volume, and fails if any sound effect peaks above -8 dBFS or
the music or a run averages louder than -24 dBFS. It guards the defaults, the output gain
and the final limiter in `js/core/audio.js`. Run it after changing any sound.

`node fork/test-cloud.cjs` (with the server running) is the live check of the Firebase
project `mrsurvivor`. It signs up a throwaway account on the branded page, saves, reads
the save back in a fresh browser, then deletes the account. Run it after changing
`firebase-config.js`, the rules or the auth settings. Rules and indexes deploy with
`npx firebase-tools deploy --only firestore,database` (`.firebaserc` points at `mrsurvivor`).
