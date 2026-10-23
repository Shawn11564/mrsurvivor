#!/usr/bin/env node
// The Choice Band asks which move it locks into (js/fork/choice-lock.js, hooked in offerItem in
// js/game.js), in headless Edge on dev.html, as a guest, in a real run: the band is a real item
// pickup dropped at your feet (G.Pickups.drop), and every pick is a real key press.
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-choice-lock.cjs [base-url]
//
//   1. No item, three moves: picking the band up stops the game (state 'choice', the clock stays)
//      and the item screen asks "Lock into which move?" with your three slots; keys pressed in the
//      first second do nothing (the guard); 3 locks the third slot: it's the active one, the run
//      goes on, and 1 (switching) is refused while you hold it.
//   2. Holding Leftovers: the usual "keep or switch" pick first; switching to the band then asks
//      the move (2 locks the second slot).
//   3. Holding Leftovers and keeping them: no move pick.
//   4. One move only: nothing to ask, the band goes on at once and the run doesn't stop.
//   5. The band's description says you choose the move.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.ChoiceLock, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; G.Settings.set('lab', false); G.Settings.set('pauseCount', false); G.DB.commit(); G.Flow.goMenu(); });

    /** A fresh run of Charmander with `n` moves and `item` held, no enemies. */
    async function run(n, item) {
      await page.evaluate(() => { G.Game.quit(); G.UI.hideAll(); G.Flow.goMenu(); });
      await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
      await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
      return page.evaluate(([n, item]) => {
        G.Spawner.update = () => {};
        const pl = G.Game.player; pl.invuln = 1e9;
        for (const e of G.EnemyMgr.all()) e.dead = true;
        const extra = G.Moves.poolFor(pl.mon).filter(id => !pl.hasMove(id)).slice(0, n - pl.slots.length);
        for (const id of extra) pl.addMove(id);
        if (item) pl.equip(item);
        pl.active = 0;
        return { slots: pl.slots.length, item: pl.item };
      }, [n, item]);
    }
    const drop = () => page.evaluate(() => { const pl = G.Game.player; G.Pickups.drop('item', pl.x, pl.y, 'choiceband'); });
    const shown = () => page.evaluate(() => {
      const scr = document.getElementById('scr-item');
      return { open: !scr.classList.contains('hidden'), state: G.Game.state, h: scr.querySelector('h2').textContent,
               sub: scr.querySelector('.sub').textContent, cards: [...document.querySelectorAll('#item-cards .card .nm')].map(e => e.textContent.trim()),
               active: G.Game.player.active, item: G.Game.player.item };
    });
    const waitOpen = () => page.waitForFunction(() => !document.getElementById('scr-item').classList.contains('hidden'), null, { timeout: 10000 });
    const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(250); };

    console.log('1. No item, three moves');
    const r1 = await run(3, null);
    check(r1.slots === 3 && !r1.item, 'three slots, no item', r1);
    await drop(); await waitOpen();
    const a = await shown();
    check(a.open && a.state === 'choice' && /Choice Band/.test(a.h) && /Lock into which move/.test(a.sub) && a.cards.length === 3,
      'the game stops and the item screen asks which of the 3 moves', a);
    check(a.item === 'choiceband', 'the band is on already', a.item);
    await key('Digit3');
    const early = await shown();
    check(early.open && early.active === 0, 'a key in the first second does nothing (guard)', early);
    await page.waitForTimeout(1000);
    await key('Digit3');
    const b = await shown();
    check(!b.open && b.active === 2 && b.state === 'playing', '3 locks the third slot and the run goes on', b);
    await key('Digit1');
    check((await shown()).active === 2, 'switching (1) is refused while you hold it');
    const restored = await page.evaluate(() => document.querySelector('#scr-item h2').textContent);
    check(!/Choice Band/.test(restored), 'the item screen\'s own heading is back', restored);

    console.log('2. Holding Leftovers, switching to the band');
    await run(3, 'leftovers');
    await drop(); await waitOpen();
    const c = await shown();
    check(c.cards.length === 2 && /Leftovers/.test(c.cards[0]) && /Choice Band/.test(c.cards[1]), 'the usual keep-or-switch pick first', c);
    await page.waitForTimeout(1100); await key('Digit2');
    await waitOpen();
    const d = await shown();
    check(d.open && d.state === 'choice' && d.cards.length === 3 && /Lock into which move/.test(d.sub), 'then the move pick', d);
    await page.waitForTimeout(1100); await key('Digit2');
    const e = await shown();
    check(!e.open && e.item === 'choiceband' && e.active === 1 && e.state === 'playing', '2 locks the second slot', e);

    console.log('3. Holding Leftovers, keeping them');
    await run(3, 'leftovers');
    await drop(); await waitOpen();
    await page.waitForTimeout(1100); await key('Digit1');
    const f = await shown();
    check(!f.open && f.item === 'leftovers' && f.state === 'playing', 'no move pick', f);

    console.log('4. One move only');
    const r4 = await run(1, null);
    await drop();
    await page.waitForFunction(() => G.Game.player.item === 'choiceband', null, { timeout: 10000 });
    const g = await shown();
    check(r4.slots === 1 && !g.open && g.state === 'playing', 'nothing to ask: the band goes on and the run goes on', g);

    console.log('5. The description');
    const desc = await page.evaluate(() => G.T(G.Items.BY.choiceband.desc));
    check(/move you choose/.test(desc), 'the band says you choose the move', desc);

    check(!errors.length, 'no page errors', errors.slice(0, 5));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll Choice Band checks passed');
  process.exit(failures ? 1 : 0);
})();
