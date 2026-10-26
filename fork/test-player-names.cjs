// Public weekly podiums through real Firestore snapshots, UI screens and co-op canvas drawing.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');
const EMU = `G.FIREBASE_CONFIG={apiKey:'demo',projectId:'demo-ps',authDomain:'demo-ps.firebaseapp.com',appId:'demo',databaseURL:'http://127.0.0.1:9000?ns=demo-ps-default-rtdb',emulator:true};`;
const encode = v => Array.isArray(v) ? { arrayValue: { values: v.map(encode) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } }
  : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
async function seed(path, value) {
  const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-ps/databases/(default)/documents/' + path, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encode(value).mapValue.fields })
  });
  if (!r.ok) throw Error(await r.text());
}
const row = (t, uids, names) => ({ t, uids, names, dex: uids.map(() => 4), shiny: uids.map(() => false), lv: 1, kills: 0 });
const board = top => ({ top, me: '', ev: '' });
async function player(browser, prefix, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.stack || String(e)));
  await p.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  await p.addInitScript(() => { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); });
  await p.goto(BASE + '/dev.html', { waitUntil: 'load' }); await pastStart(p, '#login-form');
  const account = await p.evaluate(async prefix => {
    const name = prefix + Date.now().toString(36), r = await G.DB.register(name, 'pw-' + name);
    if (!r.ok) throw Error(JSON.stringify(r));
    localStorage.setItem('ps.recover.no.' + G.DB.fb.uid, '1');
    if (await G.Social.start() !== 'ok') await G.Social.claimNick(name);
    const s = G.DB.save; s.owned[4] = { at: 1 }; s.partner = s.starter = 4;
    G.Settings.set('underdogLadder', false); G.Flow.goMenu();
    return { uid: G.DB.fb.uid, name };
  }, prefix);
  return { p, ...account };
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const errors = [], a = await player(browser, 'pod', errors), v = await player(browser, 'view', errors);
    const B = await a.p.evaluate(() => ({ s: G.Ranking.board('s', 'w'), g: G.Ranking.board('g', 'w'), all: G.Ranking.board('s', 'a'), lab: G.Ranking.board('ls', 'w') }));
    const solo = { [a.uid]: row(1200, [a.uid], [a.name]), b: row(1100, ['b'], ['DualUser']), c: row(1000, ['c'], ['BronzeUser']) };
    const group = { bd: row(1300, ['b', 'd'], ['DualUser', 'GroupGold']), ae: row(1200, [a.uid, 'e'], [a.name, 'GroupSilver']), fd: row(1100, ['f', 'd'], ['GroupBronze', 'GroupGold']) };
    await seed('lbs/' + B.s, board(solo)); await seed('lbs/' + B.g, board(group));
    await seed('lbs/' + B.all, board({ [v.uid]: row(14000, [v.uid], [v.name]) }));
    await seed('lbs/' + B.lab, board({ [v.uid]: row(14000, [v.uid], [v.name]) }));
    await seed('profiles/b', { name: 'DualUser', title: '', best: {}, favs: [], medals: [] });
    for (const p of [a.p, v.p]) await p.waitForFunction(uid => G.PlayerNames.ranks(uid).length === 2, a.uid);
    const ranks = await v.p.evaluate(uid => ({ a: G.PlayerNames.ranks(uid), b: G.PlayerNames.ranks('b'), d: G.PlayerNames.ranks('d'), f: G.PlayerNames.ranks('f'), me: G.PlayerNames.ranks(G.DB.fb.uid) }), a.uid);
    assert.deepEqual(ranks.a, [{ board: 's', rank: 1 }, { board: 'g', rank: 2 }]);
    assert.deepEqual(ranks.b, [{ board: 's', rank: 2 }, { board: 'g', rank: 1 }]);
    assert.deepEqual(ranks.d, [{ board: 'g', rank: 1 }], 'each group member gets only their best group placement');
    assert.deepEqual(ranks.f, [{ board: 'g', rank: 3 }]);
    assert.deepEqual(ranks.me, [], 'all-time and Lab boards do not award weekly badges');
    await v.p.evaluate(([uid, name]) => {
      const box = document.createElement('div'); box.id = 'pn-safe';
      box.innerHTML = G.PlayerNames.html(G.DB.fb.uid, name) + G.PlayerNames.html('b', '<img src=x onerror=alert(1)>');
      document.body.appendChild(box);
    }, [a.uid, a.name]);
    await v.p.waitForFunction(() => document.querySelector('#pn-safe [data-player-uid=b] .pn-badge'));
    assert.equal(await v.p.locator('#pn-safe img').count(), 0, 'player names remain escaped');
    assert.equal(await v.p.locator('#pn-safe [data-player-uid="' + v.uid + '"] .pn-badge').count(), 0, 'a copied nickname cannot claim another UID’s badge');
    await v.p.locator('#pn-safe').evaluate(el => el.remove());
    console.log('PASS both weekly boards, all team members, best group rank, public observer, mode isolation');

    await v.p.evaluate(() => G.ProfileUI.show('b'));
    await v.p.locator('#prof-body .pn-badge').nth(1).waitFor({ state: 'visible' });
    assert.equal(await v.p.locator('#prof-body .pn-text').evaluate(el => getComputedStyle(el).color), 'rgb(255, 212, 90)', 'name uses the best rank color');
    await v.p.screenshot({ path: 'tools/cache/weekly-profile.png' });
    await v.p.setViewportSize({ width: 780, height: 430 });
    assert.ok(await v.p.locator('#prof-body .player-name').evaluate(el => el.getBoundingClientRect().right < innerWidth), 'profile badges fit mobile landscape');
    await v.p.screenshot({ path: 'tools/cache/weekly-profile-mobile.png' });
    await v.p.setViewportSize({ width: 1280, height: 800 });
    await v.p.evaluate(() => { document.getElementById('prof-close').click(); G.RankingUI.open(); });
    await v.p.locator('#rk-list .pn-badge').first().waitFor({ state: 'visible' });
    assert.ok(await v.p.locator('#rk-list [data-player-uid="b"] .pn-badge').count() === 2);
    await a.p.waitForFunction(() => document.querySelector('#user-pill .pn-badge'));
    await a.p.evaluate(() => G.SettingsUI.open('acc'));
    await a.p.locator('#set-body .pn-badge').first().waitFor({ state: 'visible' });
    await a.p.evaluate(() => G.SettingsUI.close());
    console.log('PASS real profile, leaderboard, account header and settings render colored names and numbered badges');

    // Two clients in a real room: the observer sees the host's badges in lobby and run.
    const room = await a.p.evaluate(async () => (await G.Social.createRoom()).id);
    assert.equal((await v.p.evaluate(id => G.Social.joinRoom(id), room)).ok, true);
    for (const p of [a.p, v.p]) await p.evaluate(() => { G.UI.hideAll(); G.LobbyUI.open(); });
    const selector = '#lobby-members [data-player-uid="' + a.uid + '"] .pn-badge';
    await v.p.locator(selector).nth(1).waitFor({ state: 'visible' });
    await v.p.screenshot({ path: 'tools/cache/weekly-lobby.png' });
    await a.p.waitForFunction(() => G.Social.room.members.length === 2 && G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'));
    await v.p.click('#lobby-ready'); await a.p.waitForFunction(() => G.Social.room.members.filter(m => m.ready).length === 1);
    await a.p.click('#lobby-ready');
    for (const p of [a.p, v.p]) {
      await p.waitForFunction(() => G.Coop.active && G.Game.state === 'playing');
      await p.evaluate(() => {
        window.__names = []; const draw = G.PlayerNames.draw;
        G.PlayerNames.draw = function (ctx, uid, text, x, y, opts) {
          const out = draw.apply(this, arguments); window.__names.push({ uid, text, stroke: !!opts?.stroke, max: opts?.maxWidth });
          if (window.__names.length > 100) window.__names.shift(); return out;
        };
        G.Spawner.update = () => {}; G.Game.player.invuln = 1e9;
      });
    }
    await v.p.waitForFunction(uid => window.__names.some(n => n.uid === uid && n.stroke) && window.__names.some(n => n.uid === uid && n.max === 73), a.uid);
    await a.p.waitForFunction(uid => window.__names.some(n => n.uid === uid && n.stroke), a.uid);
    await v.p.screenshot({ path: 'tools/cache/weekly-run.png' });
    await a.p.evaluate(() => G.RunStats.showParty(G.RunStats.all(), () => {}));
    await a.p.locator('#scr-party [data-player-uid="' + a.uid + '"] .pn-badge').nth(1).waitFor({ state: 'visible' });
    await a.p.locator('#scr-party [data-a=next]').click();
    console.log('PASS real co-op lobby, overhead nametags, teammate HP HUD and team-summary names');

    // Keep an existing DOM node mounted while the server standings change.
    await a.p.evaluate(uid => { G.Game.quit(); G.UI.hideAll(); G.Flow.goMenu(); G.ProfileUI.showData({ name: G.Social.me.name, best: {}, medals: [] }, uid); }, a.uid);
    const name = a.p.locator('#prof-body .player-name');
    await name.locator('.pn-badge').nth(1).waitFor({ state: 'visible' });
    const mounted = await name.elementHandle();
    const reordered = { b: row(1500, ['b'], ['DualUser']), [a.uid]: row(1200, [a.uid], [a.name]), c: solo.c };
    await seed('lbs/' + B.s, board(reordered));
    await seed('lbs/' + B.g, board({ fd: row(1500, ['f', 'd'], ['GroupBronze', 'GroupGold']), bd: group.bd, ae: group.ae }));
    await a.p.waitForFunction(uid => G.PlayerNames.ranks(uid).map(r => r.rank).join() === '2,3', a.uid);
    await v.p.waitForFunction(() => G.PlayerNames.ranks('b')[0]?.rank === 1);
    assert.equal(await v.p.evaluate(async () => (await G.Ranking.top('s', 'w'))[0].uids[0]), 'b', 'weekly leaderboard cache must agree with live badge standings');
    assert.equal(await mounted.evaluate(el => el.isConnected), true);
    assert.equal(await name.locator('.pn-text').evaluate(el => getComputedStyle(el).color), 'rgb(201, 217, 238)');
    assert.deepEqual(await name.locator('.pn-badge').evaluateAll(es => es.map(e => e.textContent)), ['2', '3']);
    const ties = Object.fromEntries(['z', 'a', 'B', 'A'].map(uid => [uid, row(1600, [uid], [uid])]));
    await seed('lbs/' + B.s, board(ties));
    await a.p.waitForFunction(() => G.PlayerNames.ranks('A')[0]?.rank === 1 && G.PlayerNames.ranks('a')[0]?.rank === 3);
    assert.deepEqual(await a.p.evaluate(async () => (await G.Ranking.top('s', 'w')).map(r => r.id)), ['A', 'B', 'a', 'z'], 'badge ties match the displayed stable leaderboard order');
    assert.deepEqual(await a.p.evaluate(() => G.PlayerNames.ranks('z')), []);
    await seed('lbs/' + B.s, board(reordered));
    await a.p.waitForFunction(uid => G.PlayerNames.ranks(uid).map(r => r.rank).join() === '2,3', a.uid);

    // Move only the clock: subscribe to next week's actual docs and remove the old awards immediately.
    await a.p.clock.setFixedTime(new Date(Date.now() + 7 * 86400000));
    await a.p.waitForFunction(uid => G.PlayerNames.ranks(uid).length === 0, a.uid);
    assert.equal(await name.locator('.pn-badge').count(), 0);
    assert.equal(await name.evaluate(el => el.classList.contains('pn-ranked')), false);
    const next = await a.p.evaluate(() => G.Ranking.board('s', 'w'));
    assert.notEqual(next, B.s);
    await seed('lbs/' + next, board({ c: row(400, ['c'], ['BronzeUser']) }));
    await a.p.waitForFunction(() => G.PlayerNames.ranks('c')[0]?.rank === 1);
    await v.p.evaluate(() => G.DB.logout());
    assert.equal(await v.p.evaluate(() => G.PlayerNames.ranks('b').length), 0);
    assert.deepEqual(errors, []);
    console.log('PASS live promotion/demotion without remount, weekly rollover, next-week awards and logout cleanup');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
