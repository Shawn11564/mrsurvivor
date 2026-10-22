#!/usr/bin/env node
// The picture shown when someone pastes a MrSurvivor link (Discord, WhatsApp, X...): 1200×630,
// English, our name and domain. Upstream's assets/og-image.jpg says PokéSurvivor, in Spanish, with
// their domain; fork/english.cjs points every page's og:image / twitter:image at this one instead.
//
//   python -m http.server 8123          (in the repo root)
//   node fork/make-og-image.cjs [base-url] [--dex=25] [--seconds=12] [--approach=3.5]
//
// Plays a real run in headless Edge (dev.html, as a guest, the partner can't be hurt) until the
// hordes come in (bursts from every side, taken `approach` seconds later while they close in; they
// take a tenth of the damage so they stay on screen), takes the canvas without the HUD, with the partner low in
// the frame, and lays the title over the top with the game's font and the wordmark's colours
// (css/brand.css). Writes assets/fork/og-image.jpg; rerun it to refresh.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const { BRAND } = require('./brand.cjs');
const { OG_IMAGE } = require('./english.cjs');

const ROOT = path.join(__dirname, '..');
const BASE = process.argv.slice(2).find(a => !a.startsWith('--')) || require('./pw.cjs').BASE;
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
const DEX = arg('dex', 25), SECONDS = arg('seconds', 12), APPROACH = arg('approach', 3.5);
const W = 1200, H = 630;
// The camera keeps the partner in the middle of the canvas: a canvas twice as tall, cropped so the
// partner stands at PARTNER_Y, below the title.
const PARTNER_Y = 470, TOP = H - PARTNER_Y;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: W, height: 2 * H }, serviceWorkers: 'block' })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); } catch (e) { /* nada */ } });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(dex => {
      const s = G.DB.save; s.owned[dex] = { at: Date.now() }; s.partner = dex; s.starter = dex; G.DB.commit(); G.Flow.goMenu();
      G.Game.startRun(null, { dex, shiny: false });
    }, DEX);
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    // The partner can't fall, level-up cards don't stop the run, and the HUD isn't drawn.
    await page.evaluate(() => {
      const p = G.Game.player;
      (function alive() { p.invuln = 99; p.hp = p.maxHp; requestAnimationFrame(alive); })();
      G.HUD.draw = () => {};
      const hurt = G.Enemy.prototype.hurt;
      G.Enemy.prototype.hurt = function (amount, ...rest) { return hurt.call(this, amount * 0.1, ...rest); };
      setInterval(() => {
        for (const id of ['scr-levelup', 'scr-item', 'scr-bond']) {
          const c = G.UI.isOpen(id) && document.querySelector(`#${id} .card`);
          if (c) c.click();
        }
      }, 200);
    });
    await page.waitForTimeout(SECONDS * 1000);
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    await page.evaluate(() => { for (let i = 0; i < 5; i++) G.Spawner.burst(14); });
    await page.waitForTimeout(APPROACH * 1000);
    const shot = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
    await page.setViewportSize({ width: W, height: H });

    const font = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', 'PixelifyPS-700.ttf')).toString('base64');
    await page.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: Px; src: url(data:font/ttf;base64,${font}); }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #0c111b; }
      body { background: url(${shot}) 0 -${TOP}px / ${W}px ${2 * H}px no-repeat; font-family: Px, sans-serif; image-rendering: pixelated; }
      .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(12,17,27,.82) 0%, rgba(12,17,27,.7) 52%, rgba(12,17,27,.3) 70%, rgba(12,17,27,.3) 82%, rgba(12,17,27,.75) 100%); }
      .txt { position: absolute; left: 0; right: 0; top: 70px; display: flex; flex-direction: column; align-items: center; text-align: center; }
      h1 { margin: 0; font-size: 150px; line-height: 1; color: #8cc6ff; text-shadow: 6px 6px 0 #24508a, 12px 12px 0 #0c111b; letter-spacing: 2px; }
      .sub { margin-top: 30px; font-size: 44px; color: #e6f0fb; letter-spacing: 3px; text-shadow: 3px 3px 0 #0c111b; }
      .tag { margin-top: 18px; font-size: 32px; color: #79b8ff; text-shadow: 3px 3px 0 #0c111b; }
      .dom { position: absolute; left: 0; right: 0; bottom: 28px; text-align: center; font-size: 36px; color: #fff; text-shadow: 3px 3px 0 #0c111b; }
    </style></head><body><div class="veil"></div><div class="txt">
      <h1>${BRAND.name}</h1>
      <div class="sub">SURVIVE THE POKÉMON HORDES</div>
      <div class="tag">Free · Browser and mobile · Co-op for up to 4</div>
    </div><div class="dom">${BRAND.domain}</div></body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const ok = await page.evaluate(() => document.fonts.check('150px Px'));
    if (!ok) throw new Error('the game font did not load');
    const out = path.join(ROOT, OG_IMAGE);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`wrote ${path.relative(ROOT, out)} (${W}×${H}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
