/* ============ sites.js — temples, dungeons and wormholes on the map (MrSurvivor fork) ============
 * From 20:00 in a run, now and then (a check every CHECK s, CHANCE more likely after each miss, at least GAP s
 * after the last one, never while a raid is coming) a SITE rises on the map 1100-1500 px from one of you: you have to
 * get there (a gold arrow with the distance points to it) within TTL s. Walk into it and a SEAL closes around it,
 * radius R: the horde is driven off (G.EnemyMgr.stash, as in the rift), nothing else spawns, everyone is pulled in,
 * nobody leaves, and its GUARDIAN fights you there, with a mechanic of its own:
 *   ANCIENT TEMPLE   a Regi (Regigigas, rarely). Its stone seal takes 90 % off every hit. Four rune plates ring the
 *                    temple: stand on one for STAND s (3, like a revive) to light it; it stays lit LIT s. All four lit: the seal shatters,
 *                    the guardian is stunned and for EXPOSE s takes ×1.25. Below half HP it takes longer to light them.
 *   MYSTERY DUNGEON  a Monster House: two waves of the run's own enemies (the second all with elite affixes), then the
 *                    DUNGEON LORD, a pseudo-legendary that calls 3 allies every SUMMON s and takes 15 % less damage for
 *                    each ally standing (at most 60 %).
 *   ULTRA WORMHOLE   an Ultra Beast. Every DIVE s it dives into Ultra Space (untouchable) and bursts out of another of
 *                    the three wormholes in a warned charge. Where it dived it leaves an ULTRA CORE: break it within
 *                    FUSE s or it bursts and gives the beast a Beast Boost (×1.12 damage, ×1.05 speed, heals 6 %, up to
 *                    8). Below half HP it dives more often and leaves two.
 * The guardian is strong: HP from the clock (a boss slot's at that minute, more in co-op) or the team's power meter
 * (js/fork/lab/boss-power.js) × S s (×1.5 at 45:00), whichever is more, one hit at most 8 % of it, damage like a boss.
 * You have FIGHT s. Beat it: the guardian's drops (as any boss) plus coins, tickets, 2 gems each, half your HP back,
 * downed teammates up, XP for at least one level and a RELIC PICK each (js/fork/lab/relics.js: that level's hand is
 * three relics, run-long bonuses, one from the site's own pool). Time runs out: the guardian withdraws, no reward.
 * Going down inside is going down (the run ends solo, the usual revive in co-op): there's no leaving the seal.
 * Co-op: the host decides and runs the guardian (enemies travel as 'ne'); { k:'labsite', a } with a = open (s),
 * close, fight (s), ids (guardian, cores), st (the mechanic's state, 5 a second), dive / emerge (x, y), won, lost,
 * end; a guest's { a:'enter' } asks the host to start it. Each computer keeps its own Pokémon inside the seal.
 * Hooks: G.Events.update (the clock; and the game's own events wait during a fight), .drawables, .drawHud,
 * G.Spawner.update (nothing spawns during a fight), G.Judgment.drawAir, G.Enemy.prototype.hurt (the seal, the
 * exposure, the Lord's allies, the dive); js/fork/lab/wild-legends.js and eternatus.js check G.LabSites.busy.
 * Texts in English. Test: fork/test-sites.cjs.
 */
G.LabSites = (() => {
  const FROM = 1200, CHECK = 30, CHANCE = 0.14, GAP = 200, TTL = 150, ENTER_R = 60, R = 300, RAID_CLEAR = 190;
  const FIGHT = { temple: 150, dungeon: 180, wormhole: 150 };
  const HP_K = { temple: 1.0, dungeon: 1.0, wormhole: 1.1 }, SECS = { temple: 22, dungeon: 18, wormhole: 20 };
  const HIT_CAP = 0.08;
  // STAND: 3 s on a plate to light it, like a revive (was 1.3 / 1.8 s; 2026-10-24). LIT grew with it, so one
  // player can still light all four alone: 4 x 3 s plus ~5 s walking between them fits 24 s (4 x 4 s in 25 s).
  const STAND = [3, 4], LIT = [24, 25], EXPOSE = 10, SEALED = 0.1, EXPOSED = 1.25, PLATE_R = 38;
  const WAVES = [10, 14], WAVE_T = 32, LORD_CUT = 0.15, LORD_MAX = 0.6, SUMMON = 12;
  const DIVE = [9, 6.5], DIVE_LEN = 1.6, FUSE = 7, BOOST_MAX = 8;
  const KINDS = ['temple', 'dungeon', 'wormhole'];
  const INFO = {
    temple: { name: 'Ancient Temple', a: 'AN', color: '#e8c36a', guard: [377, 378, 379, 894, 895], rare: 486,
      sub: 'Light the four rune plates to break its seal' },
    dungeon: { name: 'Mystery Dungeon', a: 'A', color: '#7fd4ff', guard: [248, 445, 373, 376, 635, 706, 784, 887, 998, 149],
      sub: 'A Monster House: two waves, then the Dungeon Lord' },
    wormhole: { name: 'Ultra Wormhole', a: 'AN', color: '#ff7ae0', guard: [793, 794, 795, 796, 797, 798, 799, 804, 805, 806],
      sub: 'Break the Ultra Cores it leaves, or it grows stronger' }
  };
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;
  let site = null;          // every computer: { id, kind, x, y, ttl, t, phase: 'open' | 'fight' | 'won' | 'lost', ... }
  let checkT = CHECK, misses = 0, lastEnd = -1e9, last = null, asked = false, seq = 1, netT = 0, shown = 0, force = false;

  function send(msg, to) {
    if (!G.Coop.active) return;
    msg.k = 'labsite';
    if (to) { G.Net.send(to, msg); return; }
    if (!G.Coop.isHost) return;
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }
  function reset() { site = null; checkT = CHECK; misses = 0; lastEnd = -1e9; last = null; asked = false; netT = 0; force = false; }

  // ---------------- a site rises ----------------

  /** Room for the seal: the middle clear, and most of a ring inside it walkable. */
  function roomy(x, y) {
    if (!G.World.isFree(x, y, 40)) return false;
    let ok = 0;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.2832; if (G.World.isFree(x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, 18)) ok++; }
    return ok >= 10;
  }
  /** Authority: picks the kind and the spot, and tells everyone. */
  function open(kind) {
    const alive = G.Game.everyone().filter(p => !p.dead), pl = G.U.pick(alive.length ? alive : [G.Game.player]);
    kind = kind || G.U.pick(KINDS.filter(k => k !== last));
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(1100, 1500);
      const x = Math.round(pl.x + Math.cos(a) * d), y = Math.round(pl.y + Math.sin(a) * d);
      if (!roomy(x, y)) continue;
      const s = { id: seq++, kind, x, y, ttl: TTL };
      send({ a: 'open', s });
      show(s);
      return true;
    }
    return false;
  }
  /** On every computer: the site appears. */
  function show(s) {
    if (!s || !INFO[s.kind]) return;
    site = { id: s.id, kind: s.kind, x: s.x, y: s.y, ttl: s.ttl, t: 0, phase: 'open', ft: 0, guard: 0, ks: {} };
    last = s.kind; asked = false; shown = performance.now();
    G.Audio.sfx('rift');
    G.FX.ring(s.x, s.y, 6, 120, INFO[s.kind].color, 0.8, 6);
  }
  function close(msg) {
    if (!site) return;
    if (msg) G.Spawner.say(msg, 3, true);
    site = null;
  }

  // ---------------- the fight ----------------

  /** Authority: the seal closes. */
  function start() {
    if (!site || site.phase !== 'open') return;
    const cfg = { id: site.id };
    if (site.kind === 'temple') cfg.plates = plateSpots();
    if (site.kind === 'wormhole') cfg.portals = portalSpots();
    send({ a: 'fight', s: cfg });
    begin(cfg);
    spawnGuard();
  }
  /** On every computer: the seal closes, the horde is driven off, everyone is pulled in (cfg: the host's plates or wormholes). */
  function begin(cfg) {
    if (!site || site.phase !== 'open') return;
    const s = site, info = INFO[s.kind], spots = (l, n) => (Array.isArray(l) ? l : []).slice(0, n).filter(v => Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]));
    s.phase = 'fight'; s.ft = FIGHT[s.kind]; s.t = 0;
    s.ks = s.kind === 'temple' ? { plates: spots(cfg.plates, 4).map(([x, y]) => ({ x, y, p: 0, lit: 0 })), ex: 0, stage: 1 }
      : s.kind === 'dungeon' ? { wave: 0, waveT: 0, left: 0, lord: 0, summonT: SUMMON, allies: 0 }
      : { portals: spots(cfg.portals, 3).map(([x, y]) => ({ x, y })), diveT: DIVE[0], dive: null, cores: [], boost: 0, stage: 1 };
    if (G.Rift.rift) G.Rift.onEvent(['riftx']);
    if (authority()) G.EnemyMgr.stash(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    const ps = G.Game.everyone();
    ps.forEach((p, i) => {
      if (G.U.dist2(p.x, p.y, s.x, s.y) < (R - 50) ** 2) return;
      p.x = s.x + (i - (ps.length - 1) / 2) * 34; p.y = s.y + R * 0.55;
    });
    const pl = G.Game.player;
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.flash(info.color, 0.7);
    G.Camera.kick(1);
    G.Audio.sfx('boss');
    G.Spawner.say('The seal closes! ' + info.sub, 3.6, true);
  }

  function plateSpots() {
    return [0, 1, 2, 3].map(i => {
      const a = Math.PI / 4 + i * Math.PI / 2;
      for (const k of [0.62, 0.55, 0.7, 0.48]) {
        const x = Math.round(site.x + Math.cos(a) * R * k), y = Math.round(site.y + Math.sin(a) * R * k);
        if (G.World.isFree(x, y, 16)) return [x, y];
      }
      return [Math.round(site.x + Math.cos(a) * R * 0.62), Math.round(site.y + Math.sin(a) * R * 0.62)];
    });
  }
  function portalSpots() {
    return [0, 1, 2].map(i => {
      const a = -Math.PI / 2 + i * 6.2832 / 3;
      for (const k of [0.7, 0.6, 0.78, 0.5]) {
        const x = Math.round(site.x + Math.cos(a) * R * k), y = Math.round(site.y + Math.sin(a) * R * k);
        if (G.World.isFree(x, y, 18)) return [x, y];
      }
      return [Math.round(site.x + Math.cos(a) * R * 0.7), Math.round(site.y + Math.sin(a) * R * 0.7)];
    });
  }

  /** A guardian's numbers at t with n players (the clock, or the team's power meter). */
  function guardHp(kind, t, n, k = 1) {
    const P = G.LabPower, S = G.LabBossSlots;
    const base = S ? S.defNumbers(S.slotAt(Math.max(1080, t))).hp : 21600;
    const clock = base * G.Enemies.bossScale(t).hp * (P ? P.hpK(t) : 1) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1) * HP_K[kind] * k;
    const secs = SECS[kind] * k * (1 + 0.5 * G.U.clamp((t - 1200) / 1500, 0, 1.5));
    return Math.round(Math.max(clock, P ? P.power() * secs : 0, P ? P.maxHit() * 10 : 0));
  }
  function guardDef(dex, kind, t, n, k = 1) {
    const mon = G.DEX_BY[dex], S = G.LabBossSlots, P = G.LabPower;
    const slot = S ? S.defNumbers(S.slotAt(Math.max(1080, t))) : { dmg: 82, xp: 1800 };
    const dmg = Math.round(slot.dmg * G.Enemies.bossScale(t).dmg * (P ? P.dmgK(t) : 1) * 1.1);
    return { dex, name: mon.name, hp: guardHp(kind, t, n, k), spd: Math.round(G.U.clamp(48 + (mon.spd - 78) * 0.6, 48, 105)), dmg,
      xp: Math.round(slot.xp * 2), shotDmg: Math.round(dmg * 0.55), shotCd: 0.95, range: 300,
      behavior: mon.types.some(x => ['psychic', 'electric', 'ghost', 'fairy', 'fire', 'water', 'ice', 'dragon'].includes(x)) ? 'ranged' : 'charger' };
  }
  function mark(e, guard) {
    e._site = site.id;
    e._noPower = true;
    if (guard) { e._siteGuard = site.id; e._hitCap = HIT_CAP; e.flying = false; }
  }
  /** Authority: the guardian (the Dungeon Lord comes after the waves). */
  function spawnGuard() {
    const s = site, t = G.Game.st.time, n = G.Game.everyone().length;
    if (s.kind === 'dungeon') { s.ks.waveT = 1.5; return; }
    const list = INFO[s.kind].guard.filter(d => G.DEX_BY[d] && G.SPRITE_META[d]);
    const dex = s.kind === 'temple' && Math.random() < 0.15 && G.SPRITE_META[INFO.temple.rare] ? INFO.temple.rare : G.U.pick(list);
    G.Sprites.preload([dex], 8000);
    const e = new G.Enemy(guardDef(dex, s.kind, t, n), s.x, s.y - R * 0.3, { hp: 1, spd: 1, dmg: 1 }, true);
    mark(e, true);
    G.EnemyMgr.add(e);
    s.guard = e.id;
    send({ a: 'ids', guard: e.id });
    dress(e);
    G.Spawner.say(e.name + ' guards the ' + INFO[s.kind].name.toLowerCase() + '!', 3);
  }

  // ---------------- every frame ----------------

  function tick(dt, players, time) {
    if (!site) {
      if (!authority() || !lab() || time < FROM || G.Rift.inArena || G.Judgment.active || G.Game.state !== 'playing') return;
      const AT = G.Judgment.AT;
      if (time > AT - RAID_CLEAR && time < AT + 5) return;
      if (time - lastEnd < GAP) return;
      if ((checkT -= dt) > 0) return;
      checkT = CHECK;
      if (force || Math.random() < CHANCE * (1 + misses)) { misses = 0; force = false; open(); } else misses++;
      return;
    }
    const s = site, pl = G.Game.player;
    if (s.phase === 'open') {
      if (G.Judgment.active) { close(); return; }
      if (G.Rift.inArena) return;
      s.t += dt; s.ttl -= dt;
      if (authority() && s.ttl <= 0) { send({ a: 'close' }); close('The ' + INFO[s.kind].name.toLowerCase() + ' sinks back into the earth…'); return; }
      if (pl && !pl.dead && !asked && G.U.dist2(pl.x, pl.y, s.x, s.y) < ENTER_R * ENTER_R) {
        asked = true;
        if (authority()) start(); else send({ a: 'enter', id: s.id }, G.Net.hostUid);
      }
      return;
    }
    s.t += dt;
    keepIn(pl);
    if (s.phase !== 'fight') {
      s.endT -= dt;
      if (s.endT <= 0 && authority()) { send({ a: 'end' }); finish(); }
      return;
    }
    s.ft -= dt;
    if (!authority()) return;
    for (const e of G.EnemyMgr.all()) if (e._site === s.id && !e.remote && !e._diving) keepIn(e, 20);
    const g = G.EnemyMgr.get(s.guard);
    if (s.kind === 'temple') temple(dt, g);
    else if (s.kind === 'dungeon') dungeon(dt, g);
    else wormhole(dt, g);
    if ((netT -= dt) <= 0) { netT = 0.2; send({ a: 'st', ks: netState() }); }
    const now = G.EnemyMgr.get(s.guard);                // (the Dungeon Lord may have come this frame)
    if (s.guard && (!now || now.dead) && (s.kind !== 'dungeon' || s.ks.lord)) { send({ a: 'won' }); won(); return; }
    if (s.ft <= 0) { send({ a: 'lost' }); lost(); }
  }

  /** Inside the seal. */
  function keepIn(e, pad = 12) {
    if (!e || e.dead || !site) return;
    const dx = e.x - site.x, dy = e.y - site.y, d = Math.hypot(dx, dy), max = R - pad;
    if (d > max && d > 0.01) { e.x = site.x + dx / d * max; e.y = site.y + dy / d * max; }
  }

  // --- the temple: rune plates ---
  function temple(dt, g) {
    const k = site.ks, st = g && !g.dead && g.hp < g.maxHp * 0.5 ? 2 : 1;
    if (st !== k.stage) { k.stage = st; G.Spawner.say('The titan awakens! The plates take longer to light', 3); send({ a: 'say', t: 'The titan awakens! The plates take longer to light' }); }
    if (k.ex > 0) {
      k.ex -= dt;
      if (k.ex <= 0) { k.ex = 0; for (const p of k.plates) { p.lit = 0; p.p = 0; } if (g && !g.dead) fx(g.x, g.y, '#9a9a9a'); }
      return;
    }
    const ps = G.Game.everyone().filter(p => !p.dead);
    for (const p of k.plates) {
      if (p.lit > 0) { p.lit = Math.max(0, p.lit - dt); continue; }
      const on = ps.some(o => G.U.dist2(o.x, o.y, p.x, p.y) < PLATE_R * PLATE_R);
      p.p = on ? p.p + dt / STAND[st - 1] : Math.max(0, p.p - dt / STAND[st - 1] * 0.5);
      if (p.p >= 1) { p.p = 0; p.lit = LIT[st - 1]; G.Audio.sfx('confirm'); G.FX.ring(p.x, p.y, 6, 60, INFO.temple.color, 0.5, 4); }
    }
    if (k.plates.every(p => p.lit > 0)) {
      k.ex = EXPOSE;
      for (const p of k.plates) { p.lit = 0; p.p = 0; }
      if (g && !g.dead) { g.stunT = Math.max(g.stunT || 0, 3); if (g.ai) g.ai.cast = null; }
      send({ a: 'say', t: 'The seal shatters! Strike now!' });
      G.Spawner.say('The seal shatters! Strike now!', 2.6, true);
      G.Camera.kick(0.9);
      G.Audio.sfx('break');
    }
  }

  // --- the dungeon: waves, then the Lord ---
  function dungeon(dt, g) {
    const k = site.ks, mine = () => G.EnemyMgr.all().filter(e => e._site === site.id && !e.dead && !e._siteGuard);
    k.left = mine().length;
    if (!k.lord) {
      k.waveT -= dt;
      if (k.waveT > 0 && !(k.wave > 0 && k.left <= 2)) return;
      if (k.wave < 2) { k.wave++; k.waveT = WAVE_T; wave(k.wave); return; }
      lord();
      return;
    }
    k.allies = k.left;
    if (g && !g.dead && (k.summonT -= dt) <= 0) { k.summonT = SUMMON; allies(g, 3); }
  }
  function regularDef() { return G.U.pick(G.Enemies.bagAt(G.Game.st.time).filter(d => !['healer', 'shielder', 'summoner', 'bomber'].includes(d.behavior))); }
  /** Authority: one enemy of the run's cast inside the seal, with the spawner's numbers (the endgame curve on top). */
  function one(def, x, y, elite) {
    const t = G.Game.st.time, n = G.Game.everyone().length;
    const sc = G.Enemies.scale(t);
    const e = new G.Enemy(def, x, y, Object.assign({}, sc, { hp: sc.hp * G.Coop.scaleHp(n) * (3.3 + Math.min(1.7, t / 210)) * (elite ? 1.5 : 1) }));
    e.dmg *= 2.4; e.xp = Math.round(e.xp * 5.6);
    mark(e, false);
    G.EnemyMgr.add(e);
    G.FX.burst(e.x, e.y - 8, INFO.dungeon.color, 8, 100);
    return e;
  }
  function freeIn(minR, maxR, awayFrom) {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(minR, maxR), x = site.x + Math.cos(a) * d, y = site.y + Math.sin(a) * d;
      if (!G.World.isFree(x, y, 14)) continue;
      if (awayFrom && awayFrom.some(p => G.U.dist2(p.x, p.y, x, y) < 130 * 130)) continue;
      return [x, y];
    }
    return [site.x, site.y - R * 0.5];
  }
  function wave(w) {
    const ps = G.Game.everyone().filter(p => !p.dead), n = WAVES[w - 1] + 4 * (G.Game.everyone().length - 1);
    for (let i = 0; i < n; i++) {
      const [x, y] = freeIn(R * 0.45, R * 0.9, ps);
      const e = one(regularDef(), x, y, true);
      if (w === 2 && G.LabAffixes) G.LabAffixes.tag(e, G.U.pick(['shielded', 'swift', 'vampiric', 'splitting', 'explosive']));
    }
    const t = w === 1 ? "It's a Monster House!" : 'Wave 2: elites!';
    send({ a: 'say', t }); G.Spawner.say(t, 2.6, true);
    G.Audio.sfx('surge');
  }
  function lord() {
    const s = site, t = G.Game.st.time, n = G.Game.everyone().length;
    const list = INFO.dungeon.guard.filter(d => G.DEX_BY[d] && G.SPRITE_META[d]), dex = G.U.pick(list);
    G.Sprites.preload([dex], 8000);
    const e = new G.Enemy(guardDef(dex, 'dungeon', t, n), s.x, s.y, { hp: 1, spd: 1, dmg: 1 }, true);
    mark(e, true);
    G.EnemyMgr.add(e);
    s.guard = e.id; s.ks.lord = e.id; s.ks.summonT = 6;
    send({ a: 'ids', guard: e.id });
    dress(e);
    const msg = 'The Dungeon Lord, ' + e.name + '! Its allies shield it';
    send({ a: 'say', t: msg }); G.Spawner.say(msg, 3.2, true);
    G.Audio.sfx('boss'); G.Camera.kick(1);
  }
  function allies(g, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, x = g.x + Math.cos(a) * 60, y = g.y + Math.sin(a) * 45;
      one(regularDef(), G.World.isFree(x, y, 12) ? x : g.x, G.World.isFree(x, y, 12) ? y : g.y, false);
    }
    g.anim.play('Charge', { speed: 1.2 });
    G.FX.ring(g.x, g.y, 8, 80, INFO.dungeon.color, 0.5, 4);
  }

  // --- the wormhole: dives, cores, Beast Boost ---
  function wormhole(dt, g) {
    const k = site.ks;
    if (!g || g.dead) return;
    const st = g.hp < g.maxHp * 0.5 ? 2 : 1;
    if (st !== k.stage) { k.stage = st; const m = g.name + ' is furious: it dives more often!'; send({ a: 'say', t: m }); G.Spawner.say(m, 2.8, true); }
    for (const id of k.cores.slice()) {
      const c = G.EnemyMgr.get(id);
      if (!c || c.dead) { k.cores.splice(k.cores.indexOf(id), 1); continue; }
      c.x = c.ax; c.y = c.ay; c.lagT = 0;
      if ((c.fuse -= dt) <= 0) { burst(c, g); k.cores.splice(k.cores.indexOf(id), 1); }
    }
    if (k.dive) {
      g.lagT = 0; g.stunT = Math.max(g.stunT || 0, 0.3);
      if ((k.dive.t -= dt) <= 0) emerge(g);
      return;
    }
    if (g.ai && g.ai.cast) return;
    if ((k.diveT -= dt) <= 0) dive(g);
  }
  function dive(g) {
    const k = site.ks;
    fx(g.x, g.y, INFO.wormhole.color);
    core(g.x, g.y, g);
    if (k.stage === 2) { const p = G.U.pick(k.portals); core(p.x + G.U.rand(-30, 30), p.y + 30, g); }
    k.dive = { t: DIVE_LEN, x: g.x, y: g.y };
    g._diving = true;
    g.x = site.x; g.y = site.y + 40000;
    send({ a: 'dive', id: g.id });
    G.Audio.sfx('rift');
  }
  function emerge(g) {
    const k = site.ks, from = k.dive, far = k.portals.slice().sort((a, b) => G.U.dist2(b.x, b.y, from.x, from.y) - G.U.dist2(a.x, a.y, from.x, from.y));
    const p = G.U.pick(far.slice(0, 2));
    k.dive = null; k.diveT = DIVE[k.stage - 1];
    g._diving = false; g.x = p.x; g.y = p.y; g.stunT = 0;
    send({ a: 'emerge', id: g.id, x: Math.round(p.x), y: Math.round(p.y) });
    fx(p.x, p.y, INFO.wormhole.color);
    const tg = G.EnemyMgr.nearestPlayer(G.Game.everyone().filter(o => !o.dead), g.x, g.y);
    if (tg) { if (!g.ai) g.bossInit(); g.bossStart('dash', tg); }
  }
  function core(x, y, g) {
    const P = G.LabPower, hp = Math.round(Math.max(g.maxHp * 0.03, P ? P.power() * 3 : 0));
    const c = new G.Enemy({ dex: g.dex, name: 'Ultra Core', hp, spd: 0, dmg: 0, xp: Math.round(g.xp * 0.05), behavior: 'charger' }, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
    mark(c, false);
    c._noScale = true;
    coreLook(c);
    c.ax = x; c.ay = y; c.fuse = FUSE; c.maxFuse = FUSE;
    G.EnemyMgr.add(c);
    site.ks.cores.push(c.id);
    send({ a: 'ids', cores: site.ks.cores.slice() });
  }
  function burst(c, g) {
    const k = site.ks;
    c.hp = 0; c.dead = true; c.fade = 0.5;
    fx(c.x, c.y, '#ff4ad0');
    if (k.boost < BOOST_MAX) { k.boost++; g.dmg *= 1.12; g.spd *= 1.05; }
    g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.06);
    const m = 'Beast Boost! ' + g.name + ' grows stronger (×' + k.boost + ')';
    send({ a: 'say', t: m }); G.Spawner.say(m, 2.4, true);
    G.Audio.sfx('boss');
  }

  /** What guests need to draw the mechanic. */
  function netState() {
    const k = site.ks;
    if (site.kind === 'temple') return { pl: k.plates.map(p => [+p.p.toFixed(2), +p.lit.toFixed(1)]), ex: +k.ex.toFixed(1), st: k.stage };
    if (site.kind === 'dungeon') return { w: k.wave, l: k.left, lord: k.lord ? 1 : 0, al: k.allies };
    return { bo: k.boost, co: k.cores.map(id => { const c = G.EnemyMgr.get(id); return c ? +c.fuse.toFixed(1) : 0; }) };
  }
  function netApply(n) {
    if (!site || site.phase !== 'fight' || !n) return;
    const k = site.ks;
    if (site.kind === 'temple' && Array.isArray(n.pl)) { n.pl.slice(0, 4).forEach((v, i) => { if (k.plates[i] && Array.isArray(v)) { k.plates[i].p = +v[0] || 0; k.plates[i].lit = +v[1] || 0; } }); k.ex = +n.ex || 0; k.stage = n.st | 0 || 1; }
    else if (site.kind === 'dungeon') { k.wave = n.w | 0; k.left = n.l | 0; k.lord = n.lord ? k.lord || 1 : 0; k.allies = n.al | 0; }
    else if (site.kind === 'wormhole') { k.boost = n.bo | 0; if (Array.isArray(n.co)) n.co.forEach((f, i) => { const c = G.EnemyMgr.get(k.cores[i]); if (c) c.fuse = +f || 0; }); }
  }

  // ---------------- the end ----------------

  function won() {
    if (!site || site.phase !== 'fight') return;
    const s = site, pl = G.Game.player, g = G.EnemyMgr.get(s.guard);
    s.phase = 'won'; s.endT = 4;
    if (authority()) loot(g ? g.x : s.x, g ? g.y : s.y);
    G.Pickups.pullAll();
    if (pl) {
      if (pl.dead) pl.revive(0.5);
      else pl.heal(pl.maxHp * 0.5);
      if (G.LabRelics) G.LabRelics.grant(pl, s.kind);
    }
    if (G.Gems) G.Gems.give(2);
    G.Audio.sfx('legend');
    G.FX.ring(s.x, s.y, 10, R, INFO[s.kind].color, 0.8, 6);
    G.Spawner.say('The guardian is beaten! A relic awaits you', 3.6, true);
  }
  /** Authority: coins, tickets and XP for at least one level for the team (the relic hand). */
  function loot(x, y) {
    for (let i = 0; i < 14; i++) G.Pickups.drop('coin', x + G.U.rand(-60, 60), y + G.U.rand(-45, 45), 8);
    for (let i = 0; i < 2; i++) G.Pickups.drop('ticket', x + G.U.rand(-30, 30), y + G.U.rand(-20, 20), 1);
    if (Math.random() < 0.5) G.Pickups.drop('ticket10', x, y - 24, 1);
    const pl = G.Game.player, k = (pl.xpMul || 1) * (G.Coop.active ? G.Coop.xpFactor() : 1);
    G.Pickups.dropXp(x, y, Math.ceil((pl.xpNext - pl.xp) / Math.max(0.01, k) * 1.05) + 1, true, false, true);
  }
  function lost() {
    if (!site || site.phase !== 'fight') return;
    site.phase = 'lost'; site.endT = 1.5;
    G.Spawner.say('The guardian withdraws. The seal breaks…', 3, true);
    G.Audio.sfx('back');
  }
  /** On every computer: the seal opens and the horde comes back. */
  function finish() {
    if (!site) return;
    const s = site;
    site = null;
    lastEnd = G.Game.st ? G.Game.st.time : 0;
    if (authority()) G.EnemyMgr.restore();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    G.Game.flash(INFO[s.kind].color, 0.5);
  }

  // ---------------- the seal, the exposure, the Lord's allies, the dive ----------------

  const E = G.Enemy.prototype, hurt = E.hurt;
  E.hurt = function (amount) {
    if (this._siteGuard && site && this._siteGuard === site.id && !this.remote && site.phase === 'fight') {
      if (this._diving) return;
      const k = site.ks, capped = Math.min(amount, this.maxHp * (this._hitCap || 1));
      let m = 1;
      if (site.kind === 'temple') m = k.ex > 0 ? EXPOSED : SEALED;
      else if (site.kind === 'dungeon') m = 1 - Math.min(LORD_MAX, LORD_CUT * (k.allies || 0));
      if (m !== 1) { const a = [...arguments]; a[0] = capped * m; return hurt.apply(this, a); }
    }
    return hurt.apply(this, arguments);
  };

  // ---------------- drawing ----------------

  /** The guardian's look (a guest's copy too): its seal, its dive. */
  function dress(e) {
    if (e._dressed) return;
    e._dressed = true;
    const base = Object.getPrototypeOf(e).draw;
    e.draw = function (ctx) {
      if (this._diving) return;
      base.call(this, ctx);
      if (this.dead || !site || site.phase !== 'fight') return;
      const k = site.ks, now = performance.now() / 1000;
      ctx.save();
      if (site.kind === 'temple' && !(k.ex > 0)) {
        // The stone seal: a grey shell with cracks.
        const rx = this.r * 1.9 + 8, ry = this.bodyH * 0.7 + 8, cy = this.y - this.bodyH * 0.45;
        ctx.globalAlpha = 0.28; ctx.fillStyle = '#8b8577';
        ctx.beginPath(); ctx.ellipse(this.x, cy, rx, ry, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#d8cfb6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(this.x, cy, rx, ry, 0, 0, 6.2832); ctx.stroke();
        ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(this.x - rx * 0.5, cy - ry * 0.6); ctx.lineTo(this.x - rx * 0.2, cy - ry * 0.1); ctx.lineTo(this.x - rx * 0.35, cy + ry * 0.4);
        ctx.moveTo(this.x + rx * 0.4, cy - ry * 0.5); ctx.lineTo(this.x + rx * 0.15, cy); ctx.stroke();
      } else if (site.kind === 'temple') {
        ctx.globalAlpha = 0.35 + Math.sin(now * 10) * 0.15; ctx.strokeStyle = INFO.temple.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.8, this.r * 0.7, 0, 0, 6.2832); ctx.stroke();
      } else if (site.kind === 'dungeon' && k.allies > 0) {
        const rx = this.r * 1.9 + 8, ry = this.bodyH * 0.7 + 8, cy = this.y - this.bodyH * 0.45;
        ctx.globalAlpha = 0.12 + 0.04 * Math.min(4, k.allies); ctx.fillStyle = INFO.dungeon.color;
        ctx.beginPath(); ctx.ellipse(this.x, cy, rx, ry, 0, 0, 6.2832); ctx.fill();
      } else if (site.kind === 'wormhole' && k.boost > 0) {
        ctx.globalAlpha = 0.25 + Math.min(0.4, k.boost * 0.05); ctx.strokeStyle = '#ff4ad0'; ctx.lineWidth = 2 + k.boost * 0.5;
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.7, this.r * 0.65, 0, 0, 6.2832); ctx.stroke();
      }
      ctx.restore();
    };
  }
  function coreLook(c) {
    if (c._core) return;
    c._core = true; c.name = 'Ultra Core'; c.flying = false; c.stunT = 1e9;
    c.draw = function (ctx) {
      const a = this.dead ? Math.max(0, this.fade / 0.9) : 1;
      if (a <= 0) return;
      const now = performance.now() / 1000, x = this.x, y = this.y - 16, k = this.maxFuse ? Math.max(0, this.fuse / this.maxFuse) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, this.y, 14, 5, 0, 0, 6.2832); ctx.fill();
      const r = 10 + Math.sin(now * 8 + this.id) * 1.5;
      const gr = ctx.createRadialGradient(x, y, 2, x, y, r * 1.8);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#ff9af0'); gr.addColorStop(1, 'rgba(180,40,200,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 6.2832); ctx.fill();
      ctx.fillStyle = this.flash > 0 ? '#ffffff' : '#ff4ad0'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, 6.2832); ctx.fill();
      if (!this.dead) {
        ctx.strokeStyle = k < 0.35 ? '#ff3a3a' : '#ffd0f6'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + 6.2832 * k); ctx.stroke();
        const bw = 30;
        ctx.fillStyle = '#000'; ctx.fillRect(x - bw / 2 - 1, y - 26, bw + 2, 5);
        ctx.fillStyle = '#ff4ad0'; ctx.fillRect(x - bw / 2, y - 25, bw * Math.max(0, this.hp / this.maxHp), 3);
      }
      ctx.restore();
    };
  }
  function fx(x, y, col) { G.FX.burst(x, y - 20, col, 22, 200); G.FX.ring(x, y, 6, 70, col, 0.5, 4); }

  /** The site on the map (its building), and in a fight the seal, plates and wormholes. */
  function drawables() {
    if (!site) return [];
    const s = site, info = INFO[s.kind], now = performance.now() / 1000, out = [];
    // The ground: the site's circle (open) or the seal, the plates and the wormholes (fight).
    out.push({ y: s.y - 4000, draw(ctx) {
      ctx.save();
      if (s.phase === 'open') {
        const k = 0.5 + Math.sin(now * 3) * 0.5;
        ctx.globalAlpha = 0.18 + k * 0.1; ctx.fillStyle = info.color;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, 90, 62, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.strokeStyle = info.color; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -now * 20;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, 90, 62, 0, 0, 6.2832); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.5 + Math.sin(now * 2) * 0.15; ctx.strokeStyle = info.color; ctx.lineWidth = 4; ctx.setLineDash([14, 8]); ctx.lineDashOffset = now * 25;
        ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 6.2832); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.06; ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 6.2832); ctx.fill();
        const k = s.ks;
        if (s.kind === 'temple' && k.plates) for (const p of k.plates) plate(ctx, p, k, now);
        if (s.kind === 'wormhole' && k.portals) for (const p of k.portals) portal(ctx, p, now, 1);
      }
      ctx.restore();
    } });
    if (s.phase === 'open') out.push({ y: s.y, draw: ctx => building(ctx, s, now) });
    else for (let i = 0; i < 16; i++) {
      // Standing stones round the seal.
      const a = i / 16 * 6.2832, x = s.x + Math.cos(a) * (R + 10), y = s.y + Math.sin(a) * (R + 10);
      out.push({ y, draw(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, 9, 4, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#6f6a5e'; ctx.fillRect(x - 6, y - 22, 12, 22);
        ctx.fillStyle = '#8f897b'; ctx.fillRect(x - 6, y - 22, 12, 4);
        ctx.globalAlpha = 0.6 + Math.sin(now * 3 + i) * 0.3; ctx.fillStyle = info.color; ctx.fillRect(x - 2, y - 16, 4, 8);
        ctx.restore();
      } });
    }
    return out;
  }
  function plate(ctx, p, k, now) {
    const lit = p.lit > 0, ex = k.ex > 0;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = lit ? 'rgba(232,195,106,.45)' : 'rgba(60,56,48,.55)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, PLATE_R, PLATE_R * 0.7, 0, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = lit ? '#ffe9a8' : ex ? '#6f6a5e' : '#b9ae8f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, PLATE_R, PLATE_R * 0.7, 0, 0, 6.2832); ctx.stroke();
    // Braille dots, like the Regis' ruins.
    ctx.fillStyle = lit ? '#fff6d0' : '#d8cfb6';
    for (const [dx, dy] of [[-12, -6], [-12, 3], [-4, -6], [4, 3], [12, -6], [12, 3], [-4, 9], [4, -6]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy * 0.8, 2.2, 0, 6.2832); ctx.fill(); }
    if (!lit && p.p > 0) {
      ctx.strokeStyle = INFO.temple.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, PLATE_R + 6, (PLATE_R + 6) * 0.7, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, p.p)); ctx.stroke();
    }
    if (lit) {
      ctx.globalAlpha = 0.3 + Math.sin(now * 6) * 0.15; ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(p.x - 3, p.y - 60, 6, 60);
    }
    ctx.restore();
  }
  function portal(ctx, p, now, a) {
    ctx.save();
    ctx.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['#ff7ae0', '#9a7bff', '#7affea'][i]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 26 - i * 6, (26 - i * 6) * 0.5, now * (1.5 + i) , 0, 6.2832); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,0,40,.7)'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 10, 5, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  /** The building you travel to. */
  function building(ctx, s, now) {
    const x = s.x, y = s.y, col = INFO[s.kind].color;
    ctx.save();
    if (s.kind === 'temple') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 70, 18, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#7d7566'; ctx.fillRect(x - 64, y - 8, 128, 12);
      ctx.fillStyle = '#9c9481'; ctx.fillRect(x - 56, y - 16, 112, 10);
      for (const dx of [-46, -16, 16, 46]) { ctx.fillStyle = '#b3aa94'; ctx.fillRect(x + dx - 6, y - 66, 12, 52); ctx.fillStyle = '#8b8371'; ctx.fillRect(x + dx + 2, y - 66, 4, 52); }
      ctx.fillStyle = '#9c9481'; ctx.beginPath(); ctx.moveTo(x - 66, y - 66); ctx.lineTo(x, y - 96); ctx.lineTo(x + 66, y - 66); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a140c'; ctx.fillRect(x - 10, y - 46, 20, 32);
      ctx.fillStyle = col;
      for (const [dx, dy] of [[-8, -80], [0, -80], [8, -80], [-4, -74], [4, -74]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2, 0, 6.2832); ctx.fill(); }
    } else if (s.kind === 'dungeon') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 70, 18, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#5d5a6e'; ctx.beginPath(); ctx.moveTo(x - 72, y + 2); ctx.quadraticCurveTo(x - 60, y - 70, x, y - 82); ctx.quadraticCurveTo(x + 60, y - 70, x + 72, y + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#76738a'; ctx.beginPath(); ctx.moveTo(x - 50, y - 30); ctx.quadraticCurveTo(x - 30, y - 70, x, y - 76); ctx.lineTo(x - 10, y - 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b0a14'; ctx.beginPath(); ctx.moveTo(x - 24, y + 2); ctx.quadraticCurveTo(x - 22, y - 44, x, y - 46); ctx.quadraticCurveTo(x + 22, y - 44, x + 24, y + 2); ctx.closePath(); ctx.fill();
      // The stairs down.
      ctx.fillStyle = col; for (let i = 0; i < 3; i++) ctx.fillRect(x - 14 + i * 4, y - 8 - i * 7, 28 - i * 8, 3);
    } else portal(ctx, { x, y: y - 30 }, now, 1), portal(ctx, { x, y: y - 30 }, now * 1.3, 0.6);
    // "!" bouncing over it.
    const by = y - (s.kind === 'temple' ? 110 : 96) - Math.abs(Math.sin(now * 4)) * 8;
    ctx.font = '700 18px Pixelify, monospace'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; G.I18n.rawCanvas(ctx, 'strokeText', '!', x, by);
    ctx.fillStyle = col; G.I18n.rawCanvas(ctx, 'fillText', '!', x, by);
    ctx.restore();
  }

  /** On top, in the world: a wormhole's dive and the Lord's tethers. */
  function drawAir(ctx) {
    if (!site || site.phase !== 'fight') return;
    const k = site.ks, now = performance.now() / 1000;
    if (site.kind === 'dungeon' && k.lord) {
      const g = G.EnemyMgr.get(site.guard);
      if (!g || g.dead) return;
      ctx.save(); ctx.strokeStyle = INFO.dungeon.color; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -now * 30; ctx.globalAlpha = 0.5;
      for (const e of G.EnemyMgr.all()) {
        if (e.dead || e === g || (e._site !== site.id && !(e.remote && G.U.dist2(e.x, e.y, site.x, site.y) < R * R))) continue;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - e.bodyH * 0.6); ctx.lineTo(g.x, g.y - g.bodyH * 0.6); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** HUD: the arrow to the site, its banner when it rises, and the fight's line. */
  function drawHud(ctx, w, h, pl, F) {
    if (!site) return;
    const s = site, info = INFO[s.kind], cam = G.Camera;
    const raw = (m, t, x, y) => G.I18n.rawCanvas(ctx, m, t, x, y);
    if (s.phase === 'open') {
      const sx = (s.x - cam.left()) * cam.scale, sy = (s.y - 40 - cam.top()) * cam.scale;
      const label = info.name.toUpperCase() + ' · ' + Math.round(G.U.dist(pl.x, pl.y, s.x, s.y) / 32) + ' m · ' + G.U.mmss(Math.max(0, s.ttl));
      const mk = G.Markers.at('site:' + s.id, sx, sy, w, h);
      ctx.save();
      if (mk) {
        const a = mk.a, ca = Math.cos(a), sa = Math.sin(a), beat = 0.5 + Math.sin(performance.now() / 140) * 0.5;
        ctx.translate(mk.x, mk.y); ctx.scale(mk.k, mk.k);
        G.Markers.halo(ctx, info.color, mk);
        ctx.beginPath();
        ctx.moveTo(ca * 34, sa * 34); ctx.lineTo(Math.cos(a + 2.45) * 17, Math.sin(a + 2.45) * 17); ctx.lineTo(Math.cos(a - 2.45) * 17, Math.sin(a - 2.45) * 17);
        ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.globalAlpha = 0.7 + beat * 0.3; ctx.fillStyle = info.color; ctx.fill(); ctx.globalAlpha = 1;
        ctx.font = F(800, 11); ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        raw('strokeText', label, -ca * 28, -sa * 26 + 4); ctx.fillStyle = info.color; raw('fillText', label, -ca * 28, -sa * 26 + 4);
      } else {
        ctx.font = F(800, 11); ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const t2 = 'ENTER · ' + G.U.mmss(Math.max(0, s.ttl));
        raw('strokeText', t2, sx, sy - 76); ctx.fillStyle = info.color; raw('fillText', t2, sx, sy - 76);
      }
      ctx.restore();
      // Its banner, for 4.5 s.
      const age = (performance.now() - shown) / 1000;
      if (age < 4.5) {
        const a = Math.min(1, age * 4, (4.5 - age) * 2);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(w / 2, h * 0.2);
        const t1 = info.a + ' ' + info.name.toUpperCase() + ' HAS APPEARED!', t2 = 'Follow the arrow: a strong guardian waits there, and a relic for beating it';
        ctx.font = F(800, 20); const w1 = G.I18n.rawCanvas(ctx, 'measureText', t1).width; ctx.font = F(700, 11); const w2 = G.I18n.rawCanvas(ctx, 'measureText', t2).width;
        const bw = Math.min(w - 24, Math.max(w1, w2) + 36);
        ctx.fillStyle = 'rgba(16,12,6,.88)'; ctx.fillRect(-bw / 2, -26, bw, 52);
        ctx.lineWidth = 2; ctx.strokeStyle = info.color; ctx.strokeRect(-bw / 2, -26, bw, 52);
        ctx.textAlign = 'center'; ctx.fillStyle = info.color; ctx.font = F(800, 20); raw('fillText', t1, 0, -2);
        ctx.fillStyle = '#e8e2d0'; ctx.font = F(700, 11); raw('fillText', t2, 0, 16);
        ctx.restore();
      }
      return;
    }
    // In the fight: what to do now.
    const k = s.ks;
    let line = info.name.toUpperCase() + ' · ' + G.U.mmss(Math.max(0, s.ft));
    let sub = '';
    if (s.phase === 'won') line = info.name.toUpperCase() + ' · CLEARED';
    else if (s.kind === 'temple') sub = k.ex > 0 ? 'EXPOSED ' + Math.ceil(k.ex) + ' s · strike now!' : 'Sealed: ' + (k.plates || []).filter(p => p.lit > 0).length + '/4 plates lit · stand on a plate to light it';
    else if (s.kind === 'dungeon') sub = k.lord ? (k.allies > 0 ? k.allies + ' all' + (k.allies > 1 ? 'ies shield' : 'y shields') + ' the Lord (-' + Math.round(Math.min(LORD_MAX, LORD_CUT * k.allies) * 100) + '% damage)' : 'The Lord stands alone!')
      : 'Monster House · wave ' + Math.max(1, k.wave) + '/2 · ' + k.left + ' left';
    else sub = 'Beast Boost ×' + (k.boost || 0) + ' · break the Ultra Cores before they burst';
    ctx.save();
    ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const y0 = G.BossBars.below(76);
    ctx.font = F(800, 12); raw('strokeText', line, w / 2, y0); ctx.fillStyle = s.ft < 20 && s.phase === 'fight' ? '#ff5f6d' : info.color; raw('fillText', line, w / 2, y0);
    if (sub) { ctx.font = F(700, 11); raw('strokeText', sub, w / 2, y0 + 15); ctx.fillStyle = '#e8e2d0'; raw('fillText', sub, w / 2, y0 + 15); }
    ctx.restore();
  }

  // ---------------- hooks ----------------

  const evUpdate = G.Events.update;
  G.Events.update = function (dt, players, time) {
    tick(dt, players, time);
    if (site && site.phase !== 'open') return;          // the game's own events wait during a fight
    return evUpdate.apply(this, arguments);
  };
  const evDraw = G.Events.drawables;
  G.Events.drawables = function () { const r = evDraw.apply(this, arguments); return site ? (r || []).concat(drawables()) : r; };
  const evHud = G.Events.drawHud;
  G.Events.drawHud = function (ctx, w, h, pl, F) { const r = evHud.apply(this, arguments); if (site && pl) drawHud(ctx, w, h, pl, F); return r; };
  const spUpdate = G.Spawner.update;
  G.Spawner.update = function (dt) {
    if (site && site.phase !== 'open') { G.Spawner.tickBanner(dt); return; }
    return spUpdate.apply(this, arguments);
  };
  const jAir = G.Judgment.drawAir;
  G.Judgment.drawAir = function (ctx) { const r = jAir.apply(this, arguments); drawAir(ctx); return r; };
  const jReset = G.Judgment.reset;
  G.Judgment.reset = function () { reset(); return jReset.apply(this, arguments); };

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'labsite' || !G.Coop.active) return;
    if (G.Coop.isHost) {
      if (msg.a === 'enter' && site && site.phase === 'open' && msg.id === site.id) start();
      return;
    }
    if (from !== G.Net.hostUid) return;
    switch (msg.a) {
      case 'open': if (msg.s && Number.isFinite(msg.s.x) && Number.isFinite(msg.s.y)) show(msg.s); break;
      case 'close': close(site ? 'The ' + INFO[site.kind].name.toLowerCase() + ' sinks back into the earth…' : ''); break;
      case 'fight': if (site && msg.s && msg.s.id === site.id) begin(msg.s); break;
      case 'ids': {
        if (!site) break;
        if (msg.guard) site.guard = msg.guard;
        if (site.kind === 'dungeon' && msg.guard) site.ks.lord = msg.guard;
        if (Array.isArray(msg.cores)) site.ks.cores = msg.cores.slice(0, 8);
        const put = (n = 0) => {
          if (!site) return;
          let left = 0;
          const g = G.EnemyMgr.get(site.guard);
          if (g) dress(g); else if (site.guard) left++;
          for (const id of site.ks.cores || []) { const c = G.EnemyMgr.get(id); if (c) coreLook(c); else left++; }
          if (left && n < 30) setTimeout(() => put(n + 1), 150);
        };
        put();
        break;
      }
      case 'st': netApply(msg.ks); break;
      case 'say': if (typeof msg.t === 'string') G.Spawner.say(msg.t.slice(0, 120), 2.8, true); break;
      case 'dive': { const g = G.EnemyMgr.get(msg.id); if (g) { fx(g.x, g.y, INFO.wormhole.color); g._diving = true; g.x = g.y = 1e7; if (g.net) { g.net.x = g.net.y = 1e7; } } break; }
      case 'emerge': {
        const g = G.EnemyMgr.get(msg.id);
        if (g && Number.isFinite(msg.x) && Number.isFinite(msg.y)) { g._diving = false; g.x = msg.x; g.y = msg.y; if (g.net) { g.net.x = msg.x; g.net.y = msg.y; g.net.vx = g.net.vy = 0; } fx(msg.x, msg.y, INFO.wormhole.color); }
        break;
      }
      case 'won': won(); break;
      case 'lost': lost(); break;
      case 'end': finish(); break;
    }
  });

  // The words the banners use, as they are (the dictionary's word-by-word pass would touch some).
  if (G.I18n && G.I18n.add) {
    const words = ["It's a Monster House!", 'Wave 2: elites!', 'The seal shatters! Strike now!', 'The titan awakens! The plates take longer to light',
      'The guardian is beaten! A relic awaits you', 'The guardian withdraws. The seal breaks…'];
    for (const k of KINDS) words.push('The seal closes! ' + INFO[k].sub, 'The ' + INFO[k].name.toLowerCase() + ' sinks back into the earth…');
    G.I18n.add(Object.fromEntries(words.map(x => [x, x])), 'en');
  }

  return {
    FROM, TTL, R, FIGHT, KINDS, INFO, guardHp, STAND, LIT, PLATE_R,
    get site() { return site; },
    /** A fight (or its reward) is on: the raids, the wild legendaries and the rifts wait. */
    get busy() { return !!site && site.phase !== 'open'; },
    get fighting() { return !!site && site.phase === 'fight'; },
    /** Off to World 2 (js/fork/lab/worlds.js): a site still waiting on World 1's map goes. */
    leave() { if (site && site.phase === 'open') close(); },
    /** For the checks: a site of that kind now (authority), and the fight's time left. */
    debugOpen(kind) { if (authority() && !site) return open(kind); return false; },
    debugTimeLeft(s) { if (site && site.phase === 'fight') site.ft = s; },
    debugNext(s, sure = true) { checkT = s; lastEnd = -1e9; force = sure; }
  };
})();
