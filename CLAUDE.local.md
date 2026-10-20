# MrSurvivor fork: these rules override CLAUDE.md

This checkout is **MrSurvivor**, Shawn's fork of JPTER78's PokéSurvivor. `CLAUDE.md` is
upstream's file and describes *their* release process and servers. Read `fork/README.md`.

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
