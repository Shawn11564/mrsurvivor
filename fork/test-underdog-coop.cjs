#!/usr/bin/env node
// The Underdog XP ladder in a group (js/fork/lab/underdog.js), two real players in headless Edge on
// the Firebase emulator, connected peer to peer:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-underdog-coop.cjs [base-url]
//
// Solo, the ladder comes up on Play and holds the run back; a group run starts for everyone at once,
// so there it shows in the lobby, once the room is a Lab one (the host's setting):
//   1. Host with Lab off: neither sees it.
//   2. The host turns Lab on: the guest (Caterpie) gets the ladder with its own Pokémon and "Got it";
//      so does the host (Charmander).
//   3. "Got it" closes it; back in the lobby later, not again for the same Pokémon.
//   4. Everyone ready: the Lab run starts as usual.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function player(browser, name, dex, lab) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.LabUnderdog, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex, lab]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save; s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
    G.Settings.set('lab', lab); G.Settings.set('underdogLadder', true); G.Settings.set('underdogSeen', 0);
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
    return { ok: true, uid: G.DB.fb.uid };
  }, [name, dex, lab]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  page.uid = r.uid; page.name = name;
  return page;
}
const ladder = p => p.evaluate(() => { const b = document.getElementById('ud-ladder');
  return b && !b.classList.contains('hidden') ? { mine: b.querySelector('.ud-mine').textContent, go: document.getElementById('ud-go').textContent } : null; });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'uhst' + tag, 4, false);
    const guest = await player(browser, 'ugst' + tag, 10, false);   // Caterpie: a big underdog bonus
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
    for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(u => G.Social.room.members.length === 2 && G.Net.mode(u) === 'direct', guest.uid, { timeout: 30000 });

    console.log('1. Lab off');
    await host.waitForTimeout(1500);
    check(!(await ladder(host)) && !(await ladder(guest)), 'no ladder for either');

    console.log('2. The host turns Lab on');
    await host.evaluate(() => G.Settings.set('lab', true));      // lab.js tells the guests ('lab') on the change
    const gl = await settle(guest, () => { const b = document.getElementById('ud-ladder'); return b && !b.classList.contains('hidden'); }, undefined, 10000);
    const g = await ladder(guest);
    check(gl && g && /Caterpie gets \+\d+% XP/.test(g.mine) && g.go === 'Got it', 'the guest gets the ladder for Caterpie, with "Got it"', g);
    const h = await settle(host, () => { const b = document.getElementById('ud-ladder'); return b && !b.classList.contains('hidden'); }, undefined, 5000) && await ladder(host);
    check(h && /Charmander/.test(h.mine) && h.go === 'Got it', 'the host gets it for Charmander', h);

    console.log('3. Got it');
    for (const p of [host, guest]) await p.click('#ud-go');
    check(!(await ladder(guest)) && await guest.evaluate(() => G.Settings.get('underdogSeen') === 10), '"Got it" closes it and marks Caterpie seen');
    await guest.evaluate(() => { G.MenuUI.open(); G.LobbyUI.open(); });
    await guest.waitForTimeout(1500);
    check(!(await ladder(guest)), 'back in the lobby: not again for Caterpie');

    console.log('4. Ready');
    for (const p of [host, guest]) await p.evaluate(() => G.Social.setReady(true));
    const ok = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active && G.Lab.active, undefined, 15000)));
    check(ok.every(Boolean), 'the Lab run starts for both');
    for (const p of [host, guest]) check(!p.errs.length, `${p.name}: no page errors`, p.errs.slice(0, 3));
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op underdog checks passed');
  process.exit(failures ? 1 : 0);
})();
