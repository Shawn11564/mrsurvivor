/* ============ necrozma.js — the Necrozma raid at 45:00 (MrSurvivor fork) ============
 * Once Eternatus is beaten (js/fork/lab/eternatus.js), at 45:00 NECROZMA comes: everyone travels to a
 * psychic arena (like the rift's) of radius R to fight it, and the light is the fight:
 *   - THE LIGHT starts full and Necrozma drinks it, DRAIN % a second; the screen darkens as it falls (each of you sees
 *     only a shrinking circle around your Pokémon; the prisms glimmer through). At 0 the DARKNESS hurts every one of
 *     you DARK_PCT of your max HP a second (pure) and heals Necrozma DARK_HEAL a second.
 *   - 4 PRISMS stand around the arena (still enemies, no hits). Breaking one floods the arena with light (back to
 *     full), stuns Necrozma for STUN s and EXPOSES it for EXPOSE s. A broken prism re-forms REFORM s later.
 *   - PRISM ARMOR: Necrozma takes ARMOR of every hit, except while exposed (×EXPOSED). So you choose: break a prism
 *     now for a damage window, or keep it for when the dark comes. One hit takes at most HIT_CAP of its HP.
 *   - Its own boss attacks, PHOTON GEYSER (a warned pillar of light under each of you, GEYSER_PCT of your HP) and the
 *     PRISMATIC LASER (a warned beam sweeping across the arena, LASER_PCT of your HP).
 *   - At PHASE2 of its HP, ULTRA BURST: faster, the light drains quicker, geysers come more often, prisms re-form sooner.
 *   - Its HP: the most of 3× a rift legendary's, 45 s of your single-target damage (G.Judgment's) and POWER_S s of the
 *     team's power meter (js/fork/lab/boss-power.js).
 *   - TIME s. Beat it: a ×25 rainbow ticket and 3 gems each, half your HP back, TWO relic picks each (js/fork/lab/
 *     relics.js), XP for at least a level, back to the map and the run goes on (rifts open again). Time runs out: the
 *     run ends (it knocks out all of you). Going down in the arena is going down.
 * While it lasts G.Judgment.active is true (nothing else spawns, as for Eternatus). Rifts stop 2 min before (G.Judgment
 * .AT is 45:00 between the two raids), map sites (js/fork/lab/sites.js) 190 s before, and a site fight finishes first.
 * Hooks: G.Judgment.update / .active / .AT / .reset / .drawAir / .drawOverlay, G.World.biomeName, G.World.drawVignette
 * (the darkness, under the HUD), G.Enemy.prototype.hurt (the armor). pl._labNecrozma: beaten (kept by resume.js).
 * Co-op: the host decides. { k:'labnecro', a } with a = start (cfg), ids (boss, a prism id per slot, 0 = broken),
 * st (light, exposed, stage: 4 a second), shatter (slot), stage, win, lose, back. Necrozma and the prisms travel like
 * any enemy ('ne'), its attacks as hazards ('hz'); each computer hurts its own Pokémon in the dark.
 * Texts in English. Test: fork/test-necrozma.cjs.
 */
G.Necrozma = (() => {
  const AT = 2700, DEX = 800, R = 15, TIME = 210, PRISMS = 4;
  const DRAIN = [4, 6], REFORM = [25, 18], EXPOSE = 7, STUN = 2.5, ARMOR = 0.5, EXPOSED = 1.25, HIT_CAP = 0.05, POWER_S = 45;
  const DARK_PCT = 0.08, DARK_HEAL = 0.015, GEYSER = [7, 5], GEYSER_PCT = 0.25, LASER = 12, LASER_PCT = 0.3, PHASE2 = 0.5;
  const GOLD = '#ffe27a', PALE = '#fff6c8', VIOLET = '#7a4cff';
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;
  const done = () => !!(G.Game.player && G.Game.player._labNecrozma);
  const eterDone = () => !!(G.Game.player && G.Game.player._labEternatus);
  const SRC = { name: 'Necrozma', dex: DEX, boss: true };
  let raid = null;   // { x, y, back, biome, t, phase, endT, bossId, slots: [{ x, y, id, reT }], light, ex, stage, geyserT, laserT, darkT, netT }

  function send(msg) {
    if (!G.Coop.active || !G.Coop.isHost) return;
    msg.k = 'labnecro';
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }

  // ---------------- start ----------------

  /** Authority: the spot, the prisms' places and the way back, and tells everyone. */
  function start() {
    const ts = TS(), pl = G.Game.player;
    const tx = 9000 + Math.floor(Math.random() * 2000), ty = -9000 - Math.floor(Math.random() * 2000);
    const x = tx * ts + ts / 2, y = ty * ts + ts / 2, a0 = Math.random() * 6.2832;
    const slots = [];
    for (let i = 0; i < PRISMS; i++) { const a = a0 + i * 6.2832 / PRISMS; slots.push([Math.round(x + Math.cos(a) * ts * 9.5), Math.round(y + Math.sin(a) * ts * 9.5 * 0.85)]); }
    const cfg = { tx, ty, slots, back: [Math.round(pl.x), Math.round(pl.y)] };
    send({ a: 'start', cfg });
    begin(cfg);
    spawn();
  }

  /** On every computer: travel to the arena. */
  function begin(cfg) {
    if (raid) return;
    const ts = TS(), pl = G.Game.player;
    raid = { x: cfg.tx * ts + ts / 2, y: cfg.ty * ts + ts / 2, back: { x: cfg.back[0], y: cfg.back[1] }, biome: G.World.biome, t: 0,
      phase: 'fight', endT: 0, bossId: 0, slots: cfg.slots.slice(0, PRISMS).map(([x, y]) => ({ x, y, id: 0, reT: 0 })),
      light: 100, ex: 0, stage: 1, geyserT: 5, laserT: 9, darkT: 0, netT: 0 };
    if (authority()) G.EnemyMgr.stash(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    G.Events.reset();
    G.Weather.clear();
    G.World.setArena({ tx: cfg.tx, ty: cfg.ty, r: R, type: 'psychic' });
    G.World.setBiome(G.Tiles.arenaBiome('psychic'), true);
    const ps = G.Game.everyone();
    ps.forEach((p, i) => { p.x = raid.x + (i - (ps.length - 1) / 2) * 34; p.y = raid.y + ts * 4; });
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Sprites.preload([DEX], 8000);
    G.Game.flash(PALE, 0.9);
    G.Camera.kick(1.2);
    G.Audio.sfx('rift');
    G.Spawner.say('Necrozma raid! It devours the light: break the prisms to bring it back', 4, true);
  }

  /** Authority: Necrozma and its prisms (HP from your damage). */
  function spawn() {
    const ts = TS(), t = G.Game.st.time, n = G.Game.everyone().length;
    const floor = (3200 + t * 9) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1) * 3;
    const single = (G.Judgment.debug && G.Judgment.debug.single) || 0, power = G.LabPower ? G.LabPower.power() : 0;
    const hp = Math.round(Math.max(floor, single * 45, power * POWER_S));
    const dk = G.LabPower ? G.LabPower.raidDmgK(t) : 1;
    const def = { dex: DEX, name: 'Necrozma', hp, spd: 44, dmg: Math.round((40 + t / 20) * dk), xp: Math.round(2500 + t * 2),
      behavior: 'ranged', shotDmg: Math.round((22 + t / 40) * dk), shotCd: 1.0, range: 320 };
    const e = new G.Enemy(def, raid.x, raid.y - ts * 3, { hp: 1, spd: 1, dmg: 1 }, true);
    e.necrozma = true; e.flying = false; e._noPower = true; e._hitCap = HIT_CAP;
    G.EnemyMgr.add(e);
    raid.bossId = e.id;
    raid.prismHp = Math.round(Math.max(floor * 0.05, single * 3, power * 3));
    raid.prismXp = Math.round(300 + t / 4);
    for (let i = 0; i < PRISMS; i++) prism(i, true);
    ids();
    G.Audio.sfx('boss');
  }
  /** Authority: the prism in slot i. */
  function prism(i, quiet) {
    const s = raid.slots[i];
    const o = new G.Enemy({ dex: DEX, name: 'Prism', hp: raid.prismHp, spd: 0, dmg: 0, xp: raid.prismXp, behavior: 'charger' }, s.x, s.y, { hp: 1, spd: 1, dmg: 1 }, false);
    o._noScale = true; o._noPower = true;
    look(o);
    o.ax = s.x; o.ay = s.y;
    G.EnemyMgr.add(o);
    s.id = o.id; s.reT = 0;
    if (!quiet) { ids(); G.FX.ring(s.x, s.y, 6, 60, PALE, 0.5, 4); }
  }
  function ids() { send({ a: 'ids', boss: raid.bossId, prisms: raid.slots.map(s => s.id) }); }
  /** A prism: still, no hits, drawn as a crystal of light (a guest's copy too). */
  function look(o) {
    if (o.necroPrism) return;
    o.necroPrism = true; o.name = 'Prism'; o.flying = false; o.stunT = 1e9;
    o.draw = drawPrism;
  }

  // ---------------- every frame ----------------

  function tick(dt, pl, time) {
    if (!raid) {
      if (authority() && lab() && eterDone() && !done() && time >= AT && !G.Rift.inArena && !(G.Eternatus && G.Eternatus.active)
        && !(G.LabSites && G.LabSites.busy) && G.Game.state === 'playing') start();
      return;
    }
    raid.t += dt;
    if (raid.phase !== 'fight') {
      raid.endT -= dt;
      if (raid.phase === 'won' && raid.endT <= 0 && authority()) { send({ a: 'back' }); finish(); }
      return;
    }
    raid.light = Math.max(0, raid.light - DRAIN[raid.stage - 1] * dt);
    raid.ex = Math.max(0, raid.ex - dt);
    // The dark: each computer hurts its own Pokémon.
    if (raid.light <= 0 && pl && !pl.dead) {
      if ((raid.darkT -= dt) <= 0) {
        raid.darkT = 1;
        pl.invuln = 0;
        const hit = () => pl.hurt(pl.maxHp * DARK_PCT, null, true);
        if (G.DeathCause) G.DeathCause.by(Object.assign({ how: 'dark' }, SRC), hit); else hit();
      }
    } else raid.darkT = 0.6;
    if (!authority()) return;
    const boss = G.EnemyMgr.get(raid.bossId);
    raid.slots.forEach((s, i) => {
      if (s.id) {
        const o = G.EnemyMgr.get(s.id);
        if (o && !o.dead) { o.x = o.ax; o.y = o.ay; o.lagT = 0; o.stunT = 1e9; return; }
        s.id = 0; s.reT = REFORM[raid.stage - 1];
        send({ a: 'shatter', i }); shatter(i); ids();
        return;
      }
      if ((s.reT -= dt) <= 0) prism(i);
    });
    if (boss && !boss.dead) {
      keepInside(boss);
      if (raid.light <= 0) boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * DARK_HEAL * dt);
      if (raid.stage === 1 && boss.hp <= boss.maxHp * PHASE2) { send({ a: 'stage' }); burst(); boss.spd *= 1.25; }
      if (!(boss.stunT > 0.3)) {
        if ((raid.geyserT -= dt) <= 0) { raid.geyserT = GEYSER[raid.stage - 1]; geyser(boss); }
        if ((raid.laserT -= dt) <= 0) { raid.laserT = LASER; laser(boss); }
      }
    }
    if ((raid.netT -= dt) <= 0) { raid.netT = 0.25; send({ a: 'st', l: Math.round(raid.light * 10) / 10, ex: Math.round(raid.ex * 10) / 10, s: raid.stage }); }
    if (!boss || boss.dead) { send({ a: 'win' }); won(); return; }
    if (raid.t >= TIME) { send({ a: 'lose' }); lost(); }
  }

  function keepInside(e) {
    const max = (R - 2) * TS(), dx = e.x - raid.x, dy = e.y - raid.y, d = Math.hypot(dx, dy);
    if (d > max) { e.x = raid.x + dx / d * max; e.y = raid.y + dy / d * max; }
  }

  /** On every computer: a prism shattered: light, and Necrozma exposed. */
  function shatter(i) {
    if (!raid) return;
    const s = raid.slots[i];
    raid.light = 100; raid.ex = EXPOSE;
    if (s) { G.FX.burst(s.x, s.y - 30, PALE, 30, 240); G.FX.ring(s.x, s.y, 8, R * TS(), PALE, 0.6, 6); }
    G.Game.flash(PALE, 0.5);
    G.Audio.sfx('legend');
    if (authority()) {
      const b = G.EnemyMgr.get(raid.bossId);
      if (b && !b.dead) { b.stunT = Math.max(b.stunT || 0, STUN); if (b.ai) b.ai.cast = null; }
    }
    G.Spawner.say('The prism shatters! Light floods back: Necrozma is exposed', 2.6, true);
  }
  /** On every computer: Ultra Burst. */
  function burst() {
    if (!raid || raid.stage > 1) return;
    raid.stage = 2;
    G.Game.flash(GOLD, 0.7);
    G.Camera.kick(1.2);
    G.Audio.sfx('boss');
    G.Spawner.say('ULTRA BURST! Necrozma devours the light faster', 3.4, true);
  }

  /** Authority: Photon Geyser, a warned pillar of light under each of you. */
  function geyser(boss) {
    for (const p of G.Game.everyone()) {
      if (p.dead) continue;
      boss.hazard({ kind: 'zone', x: p.x, y: p.y, r: 64, delay: 1.3, dmg: Math.round(boss.shotDmg()), pct: GEYSER_PCT, type: 'psychic', color: GOLD, vis: 'pillar' });
    }
    boss.anim.play('Shoot', { speed: 1 });
  }
  /** Authority: the Prismatic Laser, a beam sweeping across the arena. */
  function laser(boss) {
    const ps = G.Game.everyone().filter(p => !p.dead);
    if (!ps.length) return;
    const tg = G.U.pick(ps), dir = Math.random() < 0.5 ? 1 : -1, a0 = Math.atan2(tg.y - boss.y, tg.x - boss.x) - dir * 0.9;
    for (let i = 0; i < 9; i++) {
      boss.hazard({ kind: 'beam', x: boss.x, y: boss.y, angle: a0 + dir * i * 0.225, len: R * TS() * 2, w: 30, delay: 1.0 + i * 0.11,
        dmg: Math.round(boss.shotDmg() * 1.2), pct: LASER_PCT, type: 'psychic', color: '#fff3b0' });
    }
    boss.anim.play('Charge', { speed: 1 });
    G.Audio.sfx('quake');
  }

  // ---------------- end ----------------

  function won() {
    if (!raid || raid.phase !== 'fight') return;
    raid.phase = 'won'; raid.endT = 5; raid.light = 100;
    const pl = G.Game.player, b = G.EnemyMgr.get(raid.bossId);
    if (pl) {
      pl._labNecrozma = 1;
      if (pl.dead) pl.revive(0.5); else pl.heal(pl.maxHp * 0.5);
      if (G.LabRelics) { G.LabRelics.grant(pl, 'any'); G.LabRelics.grant(pl, 'any'); }
    }
    if (authority() && pl) {
      const x = b ? b.x : raid.x, y = b ? b.y : raid.y, k = (pl.xpMul || 1) * (G.Coop.active ? G.Coop.xpFactor() : 1);
      G.Pickups.dropXp(x, y, Math.ceil((pl.xpNext - pl.xp) / Math.max(0.01, k) * 1.05) + 1, true, false, true);
    }
    G.Pickups.pullAll();
    if (G.Gems) G.Gems.give(3);
    if (G.Rainbow) G.Rainbow.give(1, 'You beat Necrozma.');
    G.Spawner.say('Necrozma is beaten! The light returns: two relics await you', 4, true);
  }

  function lost() {
    if (!raid || raid.phase !== 'fight') return;
    raid.phase = 'lost'; raid.endT = 99;
    G.Spawner.say('Necrozma swallows the last light…', 4, true);
    G.Game.flash('#000000', 0.9);
    const pl = G.Game.player;
    if (pl && !pl.dead) {
      pl.invuln = 0; pl.sashT = performance.now();       // (not even the Focus Sash)
      const ko = () => pl.hurt(pl.maxHp * 100, null, true);
      if (G.DeathCause) G.DeathCause.by(Object.assign({ how: 'raid' }, SRC), ko); else ko();
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
    G.Game.flash(PALE, 0.8);
  }

  // ---------------- drawing ----------------

  function drawPrism(ctx) {
    const e = this, a = e.dead ? Math.max(0, e.fade / 0.9) : 1;
    if (a <= 0) return;
    const now = performance.now() / 1000, x = e.x, y = e.y, h = 58, glow = 0.5 + Math.sin(now * 3 + e.id) * 0.25;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, 18, 6, 0, 0, 6.2832); ctx.fill();
    const g = ctx.createRadialGradient(x, y - h * 0.5, 4, x, y - h * 0.5, 46);
    g.addColorStop(0, `rgba(255,246,200,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - h * 0.5, 46, 0, 6.2832); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#fff3b0';
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 13, y - h * 0.45); ctx.lineTo(x, y - h); ctx.lineTo(x + 13, y - h * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - 4, y - h * 0.45); ctx.lineTo(x, y - h + 8); ctx.closePath(); ctx.fill();
    if (!e.dead) {
      const bw = 36;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.fillRect(x - bw / 2 - 1, y - h - 16, bw + 2, 6);
      ctx.fillStyle = GOLD; ctx.fillRect(x - bw / 2, y - h - 15, bw * Math.max(0, e.hp / e.maxHp), 4);
    }
    ctx.restore();
  }

  /** In the world: rays from the prisms into Necrozma while it is exposed. */
  function drawWorld(ctx) {
    const boss = G.EnemyMgr.get(raid.bossId);
    if (!boss || boss.dead) return;
    const now = performance.now() / 1000;
    ctx.save();
    if (raid.ex > 0) {
      ctx.globalAlpha = 0.25 + Math.sin(now * 10) * 0.1; ctx.strokeStyle = PALE; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(boss.x, boss.y, boss.r * 2, boss.r * 0.8, 0, 0, 6.2832); ctx.stroke();
    } else {
      // Prism Armor: dark facets over it.
      ctx.globalAlpha = 0.22; ctx.fillStyle = VIOLET;
      const cy = boss.y - boss.bodyH * 0.45, rx = boss.r * 1.9 + 8, ry = boss.bodyH * 0.7 + 8;
      ctx.beginPath(); ctx.moveTo(boss.x, cy - ry); ctx.lineTo(boss.x + rx, cy); ctx.lineTo(boss.x, cy + ry); ctx.lineTo(boss.x - rx, cy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.strokeStyle = '#b89cff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  /** The darkness (under the HUD): a shrinking circle of sight around your Pokémon; the prisms glimmer through it. */
  function drawDark(ctx, w, h) {
    const k = raid.light / 100;
    if (k >= 0.995 || raid.phase !== 'fight') return;
    const pl = G.Game.watching || G.Game.player, cam = G.Camera;
    if (!pl) return;
    const px = (pl.x - cam.left()) * cam.scale, py = (pl.y - 20 - cam.top()) * cam.scale, big = Math.max(w, h);
    const inner = 70 + Math.pow(k, 0.8) * big * 0.75, a = 0.94 * Math.pow(1 - k, 0.6);
    ctx.save();
    const g = ctx.createRadialGradient(px, py, inner, px, py, inner + 150);
    g.addColorStop(0, 'rgba(6,2,16,0)'); g.addColorStop(1, `rgba(6,2,16,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const now = performance.now() / 1000;
    for (const s of raid.slots) {
      const o = s.id && G.EnemyMgr.get(s.id);
      if (!o || o.dead) continue;
      const sx = (o.x - cam.left()) * cam.scale, sy = (o.y - 30 - cam.top()) * cam.scale;
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      const r = 6 + Math.sin(now * 4 + o.id) * 2;
      ctx.globalAlpha = 0.85; ctx.fillStyle = PALE;
      ctx.beginPath(); ctx.moveTo(sx, sy - r * 1.6); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r * 1.6); ctx.lineTo(sx - r, sy); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /** On screen: the clock, the light and what to do. */
  function drawScreen(ctx, w, h) {
    const left = Math.max(0, TIME - raid.t), raw = (m, t, x, y) => G.I18n.rawCanvas(ctx, m, t, x, y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 14px Pixelify, monospace';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const line = raid.phase === 'won' ? 'NECROZMA BEATEN' : (raid.stage === 2 ? 'ULTRA NECROZMA · ' : 'NECROZMA RAID · ') + G.U.mmss(left);
    raw('strokeText', line, w / 2, 118);
    ctx.fillStyle = left < 30 && raid.phase === 'fight' ? '#ff5f6d' : PALE;
    raw('fillText', line, w / 2, 118);
    if (raid.phase === 'fight') {
      const bw = 220, x0 = w / 2 - bw / 2, y0 = 126, k = raid.light / 100;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x0 - 2, y0 - 2, bw + 4, 10);
      ctx.fillStyle = k > 0.3 ? GOLD : '#ff8a5a'; ctx.fillRect(x0, y0, bw * k, 6);
      ctx.font = '700 11px Pixelify, monospace';
      const s2 = raid.ex > 0 ? 'EXPOSED ' + Math.ceil(raid.ex) + ' s · strike now!'
        : k <= 0 ? 'DARKNESS! Break a prism to bring the light back' : 'Light ' + Math.round(k * 100) + '% · Prism Armor halves your damage: break a prism to expose it';
      raw('strokeText', s2, w / 2, y0 + 22); ctx.fillStyle = raid.ex > 0 ? GOLD : k <= 0 ? '#ff8a5a' : '#e6dcff'; raw('fillText', s2, w / 2, y0 + 22);
    }
    ctx.restore();
  }

  // ---------------- hooks ----------------

  // Prism Armor, where the enemies run (a guest's hit reaches the host's copy), on the hit as capped.
  const E = G.Enemy.prototype, hurt = E.hurt;
  E.hurt = function (amount) {
    if (this.necrozma && !this.remote && raid && raid.phase === 'fight') {
      const a = [...arguments];
      a[0] = Math.min(amount, this.maxHp * (this._hitCap || 1)) * (raid.ex > 0 ? EXPOSED : ARMOR);
      return hurt.apply(this, a);
    }
    return hurt.apply(this, arguments);
  };

  const J = G.Judgment, jActive = Object.getOwnPropertyDescriptor(J, 'active').get;
  Object.defineProperty(J, 'active', { configurable: true, get() { return jActive.call(J) || !!raid; } });
  // Between the two raids the next one is at 45:00 (rifts stop 2 min before, map sites 190 s before).
  const jAt = Object.getOwnPropertyDescriptor(J, 'AT').get;
  Object.defineProperty(J, 'AT', { configurable: true, get() { return lab() && eterDone() ? (done() ? Infinity : AT) : jAt.call(J); } });
  const jUpdate = J.update;
  J.update = function (dt, pl, time) {
    const r = jUpdate.apply(this, arguments);
    if (lab()) tick(dt, pl, time);
    return r;
  };
  const jReset = J.reset;
  J.reset = function () { raid = null; return jReset.apply(this, arguments); };
  const jAir = J.drawAir;
  J.drawAir = function (ctx) { const r = jAir.apply(this, arguments); if (raid) drawWorld(ctx); return r; };
  const jOver = J.drawOverlay;
  J.drawOverlay = function (ctx, w, h) { const r = jOver.apply(this, arguments); if (raid) drawScreen(ctx, w, h); return r; };
  const vignette = G.World.drawVignette;
  G.World.drawVignette = function (ctx, w, h) { const r = vignette.apply(this, arguments); if (raid) drawDark(ctx, w, h); return r; };
  const biomeName = G.World.biomeName;
  G.World.biomeName = function () { return raid ? 'Ultra Space' : biomeName.apply(this, arguments); };

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'labnecro' || !G.Coop.active || G.Coop.isHost || from !== G.Net.hostUid) return;
    switch (msg.a) {
      case 'start': if (msg.cfg && Array.isArray(msg.cfg.slots)) begin(msg.cfg); break;
      case 'ids': {
        if (!raid || !Array.isArray(msg.prisms)) break;
        raid.bossId = msg.boss;
        msg.prisms.slice(0, PRISMS).forEach((id, i) => { if (raid.slots[i]) raid.slots[i].id = id | 0; });
        const mark = (n = 0) => {
          let left = 0;
          for (const s of raid ? raid.slots : []) { if (!s.id) continue; const o = G.EnemyMgr.get(s.id); if (o) look(o); else left++; }
          if (left && raid && n < 30) setTimeout(() => mark(n + 1), 150);
        };
        mark();
        break;
      }
      case 'st': if (raid && raid.phase === 'fight') { raid.light = +msg.l || 0; raid.ex = +msg.ex || 0; if ((msg.s | 0) === 2) burst(); } break;
      case 'shatter': shatter(msg.i | 0); break;
      case 'stage': burst(); break;
      case 'win': won(); break;
      case 'lose': lost(); break;
      case 'back': finish(); break;
    }
  });

  if (G.I18n && G.I18n.add) G.I18n.add(Object.fromEntries(['Necrozma raid! It devours the light: break the prisms to bring it back',
    'The prism shatters! Light floods back: Necrozma is exposed', 'ULTRA BURST! Necrozma devours the light faster',
    'Necrozma is beaten! The light returns: two relics await you', 'Necrozma swallows the last light…', 'You beat Necrozma.',
    'Ultra Space', 'Prism', 'darkness'].map(x => [x, x])), 'en');

  return {
    AT, TIME, DEX, ARMOR, EXPOSED, EXPOSE, DRAIN, REFORM, DARK_PCT, POWER_S, PHASE2,
    get active() { return !!raid; }, get raid() { return raid; }, get done() { return done(); },
    /** For tests: the time left. */
    debugTimeLeft(s) { if (raid) raid.t = TIME - s; }
  };
})();
