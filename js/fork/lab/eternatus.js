/* ============ eternatus.js — la incursión de Eternatus (Lab primero, fork MrSurvivor) ============
 * En una partida Lab, a las 30:00 no llega la Sentencia de Arceus (js/systems/judgment.js): llega
 * ETERNATUS. Todos viajan a una arena oscura (como la de la grieta) contra él:
 *   - 3 OBELISCOS (enemigos quietos: stunT eterno, ni se mueven ni pegan) lo curan mientras sigan en
 *     pie, cada uno HEAL de su vida por segundo. Hay que romperlos para poder con él.
 *   - El ETERNABEAM: cada BEAM_EVERY s se queda quieto, avisa BEAM_WARN s y dispara a toda la arena.
 *     Te salvas si hay un CRISTAL (o una columna de la arena) entre él y tú; si no, BEAM_PCT de tu
 *     vida, puro. Mientras avisa se ve la sombra segura detrás de cada cristal.
 *   - TIME segundos. Si cae Eternatus: un ticket arcoíris ×25 para cada uno, de vuelta al mapa y la
 *     partida sigue (las grietas vuelven a abrirse; la Sentencia ya no llega). Si se acaba el
 *     tiempo, se acaba la partida (os debilita a todos). Caer en la arena es caer, como siempre.
 * Mientras dura, G.Judgment.active es true: nada más sale (oleadas, eventos, clima, cambio de
 * bioma, legendarios salvajes) y la velocidad tiene el tope suave de la Sentencia.
 * Ganchos: G.Judgment.update (en Lab no deja empezar a Arceus; sí mide vuestro daño, para la vida
 * de Eternatus), .active, .AT (las grietas miran AT − 2 min), .reset, .drawAir y .drawOverlay;
 * G.Events.drawables (los cristales, ordenados por Y); G.World.biomeName. pl._labEternatus: ya ganada (vuelve con
 * js/fork/lab/resume.js).
 * Cooperativo: lo decide el anfitrión. { k:'labeter', a } con a = start (cfg), ids, beam, win, lose,
 * back. Eternatus y los obeliscos van como cualquier enemigo ('ne').
 * Textos en inglés, como el Lab. Prueba: fork/test-eternatus.cjs.
 */
G.Eternatus = (() => {
  const AT = 1800, DEX = 890, R = 15, TIME = 180;
  const HEAL = 0.015, BEAM_EVERY = 15, BEAM_FIRST = 10, BEAM_WARN = 3, BEAM_PCT = 0.75, CR = 18;
  const RED = '#ff3a6a', SAFE = 'rgba(120,255,200,0.2)';
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;
  let raid = null;   // { x, y, back, biome, crystals, t, phase, endT, bossId, obs, beamT, beam, fired }

  function send(msg) {
    if (!G.Coop.active || !G.Coop.isHost) return;
    msg.k = 'labeter';
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }
  const done = () => !!(G.Game.player && G.Game.player._labEternatus);

  // ---------------- empezar ----------------

  /** Quien manda: el sitio, los cristales y la vuelta, y avisa a todos. */
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

  /** En cada ordenador: viaje a la arena. */
  function begin(cfg) {
    if (raid) return;
    const ts = TS(), pl = G.Game.player;
    raid = { x: cfg.tx * ts + ts / 2, y: cfg.ty * ts + ts / 2, back: { x: cfg.back[0], y: cfg.back[1] }, biome: G.World.biome,
      crystals: cfg.crystals.map(([x, y]) => ({ x, y })), t: 0, phase: 'fight', endT: 0, bossId: 0, obs: [],
      beamT: BEAM_FIRST, beam: null, fired: 0 };
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

  /** Quien manda: Eternatus y sus obeliscos (con la vida según vuestro daño). */
  function spawn() {
    const ts = TS(), t = G.Game.st.time, n = G.Game.everyone().length;
    const floor = (3200 + t * 9) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1) * 3;
    const single = (G.Judgment.debug && G.Judgment.debug.single) || 0;
    const hp = Math.round(Math.max(floor, single * 45));
    const def = { dex: DEX, name: 'Eternatus', hp, spd: 38, dmg: Math.round(40 + t / 20), xp: Math.round(1500 + t * 2),
      behavior: 'ranged', shotDmg: Math.round(20 + t / 40), shotCd: 1.1, range: 320 };
    const e = new G.Enemy(def, raid.x, raid.y - ts * 3, { hp: 1, spd: 1, dmg: 1 }, true);
    e.eternatus = true;
    e.flying = false;
    G.EnemyMgr.add(e);
    raid.bossId = e.id;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * 6.2832 / 3, d = ts * 10;
      const o = new G.Enemy({ dex: DEX, name: 'Obelisk', hp: Math.round(Math.max(floor * 0.08, single * 5)), spd: 0, dmg: 0,
        xp: Math.round(200 + t / 4), behavior: 'charger' }, raid.x + Math.cos(a) * d, raid.y + Math.sin(a) * d * 0.85, { hp: 1, spd: 1, dmg: 1 }, false);
      obelisk(o);
      G.EnemyMgr.add(o);
      raid.obs.push(o.id);
    }
    send({ a: 'ids', boss: e.id, obs: raid.obs });
    G.Audio.sfx('boss');
  }

  /** Un obelisco: quieto, sin golpes, con su propio dibujo (también la copia de un invitado). */
  function obelisk(o) {
    if (o.obelisk) return;
    o.obelisk = true;
    o.name = 'Obelisk';
    o.flying = false;
    o.stunT = 1e9;
    o.ax = o.x; o.ay = o.y;
    o.draw = drawObelisk;
  }

  // ---------------- cada fotograma ----------------

  function tick(dt, pl, time) {
    if (!raid) {
      if (authority() && lab() && !done() && time >= AT && !G.Rift.inArena && G.Game.state === 'playing') start();
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
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * HEAL * obs.length * dt);
      keepInside(boss);
      raid.beamT -= dt;
      if (raid.beamT <= 0 && !raid.beam) { raid.beamT = BEAM_EVERY; charge(boss.x, boss.y); }
      if (raid.beam) boss.stunT = Math.max(boss.stunT || 0, 0.2);
    }
    if (!boss || boss.dead) { send({ a: 'win' }); won(); return; }
    if (raid.t >= TIME) { send({ a: 'lose' }); lost(); }
  }

  /** Los cristales son sólidos (cada uno empuja a su Pokémon). */
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

  /** Empieza a cargar desde (x, y) (también lo que manda el anfitrión). */
  function charge(x, y) {
    if (!raid) return;
    raid.beam = { x, y, t: 0 };
    send({ a: 'beam', x: Math.round(x), y: Math.round(y) });
    G.Audio.sfx('quake');
  }

  /** ¿Hay un cristal o una columna entre (ex, ey) y (px, py)? */
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

  // ---------------- final ----------------

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
      pl.invuln = 0; pl.sashT = performance.now();       // (ni la Banda Focus)
      const ko = () => pl.hurt(pl.maxHp * 100, null, true);
      if (G.DeathCause) G.DeathCause.by({ name: 'Eternatus', dex: DEX, boss: true, how: 'raid' }, ko); else ko();
    }
  }

  /** En cada ordenador: de vuelta al mapa. */
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

  // ---------------- dibujo ----------------

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

  /** Lo que va por encima (en el mundo): los lazos de los obeliscos y la sombra segura. */
  function drawWorld(ctx) {
    const boss = G.EnemyMgr.get(raid.bossId), now = performance.now() / 1000;
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
    // La carga: un anillo rojo que se cierra sobre Eternatus.
    const k = Math.min(1, b.t / BEAM_WARN);
    ctx.globalAlpha = b.hit ? 0.5 : 0.35 + k * 0.4;
    ctx.strokeStyle = RED; ctx.lineWidth = 4 + k * 6;
    ctx.beginPath(); ctx.arc(b.x, b.y - 40, 160 * (1 - k) + 20, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  /** En pantalla: el reloj, los obeliscos y el aviso del rayo. */
  function drawScreen(ctx, w, h) {
    const left = Math.max(0, TIME - raid.t), obs = raid.obs.filter(id => { const o = G.EnemyMgr.get(id); return o && !o.dead; }).length;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 14px Pixelify, monospace';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const line = raid.phase === 'won' ? 'ETERNATUS BEATEN' : 'ETERNATUS RAID · ' + G.U.mmss(left) + (obs ? ' · ' + obs + ' obelisk' + (obs > 1 ? 's heal' : ' heals') + ' it' : '');
    ctx.strokeText(line, w / 2, 118);
    ctx.fillStyle = left < 30 && raid.phase === 'fight' ? RED : '#ffd0dc';
    ctx.fillText(line, w / 2, 118);
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

  // ---------------- ganchos ----------------

  const J = G.Judgment, jActive = Object.getOwnPropertyDescriptor(J, 'active').get;
  Object.defineProperty(J, 'active', { configurable: true, get() { return jActive.call(J) || !!raid; } });
  // Las grietas dejan de abrirse 2 min antes; en Lab, tras ganar, vuelven.
  Object.defineProperty(J, 'AT', { configurable: true, get() { return lab() && done() ? Infinity : AT; } });
  const jUpdate = J.update;
  J.update = function (dt, pl, time) {
    if (!lab() || jActive.call(J)) return jUpdate.apply(this, arguments);
    jUpdate.call(this, dt, pl, 0);       // mide el daño; con el reloj a 0, Arceus no empieza
    tick(dt, pl, time);
  };
  const jReset = J.reset;
  J.reset = function () { raid = null; return jReset.apply(this, arguments); };
  const jAir = J.drawAir;
  J.drawAir = function (ctx) { const r = jAir.apply(this, arguments); if (raid) drawWorld(ctx); return r; };
  const jOver = J.drawOverlay;
  J.drawOverlay = function (ctx, w, h) { const r = jOver.apply(this, arguments); if (raid) drawScreen(ctx, w, h); return r; };
  // (Si no, el HUD pondría el nombre de la arena oscura de las grietas.)
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
        raid.bossId = msg.boss; raid.obs = (msg.obs || []).slice(0, 3);
        const mark = (n = 0) => {
          let left = 0;
          for (const id of raid ? raid.obs : []) { const o = G.EnemyMgr.get(id); if (o) obelisk(o); else left++; }
          if (left && raid && n < 30) setTimeout(() => mark(n + 1), 150);
        };
        mark();
        break;
      }
      case 'beam': if (raid && raid.phase === 'fight') charge(msg.x, msg.y); break;
      case 'win': won(); break;
      case 'lose': lost(); break;
      case 'back': finish(); break;
    }
  });

  return {
    AT, TIME, BEAM_WARN, BEAM_PCT, DEX, shielded: (...a) => !!raid && shielded(...a),
    get active() { return !!raid; }, get raid() { return raid; },
    /** Para pruebas: el Eternabeam ya, o el tiempo que queda. */
    debugBeam() { const b = raid && G.EnemyMgr.get(raid.bossId); if (b && authority()) { raid.beamT = BEAM_EVERY; charge(b.x, b.y); } },
    debugTimeLeft(s) { if (raid) raid.t = TIME - s; }
  };
})();
