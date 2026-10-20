#!/usr/bin/env node
// Co-op keeps going while the host's tab is hidden (js/fork/coop-background.js), on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-coop-background.cjs [base-url]
//
// The host runs in a plain Edge driven over raw CDP: Playwright makes every page it drives
// look visible and focused, so it can't show a background tab's real behaviour (no
// requestAnimationFrame, timers at 1 a second). Opening a second tab really hides the host's.
// The guest is a normal Playwright page.
//   1. Host and guest connect peer to peer, ready up, and the run starts.
//   2. The host's tab goes to the background for 8 s (past coop.js's 2.5 s "not responding"):
//      the host's game keeps ticking at ~real speed and the guest is never held.
//   3. Back to the host's tab: still one game loop (no doubled speed).
const { chromium, pastStart } = require('./pw.cjs');
const { spawn } = require('child_process'), os = require('os'), path = require('path'), fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9300 + Math.floor(Math.random() * 500);
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

/** A tab of a real Edge over raw CDP: eval(js) awaits promises and returns the value. */
async function rawTab(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map(), on = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
    else if (d.method && on.has(d.method)) on.get(d.method)(d.params);
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (js) => {
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error('host: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description));
    return r.result.result.value;
  };
  const waitFor = async (js, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evaluate(js).catch(() => false)) return true; await sleep(200); } return false; };
  return { send, evaluate, waitFor, on: (m, f) => on.set(m, f), close: () => ws.close() };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coopbg-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  let host;
  try {
    let tabs = [];
    for (let i = 0; i < 60 && !tabs.length; i++) { try { tabs = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter(t => t.type === 'page'); } catch (e) { /* not up yet */ } if (!tabs.length) await sleep(200); }
    const hostTab = tabs[0];
    host = await rawTab(hostTab.webSocketDebuggerUrl);
    // The emulator config instead of js/core/firebase-config.js (same as the Playwright route).
    await host.send('Fetch.enable', { patterns: [{ urlPattern: '*js/core/firebase-config.js*' }] });
    host.on('Fetch.requestPaused', p => host.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body: Buffer.from(EMU).toString('base64') }));
    await host.send('Page.navigate', { url: BASE + '/dev.html' });
    await host.waitFor(`!!document.getElementById('tap-start')`);
    for (let i = 0; i < 100 && !(await host.evaluate(`window.G && G.DB && G.DB.mode === 'cloud' && !!G.CoopBackground`)); i++) {
      await host.evaluate(`(document.getElementById('tap-start') || {}).click && document.getElementById('tap-start').click(), 1`).catch(() => {});
      await sleep(300);
    }
    const NAME_H = 'bgh' + tag, NAME_G = 'bgg' + tag;
    const setup = (name, dex) => `(async () => {
      const reg = await G.DB.register(${JSON.stringify(name)}, 'pw-' + ${JSON.stringify(name)});
      if (reg.ok === false) return JSON.stringify(reg);
      const s = G.DB.save; s.partner = ${dex}; s.owned[${dex}] = { at: Date.now(), from: 'starter' }; G.DB.commit();
      const st = await G.Social.start();
      if (st !== 'ok') await G.Social.claimNick(${JSON.stringify(name)});
      G.Flow.afterLogin();
      for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
      return 'ok';
    })()`;
    check(await host.evaluate(setup(NAME_H, 4)) === 'ok', 'host (raw Edge) signed up on the emulator');

    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
    await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    const guest = await ctx.newPage();
    const gErr = [];
    guest.on('pageerror', e => gErr.push(String(e)));
    await guest.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(guest, '#login-form');
    await guest.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social, null, { timeout: 30000 });
    check(await guest.evaluate(setup(NAME_G, 7)) === 'ok', 'guest (Playwright) signed up');

    console.log('1. Party');
    const id = await host.evaluate(`G.Social.createRoom().then(r => r.id)`);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    check(j.ok, 'guest joined the room', j.ok ? undefined : j);
    await host.evaluate(`G.LobbyUI.open(), 1`); await guest.evaluate(() => G.LobbyUI.open());
    check(await host.waitFor(`G.Social.room && G.Social.room.members.length === 2 && G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct')`),
      'connected peer to peer');
    await sleep(500);
    await guest.click('#lobby-ready');
    await host.evaluate(`document.getElementById('lobby-ready').click(), 1`);
    check(await host.waitFor(`G.Game.state === 'playing' && G.Coop.active`), 'the run starts for the host');
    await guest.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 15000 });
    // Count the host's frames (G.Coop.tick runs once a frame) and the game time they add up to.
    await host.evaluate(`(() => { const t = G.Coop.tick; window.__n = 0; window.__dt = 0; G.Coop.tick = function (dt) { __n++; __dt += dt; return t.apply(this, arguments); }; return 1; })()`);
    // Nobody gets hurt meanwhile: this checks the clock, not survival.
    await host.evaluate(`(() => { G.Game.player.hurt = () => {}; return 1; })()`);
    await guest.evaluate(() => { G.Game.player.hurt = () => {}; });

    console.log('2. Host tab in the background for 8 s');
    const other = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    check(await host.waitFor(`document.visibilityState === 'hidden'`, 5000), 'the host\'s tab is really hidden');
    const s0 = await host.evaluate(`({ n: __n, dt: __dt, t: performance.now() })`);
    const held = [];
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      held.push(await guest.evaluate(() => G.Game.state));
      await sleep(250);
    }
    const s1 = await host.evaluate(`({ n: __n, dt: __dt, t: performance.now(), v: document.visibilityState, st: G.Game.state })`);
    const secs = (s1.t - s0.t) / 1000, fps = (s1.n - s0.n) / secs, speed = (s1.dt - s0.dt) / secs;
    check(s1.v === 'hidden' && s1.st === 'playing', 'host still hidden and playing', { v: s1.v, st: s1.st });
    check(fps > 20, `host keeps ticking hidden: ${fps.toFixed(1)} frames/s`);
    check(speed > 0.92 && speed < 1.08, `at about real speed: ${speed.toFixed(2)} s of game a second`);
    check(!held.includes('held'), 'the guest is never held ("waiting for the host")', [...new Set(held)]);

    console.log('3. Back to the host\'s tab');
    await fetch(`http://127.0.0.1:${PORT}/json/activate/${hostTab.id}`);
    await fetch(`http://127.0.0.1:${PORT}/json/close/${other.id}`);
    check(await host.waitFor(`document.visibilityState === 'visible'`, 5000), 'visible again');
    await sleep(500);
    const v0 = await host.evaluate(`({ dt: __dt, t: performance.now() })`);
    await sleep(3000);
    const v1 = await host.evaluate(`({ dt: __dt, t: performance.now() })`);
    const vs = (v1.dt - v0.dt) / ((v1.t - v0.t) / 1000);
    check(vs > 0.5 && vs < 1.1, `one game loop again, not two: ${vs.toFixed(2)} s of game a second`);
    check(await guest.evaluate(() => G.Game.state) === 'playing', 'guest still playing');
    check(!gErr.length, 'no page errors on the guest', gErr);
  } catch (e) { console.error(e); failures++; }
  try { host && host.close(); } catch (e) { /* nada */ }
  await browser.close();
  edge.kill();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op background checks passed');
  process.exit(failures ? 1 : 0);
})();
