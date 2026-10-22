#!/usr/bin/env node
// The arrow to a treasure thief (Meowth or Gholdengo running off with coins or a ×10 ticket) says
// how far it is, like the lost Pokémon's (drawHud in js/systems/events.js). Headless Edge, dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-thief-arrow.cjs [base-url]
//
// A real thief (the same def spawnThief builds) is put 20 m away, off screen; the HUD's text is
// read as it's drawn (the canvas's fillText) and must say "Gholdengo · 20 m".
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.DB.playAsGuest && G.Game, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(() => { G.DB.save.owned[4] = { at: Date.now() }; G.DB.save.partner = 4; G.Game.startRun(); });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 30000 });
    const label = await page.evaluate(() => new Promise(res => {
      const pl = G.Game.player;
      pl.hurt = () => {};
      const mon = G.DEX_BY[1000];
      G.Sprites.preload([1000]);
      const def = { dex: 1000, name: mon.name, behavior: 'thief', hp: 1e6, spd: 0, dmg: 0, xp: 10, loot: 'ticket10' };
      const e = new G.Enemy(def, pl.x + 20 * 32, pl.y, { hp: 1, spd: 1, dmg: 1 });
      e.life = 60;
      G.EnemyMgr.add(e);
      // edgeArrow draws with ctx.fillText (the translated path): watch the canvas itself.
      const P = CanvasRenderingContext2D.prototype, seen = [], o = P.fillText;
      P.fillText = function (s) { seen.push(String(s)); return o.apply(this, arguments); };
      setTimeout(() => { P.fillText = o; res({ name: mon.name, hit: seen.filter(s => s.startsWith(mon.name)).slice(-1)[0] || null }); }, 600);
    }));
    check(label.hit && new RegExp('^' + label.name + ' · (19|20|21) m$').test(label.hit), `the Gholdengo arrow says the distance ("${label.hit}")`);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll thief arrow checks passed');
  process.exit(failures ? 1 : 0);
})();
