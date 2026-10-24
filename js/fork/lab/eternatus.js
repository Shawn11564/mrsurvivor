/* ============ eternatus.js — the Eternatus raid (Lab first, MrSurvivor fork) ============
 * In a Lab run, at 30:00 Arceus's Judgment (js/systems/judgment.js) doesn't come: ETERNATUS
 * does. Everyone travels to a dark arena (like the rift's) to fight it:
 *   - 3 OBELISKS (still enemies: endless stunT, they neither move nor hit) heal it while they're
 *     standing, each HEAL of its HP per second, and while any stands a DYNAMAX BARRIER (a dome over it)
 *     cuts the damage it takes to BARRIER (80 % less). You have to break them to beat it: since
 *     2026-10-23, when a strong team beat it without touching them.
 *   - Its HP: the most of the old floor, your single-target damage × 45 s (G.Judgment's) and the team's power
 *     meter × POWER_S s (js/fork/lab/boss-power.js); one hit takes at most HIT_CAP of it.
 *   - THREE STAGES. At PHASE2 of its HP it draws on the Darkest Day: 3 new obelisks rise (the barrier is back,
 *     and their healing can't take it over PHASE2), the beam comes every 12 s instead of 15, and between beams
 *     the DYNAMAX CANNON: 3 warned beams at each of you (CANNON_PCT of your HP each). At PHASE3, ETERNAMAX: it
 *     speeds up, the beam comes every 9 s, the cannon more often, and 2 of the 6 crystals shatter.
 *   - The ETERNABEAM: every BEAM_EVERY s it stands still, warns for BEAM_WARN s and fires at the whole arena.
 *     You're safe if there's a CRYSTAL (or an arena pillar) between it and you; if not, BEAM_PCT of your
 *     HP, pure. While it warns, the safe shadow behind each crystal shows.
 *   - TIME seconds. If Eternatus falls: a ×25 rainbow ticket for each player, back to the map and the
 *     run goes on (rifts open again; the Judgment no longer comes). If time runs
 *     out, the run ends (it faints all of you). Going down in the arena is going down, as always.
 * While it lasts, G.Judgment.active is true: nothing else spawns (waves, events, weather, biome
 * change, wild legendaries) and speed has the Judgment's soft cap.
 * A map site's fight (js/fork/lab/sites.js) that runs into 30:00 finishes first.
 * Hooks: G.Judgment.update (in Lab it doesn't let Arceus start; it does measure your damage, for
 * Eternatus's HP), .active, .AT (rifts look at AT − 2 min), .reset, .drawAir and .drawOverlay;
 * G.Events.drawables (the crystals, sorted by Y); G.World.biomeName. pl._labEternatus: already won (comes back with
 * js/fork/lab/resume.js).
 * Co-op: the host decides. { k:'labeter', a } with a = start (cfg), ids (every obelisk so far), beam, stage (n and
 * the crystals left), win, lose, back. Eternatus and the obelisks travel like any other enemy ('ne'), the cannon as
 * hazards ('hz'); the barrier cuts damage on the host (a guest's hit reaches the host's copy), every screen draws it.
 * Texts in English, like the Lab. Test: fork/test-eternatus.cjs.
 */
G.Eternatus = (() => {
  const AT = 1800, DEX = 890, R = 15, TIME = 210;
  const HEAL = 0.015, BEAM_EVERY = [15, 12, 9], BEAM_FIRST = 10, BEAM_WARN = 3, BEAM_PCT = 0.75, CR = 18;
  const BARRIER = 0.2, PHASE2 = 0.6, PHASE3 = 0.25, HIT_CAP = 0.05, POWER_S = 40, CANNON_EVERY = [0, 7, 4.5], CANNON_PCT = 0.2;
  const RED = '#ff3a6a', SAFE = 'rgba(120,255,200,0.2)';
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;
  let raid = null;   // { x, y, back, biome, crystals, t, phase, endT, bossId, obs, beamT, beam, fired, stage, ceil, cannonT }

  function send(msg) {
    if (!G.Coop.active || !G.Coop.isHost) return;
    msg.k = 'labeter';
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }
  const done = () => !!(G.Game.player && G.Game.player._labEternatus);

  // ---------------- start ----------------

  /** Authority: the spot, the crystals and the way back, and tells everyone. */
  function start() {
    const ts = TS(), pl = G.Game.player;
    const tx = -9000 - Math.floor(Math.random() * 2000), ty = 9000 + Math.floor(Math.random() * 2000);
    const x = tx * ts + ts / 2, y = ty * ts + ts / 2, a0 = Math.random() * 6.2832;
    const crystals = [];
    for (let i = 0; i < 6; i++) {
      const a = a0 + i * 6.2832 / 6, d = ts * (i % 2 ? 5 : 7.5);
      crystals.push([Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.85)]);
    }
    const cfg = { tx, ty, crystals, back: [Math.round(pl.x), Math.round(pl.y)] };
    send({ a: 'start', cfg });
    begin(cfg);
    spawn();
  }

  /** On every computer: travel to the arena. */
  function begin(cfg) {
    if (raid) return;
    const ts = TS(), pl = G.Game.player;
    raid = { x: cfg.tx * ts + ts / 2, y: cfg.ty * ts + ts / 2, back: { x: cfg.back[0], y: cfg.back[1] }, biome: G.World.biome,
      crystals: cfg.crystals.map(([x, y]) => ({ x, y })), t: 0, phase: 'fight', endT: 0, bossId: 0, obs: [],
      beamT: BEAM_FIRST, beam: null, fired: 0, stage: 1, ceil: 1, cannonT: 5 };
    if (authority()) G.EnemyMgr.stash(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    G.Events.reset();
    G.Weather.clear();
    G.World.setArena({ tx: cfg.tx, ty: cfg.ty, r: R, type: 'dark' });
    G.World.setBiome(G.Tiles.arenaBiome('dark'), true);
    const ps = G.Game.everyone();
    ps.forEach((p, i) => { p.x = raid.x + (i - (ps.length - 1) / 2) * 34; p.y = raid.y + ts * 4; });
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Sprites.preload([DEX], 8000);
    G.Game.flash('#ff3a6a', 0.9);
    G.Camera.kick(1.2);
    G.Audio.sfx('rift');
    G.Spawner.say('Eternatus raid! Break the obelisks, hide from the Eternabeam', 4, true);
  }

  /** Authority: Eternatus and its obelisks (with HP based on your damage). */
  function spawn() {
    const ts = TS(), t = G.Game.st.time, n = G.Game.everyone().length;
    const floor = (3200 + t * 9) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1) * 3;
    const single = (G.Judgment.debug && G.Judgment.debug.single) || 0, power = G.LabPower ? G.LabPower.power() : 0;
    const hp = Math.round(Math.max(floor, single * 45, power * POWER_S));
    const def = { dex: DEX, name: 'Eternatus', hp, spd: 38, dmg: Math.round(40 + t / 20), xp: Math.round(1500 + t * 2),
      behavior: 'ranged', shotDmg: Math.round(20 + t / 40), shotCd: 1.1, range: 320 };
    const e = new G.Enemy(def, raid.x, raid.y - ts * 3, { hp: 1, spd: 1, dmg: 1 }, true);
    e.eternatus = true;
    e.flying = false;
    e._hitCap = HIT_CAP;
    G.EnemyMgr.add(e);
    raid.bossId = e.id;
    raid.obHp = Math.round(Math.max(floor * 0.08, single * 5, power * 4));
    raid.obXp = Math.round(200 + t / 4);
    obelisks(-Math.PI / 2, ts * 10);
    G.Audio.sfx('boss');
  }

  /** Authority: 3 obelisks around the arena (from angle a0, d from the middle), and tells the guests. */
  function obelisks(a0, d) {
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 6.2832 / 3;
      const o = new G.Enemy({ dex: DEX, name: 'Obelisk', hp: raid.obHp, spd: 0, dmg: 0, xp: raid.obXp, behavior: 'charger' },
        raid.x + Math.cos(a) * d, raid.y + Math.sin(a) * d * 0.85, { hp: 1, spd: 1, dmg: 1 }, false);
      obelisk(o);
      G.EnemyMgr.add(o);
      raid.obs.push(o.id);
    }
    send({ a: 'ids', boss: raid.bossId, obs: raid.obs });
  }
  /** Is any obelisk standing (the barrier is up)? */
  function shieldUp() {
    return !!raid && raid.obs.some(id => { const o = G.EnemyMgr.get(id); return o && !o.dead; });
  }

  /** An obelisk: still, no hits, with its own drawing (a guest's copy too). */
  function obelisk(o) {
    if (o.obelisk) return;
    o.obelisk = true;
    o.name = 'Obelisk';
    o.flying = false;
    o.stunT = 1e9;
    o.ax = o.x; o.ay = o.y;
    o.draw = drawObelisk;
  }

  // ---------------- every frame ----------------

  function tick(dt, pl, time) {
    if (!raid) {
      if (authority() && lab() && !done() && time >= AT && !G.Rift.inArena && !(G.LabSites && G.LabSites.busy) && G.Game.state === 'playing') start();
      return;
    }
    raid.t += dt;
    for (const c of raid.crystals) push(pl, c);
    beamTick(dt, pl);
    if (raid.phase !== 'fight') {
      raid.endT -= dt;
      if (raid.phase === 'won' && raid.endT <= 0 && authority()) { send({ a: 'back' }); finish(); }
      return;
    }
    if (!authority()) return;
    const boss = G.EnemyMgr.get(raid.bossId);
    const obs = raid.obs.map(id => G.EnemyMgr.get(id)).filter(o => o && !o.dead);
    for (const o of obs) { o.x = o.ax; o.y = o.ay; o.lagT = 0; o.stunT = 1e9; }
    if (boss && !boss.dead) {
      const top = boss.maxHp * raid.ceil;
      if (obs.length && boss.hp < top) boss.hp = Math.min(top, boss.hp + boss.maxHp * HEAL * obs.length * dt);
      if (raid.stage === 1 && boss.hp <= boss.maxHp * PHASE2) stage(2);
      else if (raid.stage === 2 && boss.hp <= boss.maxHp * PHASE3) stage(3);
      keepInside(boss);
      raid.beamT -= dt;
      if (raid.beamT <= 0 && !raid.beam) { raid.beamT = BEAM_EVERY[raid.stage - 1]; charge(boss.x, boss.y); }
      if (raid.beam) boss.stunT = Math.max(boss.stunT || 0, 0.2);
      else if (raid.stage > 1 && !(boss.stunT > 0.3) && (raid.cannonT -= dt) <= 0) { raid.cannonT = CANNON_EVERY[raid.stage - 1]; cannon(boss); }
    }
    if (!boss || boss.dead) { send({ a: 'win' }); won(); return; }
    if (raid.t >= TIME) { send({ a: 'lose' }); lost(); }
  }

  /** Authority: the next stage (2: new obelisks; 3: Eternamax, 2 crystals shatter), and tells the guests. */
  function stage(n) {
    const boss = G.EnemyMgr.get(raid.bossId), keep = raid.crystals.map(c => [Math.round(c.x), Math.round(c.y)]);
    if (n === 3) {
      for (let i = 0; i < 2 && keep.length > 4; i++) keep.splice(Math.floor(Math.random() * keep.length), 1);
      if (boss) boss.spd *= 1.3;
    }
    send({ a: 'stage', n, crystals: keep });
    staged(n, keep);
    if (n === 2) { obelisks(-Math.PI / 2 + Math.PI / 3, TS() * 7.5); raid.cannonT = 4; }
    raid.beamT = Math.min(raid.beamT, BEAM_EVERY[n - 1]);
  }
  /** On every computer: the new stage's look and words. */
  function staged(n, crystals) {
    if (!raid || raid.stage >= n) return;
    raid.stage = n;
    raid.ceil = n === 2 ? PHASE2 : PHASE3;
    const gone = raid.crystals.filter(c => !crystals.some(k => Math.abs(k[0] - c.x) < 2 && Math.abs(k[1] - c.y) < 2));
    for (const c of gone) { G.FX.burst(c.x, c.y - 30, '#cdb6f5', 26, 220); G.FX.ring(c.x, c.y, 6, 70, '#8a5ad0', 0.5, 4); }
    raid.crystals = crystals.map(k => ({ x: k[0], y: k[1] }));
    G.Game.flash(RED, 0.6);
    G.Camera.kick(1.1);
    G.Audio.sfx(n === 3 ? 'boss' : 'quake');
    G.Spawner.say(n === 2 ? 'Eternatus draws on the Darkest Day: the obelisks rise again!' : 'ETERNAMAX! Two crystals shatter, the beam comes faster', 3.6, true);
  }

  /** Authority: the Dynamax Cannon, 3 warned beams at each of you. */
  function cannon(boss) {
    const len = R * TS() * 2;
    for (const p of G.Game.everyone()) {
      if (p.dead) continue;
      const a = Math.atan2(p.y - boss.y, p.x - boss.x);
      for (const k of [-0.32, 0, 0.32]) {
        boss.hazard({ kind: 'beam', x: boss.x, y: boss.y, angle: a + k, len, w: 30, delay: 1.15, dmg: Math.round(boss.shotDmg()),
          pct: CANNON_PCT, type: 'dragon', color: RED });
      }
    }
    boss.anim.play('Charge', { speed: 1.1 });
    G.Audio.sfx('quake');
  }

  /** The crystals are solid (each computer pushes its own Pokémon). */
  function push(p, c) {
    if (!p || p.dead) return;
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), min = CR + (p.r || 10);
    if (d >= min) return;
    if (d < 0.01) { p.y = c.y + min; return; }
    p.x = c.x + dx / d * min; p.y = c.y + dy / d * min;
  }

  function keepInside(e) {
    const max = (R - 2) * TS(), dx = e.x - raid.x, dy = e.y - raid.y, d = Math.hypot(dx, dy);
    if (d > max) { e.x = raid.x + dx / d * max; e.y = raid.y + dy / d * max; }
  }

  // ---------------- Eternabeam ----------------

  /** Starts charging from (x, y) (also what the host sends). */
  function charge(x, y) {
    if (!raid) return;
    raid.beam = { x, y, t: 0 };
    send({ a: 'beam', x: Math.round(x), y: Math.round(y) });
    G.Audio.sfx('quake');
  }

  /** Is there a crystal or a pillar between (ex, ey) and (px, py)? */
  function shielded(ex, ey, px, py) {
    const vx = px - ex, vy = py - ey, L2 = vx * vx + vy * vy;
    if (L2 < 1) return false;
    for (const c of raid.crystals) {
      const k = ((c.x - ex) * vx + (c.y - ey) * vy) / L2;
      if (k <= 0 || k >= 1) continue;
      if (G.U.dist2(c.x, c.y, ex + vx * k, ey + vy * k) < CR * CR) return true;
    }
    const L = Math.sqrt(L2), n = Math.floor(L / 10);
    for (let i = 4; i < n - 1; i++) if (G.World.projectileBlock(ex + vx * i / n, ey + vy * i / n, 2)) return true;
    return false;
  }

  function beamTick(dt, pl) {
    const b = raid.beam;
    if (!b) return;
    b.t += dt;
    if (b.t >= BEAM_WARN && !b.hit) {
      b.hit = true;
      raid.fired++;
      G.Game.flash('#ff2040', 0.7);
      G.Camera.kick(1.4);
      G.Audio.sfx('land');
      for (let i = 0; i < 3; i++) G.FX.ring(b.x, b.y, 20 + i * 30, R * TS(), i % 2 ? '#ffffff' : RED, 0.5 + i * 0.15, 8);
      if (pl && !pl.dead && !shielded(b.x, b.y, pl.x, pl.y)) {
        pl.invuln = 0;
        const hit = () => pl.hurt(pl.maxHp * BEAM_PCT, null, true);
        if (G.DeathCause) G.DeathCause.by({ name: 'Eternatus', dex: DEX, boss: true, how: 'beam' }, hit); else hit();
      }
    }
    if (b.t >= BEAM_WARN + 0.6) raid.beam = null;
  }

  // ---------------- end ----------------

  function won() {
    if (!raid || raid.phase !== 'fight') return;
    raid.phase = 'won'; raid.endT = 5; raid.beam = null;
    const pl = G.Game.player;
    if (pl) pl._labEternatus = 1;
    G.Pickups.pullAll();
    G.Spawner.say('Eternatus is beaten! The run goes on', 4, true);
    if (G.Rainbow) G.Rainbow.give(1, 'You beat Eternatus.');
  }

  function lost() {
    if (!raid || raid.phase !== 'fight') return;
    raid.phase = 'lost'; raid.endT = 99; raid.beam = null;
    G.Spawner.say('Eternatus wins. The Darkest Day falls…', 4, true);
    G.Game.flash('#ff2040', 0.9);
    const pl = G.Game.player;
    if (pl && !pl.dead) {
      pl.invuln = 0; pl.sashT = performance.now();       // (not even the Focus Sash)
      const ko = () => pl.hurt(pl.maxHp * 100, null, true);
      if (G.DeathCause) G.DeathCause.by({ name: 'Eternatus', dex: DEX, boss: true, how: 'raid' }, ko); else ko();
    }
  }

  /** On every computer: back to the map. */
  function finish() {
    const a = raid, pl = G.Game.player;
    if (!a) return;
    raid = null;
    G.World.setBiome(a.biome, true);
    G.Weather.clear();
    if (authority()) G.EnemyMgr.restore();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    for (const p of G.Game.everyone()) { p.x = a.back.x; p.y = a.back.y; }
    if (pl) {
      if (pl.dead) pl.revive(0.3);
      G.Camera.x = pl.x; G.Camera.y = pl.y;
    }
    G.Game.flash('#ff3a6a', 0.8);
  }

  // ---------------- drawing ----------------

  function drawObelisk(ctx) {
    const e = this, a = e.dead ? Math.max(0, e.fade / 0.9) : 1, h = 66, w = 24;
    if (a <= 0) return;
    const now = performance.now() / 1000, x = e.x, y = e.y;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y, 20, 7, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#2a1630';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2 + 4, y - h); ctx.lineTo(x, y - h - 14); ctx.lineTo(x + w / 2 - 4, y - h); ctx.lineTo(x + w / 2, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = a * (0.55 + Math.sin(now * 4 + e.id) * 0.3);
    ctx.fillStyle = RED;
    ctx.fillRect(x - 3, y - h + 6, 6, h - 18);
    if (!e.dead) {
      const bw = 40;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.fillRect(x - bw / 2 - 1, y - h - 28, bw + 2, 6);
      ctx.fillStyle = RED; ctx.fillRect(x - bw / 2, y - h - 27, bw * Math.max(0, e.hp / e.maxHp), 4);
    }
    ctx.restore();
  }

  function drawCrystal(ctx, c) {
    const x = c.x, y = c.y;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(x, y, CR + 2, 7, 0, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#8a5ad0';
    ctx.fillStyle = '#cdb6f5';
    ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 16, y - 26); ctx.lineTo(x + 22, y - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#efe4ff';
    ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x - 11, y - 40); ctx.lineTo(x - 2, y - 60); ctx.lineTo(x + 7, y - 44); ctx.lineTo(x + 13, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 3, y - 46); ctx.stroke();
    ctx.restore();
  }

  /** What goes on top (in the world): the obelisks' links and the safe shadow. */
  function drawWorld(ctx) {
    const boss = G.EnemyMgr.get(raid.bossId), now = performance.now() / 1000;
    if (boss && !boss.dead && shieldUp()) {
      // The Dynamax barrier: a dome over it while an obelisk stands.
      const rx = boss.r * 2.1 + 10, ry = boss.bodyH * 0.75 + 10, cy = boss.y - boss.bodyH * 0.45;
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(now * 3) * 0.05;
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.ellipse(boss.x, cy, rx, ry, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.65; ctx.strokeStyle = '#ff9ab4'; ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]); ctx.lineDashOffset = now * 30;
      ctx.beginPath(); ctx.ellipse(boss.x, cy, rx, ry, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    if (boss && !boss.dead) {
      ctx.save();
      ctx.lineWidth = 3;
      for (const id of raid.obs) {
        const o = G.EnemyMgr.get(id);
        if (!o || o.dead) continue;
        ctx.globalAlpha = 0.45 + Math.sin(now * 6 + id) * 0.2;
        ctx.strokeStyle = RED;
        ctx.setLineDash([10, 8]); ctx.lineDashOffset = -now * 40;
        ctx.beginPath(); ctx.moveTo(o.x, o.y - 70); ctx.lineTo(boss.x, boss.y - boss.bodyH * 0.6); ctx.stroke();
      }
      ctx.restore();
    }
    const b = raid.beam;
    if (!b) return;
    const far = R * TS() * 2;
    ctx.save();
    ctx.fillStyle = b.hit ? 'rgba(120,255,200,0.3)' : SAFE;
    for (const c of raid.crystals) {
      const d = Math.hypot(c.x - b.x, c.y - b.y);
      if (d <= CR) continue;
      const th = Math.atan2(c.y - b.y, c.x - b.x), al = Math.asin(CR / d), L = d + far;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(th + Math.PI / 2) * CR, c.y + Math.sin(th + Math.PI / 2) * CR);
      ctx.lineTo(b.x + Math.cos(th + al) * L, b.y + Math.sin(th + al) * L);
      ctx.lineTo(b.x + Math.cos(th - al) * L, b.y + Math.sin(th - al) * L);
      ctx.lineTo(c.x + Math.cos(th - Math.PI / 2) * CR, c.y + Math.sin(th - Math.PI / 2) * CR);
      ctx.closePath(); ctx.fill();
    }
    // The charge: a red ring that closes in on Eternatus.
    const k = Math.min(1, b.t / BEAM_WARN);
    ctx.globalAlpha = b.hit ? 0.5 : 0.35 + k * 0.4;
    ctx.strokeStyle = RED; ctx.lineWidth = 4 + k * 6;
    ctx.beginPath(); ctx.arc(b.x, b.y - 40, 160 * (1 - k) + 20, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  /** On screen: the clock, the obelisks and the beam warning. */
  function drawScreen(ctx, w, h) {
    const left = Math.max(0, TIME - raid.t), obs = raid.obs.filter(id => { const o = G.EnemyMgr.get(id); return o && !o.dead; }).length;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 14px Pixelify, monospace';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const line = raid.phase === 'won' ? 'ETERNATUS BEATEN' : (raid.stage === 3 ? 'ETERNAMAX · ' : 'ETERNATUS RAID · ') + G.U.mmss(left)
      + (obs ? ' · ' + obs + ' obelisk' + (obs > 1 ? 's shield and heal' : ' shields and heals') + ' it' : '');
    ctx.strokeText(line, w / 2, 118);
    ctx.fillStyle = left < 30 && raid.phase === 'fight' ? RED : '#ffd0dc';
    ctx.fillText(line, w / 2, 118);
    if (obs && raid.phase === 'fight') {
      ctx.font = '700 11px Pixelify, monospace';
      const s2 = 'Break the obelisks: while one stands, Eternatus takes 80% less damage';
      ctx.strokeText(s2, w / 2, 134); ctx.fillStyle = '#ff9ab4'; ctx.fillText(s2, w / 2, 134);
      ctx.font = '700 14px Pixelify, monospace';
    }
    const b = raid.beam;
    if (b && !b.hit) {
      const k = Math.min(1, b.t / BEAM_WARN);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,32,64,0)');
      g.addColorStop(1, `rgba(255,32,64,${0.15 + k * 0.35 + Math.sin(b.t * 20) * 0.05})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.font = '700 22px Pixelify, monospace';
      const s = 'ETERNABEAM in ' + Math.max(0, BEAM_WARN - b.t).toFixed(1) + ' · get behind a crystal!';
      ctx.strokeText(s, w / 2, h * 0.3); ctx.fillStyle = '#fff'; ctx.fillText(s, w / 2, h * 0.3);
    }
    ctx.restore();
  }

  // ---------------- hooks ----------------

  // The Dynamax barrier, where the enemies run (a guest's hit reaches the host's copy). On the hit as capped
  // (boss-power.js caps the final number, after this): a huge burst still only gets BARRIER of the cap through.
  const E = G.Enemy.prototype, hurt = E.hurt;
  E.hurt = function (amount) {
    if (this.eternatus && !this.remote && raid && raid.phase === 'fight' && shieldUp()) {
      const a = [...arguments];
      a[0] = Math.min(amount, this.maxHp * (this._hitCap || 1)) * BARRIER;
      return hurt.apply(this, a);
    }
    return hurt.apply(this, arguments);
  };

  const J = G.Judgment, jActive = Object.getOwnPropertyDescriptor(J, 'active').get;
  Object.defineProperty(J, 'active', { configurable: true, get() { return jActive.call(J) || !!raid; } });
  // Rifts stop opening 2 min before; in Lab, after winning, they come back.
  Object.defineProperty(J, 'AT', { configurable: true, get() { return lab() && done() ? Infinity : AT; } });
  const jUpdate = J.update;
  J.update = function (dt, pl, time) {
    if (!lab() || jActive.call(J)) return jUpdate.apply(this, arguments);
    jUpdate.call(this, dt, pl, 0);       // measures the damage; with the clock at 0, Arceus doesn't start
    tick(dt, pl, time);
  };
  const jReset = J.reset;
  J.reset = function () { raid = null; return jReset.apply(this, arguments); };
  const jAir = J.drawAir;
  J.drawAir = function (ctx) { const r = jAir.apply(this, arguments); if (raid) drawWorld(ctx); return r; };
  const jOver = J.drawOverlay;
  J.drawOverlay = function (ctx, w, h) { const r = jOver.apply(this, arguments); if (raid) drawScreen(ctx, w, h); return r; };
  // (Otherwise the HUD would show the name of the rifts' dark arena.)
  const biomeName = G.World.biomeName;
  G.World.biomeName = function () { return raid ? 'Eternatus Raid' : biomeName.apply(this, arguments); };
  const evDraw = G.Events.drawables;
  G.Events.drawables = function () {
    const r = evDraw.apply(this, arguments);
    if (!raid) return r;
    return (r || []).concat(raid.crystals.map(c => ({ y: c.y, draw: ctx => drawCrystal(ctx, c) })));
  };

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'labeter' || !G.Coop.active || G.Coop.isHost || from !== G.Net.hostUid) return;
    switch (msg.a) {
      case 'start': if (msg.cfg) begin(msg.cfg); break;
      case 'ids': {
        if (!raid) break;
        raid.bossId = msg.boss; raid.obs = (msg.obs || []).slice(0, 6);
        const mark = (n = 0) => {
          let left = 0;
          for (const id of raid ? raid.obs : []) { const o = G.EnemyMgr.get(id); if (o) obelisk(o); else left++; }
          if (left && raid && n < 30) setTimeout(() => mark(n + 1), 150);
        };
        mark();
        break;
      }
      case 'beam': if (raid && raid.phase === 'fight') charge(msg.x, msg.y); break;
      case 'stage': if (raid && Array.isArray(msg.crystals)) staged(msg.n | 0, msg.crystals.slice(0, 6).filter(k => Array.isArray(k) && Number.isFinite(k[0]) && Number.isFinite(k[1]))); break;
      case 'win': won(); break;
      case 'lose': lost(); break;
      case 'back': finish(); break;
    }
  });

  return {
    AT, TIME, BEAM_WARN, BEAM_PCT, DEX, BARRIER, PHASE2, PHASE3, POWER_S, shielded: (...a) => !!raid && shielded(...a),
    get barrier() { return shieldUp(); },
    get active() { return !!raid; }, get raid() { return raid; },
    /** For tests: the Eternabeam right now, or the time left. */
    debugBeam() { const b = raid && G.EnemyMgr.get(raid.bossId); if (b && authority()) { raid.beamT = BEAM_EVERY; charge(b.x, b.y); } },
    debugTimeLeft(s) { if (raid) raid.t = TIME - s; }
  };
})();
