// Real run-end submission -> Firebase SDK/emulator -> leaderboard renderer.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');
const EMU = `G.FIREBASE_CONFIG={apiKey:'demo',projectId:'demo-ps',authDomain:'demo-ps.firebaseapp.com',appId:'demo',databaseURL:'http://127.0.0.1:9000?ns=demo-ps-default-rtdb',emulator:true};`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    // Keep the fixture's Firebase config route effective after reload; a service worker bypasses routes.
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.stack || String(e)));
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    await page.addInitScript(() => {
      localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en');
    });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#login-form');
    const account = await page.evaluate(async () => {
      const name = 'looks' + Date.now().toString(36);
      const r = await G.DB.register(name, 'pw-' + name); if (!r.ok) throw Error(JSON.stringify(r));
      if (await G.Social.start() !== 'ok') await G.Social.claimNick(name);
      const s = G.DB.save; s.owned[94] = { at: 1 }; s.shiny[94] = { at: 1 }; s.partner = s.starter = 94;
      G.Settings.set('underdogLadder', false); G.Flow.goMenu();
      const submit = G.Ranking.submitSolo;
      G.Ranking.submitSolo = function (r) { window.__submission = submit.call(this, r); return window.__submission; };
      G.Game.startRun(null, { dex: 94, shiny: true });
      return { name, password: 'pw-' + name };
    });
    await page.waitForFunction(() => G.Game.state === 'playing');
    const row = await page.evaluate(async () => {
      G.Game.player.equip('megastone');
      if (!G.Game.player.mega || !G.Game.player.shiny) throw Error('fixture is not shiny Mega Gengar');
      G.Game.resumeAt(305); G.Game.quit(); await window.__submission;
      const b = G.Ranking.board('s', 'a');
      return (await G.DB.fb.fs.doc('lb/' + b + '/e/' + G.DB.fb.uid).get()).data();
    });
    assert.equal(row.mega?.[0], true, 'real run end must store the final Mega form');
    assert.equal(row.shiny[0], true, 'real run end must retain the shiny skin');
    const cases = await page.evaluate(async () => {
      const out = [];
      const run = async (dex, shiny, mega, radiant, t) => {
        const s = G.DB.save; s.owned[dex] = { at: 1 }; s.shiny[dex] = { at: 1 };
        if (radiant) { s.radiant = s.radiant || {}; s.radiant[dex] = { at: 1 }; G.Radiant.set(dex, true); }
        G.Flow.goMenu(); G.Game.startRun(null, { dex, shiny });
        const pl = G.Game.player;
        if (mega) pl.equip('megastone');
        const finalSprite = pl.anim.dex;
        G.Game.resumeAt(t); G.Game.quit(); await window.__submission;
        const b = G.Ranking.board('s', 'a'), id = G.DB.fb.uid;
        const entry = (await G.DB.fb.fs.doc('lb/' + b + '/e/' + id).get()).data();
        const summary = (await G.DB.fb.fs.doc('lbs/' + b).get()).data().top[id];
        out.push({ dex, shiny, mega, radiant, finalSprite, entry, summary });
      };
      await run(94, true, false, false, 315);
      await run(94, false, false, false, 325);
      await run(150, false, false, true, 335);
      await run(150, false, true, true, 345);
      return out;
    });
    for (const c of cases) for (const e of [c.entry, c.summary]) {
      assert.equal(e.dex[0], c.dex); assert.equal(e.mega[0], c.mega);
      assert.equal(e.radiant[0], c.radiant); assert.equal(e.shiny[0], c.shiny);
    }
    // Render real stored rows through RankingUI; observe the actual sprite constructor.
    await page.evaluate(() => {
      window.__drawn = [];
      const A = G.Sprites.Animator;
      G.Sprites.Animator = class extends A { constructor(d, s, sh) { super(d, s, sh); window.__drawn.push(String(d)); } };
      G.UI.hideAll(); G.Flow.goMenu(); G.RankingUI.open();
    });
    await page.locator('#rk-list .rk-row.mine canvas').waitFor({ state: 'visible' });
    assert.match(await page.locator('#rk-list .rk-row.mine canvas').getAttribute('aria-label'), /Radiant.*Mega.*Mewtwo/);
    assert.ok((await page.evaluate(() => window.__drawn)).includes(String(cases.at(-1).finalSprite)), 'leaderboard uses the same final sprite as the run');
    // Missing artwork has the same fallback as the game; a radiant Mega never turns shiny.
    const draw = await page.evaluate(() => {
      window.__drawn.length = 0;
      G.RunAppearance.sprite(150, { radiant: true });
      G.RunAppearance.sprite(94, { mega: true, shiny: true });
      G.RunAppearance.sprite(94, { shiny: true }); // old row without new fields
      return window.__drawn;
    });
    assert.deepEqual(draw, ['150/r', 'm94', '94']);
    // Malformed appearance flags must be rejected by the real server rules.
    const denied = await page.evaluate(async () => {
      const ref = G.DB.fb.fs.doc('lb/' + G.Ranking.board('s', 'a') + '/e/' + G.DB.fb.uid);
      const old = (await ref.get()).data(), results = [];
      for (const bad of [{ mega: ['yes'] }, { radiant: [true, false] }]) {
        try { await ref.set(Object.assign({}, old, bad, { t: 346, at: firebase.firestore.FieldValue.serverTimestamp() })); results.push(false); }
        catch (e) { results.push(e.code === 'permission-denied'); }
      }
      return results;
    });
    assert.deepEqual(denied, [true, true]);
    const compatibility = await page.evaluate(async () => {
      const fs = G.DB.fb.fs, uid = G.DB.fb.uid, b = G.Ranking.board('s', 'a');
      const sum = fs.doc('lbs/' + b), data = (await sum.get()).data();
      data.top[uid].radiant = [false]; data.me = uid; data.ev = '';
      let denied = false;
      try { await sum.set(data); } catch (e) { denied = e.code === 'permission-denied'; }
      const oldBoard = G.Ranking.board('ls', 'a', 94);
      const legacy = { t: 305, lv: 1, kills: 0, uids: [uid], names: [G.Social.me.name], dex: [94], shiny: [true] };
      await fs.runTransaction(async tx => {
        const ref = fs.doc('lbs/' + oldBoard), s = await tx.get(ref), top = s.exists ? s.data().top : {};
        top[uid] = legacy;
        tx.set(fs.doc('lb/' + oldBoard + '/e/' + uid), Object.assign({}, legacy, { at: firebase.firestore.FieldValue.serverTimestamp() }));
        tx.set(ref, { top, me: uid, ev: '' });
      });
      return { denied, legacy: (await fs.doc('lb/' + oldBoard + '/e/' + uid).get()).exists };
    });
    assert.deepEqual(compatibility, { denied: true, legacy: true }, 'summaries cannot forge appearance; old clients remain compatible');
    // The actual periodic checkpoint and a real reload must retain the appearance in queued scores.
    await page.evaluate(() => {
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 94, shiny: true });
      G.Game.player.equip('megastone'); G.Game.resumeAt(405);
      G.Spawner.update = () => {}; G.Game.player.invuln = 1e9;
    });
    await page.waitForFunction(() => { const r = G.RunRecord.read(); return r?.r?.dex === 94 && r.r.mega === true && r.r.shiny === true; });
    await page.reload({ waitUntil: 'load' });
    await pastStart(page, '#login-form, #scr-menu');
    assert.equal(await page.evaluate(() => G.FIREBASE_CONFIG.projectId), 'demo-ps', 'reload stays on the local emulator');
    if (await page.locator('#login-form').isVisible()) await page.evaluate(async c => {
      const r = await G.DB.login(c.name, c.password); if (!r.ok) throw Error(JSON.stringify(r));
      G.Flow.afterLogin();
    }, account);
    await pastStart(page, '#scr-menu');
    await page.waitForFunction(() => G.RunRecord.read() === null);
    const resumedScore = await page.evaluate(async () => (await G.DB.fb.fs.doc('lb/' + G.Ranking.board('s', 'a') + '/e/' + G.DB.fb.uid).get()).data());
    assert.ok(resumedScore.t >= 405); assert.equal(resumedScore.mega[0], true); assert.equal(resumedScore.shiny[0], true);
    if (await page.locator('#resume-box [data-e]').count()) await page.locator('#resume-box [data-e]').click();
    // Two real clients. End through the vote/all-down path, which clears Co-op before endRun.
    const guestCtx = await browser.newContext({ serviceWorkers: 'block' });
    const guest = await guestCtx.newPage();
    guest.on('pageerror', e => errors.push(e.stack || String(e)));
    await guest.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    await guest.addInitScript(() => { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); });
    await guest.goto(BASE + '/dev.html', { waitUntil: 'load' }); await pastStart(guest, '#login-form');
    await guest.evaluate(async () => {
      const n = 'skin' + Date.now().toString(36), r = await G.DB.register(n, 'pw-' + n);
      if (!r.ok) throw Error(JSON.stringify(r)); if (await G.Social.start() !== 'ok') await G.Social.claimNick(n);
      const s = G.DB.save; s.owned[150] = { at: 1 }; s.radiant = { 150: { at: 1 } }; s.partner = s.starter = 150;
      G.Settings.set('underdogLadder', false); G.Flow.goMenu();
    });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: 1 }; s.shiny[4] = { at: 1 }; s.partner = 4; s.partnerShiny = true;
      G.UI.hideAll(); G.Flow.goMenu();
      const sub = G.Ranking.submitGroup;
      G.Ranking.submitGroup = function (r) { window.__group = sub.call(this, r); return window.__group; };
    });
    const room = await page.evaluate(async () => (await G.Social.createRoom()).id);
    assert.equal((await guest.evaluate(id => G.Social.joinRoom(id), room)).ok, true);
    for (const p of [page, guest]) await p.evaluate(() => G.LobbyUI.open());
    await page.waitForFunction(() => G.Social.room.members.length === 2 && G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'));
    await guest.click('#lobby-ready'); await page.waitForFunction(() => G.Social.room.members.filter(m => m.ready).length === 1);
    await page.click('#lobby-ready');
    for (const p of [page, guest]) await p.waitForFunction(() => G.Coop.active && G.Game.state === 'playing');
    await page.evaluate(() => { G.LabGrowth.evolveTo(G.Game.player, 6); G.Game.player.equip('megastone'); });
    await page.waitForFunction(() => G.Coop.mates[0].pl.radiant === true);
    await guest.waitForFunction(() => G.Coop.mates[0].pl.dex === 6 && !!G.Coop.mates[0].pl.megaKey);
    const group = await page.evaluate(async () => {
      G.Game.resumeAt(505);
      const uid = G.DB.fb.uid, other = G.Coop.mates[0].uid;
      G.Coop.over(G.Game.coopApi.summary()); G.Game.quit(); await window.__group;
      return { uid, other, entry: (await G.DB.fb.fs.doc('lb/' + G.Ranking.board('g', 'a') + '/e/' + [uid, other].sort().join('_')).get()).data() };
    });
    const hi = group.entry.uids.indexOf(group.uid), gi = group.entry.uids.indexOf(group.other);
    assert.equal(group.entry.dex[hi], 6, 'co-op host keeps the evolved final species');
    assert.equal(group.entry.mega[hi], true); assert.equal(group.entry.shiny[hi], true);
    assert.equal(group.entry.radiant[gi], true, 'co-op teardown must preserve the guest radiant skin');
    await page.locator('#scr-party [data-a=next]').click();
    await page.locator('#scr-over #btn-again').click();
    await page.evaluate(() => G.RankingUI.open());
    await page.locator('#rk-mode .gen-tab').nth(1).click();
    await page.locator('#rk-list .rk-row.mine .mons canvas').nth(1).waitFor({ state: 'visible' });
    const labels = await page.locator('#rk-list .rk-row.mine .mons canvas').evaluateAll(cs => cs.map(c => c.getAttribute('aria-label')));
    assert.ok(labels.some(s => /Shiny.*Mega.*Charizard/.test(s)) && labels.some(s => /Radiant.*Mewtwo/.test(s)), 'real group leaderboard renders each member’s final appearance');
    assert.deepEqual(errors, []);
    console.log('PASS solo/co-op final forms and skins, real reload recovery, stored summaries, renderer and schema validation');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
