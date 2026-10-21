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
| `radiant-kit/index.html` | the Radiant Sprite Kit page (`/radiant-kit/`, linked from the admin menu's Tools): search a Pokémon and download its default sheets in a .zip laid out for the artist: one folder per Pokémon, `assets/0150_mewtwo/` (Lab sheets in `lab/`, the Mega in `mega/`, ticked by default), with `README.txt` (the rules) and `CREDITS.txt` |
| `fork/asset-admin.cjs` | **Asset Admin**, for us and the artist (`fork/ARTIST.md`): double-click `fork/Asset Admin.bat` / `.command`, or `node fork/asset-admin.cjs`. A page on this PC only (127.0.0.1, random key in the link), never on the site, with three tabs: **Gallery** (`fork/asset-gallery.cjs`: every PNG in `assets/pokemon` and `assets/icons`, and every icon `G.Icons` draws with code; download, upload new versions by name or onto a file (any image, renamed and turned into a PNG), staged with old and new side by side, then **Apply** writes them into the checkout), **Radiants** (`fork/radiant-admin.html`) and the **Sprite Kit**. One **Publish** for all of it commits only the files the tool manages and pushes main. It syncs with GitHub at start (the page is locked until it's done), every minute and before publishing, merging the version lists when both sides changed them; a file changed on both sides stops it, naming the file, with an Undo. Who can publish: whoever can push to the repo (its collaborators with write access) |
| `fork/radiant-admin.cjs` | the Radiants tab's side of the Asset Admin (`node fork/radiant-admin.cjs` opens it on that tab): drop the artists' zips, see every Pokémon in them checked (the importer's code) with an animated preview of each sheet, normal next to radiant, pick which to import and each one's rarity (its weight in the ritual, with the resulting odds), change the rarity of radiants already in. Players get them once Pages has deployed, with no rebuild (below). A sheet imported over an old one gets a new hash in `asset-rev.json` |
| `js/fork/asset-overrides.js` | the game side of the Asset Admin, read when the game loads (no rebuild): `js/fork/asset-rev.json` (swapped files: asked for with `?v=<hash>`, because `sw.js` keeps art forever) and `js/fork/icon-overrides.json` (a PNG in `assets/icons/code/` instead of a code-drawn icon, at the same size). Both are checked before use |
| `fork/import-radiant.cjs` | `node fork/import-radiant.cjs <zip or folder>... [--dry-run] [--strict]` brings the artist's recolours in: reads the dex from the folder name (`0150_…`, any wrapper folder, several Pokémon per zip, the Kit's older `assets/pokemon/{dex}/r/` layout too), checks every sheet against the normal one (missing or wrong-size sheets turn that Pokémon away; a changed outline, with the frame's cell, or an unrecoloured sheet is a warning), copies them to `assets/pokemon/{dex}/r/`, `r/lab/`, `m{dex}/r/` and runs `fork/radiants.cjs`. Then build, try it, commit and push: that is how a radiant ships |
| `fork/radiants.cjs` | finds the radiant forms in `assets/pokemon/{dex}/r/` (every standard sheet, each the size of the normal one; `r/lab/` and `m{dex}/r/` optional) and writes `js/fork/radiant-list.js` (bundled) and `js/fork/radiants.json` (the same list, which the game also reads when it loads and when the ritual opens, so a published radiant works without a rebuild), each with its rarity (kept from `radiants.json`, else the Pokémon's). `fork/build.cjs` runs it; it prints what it leaves out (`--strict` fails instead) |
| `js/fork/radiant.js` | radiant forms: a third variant (Normal / Shiny / Radiant in the menu and the collection), played in runs and seen in co-op. The **Radiant Ritual** (main menu) sacrifices 10 shinies you choose for one radiant at random from all of them, weighted by each radiant's rarity (`WEIGHT`: Common 40, Uncommon 25, Rare 15, Epic 7, Legendary 3), revealed with the gacha's single-ticket slot machine (`js/ui/slots.js` in `#pull-fx`), its reels stopping on that rarity's ball, then the radiant's card, warns (and asks to confirm) before a shiny legendary goes, and gives 3000 coins for one you already have. Hooks: one line each in `js/ui/menu.js`, `merge()` in `js/core/db.js` (a sacrificed shiny doesn't come back from another device's copy) and the reload-safe screens in `js/core/updater.js`. English only, like Lab mode |
| `js/fork/radiant-glow.js` | the **Radiant glow** slider (Settings > Graphics, 0-100 %, 10 % by default; `G.Settings` `radGlow`, with a preview): radiants glow in their standout colour, the one the vibrancy vote picks for their moves (`G.LabShiny.paletteFrom`, `fork/LAB.md` Phase 7). Each radiant sheet gets two blurred masks once (that hue counts fully, the rest of the body a little): a halo under the sprite and additive light over it. Wraps `Animator.draw`, so the run, co-op, menus and the ritual all get it; at 0 % it draws exactly as before. Hook: one line in `js/ui/settings-ui.js` |
| `js/fork/ui-scale.js` | the interface sized to the screen: scale k = screen ÷ 1400×850 (1 up to that, as before; ≈1.27 at 1080p, ≈1.69 at 1440p, ≈2.5 at 4K, 3 at most). The canvas HUD is drawn with `ctx.scale(k)`, and while it draws, the mouse, drag, safe area and camera map into its coordinates and the touch buttons it registers map back to CSS px. The HTML (menus, cards, top bar, toasts) gets CSS `zoom` (`--ui-k`) on everything under `<body>` except the game canvas and the touch-layout editor (`#scr-layout`, which places its pieces in window px). Wraps `G.HUD.draw` outermost, so it loads after the other HUD wrappers |

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

`node fork/test-guest-save.cjs` (server + Firebase emulator; `node fork/build.cjs` first, its last
step plays the built `index.html`) checks guest progress (`js/fork/guest-save.js`, one-line hooks in
`commit`/`playAsGuest` of `js/core/db.js`, `safe()` of `js/core/updater.js`, the guest's log-out in
`js/ui/menu.js` and `js/ui/settings-ui.js`). Upstream kept it only in memory, so any reload, an update's
included, lost it. Here it stays in this browser (`ms.guest`): a reload, and the updater's, lands back on
the menu as the same guest; signing up or logging in moves it to the account (`G.DB.adopt`: a new account
becomes the guest's save, an existing one gains its Pokémon, tickets and the coins earned above the 500 it
started with, never fewer) and the copy is used up. A browser that can't keep the copy isn't reloaded by
the updater (except a forced version) and still warns before logging out.

`node fork/test-shiny-gacha.cjs` (server + Firebase emulator) checks shiny by default: a Pokémon
you have the shiny of shows and plays shiny unless you picked Normal for it, which the save keeps
(`save.shinyOff`, `js/fork/shiny-pref.js`, used by `js/ui/menu.js`), and the gacha: Legendary
0.15 % a pull, soft pity from pull 180 (+2 percentage points a pull, taken from the other rarities in
proportion; `SOFT_PITY`/`SOFT_STEP`/`legendRate`) and pity at 220 (`RATES`/`PITY_5` in `js/systems/gacha.js`;
the odds screen's lines, `js/ui/gacha-ui.js`, are translated in `js/fork/gacha-text.js`).

`node fork/test-radiant-kit.cjs` (server) checks the Radiant Sprite Kit: search by name, number, type, rarity and
"mega"; each Pokémon's rarity (the game's colours); the .zip's names and bytes (`0006_charizard/`, with and without its Mega, Bulbasaur) and its README; every species'
list against the sheets on disk, and that the importer reads each name back to the right Pokémon.

`node fork/test-asset-admin.cjs` checks the Asset Admin with its real server, in a throwaway copy of the repo with a bare `origin`, a second clone as the other person and an unrelated change: the key, this PC's name and the page's own origin; nothing outside `assets/`, `js/` and its pages is served; the page is locked (and changes refused, 423) until the first sync; the gallery, both other tabs; download names and bytes; uploads by name (wrong size, no match and the Sprite Kit's layout refused with the reason), onto a file and as a JPG (renamed and turned into a PNG); code icons (×4 download, a ×4 PNG staged, a wrong size refused); apply (files, hashes, the icon's entry); the other person's publish brought in with both lists merged; publish (only the tool's files, the message, pushed); a push refused because they got in first, then synced and pushed again; a file changed on both sides (stops, named, Undo); Undo from the changed files; back to the code drawing.

`node fork/test-asset-overrides.cjs` (server) checks the game side on `dev.html`: a swapped sheet asked for with `?v=` (also one asked for before the list came in), code icons from their PNG (html, url, CSS, draw at the same place and size, a Lab card's badge), bad entries ignored, and with the service worker the new version fetched and kept as its own entry.

`node fork/test-radiant-admin.cjs` checks the Radiant Admin page (the Asset Admin's Radiants tab) with its real server, in a throwaway copy of the repo
that is its own git repo with a bare `origin` and an unrelated change: only the key and this PC's name get in; dropped
zips (Kit layout, older layout, a broken one) give the right cards; the preview draws normal and radiant frames;
rarities and the odds line; import writes the sheets and both lists; a rarity change from the table; publish commits
only the radiant files (the unrelated change stays) and pushes, and waits for a tick when other commits aren't pushed yet.

`node fork/test-radiant-prefs.cjs` (server) checks that a radiant you own beats its shiny by default (main menu, selector,
run, co-op card, the collection's detail and partner pick, and a shiny won after the radiant), that picking Shiny or
Normal is respected and kept, and the **Radiant** filter on the Pokémon screen (only your radiants, kept in `ms.dex`).

`node fork/test-ui-scale.cjs` (server; `SHOTS=<dir>`) checks the interface scale: at 1280×720 nothing changes; at
2560×1440 the HUD and the pages are ×1.69, the move slots' buttons are where they're drawn (a real hover shows the
tooltip, a real click switches move), a level-up card is bigger and a real click picks it, and the built `index.html`
zooms its pages but not the game canvas.

`node fork/test-radiant-glow.cjs` (server; `SHOTS=<dir>` for screenshots) checks the Radiant glow with the real radiant
Mewtwo: the slider (10% by default, kept after a reload), the glow's hue is the vibrancy vote's, 0% draws exactly the
plain sprite, 10% a mild halo and 100% far more, a real run's canvas (brighter around a radiant, unchanged around a
normal Pokémon), and the slider and preview on the built `index.html`.

`node fork/test-radiant-live.cjs` (server) checks the game side on `dev.html` with the built list empty: radiants from
`radiants.json` are in the pool with their rarities and odds, the roll follows the weights, one published while the game
is open shows up when the ritual opens, a run uses its `r/` sheets, and a missing `radiants.json` breaks nothing.

`node fork/test-import-radiant.cjs` checks the importer in a throwaway copy of the repo, on recoloured
zips made from the real sheets: the Kit's layout in a wrapper folder with two Pokémon (Lab and Mega placed,
a mismatched name and a missing Mega warned), the older layout, an unzipped folder; wrong-size and missing
sheets, unknown numbers and empty zips turned away with nothing written; a broken Mega left out on its own;
a moved frame named by its cell, an unrecoloured sheet, `--strict` and `--dry-run`.

`node fork/test-radiant.cjs` (server) checks radiants and the ritual on `dev.html` with a stand-in radiant list:
choosing 10 shinies, the legendary warning and its confirmation, the roll, the warning off, a duplicate,
no radiants yet; the cloud merge (sacrificed shinies stay gone); the Normal / Shiny / Radiant selector in the
menu and the collection; radiant in a run (and its Mega) and on the co-op lobby card; and the ritual on the
built `index.html`.

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

`node fork/test-coop-seat.cjs` (server + Firebase emulator) checks that changing your Pokémon while in
a room reaches the others at once: a partner, shiny or radiant picked in the menu or the collection is
saved with `G.DB.commit`, which `js/fork/coop-random.js` wraps to update your seat when it no longer
matches (`G.Social.mine`). Before, the others saw your old Pokémon until the run after next. It also checks
that a radiant flag is cleared when you switch away (`rad: null` in `mine()`), that the lobby card shows
radiants (`js/ui/social-ui.js`), and that a host starting while you're in the collection plays you as the
new one. `node fork/test-party-reload.cjs` covers the rejoin after a reload (`resume()` in
`js/net/social.js`: its seat variable used to hide `mine()`, so a reloaded player never got back in).

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
- evolved moves renamed so none reuses a real move's name (`js/fork/evo-names.js`): upstream names
  23 evolutions after moves that are real Lab moves here, 11 of them signatures (Fire Spin → Sacred
  Fire, Thunder Wave → Volt Tackle, Ominous Wind → Shadow Force...). Each now takes another real move
  of its type the game doesn't use (Fiery Dance, Electroweb, Infernal Parade...), with official names
  in every language (PokeAPI); only the name changes. Fly's Lab evolution is Dual Wingbeat, not Sky
  Attack (`lab-moves.js`). `fork/build.cjs` applies the names to the site pages too. Checked by
  `fork/test-shadow-force.cjs` (no evolved name matches a Lab move)

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
