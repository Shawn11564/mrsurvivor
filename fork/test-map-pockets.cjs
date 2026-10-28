#!/usr/bin/env node
// No closed pockets on the map (js/world/world.js sealPockets), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (or python -m http.server 8123 in the repo root)
//   node fork/test-map-pockets.cjs [base-url]
//
// The rock noise used to ring a few floor tiles now and then: a room nobody could walk into,
// sometimes with a spring or a chest inside (about 7 in every 600×600 tiles).
//
//   1. 8 seeds, 320×320 tiles each, read through G.World.kindAt: every patch of ground (floor or
//      liquid, joined side to side) that doesn't touch the edge of the window is a closed pocket.
//      There must be none, and no interactive prop on a rock tile.
//   2. The rift arena (closed by design) stays open inside, and the map around it is the same
//      whether the arena opened before or after those chunks were made (co-op peers agree).
//   3. Making a chunk stays cheap.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.waitForFunction(() => G.World && G.Tiles && G.Tiles.ARENA_THEMES, null, { timeout: 30000 });

    // The map of tiles [x0, x0+W) × [y0, y0+W): 0 floor, 1 wall, 2 liquid.
    await page.evaluate(() => {
      const TS = 32, KIND = { floor: 0, wall: 1, liquid: 2 };
      window.__grid = (x0, y0, W) => {
        const g = new Uint8Array(W * W);
        for (let j = 0; j < W; j++) for (let i = 0; i < W; i++)
          g[j * W + i] = KIND[G.World.kindAt((x0 + i) * TS + 16, (y0 + j) * TS + 16)];
        return g;
      };
      // Closed patches of ground: [size, tile x, tile y] each.
      window.__pockets = (g, x0, y0, W) => {
        const lab = new Uint8Array(W * W), out = [];
        for (let k = 0; k < W * W; k++) {
          if (g[k] === 1 || lab[k]) continue;
          const st = [k]; lab[k] = 1; let n = 0, edge = false;
          while (st.length) {
            const q = st.pop(), x = q % W, y = (q / W) | 0; n++;
            if (x === 0 || y === 0 || x === W - 1 || y === W - 1) edge = true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
              const nk = ny * W + nx;
              if (g[nk] !== 1 && !lab[nk]) { lab[nk] = 1; st.push(nk); }
            }
          }
          if (!edge) out.push([n, x0 + k % W, y0 + ((k / W) | 0)]);
        }
        return out;
      };
    });

    console.log('1. No closed pockets');
    const W = 320;
    const scan = await page.evaluate(W => {
      const res = [];
      for (let s = 1; s <= 8; s++) {
        const seed = s * 104729 + 17;
        G.World.reset(seed);
        const x0 = -W / 2, y0 = -W / 2, g = window.__grid(x0, y0, W);
        const pockets = window.__pockets(g, x0, y0, W);
        // Interactive props standing on rock (they used to sit in pockets).
        let onRock = 0, specials = 0;
        for (const p of G.World.specialsNear(0, 0, W * 16)) {
          specials++;
          if (G.World.isWall(p.x, p.y)) onRock++;
        }
        res.push({ seed, pockets: pockets.length, first: pockets[0] || null, specials, onRock, walls: g.reduce((a, v) => a + (v === 1), 0) });
      }
      return res;
    }, W);
    for (const r of scan) check(r.pockets === 0 && r.onRock === 0 && r.walls > 1000, `seed ${r.seed}: no closed pockets, ${r.specials} interactive props, none on rock`, r);

    console.log('2. The rift arena');
    const arena = await page.evaluate(() => {
      const seed = 104729 + 17, ax = 220, ay = 40, R = 14, W = 120, x0 = ax - W / 2, y0 = ay - W / 2;
      G.World.reset(seed);
      const before = window.__grid(x0, y0, W);           // made before the arena
      G.World.setArena({ tx: ax, ty: ay, r: R, type: 'dark' });
      const after = window.__grid(x0, y0, W);            // remade with the arena open
      G.World.reset(seed);
      G.World.setArena({ tx: ax, ty: ay, r: R, type: 'dark' });
      const fresh = window.__grid(x0, y0, W);            // made with the arena already open
      let differ = 0, inside = 0, open = 0;
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, d = Math.hypot(x0 + i - ax, y0 + j - ay);
        if (d >= R + 7 && (before[k] !== after[k] || after[k] !== fresh[k])) differ++;
        if (d < R - 1) { inside++; if (after[k] !== 1) open++; }
      }
      const centre = G.World.kindAt(ax * 32 + 16, ay * 32 + 16), south = G.World.kindAt(ax * 32 + 16, (ay + 4) * 32 + 16);
      G.World.setArena(null);
      return { differ, inside, open, centre, south };
    });
    check(arena.centre === 'floor' && arena.south === 'floor' && arena.open > arena.inside * 0.6, 'the arena is open inside (not sealed as a pocket)', arena);
    check(arena.differ === 0, 'the map around it is the same before and after the arena opens', arena);

    console.log('3. Cost');
    const cost = await page.evaluate(() => {
      G.World.reset(777);
      const t0 = performance.now(); let n = 0;
      for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) { G.World.kindAt(cx * 512 + 16, cy * 512 + 16); n++; }
      return { chunks: n, msPerChunk: +((performance.now() - t0) / n).toFixed(3) };
    });
    check(cost.msPerChunk < 3, 'a chunk takes under 3 ms to make', cost);

    check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
