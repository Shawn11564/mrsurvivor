# MrSurvivor fork: these rules override CLAUDE.md

This checkout is **MrSurvivor**, Shawn's fork of JPTER78's PokéSurvivor. `CLAUDE.md` is
upstream's file and describes *their* release process and servers. Read `fork/README.md`.

## First thing in every session: one worktree per session

Before touching any file, read Command Center's session index
(`%APPDATA%\dev.thund.commandcenter\sessions\index.json`). If another session with `"live": true`
has this folder as its `cwd`, call `EnterWorktree` (a new worktree from `origin/main` under
`.claude/worktrees/`) and do all your editing, building, testing, committing and pushing there.
`node fork/serve.cjs` serves a worktree on its own port (8130-8189, from its path) and every
`fork/test-*.cjs` uses that port by default (`fork/pw.cjs`), with Playwright found without
`PLAYWRIGHT_DIR`. Building in a shared folder bundles the other session's unfinished `dev.html`
into `index.html`. Before you push, `git pull --rebase origin main`; if generated files conflict
(`index.html`, `js/app.min.js`, `version.json`, the site pages), resolve them either way, run
`node fork/build.cjs` again and add the result. Message the other session when you push.

## Standing decisions (the owner's, 2026-10-22): don't ask about these

- **Shipping:** each item is its own commit. Build, run the item's own check plus
  `fork/test-gameplay.cjs`, commit, and **push without asking**. Ask only when
  `firestore.rules` or `database.rules.json` changed: the owner deploys the rules.
- **Never end a session with commits that aren't pushed.**
- **Scope:** new gameplay systems go into Lab first; settings, UI and display go to everyone.
- **Questions:** one batch at the start of a list, never about shipping or scope. A cut-off or
  ambiguous line gets one question while the rest of the list goes ahead.
- **Work list:** `fork/TODO.md` (claim an item there before starting it, tick it with the commit
  hash). Memory holds decisions and gotchas only, not work lists.
- **Subagents:** `model: "opus"`, `"sonnet"` or `"haiku"` only, never Fable.

## Fork rules

- **Build with `node fork/build.cjs`, never `node tools/build.js`.** The fork build runs
  upstream's tools with the branding applied. Upstream's own build writes an unbranded
  `index.html`/`app.min.js`.
- **Don't edit upstream files to rebrand.** Branding goes in `fork/brand.cjs` (rules)
  and `css/brand.css` (colours), so merges stay conflict-free.
- **Pull upstream with `node fork/sync.cjs`.** After changing anything in `fork/`, run
  `node fork/test-sync.cjs`. It replays a real merge in a throwaway clone.
- Upstream's "Servidores" section (their Firebase project `pokesurvivor-free`, their
  Cloudflare domain) is not ours. Our Firebase config goes in `js/core/firebase-config.js`.
  `null` = local-only saves. Never point it at upstream's project. Never enable Identity
  Platform (it bills per user).
- Upstream's changelog rule (`js/data/changelog.js`) is for their releases. Don't add
  fork entries there, because it's a conflict magnet.
- License: PolyForm Noncommercial. No ads, donations or paid features. Keep the credit
  and the `Required Notice` line (fork/brand.cjs puts them in the legal screen).

## English first

English is MrSurvivor's primary and default language, for players and for the project.

- The game starts in English unless the player picks another language in Settings
  (`js/core/locales.js`). `fork/english.cjs` makes the site English during the build: the
  page head and link preview (with `assets/fork/og-image.jpg`), manifest, 404 and sitemap.
- Write everything new in English only: what players see, code comments, docs, commit
  messages. Don't spend time translating: no Spanish text, no new keys or rows in
  `js/data/lang-*.js` or `lang-updates.js`, no tables of other languages. Players who chose
  another language see fork text in English (the game falls back to English).
- To change what an upstream text says, add the English for its Spanish key in a fork file
  (`G.I18n.add({ 'Spanish key': 'English' }, 'en')`). Don't rewrite upstream's Spanish.
- The game runs everything it shows through its dictionary, English too, and the
  word-by-word pass changes English words that are also Spanish keys ("Tornado" → "Gust",
  "ranking" → "Leaderboard", "media" → "medium"). Protect such a text with an entry that
  maps it to itself (`G.I18n.add({ 'Leaf Tornado': 'Leaf Tornado' }, 'en')`).
- Upstream's own files (`CLAUDE.md`, `docs/`, `GDD.md`, the comments in their code) stay
  in upstream's Spanish: translating them would conflict on every merge.
- After touching text, the build or `js/core/locales.js`, run `node fork/test-english.cjs`
  (local server running; `--no-walk` skips the slow screen walk).
