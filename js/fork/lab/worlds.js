/* ============ worlds.js — World 2 (MrSurvivor fork) ============
 * Opt-in (the "WORLD 2" switch by Play, js/fork/lab/worlds-toggle.js: G.Settings 'worlds'; in co-op the host's
 * setting decides, sent in its 'start' message). A World 2 run is timed like Megabonk's stages:
 *   - ETERNATUS comes at ETER_AT (10:00) instead of 30:00 (js/fork/lab/eternatus.js asks G.Worlds.on). Losing still
 *     ends the run.
 *   - Beating it opens a PORTAL near where you come back out. All of you (everyone still standing) inside it for
 *     ENTER_S s and you travel to WORLD 2. There's no hurry, but from the moment it opens World 1 gets harder:
 *       · every regular enemy that joins from then on: HP × RAMP_HP ^ minutes, damage × RAMP_DMG ^ minutes, XP unchanged
 *         (×1.25 / ×1.15 a minute: ×3 / ×2 HP / damage after 5 min), so farming World 1 gets slower every minute
 *       · after GRACE s, the GHOST RUSH: waves of Gastly, then Haunter, then Gengar around you, closer together and
 *         bigger every minute, flying over walls and water, with HP and damage that follow the same ramp and a speed
 *         that passes yours after a few minutes (×1.1 a minute). They give no XP worth having.
 *   - WORLD 2 is a fresh land far away (tile W2_AT + up to 4000) with its own palettes (W2_BIOMES, 4 min each, like
 *     World 1's) and its own Pokémon: three extra enemy tiers (W2_TIERS, rolled with the run's cast: they're pushed
 *     onto G.Enemies.TIERS with a `from` no clock reaches, so World 1 never draws them) that come in at 0, 4 and 8 min
 *     after you arrive, and every regular enemy there has × W2_HP HP, × W2_DMG damage and a W2_ELITE chance to be an
 *     elite. Type hordes there use the World 2 tiers. The ramp and the ghosts stop.
 *   - NECROZMA (js/fork/lab/necrozma.js) comes at NECRO_AT (30:00) instead of 45:00. The late-game horde growth
 *     (js/fork/lab/endgame.js: from 20:00, exponential past 30:00) is unchanged, so runs aim at 20-30 min, long ones
 *     ~45 and the best ~60.
 * A run without the setting is unchanged (Eternatus 30:00, Necrozma 45:00, no portal).
 * State: pl._labWorlds = { on (0|1), w (1|2), px, py, pat (the portal's place and opening time), wt (arrival time) }:
 * js/fork/lab/resume.js keeps every pl._lab* key, so a resumed run comes back in its world (and a run without the
 * setting stays without it, whatever the switch says when you resume).
 * Co-op: the host decides. { k:'worlds', a } with a = portal (x, y, at), go (tx, ty, t), st (every 2 s: w, p, wt,
 * ch, n, m: so a lost message or a late joiner catches up), set (the lobby: the host's switch). The ghosts travel
 * like any enemy ('ne').
 * Hooks: G.Game.startRun, G.Net.broadcast ('start'), G.EnemyMgr.add, G.Enemies.bagAt / hordeTypes / hordeDefs /
 * upcomingDex, G.World.setBiome / biomeName, G.Events.update / drawables / drawHud. Load order: after necrozma.js.
 * Texts in English. Test: fork/test-worlds.cjs.
 */
G.Worlds = (() => {
  const ETER_AT = 600, NECRO_AT = 1800;
  const ENTER_S = 1.5, PR = 46, GRACE = 60, RAMP_HP = 1.25, RAMP_DMG = 1.15;
  const GHOSTS = [92, 93, 94], GHOST_MAX = 40, GHOST_SPD = 90, GHOST_SPD_UP = 0.1, GHOST_SPD_MAX = 240;
  const W2_AT = 20000, W2_HP = 1.15, W2_DMG = 1.1, W2_ELITE = 0.1;
  const W2_OFF = [0, 240, 480], FAR = 1e6;
  // Above World 1's last tier (from 500: BST 530-620, 250 HP, 28 damage, 38 XP).
  const W2_TIERS = [
    { from: FAR,     bst: [480, 560], hp: 380, spd: 76, dmg: 32, xp: 50,  cast: 8 },
    { from: FAR + 1, bst: [520, 610], hp: 560, spd: 80, dmg: 38, xp: 75,  cast: 8 },
    { from: FAR + 2, bst: [560, 700], hp: 800, spd: 84, dmg: 46, xp: 110, cast: 7 }
  ];
  const VIOLET = '#b07bff', CYAN = '#7fe8ff';
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;
  const st = () => { const pl = G.Game.player; return pl && pl._labWorlds; };
  const on = () => { const s = st(); return lab() && !!(s && s.on); };
  const world = () => (on() ? st().w : 0);
  const portal = () => { const s = st(); return on() && s.w === 1 && s.pat != null ? s : null; };
  const over = t => { const p = portal(); return p ? Math.max(0, t - p.pat) : 0; };
  const rampHp = t => Math.pow(RAMP_HP, over(t) / 60);
  const rampDmg = t => Math.pow(RAMP_DMG, over(t) / 60);
  const now = () => (G.Game.st ? G.Game.st.time : 0);
  let charge = 0, inside = 0, alive = 0, ghostT = 0, netT = 0, shown = 0, shownW2 = 0;

  function send(msg) {
    if (!G.Coop.active || !G.Coop.isHost) return;
    msg.k = 'worlds';
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }

  // ---------------- World 2's land ----------------

  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16), f = c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('');
  };
  /** A biome with the fields G.Tiles.BIOMES' have, from a few colours (like tiles.js's arena themes). */
  function biome(name, th) {
    const f = th.floor, w = th.wall, L = th.liq;
    return { name, liquid: th.liquid,
      floor: [f, shade(f, 0.05), shade(f, -0.06)], dirt: [shade(f, -0.16), shade(f, -0.12), shade(f, -0.2)],
      speck: shade(f, -0.25), light: shade(f, 0.22), flowers: th.flowers,
      wallTop: [w, shade(w, 0.07), shade(w, -0.07)], wallLight: shade(w, 0.32), wallEdge: shade(w, -0.7),
      wallFace: [shade(w, -0.3), shade(w, -0.38)], wallFaceDark: shade(w, -0.55),
      liq: L, liqDeep: shade(L, -0.22), foam: th.foam || shade(L, 0.55), shore: shade(f, -0.32),
      prop: th.prop, leaf: [shade(th.leaf, -0.35), shade(th.leaf, -0.15), th.leaf, shade(th.leaf, 0.3)],
      trunk: [shade(th.trunk, -0.2), th.trunk], rock: [shade(th.rock, -0.2), th.rock, shade(th.rock, 0.22)],
      grass: [shade(th.grass, -0.28), th.grass, shade(th.grass, 0.28)] };
  }
  const W2_BIOMES = [
    biome('World 2 · Distortion World', { floor: '#3d3550', wall: '#2a2238', liquid: 'poison', liq: '#8e4fc8', foam: '#e0b0ff', prop: 'dead',
      leaf: '#6a4a8a', trunk: '#3a2f45', flowers: ['#c86bdc', '#7fe8ff', '#e0a6ff'], grass: '#5a4a7a', rock: '#5a5070' }),
    biome('World 2 · Ultra Wastes', { floor: '#2f4248', wall: '#24303a', liquid: 'spark', liq: '#3fd0e0', foam: '#d8fbff', prop: 'crystal',
      leaf: '#5fe0f0', trunk: '#2a4a60', flowers: ['#7fe8ff', '#ffffff', '#ffd23f'], grass: '#3a6a78', rock: '#4f6670' }),
    biome('World 2 · Cinder Ruins', { floor: '#4a3030', wall: '#2e1e1e', liquid: 'lava', liq: '#e8501f', foam: '#ffd46a', prop: 'dead',
      leaf: '#5e3a32', trunk: '#3a2622', flowers: ['#ff8d3d', '#ffc45e', '#c86bdc'], grass: '#7a4a3a', rock: '#6a5550' })
  ];
  const N0 = G.Tiles.BIOMES.length, W2_START = N0;
  G.Tiles.BIOMES.push(...W2_BIOMES);
  const isW2Biome = i => i >= W2_START && i < W2_START + W2_BIOMES.length;
  const w2Biome = t => W2_START + Math.floor(t / 240) % W2_BIOMES.length;

  // The run's 4-minute turn (game.js: setBiome(n) without `instant`) goes round World 1's biomes as before, or
  // World 2's in World 2. The raids, rifts and arenas (instant) choose their own.
  const setBiome = G.World.setBiome;
  G.World.setBiome = function (i, instant) {
    if (!instant && Number.isFinite(i)) i = world() === 2 ? W2_START + ((i % W2_BIOMES.length) + W2_BIOMES.length) % W2_BIOMES.length : ((i % N0) + N0) % N0;
    return setBiome.call(this, i, instant);
  };

  // ---------------- World 2's Pokémon ----------------

  const E = G.Enemies;
  E.TIERS.push(...W2_TIERS);           // rolled with the cast at every run's start (rollRun)
  const w2Tier = t => { const s = st(), since = Math.max(0, t - (s && s.wt != null ? s.wt : t)); let k = 0; W2_OFF.forEach((o, i) => { if (since >= o) k = i; }); return k; };
  const bagAt = E.bagAt;
  E.bagAt = function (t) {
    if (world() !== 2) return bagAt.apply(this, arguments);
    const horde = G.Events && G.Events.bag();
    if (horde) return horde;
    const s = st(), since = Math.max(0, t - (s.wt != null ? s.wt : t)), bag = [];
    E.cast.filter(c => c.from >= FAR).forEach((c, i) => {
      if (since < W2_OFF[i]) return;
      const w = since - W2_OFF[i] > 260 ? 3 : 10;       // older tiers lose weight, as in World 1
      for (const d of c.list) for (let j = 0; j < w; j++) bag.push(d);
    });
    return bag.length ? bag : bagAt.apply(this, arguments);
  };
  // Type hordes (events.js) from World 2's current tier.
  const hordeTypes = E.hordeTypes, hordeDefs = E.hordeDefs;
  E.hordeTypes = function (t) { return world() === 2 ? hordeTypes.call(this, FAR + w2Tier(t)) : hordeTypes.apply(this, arguments); };
  E.hordeDefs = function (type, t) { return world() === 2 ? hordeDefs.call(this, type, FAR + w2Tier(t)) : hordeDefs.apply(this, arguments); };
  /** World 2's cast that comes within `ahead` s (or all of it: for the preload when the portal opens). */
  function w2Dex(t, ahead) {
    const s = st(), since = s && s.wt != null ? Math.max(0, t - s.wt) : -1e9;
    return E.cast.filter(c => c.from >= FAR).flatMap((c, i) => (ahead == null || since + ahead >= W2_OFF[i] ? c.list.map(d => d.dex) : []));
  }
  const upcoming = E.upcomingDex;
  E.upcomingDex = function (t, ahead = 60) {
    const r = upcoming.apply(this, arguments);
    return world() === 2 ? r.concat(w2Dex(t, ahead)) : r;
  };

  // ---------------- what joins the fight ----------------

  const regular = e => !e.boss && !e.legend && !e.wildLegend && !e.judge && !e.obelisk && !e._split && !e._noScale && !e._ghost && e.behavior !== 'thief';
  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    if (e && !e.remote && !e._worlds && on() && authority() && G.Game.st && regular(e)) {
      const t = G.Game.st.time;
      if (world() === 2) {
        e._worlds = 2;
        e.maxHp = e.hp = Math.max(1, Math.round(e.maxHp * W2_HP));
        e.dmg *= W2_DMG;
        if (!e._elite && Math.random() < W2_ELITE) { e.maxHp = e.hp = Math.round(e.maxHp * 1.6); e.dmg *= 1.25; e.xp = Math.round(e.xp * 1.6); e._elite = true; }
      } else if (portal() && !(G.Eternatus && G.Eternatus.active)) {
        e._worlds = 1;
        e.maxHp = e.hp = Math.max(1, Math.round(e.maxHp * rampHp(t)));
        e.dmg *= rampDmg(t);
      }
    }
    return add.apply(this, arguments);
  };

  // ---------------- the ghost rush ----------------

  /** The horde's numbers at time t (spawner.js: the last tier × scale(t) × its toughness and damage factors). */
  function horde(t) {
    const sc = E.scale(t), last = E.TIERS.filter(r => r.from < FAR).pop();
    return { hp: last.hp * sc.hp * (3.3 + Math.min(1.7, t / 210)), dmg: last.dmg * sc.dmg * 2.4 };
  }
  function ghostWave(t) {
    const m = (over(t) - GRACE) / 60, ps = G.Game.everyone().filter(p => !p.dead);
    if (!ps.length) return;
    const have = G.EnemyMgr.all().filter(e => e._ghost && !e.dead).length;
    const n = Math.min(GHOST_MAX - have, Math.min(10, 2 + Math.floor(m * 1.5)));
    const h = horde(t), n2 = G.Game.everyone().length;
    const spd = Math.min(GHOST_SPD_MAX, GHOST_SPD * (1 + GHOST_SPD_UP * Math.max(0, m)));
    for (let i = 0; i < n; i++) {
      const r = Math.random(), k = m < 2 ? 0 : m < 4.5 ? (r < 0.6 ? 0 : 1) : (r < 0.25 ? 0 : r < 0.6 ? 1 : 2);
      const p = G.U.pick(ps), a = Math.random() * 6.2832, d = G.Camera.outerRadius() + G.U.rand(20, 90);
      const def = { dex: GHOSTS[k], name: ['Gastly', 'Haunter', 'Gengar'][k], behavior: 'chase', xp: 1,
        hp: Math.round(h.hp * [0.5, 0.8, 1.3][k] * rampHp(t) * G.Coop.scaleHp(n2)),
        dmg: Math.round(h.dmg * [0.8, 1, 1.3][k] * rampDmg(t)), spd: Math.round(spd * [1, 1.05, 1.1][k]) };
      const e = new G.Enemy(def, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.9, { hp: 1, spd: 1, dmg: 1 }, false);
      e._ghost = true; e._noScale = true; e.flying = true;
      G.EnemyMgr.add(e);
    }
  }

  // ---------------- the portal ----------------

  /** Authority: the portal opens near the leader (where the raid sent you back), and everyone hears. */
  function open() {
    const s = st(), pl = G.Game.player, ts = TS();
    let x = pl.x, y = pl.y - ts * 5;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.2832, d = ts * G.U.rand(4.5, 7);
      const cx = pl.x + Math.cos(a) * d, cy = pl.y + Math.sin(a) * d * 0.85;
      if (G.World.isFree(cx, cy, 34)) { x = cx; y = cy; break; }
    }
    opened(Math.round(x), Math.round(y), Math.round(now()));
    send({ a: 'portal', x: s.px, y: s.py, at: s.pat });
  }
  /** On every computer. */
  function opened(x, y, at) {
    const s = st();
    if (!s || s.pat != null || s.w !== 1) return;
    s.px = x; s.py = y; s.pat = at;
    charge = 0; ghostT = 3; shown = performance.now();
    G.Sprites.preload(GHOSTS.concat(w2Dex(now())), 8000);
    G.FX.ring(x, y, 10, 220, VIOLET, 0.8, 6);
    G.Audio.sfx('rift');
    G.Camera.kick(0.8);
  }

  /** Authority: the whole team goes (each computer moves everyone, as the raids do). */
  function go() {
    const ts = TS();
    let tx = W2_AT + Math.floor(Math.random() * 4000), ty = W2_AT + Math.floor(Math.random() * 4000);
    for (let i = 0; i < 30 && !G.World.isFree(tx * ts + ts / 2, ty * ts + ts / 2, 40); i++) { tx += 3; ty += 2; }
    const t = Math.floor(now());
    send({ a: 'go', tx, ty, t });
    travel(tx, ty, t);
  }
  /** On every computer: to World 2. */
  function travel(tx, ty, t) {
    const s = st(), pl = G.Game.player, ts = TS();
    if (!s || s.w === 2) return;
    s.w = 2; s.wt = t; s.pat = null;
    charge = 0; shownW2 = performance.now();
    if (authority()) G.EnemyMgr.clear(); else G.EnemyMgr.clearRemote();
    G.Pickups.clear();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    G.Events.reset();
    G.Weather.clear();
    if (G.LabSites && G.LabSites.leave) G.LabSites.leave();
    const x = tx * ts + ts / 2, y = ty * ts + ts / 2, ps = G.Game.everyone();
    ps.forEach((p, i) => { p.x = x + (i - (ps.length - 1) / 2) * 34; p.y = y; });
    if (pl.dead) pl.revive(0.3);
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.World.setBiome(w2Biome(now()), true);
    G.Sprites.preload(w2Dex(now(), 60), 8000);
    G.Game.flash(VIOLET, 0.9);
    G.Camera.kick(1.2);
    G.Audio.sfx('rift');
  }

  // ---------------- every frame ----------------

  function tick(dt, players, time) {
    const s = st();
    if (!on() || G.Game.state !== 'playing') return;
    // World 2's palette after anything that set another one instantly (a resumed run starts in World 1's).
    if (s.w === 2 && !isW2Biome(G.World.biome) && !G.Rift.inArena && !G.Judgment.active) G.World.setBiome(w2Biome(time), true);
    if (!authority()) return;
    if (s.w === 1 && s.pat == null) {
      if (G.Game.player._labEternatus && !(G.Eternatus && G.Eternatus.active) && !G.Rift.inArena) open();
      return;
    }
    if (s.w !== 1) { send2(dt); return; }
    // Inside the portal: everyone still standing, for ENTER_S s.
    const busy = G.Rift.inArena || G.Judgment.active || (G.LabSites && G.LabSites.busy);
    const up = G.Game.everyone().filter(p => !p.dead);
    alive = up.length;
    inside = up.filter(p => G.U.dist2(p.x, p.y, s.px, s.py) < PR * PR).length;
    const was = charge;
    charge = !busy && alive && inside === alive ? charge + dt : Math.max(0, charge - dt * 2);
    if (charge > 0 && was === 0) G.Pickups.pullAll();
    if (charge >= ENTER_S) { go(); return; }
    // The ghosts.
    if (!busy && over(time) >= GRACE && (ghostT -= dt) <= 0) {
      const m = (over(time) - GRACE) / 60;
      ghostT = Math.max(2, 8 - m);
      ghostWave(time);
    }
    send2(dt);
  }
  /** Host: the state every 2 s (and while the portal fills, 4 times a second). */
  function send2(dt) {
    if (!G.Coop.active) return;
    netT -= dt;
    if (netT > 0) return;
    const s = st();
    netT = charge > 0 ? 0.25 : 2;
    send({ a: 'st', w: s.w, p: s.pat != null ? [s.px, s.py, s.pat] : 0, wt: s.wt, ch: +charge.toFixed(2), n: inside, m: alive });
  }

  // ---------------- drawing ----------------

  function drawPortal(ctx) {
    const s = portal();
    if (!s) return;
    const t = performance.now() / 1000, x = s.px, y = s.py, k = Math.min(1, charge / ENTER_S);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, PR + 6, 12, 0, 0, 6.2832); ctx.fill();
    const cy = y - 34;
    const g = ctx.createRadialGradient(x, cy, 4, x, cy, 52);
    g.addColorStop(0, '#05010c'); g.addColorStop(0.55, '#2a0d4a'); g.addColorStop(1, 'rgba(176,123,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, cy, 52, 60, 0, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3 + i);
      ctx.strokeStyle = i % 2 ? CYAN : VIOLET;
      ctx.beginPath(); ctx.ellipse(x, cy, 30 + i * 6, 40 + i * 6, 0, t * (1.5 + i * 0.4) + i, t * (1.5 + i * 0.4) + i + 4.2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const a = t * 2 + i * 0.785, r = 46 - ((t * 30 + i * 9) % 40);
      ctx.fillStyle = i % 2 ? '#ffffff' : CYAN;
      ctx.fillRect(x + Math.cos(a) * r - 1.5, cy + Math.sin(a) * r * 1.15 - 1.5, 3, 3);
    }
    ctx.strokeStyle = 'rgba(176,123,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(x, y, PR, PR * 0.4, 0, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    if (k > 0) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, cy, 62, -Math.PI / 2, -Math.PI / 2 + k * 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  function banner(ctx, w, h, F, at, t1, t2, col) {
    const age = (performance.now() - at) / 1000;
    if (!at || age >= 5) return;
    const raw = (m, s, x, y) => G.I18n.rawCanvas(ctx, m, s, x, y);
    const a = Math.min(1, age * 4, (5 - age) * 2);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(w / 2, h * 0.2);
    ctx.font = F(800, 20); const w1 = raw('measureText', t1).width; ctx.font = F(700, 11); const w2 = raw('measureText', t2).width;
    const bw = Math.min(w - 24, Math.max(w1, w2) + 36);
    ctx.fillStyle = 'rgba(12,6,22,.9)'; ctx.fillRect(-bw / 2, -26, bw, 52);
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.strokeRect(-bw / 2, -26, bw, 52);
    ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.font = F(800, 20); raw('fillText', t1, 0, -2);
    ctx.fillStyle = '#e8e2f0'; ctx.font = F(700, 11); raw('fillText', t2, 0, 16);
    ctx.restore();
  }

  const fmtK = k => '×' + (k < 10 ? k.toFixed(1) : Math.round(k));
  function drawHud(ctx, w, h, pl, F) {
    if (!on() || G.Judgment.cinematic) return;
    const raw = (m, s, x, y) => G.I18n.rawCanvas(ctx, m, s, x, y);
    const s = portal();
    if (s && !G.Judgment.active && !G.Rift.inArena) {
      const cam = G.Camera, t = now(), o = over(t);
      const sx = (s.px - cam.left()) * cam.scale, sy = (s.py - 40 - cam.top()) * cam.scale;
      const mk = G.Markers.at('worlds:portal', sx, sy, w, h);
      ctx.save();
      if (mk) {
        const a = mk.a, ca = Math.cos(a), sa = Math.sin(a), beat = 0.5 + Math.sin(performance.now() / 140) * 0.5;
        const label = 'WORLD 2 PORTAL · ' + Math.round(G.U.dist(pl.x, pl.y, s.px, s.py) / 32) + ' m';
        ctx.translate(mk.x, mk.y); ctx.scale(mk.k, mk.k);
        G.Markers.halo(ctx, VIOLET, mk);
        ctx.beginPath();
        ctx.moveTo(ca * 34, sa * 34); ctx.lineTo(Math.cos(a + 2.45) * 17, Math.sin(a + 2.45) * 17); ctx.lineTo(Math.cos(a - 2.45) * 17, Math.sin(a - 2.45) * 17);
        ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.globalAlpha = 0.7 + beat * 0.3; ctx.fillStyle = VIOLET; ctx.fill(); ctx.globalAlpha = 1;
        ctx.font = F(800, 11); ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        raw('strokeText', label, -ca * 28, -sa * 26 + 4); ctx.fillStyle = VIOLET; raw('fillText', label, -ca * 28, -sa * 26 + 4);
      } else {
        ctx.font = F(800, 11); ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const t2 = G.Coop.active ? 'ALL OF YOU STEP IN · WORLD 2' : 'STEP IN · WORLD 2';
        raw('strokeText', t2, sx, sy - 70); ctx.fillStyle = VIOLET; raw('fillText', t2, sx, sy - 70);
      }
      ctx.restore();
      // The line under the boss bars: how much stronger World 1 has got, and the ghosts.
      const ghosts = o >= GRACE, k = rampHp(t);
      let line = ghosts ? 'GHOST RUSH · World 1 ' + fmtK(k) + ' stronger · get to the portal!'
        : 'PORTAL OPEN · World 1 ' + fmtK(k) + ' stronger · ghosts in ' + G.U.mmss(Math.max(0, GRACE - o));
      if (charge > 0 || (G.Coop.active && inside > 0)) line = 'ENTERING WORLD 2' + (G.Coop.active ? ' · ' + inside + '/' + alive + ' in the portal' : '') + ' · ' + Math.round(Math.min(1, charge / ENTER_S) * 100) + '%';
      ctx.save();
      ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.font = F(800, 12);
      const y0 = G.BossBars.below(76);
      raw('strokeText', line, w / 2, y0);
      ctx.fillStyle = ghosts ? (0.75 + Math.sin(performance.now() / 200) * 0.25 > 0.75 ? '#ff5f6d' : '#ff9ab4') : VIOLET;
      raw('fillText', line, w / 2, y0);
      ctx.restore();
    }
    banner(ctx, w, h, F, shown, 'A PORTAL TO WORLD 2 HAS OPENED!', 'Step in when you\'re ready. From now on World 1 grows stronger every minute, and the ghosts are coming', VIOLET);
    banner(ctx, w, h, F, shownW2, 'WORLD 2', now() < NECRO_AT - 60 ? 'Stronger Pokémon roam this land. Necrozma comes at 30:00' : 'Stronger Pokémon roam this land', CYAN);
  }

  // ---------------- hooks ----------------

  const evUpdate = G.Events.update;
  G.Events.update = function (dt, players, time) { tick(dt, players, time); return evUpdate.apply(this, arguments); };
  const evDraw = G.Events.drawables;
  G.Events.drawables = function () {
    const r = evDraw.apply(this, arguments), s = portal();
    return s && !G.Judgment.active ? (r || []).concat([{ y: s.py, draw: drawPortal }]) : r;
  };
  const evHud = G.Events.drawHud;
  G.Events.drawHud = function (ctx, w, h, pl, F) { const r = evHud.apply(this, arguments); if (pl) drawHud(ctx, w, h, pl, F); return r; };

  // The run's setting: solo, yours; co-op, the host's (its 'start' message, which the host's own startRun gets too).
  const broadcast = G.Net.broadcast;
  G.Net.broadcast = function (msg) {
    if (msg && msg.k === 'start' && msg.worlds == null) msg.worlds = !!G.Settings.get('worlds');
    return broadcast.apply(this, arguments);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function (coop = null) {
      const want = coop ? !!coop.worlds : !!G.Settings.get('worlds');
      charge = 0; inside = 0; alive = 0; ghostT = 0; netT = 0; shown = 0; shownW2 = 0;
      const r = startRun.apply(this, arguments);
      const pl = G.Game.player;
      // Kept by a run without it too (on: 0), so resuming a run never turns into the other kind.
      if (pl) pl._labWorlds = { on: want ? 1 : 0, w: 1, px: 0, py: 0, pat: null, wt: null };
      return r;
    };
  });

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'worlds' || !G.Coop.active || G.Coop.isHost || from !== G.Net.hostUid) return;
    const s = st();
    if (!s) return;
    switch (msg.a) {
      case 'portal': if (Number.isFinite(msg.x) && Number.isFinite(msg.y) && Number.isFinite(msg.at)) opened(msg.x, msg.y, msg.at); break;
      case 'go': if (Number.isFinite(msg.tx) && Number.isFinite(msg.ty)) travel(msg.tx, msg.ty, Number.isFinite(msg.t) ? msg.t : now()); break;
      case 'st': {
        charge = Number.isFinite(msg.ch) ? msg.ch : 0; inside = msg.n | 0; alive = msg.m | 0;
        if (s.w === 1 && Array.isArray(msg.p) && s.pat == null) opened(msg.p[0], msg.p[1], msg.p[2]);
        if (msg.w === 2 && s.w === 1) travel(Math.floor(G.Game.player.x / TS()), Math.floor(G.Game.player.y / TS()), Number.isFinite(msg.wt) ? msg.wt : now());
        break;
      }
    }
  });

  // The texts, as they are (the dictionary's word-by-word pass would touch some).
  if (G.I18n && G.I18n.add) {
    const words = W2_BIOMES.map(b => b.name).concat(W2_BIOMES.map(b => b.name.toUpperCase()), ['World 2', 'WORLD 2']);
    G.I18n.add(Object.fromEntries(words.map(x => [x, x])), 'en');
  }

  return {
    ETER_AT, NECRO_AT, ENTER_S, PR, GRACE, RAMP_HP, RAMP_DMG, GHOSTS, W2_TIERS, W2_HP, W2_DMG, W2_ELITE, W2_OFF, W2_START, W2_BIOMES,
    /** This run is a World 2 run (the setting when it started). */
    get on() { return on(); },
    /** 1 or 2 (0 outside a World 2 run). */
    get world() { return world(); },
    get portal() { const s = portal(); return s ? { x: s.px, y: s.py, at: s.pat } : null; },
    get charge() { return charge; },
    rampHp, rampDmg,
    /** For the checks: the ghost wave now (authority), and the World 2 Pokémon in this run's cast. */
    debugGhosts() { if (authority() && portal()) ghostWave(now()); },
    w2Dex: () => w2Dex(now())
  };
})();
