#!/usr/bin/env node
// The collection grid shows each Pokémon in the form you use (js/fork/radiant.js cell), in headless Edge:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-dex-forms.cjs [base-url]
//
// Every sprite the page draws is tagged with the sheet it really drew (a spy on G.Sprites.Animator, which
// G.UI.spriteCanvas builds): radiant (a {dex}/r sheet), shiny or normal.
//   1. A guest owns Charmander (partner, shiny), Squirtle (shiny), Pikachu (shiny, Normal picked), Wooper
//      (radiant) and Quagsire (radiant, Normal picked). Searched by number, each cell shows the form its
//      detail card opens on: shiny, shiny, normal, radiant, normal. Before the fix only the partner did.
//   2. Changing the form in the detail card redraws that cell: Squirtle Normal, Wooper Normal, then Radiant.
//   3. The built index.html shows the same (the save from 1-2; G is hidden there, so a cell's pixels are
//      matched against the colours only its normal, shiny or radiant sheet has).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const open = async file => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.errs = []; page.on('pageerror', e => page.errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.goto(BASE + file, { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.Radiant && G.ShinyPref, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    await page.evaluate(() => {
      // The spy: the canvas G.UI.spriteCanvas returns gets the form of the Animator built for it.
      const A = G.Sprites.Animator; let last = null;
      G.Sprites.Animator = class extends A { constructor(d, sc, sh) { super(d, sc, sh); last = this; } };
      const sc = G.UI.spriteCanvas;
      G.UI.spriteCanvas = function () {
        last = null;
        const cv = sc.apply(this, arguments);
        if (last) cv.dataset.form = String(last.dex).endsWith('/r') ? 'radiant' : last.shiny ? 'shiny' : 'normal';
        return cv;
      };
      const s = G.DB.save;
      for (const d of [4, 7, 25, 194, 195]) s.owned[d] = s.owned[d] || { at: Date.now() };
      for (const d of [4, 7, 25]) G.DB.grantShiny(d, 'test');
      s.radiant = Object.assign(s.radiant || {}, { 194: Date.now(), 195: Date.now() });
      s.partner = 4; s.partnerShiny = true;
      G.ShinyPref.set(25, false);
      G.Radiant.set(195, false);
      G.DB.commit(); G.MenuUI.open();
    });
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await page.click('#scr-menu [data-go=dex]');
    await page.waitForSelector('#dex-grid .cell', { timeout: 15000 });
    return page;
  };
  // The form the cell for `dex` shows, found with the collection's own search.
  const cellIs = async (page, dex) => {
    await page.fill('#dex-q', String(dex));
    await page.waitForFunction(d => {
      const c = [...document.querySelectorAll('#dex-grid .cell')];
      return c.length === 1 && c[0].querySelector('.no').textContent.startsWith(String(d).padStart(3, '0'));
    }, dex, { timeout: 5000 });
  };
  const cellForm = async (page, dex) => { await cellIs(page, dex); return page.$eval('#dex-grid .cell canvas', c => c.dataset.form || '?'); };
  // The form a cell's pixels show (after cellIs): each coloured pixel votes for the sheet (normal, shiny s/,
  // radiant r/) with the nearest colour; a radiant is drawn tinted, so the nearest, not the same, colour.
  const pixelForm = async (page, dex) => {
    await page.waitForFunction(() => {
      const c = document.querySelector('#dex-grid .cell canvas'), x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < x.length; i += 4) if (x[i] > 250) n++;
      return n > 200;
    }, null, { timeout: 10000 });
    return page.evaluate(async dex => {
      const coloured = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) > 40;
      const pal = async url => {
        const r = await fetch(url); if (!r.ok) return null;
        const img = await createImageBitmap(await r.blob()), c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, img.width, img.height).data, set = new Map();
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250 && coloured(d[i], d[i + 1], d[i + 2])) set.set(d[i] + ',' + d[i + 1] + ',' + d[i + 2], [d[i], d[i + 1], d[i + 2]]);
        return [...set.values()];
      };
      const pals = { normal: await pal(`assets/pokemon/${dex}/Idle.png`), shiny: await pal(`assets/pokemon/${dex}/s/Idle.png`),
                     radiant: await pal(`assets/pokemon/${dex}/r/Idle.png`) };
      const c = document.querySelector('#dex-grid .cell canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const votes = {};
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] <= 250 || !coloured(d[i], d[i + 1], d[i + 2])) continue;
        let best = null, bd = Infinity;
        for (const [k, p] of Object.entries(pals)) for (const [r, g, b] of p || []) {
          const dd = (r - d[i]) ** 2 + (g - d[i + 1]) ** 2 + (b - d[i + 2]) ** 2;
          if (dd < bd) { bd = dd; best = k; }
        }
        if (best) votes[best] = (votes[best] || 0) + 1;
      }
      return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    }, dex);
  };
  const WANT = { 4: 'shiny', 7: 'shiny', 25: 'normal', 194: 'radiant', 195: 'normal' };
  const NAME = { 4: 'Charmander (partner, shiny)', 7: 'Squirtle (shiny)', 25: 'Pikachu (shiny, Normal picked)', 194: 'Wooper (radiant)', 195: 'Quagsire (radiant, Normal picked)' };
  try {
    console.log('1. Each cell shows the form you use');
    const page = await open('/dev.html');
    for (const d of Object.keys(WANT).map(Number)) {
      const got = await cellForm(page, d);
      check(got === WANT[d], `${NAME[d]}: its cell is ${WANT[d]}`, got);
      const px = await pixelForm(page, d);
      check(px === got, `  and its pixels say so too (the check used on index.html)`, px);
    }

    console.log('2. Changing the form in the detail card redraws the cell');
    const pickIn = async (dex, v) => {
      await cellForm(page, dex);
      await page.click('#dex-grid .cell');
      await page.waitForSelector(`#dex-detail .seg [data-v="${v}"]`);
      await page.click(`#dex-detail .seg [data-v="${v}"]`);
      await page.waitForSelector(`#dex-detail .seg [data-v="${v}"].on`);
      return page.$eval('#dex-grid .cell canvas', c => c.dataset.form || '?');
    };
    check(await pickIn(7, 0) === 'normal', 'Squirtle: Normal in the detail card, its cell is normal');
    check(await page.evaluate(() => !G.ShinyPref.wants(7)), 'and the choice is saved');
    check(await pickIn(7, 1) === 'shiny', 'Squirtle: Shiny again, its cell is shiny');
    check(await pickIn(194, 0) === 'normal', 'Wooper: Normal, its cell is normal');
    check(await pickIn(194, 2) === 'radiant', 'Wooper: Radiant, its cell is radiant');
    check(await cellForm(page, 7) === 'shiny' && await cellForm(page, 194) === 'radiant', 'searched again, both keep the form picked');
    check(!page.errs.length, 'no page errors (dev.html)', page.errs.slice(0, 3));

    console.log('3. The built page');
    // Same browser context: the guest save made on dev.html is there. The built game hides G, so the cell's
    // pixels are matched against the colours only its normal, shiny (s/) or radiant (r/) sheet has.
    const built = await page.context().newPage();
    built.errs = []; built.on('pageerror', e => built.errs.push(String(e)));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest, #scr-menu');                 // the guest save from dev.html may open the menu straight away
    if (await built.isVisible('#btn-guest')) await built.click('#btn-guest');
    await built.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await built.click('#scr-menu [data-go=dex]');
    await built.waitForSelector('#dex-grid .cell', { timeout: 15000 });
    const forms = {};
    for (const d of Object.keys(WANT).map(Number)) {
      await cellIs(built, d);
      forms[d] = await pixelForm(built, d);
    }
    check(Object.keys(WANT).every(d => forms[d] === WANT[d]), 'index.html: every cell shows the form you use', forms);
    check(!built.errs.length, 'no page errors (index.html)', built.errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll collection form checks passed');
  process.exit(failures ? 1 : 0);
})();
