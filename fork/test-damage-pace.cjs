// Real enemy constructors, boss/raid spawning, projectiles, hazards and Player.hurt in headless Edge.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.stack || String(e)));
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
    await page.clock.install();
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.locator('#btn-guest').click();
    await page.waitForFunction(() => G.DB.save);
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[143] = { at: 1 }; s.partner = s.starter = 143;
      G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
      G.Flow.goMenu(); G.Game.startRun(null, { dex: 143, shiny: false });
    });
    await page.waitForFunction(() => G.Game.state === 'playing');
    const data = await page.evaluate(() => {
      G.Spawner.update = () => {};
      const pl = G.Game.player;
      // A 2,000-HP build at the real +200% toughness cap. Keep all defense calculations.
      pl.maxHp = pl.hp = 2000; pl.dmgReduce = G.Toughness.CAP_T; pl.labAbility = null; pl.abil = null;
      Math.random = () => 0.99; // Non-elite, unaffixed enemies at each time for a stable comparison.
      pl.mon = Object.assign({}, G.DEX_BY[143], { types: ['normal'] });
      pl.moves.length = pl.slots.length = 0; pl.addMove('ember');
      const reset = () => { pl.hp = pl.maxHp; pl.invuln = 0; pl.dead = false; pl._overhealth = 0; };
      function hits(e) {
        G.EnemyMgr.clear(); G.Projectiles.clear(); G.Hazards.clear();
        e.atkType = 'normal'; e.cat = 'special'; e.x = pl.x - 35; e.y = pl.y;
        reset(); e.shoot(1, 0);
        G.Projectiles.update(0.18, pl, []); G.Combat.resolve(0.18, pl, G.Game.st.time);
        const shot = 2000 - pl.hp;
        reset(); e.hazard({ kind: 'zone', x: pl.x, y: pl.y, r: 50, delay: 1, dmg: e.shotDmg() * 1.2, type: 'normal' });
        G.Hazards.update(1);
        return { shot, hazard: 2000 - pl.hp, raw: e.shotDmg(), hp: e.maxHp };
      }
      const rows = [];
      for (const t of [600, 1200, 1800, 2700, 3600]) {
        G.Game.debugTime(t); G.EnemyMgr.clear(); G.LabPower.reset();
        // Use the game's actual late boss slot definition and horde definition.
        const def = G.LabBossSlots.defNumbers(G.LabBossSlots.slotAt(Math.max(900, t)));
        const b = new G.Enemy(Object.assign({ dex: 149, spd: 0, behavior: 'ranged' }, def), 0, 0, G.Enemies.bossScale(t), true);
        G.EnemyMgr.add(b);
        const boss = hits(b);
        const hdef = G.Enemies.cast[5].list.find(d => d.shotDmg) || G.Enemies.cast[5].list[0];
        const h = new G.Enemy(hdef, 0, 0, G.Enemies.scale(t)); G.EnemyMgr.add(h);
        rows.push({ minute: t / 60, boss, horde: hits(h) });
      }
      G.Judgment.reset(); G.Game.debugTime(1800); reset();
      G.Judgment.update(0, pl, 1800);
      const raidBoss = G.EnemyMgr.get(G.Eternatus.raid.bossId);
      const eternatus = hits(raidBoss);
      G.Judgment.reset(); G.Game.debugTime(2700); pl._labEternatus = true; reset();
      G.Judgment.update(0, pl, 2700);
      const necrozma = hits(G.EnemyMgr.get(G.Necrozma.raid.bossId));
      const remote = new G.Enemy({ dex: 149, hp: 1000, spd: 0, dmg: 500, xp: 0, behavior: 'ranged', shotDmg: 250 }, 0, 0, { hp: 1, spd: 1, dmg: 1 }, true);
      remote.remote = true; G.EnemyMgr.add(remote);
      return { rows, eternatus, necrozma, remoteDamage: remote.dmg, beam: G.Eternatus.BEAM_PCT };
    });
    console.log(JSON.stringify(data, null, 2));
    const at = n => data.rows.find(r => r.minute === n);
    assert.ok(data.eternatus.shot >= 40, 'Eternatus ordinary shot must take at least 2% of a 2,000-HP max-reduction build');
    assert.ok(at(45).boss.shot >= 300, '45-minute ordinary boss shots must threaten a 2,000-HP max-reduction build');
    assert.ok(at(60).boss.raw >= at(45).boss.raw * 3, 'boss damage must keep accelerating in endless');
    assert.ok(at(45).horde.shot > at(30).horde.shot * 3, 'horde damage keeps up with the late clock');
    assert.ok(data.necrozma.shot >= 150 && data.necrozma.shot < 1000, 'ordinary Necrozma shots threaten the tank build without a full-health one-shot at 45:00');
    assert.equal(data.remoteDamage, 500, 'guest copies never apply the host damage multiplier twice');
    assert.deepEqual(data.rows.map(r => r.boss.hp), [43200, 88290, 180900, 1486367, 9973350], 'boss HP scaling is unchanged');
    assert.ok(Math.abs(at(10).boss.shot - 21.572201456918265) < 0.01 && Math.abs(at(20).boss.shot - 39.35469184708063) < 0.01, 'early boss damage remains unchanged through 20:00');
    assert.equal(data.beam, 0.75, 'Eternabeam percentage stays unchanged');
    assert.ok(data.rows.every(r => (r.boss.hazard > r.boss.shot || r.boss.shot === 2000) && r.boss.shot > 0), 'ordinary shots and telegraphed hazards both land through real combat, including lethal late hits');
    assert.deepEqual(errors, []);
    console.log('PASS late damage pace: real shots and hazards through player defenses');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
