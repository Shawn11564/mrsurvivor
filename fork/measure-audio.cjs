#!/usr/bin/env node
// Measures how loud the game is with the DEFAULT volume settings, in headless Edge.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/measure-audio.cjs [base-url]
//
// Taps everything the game sends to the speakers (any connect() to the AudioContext's
// destination also feeds an analyser) and reports peak and loudness (RMS) in dBFS:
// the menu music, then 12 s of a run with enemies and attacks. 0 dBFS is the loudest a
// sound card can play; well-mixed web games sit around -20 dBFS RMS with peaks below -6.
// Used to choose the defaults in js/core/audio.js (`settings`, the output gain and the final
// limiter). At the defaults it also passes/fails: no effect above -8 dBFS, music and runs at
// most -24 dBFS RMS. AUDIO='{"music":1,"sfx":1}' measures other slider values instead.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  if (process.env.AUDIO) await page.addInitScript(v => { window.__AUDIO = v; }, process.env.AUDIO);
  await page.addInitScript(() => {
    // Default settings: no saved volume.
    // AUDIO='{"music":1,"sfx":1}' measures those slider values instead of the defaults.
    try { localStorage.removeItem('ps.audio'); if (window.__AUDIO) localStorage.setItem('ps.audio', window.__AUDIO); } catch (e) { /* nada */ }
    const conn = AudioNode.prototype.connect;
    window.__meter = { peak: 0, sumSq: 0, n: 0, windows: [] };
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode && !this.__tapped) {
        this.__tapped = true;
        const ctx = this.context, an = ctx.createAnalyser();
        an.fftSize = 2048;
        conn.call(this, an);
        const buf = new Float32Array(an.fftSize);
        (function poll() {
          an.getFloatTimeDomainData(buf);
          let pk = 0, sq = 0;
          for (const v of buf) { pk = Math.max(pk, Math.abs(v)); sq += v * v; }
          const m = window.__meter;
          m.peak = Math.max(m.peak, pk); m.sumSq += sq; m.n += buf.length;
          m.windows.push(Math.sqrt(sq / buf.length));
          setTimeout(poll, 40);
        })();
      }
      return conn.call(this, dest, ...rest);
    };
  });
  const db = v => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
  const take = async label => {
    const m = await page.evaluate(() => { const m = window.__meter; window.__meter = { peak: 0, sumSq: 0, n: 0, windows: [] }; return m; });
    const rms = Math.sqrt(m.sumSq / Math.max(1, m.n));
    const loud = m.windows.slice().sort((a, b) => b - a)[Math.floor(m.windows.length * 0.05)] || 0;   // 95th percentile
    console.log(`${label.padEnd(26)} peak ${db(m.peak).padStart(6)} dBFS · RMS ${db(rms).padStart(6)} dBFS · loudest 5% ${db(loud).padStart(6)} dBFS`);
    return { peak: m.peak, rms };
  };

  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.Audio && G.DB && G.DB.playAsGuest, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  const vols = await page.evaluate(() => Object.assign({}, G.Audio.settings));
  console.log('volume settings in use:', JSON.stringify(vols));
  await page.evaluate(() => { G.Audio.unlock && G.Audio.unlock(); G.Audio.music('village'); });
  await page.waitForTimeout(1500); await take('(warm-up)');
  await page.waitForTimeout(6000); const menu = await take('menu music');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible' });
  await page.evaluate(() => { G.DB.save.partner = 4; G.Game.startRun(); });
  await page.waitForFunction(() => G.Game.state === 'playing');
  await page.waitForTimeout(2000); await take('(run start)');
  // Speed the clock up a little so the arena fills with enemies.
  await page.evaluate(() => G.Game.debugTime(120));
  await page.waitForTimeout(12000); const run = await take('run: music + combat');

  // Each sound effect alone (music off), loudest first.
  await page.evaluate(() => { G.Game.debugSpeed(0); G.Audio.music(null); });
  await page.waitForTimeout(1500);
  const names = ['hover', 'click', 'back', 'confirm', 'select', 'error', 'shot', 'hit', 'faint', 'bossDown', 'xp', 'coin', 'heal',
    'levelup', 'hurt', 'boss', 'surge', 'shiny', 'shinyGet', 'break', 'chest', 'grass', 'ball', 'shake', 'burst', 'reveal', 'rift',
    'legend', 'gameover', 'biome', 'quake', 'toll', 'descend', 'land', 'judge', 'pause', 'buy'];
  const OPTS = { shot: { kind: 'projectile', type: 'fire' }, burst: { rarity: 5 }, reveal: { rarity: 5 } };
  const each = [];
  for (const n of names) {
    // Measured at the speakers (after everything, including the final limiter).
    await page.evaluate(([n, o]) => { window.__meter = { peak: 0, sumSq: 0, n: 0, windows: [] }; G.Audio.sfx(n, o); }, [n, OPTS[n]]);
    await page.waitForTimeout(1600);
    const r = await page.evaluate(() => window.__meter);
    each.push([n, r.peak, Math.sqrt(r.sumSq / Math.max(1, r.n))]);
    await page.waitForTimeout(250);
  }
  each.sort((a, b) => b[1] - a[1]);
  console.log('\nsound effects alone (peak / RMS over 1.6 s, dBFS):');
  for (const [n, p, r] of each) console.log(`  ${n.padEnd(10)} ${db(p).padStart(6)}  ${db(r).padStart(6)}`);
  await browser.close();
  // Pass/fail at the defaults (skipped when AUDIO picks other slider values).
  if (!process.env.AUDIO) {
    const ok = [[each[0][1] <= Math.pow(10, -8 / 20), `no sound effect peaks above -8 dBFS (loudest: ${each[0][0]} ${db(each[0][1])})`],
                [menu.rms <= Math.pow(10, -24 / 20), `menu music RMS at most -24 dBFS (${db(menu.rms)})`],
                [run.rms <= Math.pow(10, -24 / 20), `run RMS at most -24 dBFS (${db(run.rms)})`]];
    console.log('');
    for (const [pass, what] of ok) console.log((pass ? '  PASS ' : '  FAIL ') + what);
    process.exit(ok.every(([p]) => p) ? 0 : 1);
  }
})().catch(e => { console.error(e); process.exit(1); });
