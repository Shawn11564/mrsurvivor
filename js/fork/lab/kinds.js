/* ============ kinds.js — new move families for Lab mode (MrSurvivor fork) ============
 * Phase 4 of fork/LAB.md. They hook into G.Combat.EXTRA (js/systems/combat.js: run, reach and whether
 * they need a target); the rest wraps functions the game calls as G.X.y. Their moves
 * are in js/fork/lab/lab-moves.js and only show up in a Lab run (G.Lab).
 *
 *   leap       Fly, Dig, Bounce, Dive: you leave (you can't be hit) and the blast lands on the target; you
 *              stay untouchable LEAP_GRACE s after landing by the target (LEAP_UPTIME). Where you come down is the move's `land`: 'stay' (Fly,
 *              Bounce: you rise and come down where you were), 'short' (Dig, Dive: LAND_SHORT px short of
 *              the target, on your side), 'back' (Phantom Force: LAND_BACK px behind where you were, away
 *              from the target), or on the target (the others, Shadow Force's chain)
 *   recoil     Double-Edge, Flare Blitz, Brave Bird: a very strong charge that costs you HP and leaves you
 *              where you were (it goes the way you walk: js/fork/lab/mobility.js)
 *              (`recoil` × the damage dealt, at most RECOIL_PER_S of your max HP in any second, and it
 *              never KOs you); a cast that knocks an enemy out gives half its recoil back
 *   ramp       Rollout, Fury Cutter, Ice Ball: each hit that lands hits harder (`step` per hit, up to
 *              `stacks`); the stacks fade one per RAMP_FADE s without a hit. A roll (`roll`) doesn't move you
 *   guard      Protect, Detect (protect: nothing hurts you for `dur` s), Counter, Mirror
 *              Coat, Metal Burst (counter, the "Aegis": hits of its category (`cat`; Metal Burst: all,
 *              `storeAll`) are blocked and stored, others halved; at the end a blast returns `mult` × the stored)
 *   sleep      Hypnosis, Sing, Sleep Powder: a zone warns, then puts whoever it catches to sleep for `stun` s; a
 *              hit wakes them (not burns or poison)
 *   weather    Rain Dance, Sunny Day, Sandstorm, Snowscape: sets that weather for `dur` s
 *   terrain    Electric, Grassy, Psychic, Misty Terrain: a circle on the ground for `dur` s that
 *              helps you (and your friends) while you're inside
 *   wave       Surf, Muddy Water, Sludge Wave: a wide wave that moves forward and drags the enemies
 *   metronome  Metronome: each time, a random move from the whole game
 *   transform  Transform: for `dur` s you turn into the nearest enemy (its look and its
 *              types) and this slot casts its move
 * And a status for any family: `conf` (Confuse Ray, Supersonic...): the enemy, confused for
 * `conf` s, stumbles around, doesn't attack you and hits whoever is next to it; `sleep` (on a
 * move of another family) puts to sleep like the family above.
 *
 * guard, weather and terrain are support: they cast on their own from any slot (PASSIVE).
 *
 * Co-op (star, like coop.js): each player runs their own attacks and the others see them as
 * a ghost. What happens to the enemies is decided by the host:
 *   guest → host       { k:'labst', id, s:'z'|'c', v }   put to sleep / confuse one of its enemies
 *   host → everyone    { k:'labes', z:[ids], c:[ids] }   who is asleep and who is confused
 * On the host, the wave and the whirlpool also drag with a guest's ghost.
 * Text in English only (fork/LAB.md). Test: fork/test-lab.cjs and fork/test-lab-coop.cjs.
 */
G.LabKinds = (() => {
  const C = G.Combat, X = C.EXTRA;
  const col = m => G.U.TYPE_COLOR[m.type];
  const now = () => performance.now();
  const boss = e => e.boss || e.judge;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const RECOIL_PER_S = 0.03;             // recoil: at most this share of your max HP in any 1 s (it was 12 % a cast)
  const LEAP_GRACE = 0.6;                // a leap that lands by the target: untouchable this long after landing (it was 0.15 s)
  const LEAP_UPTIME = 0.6;               // ...but a leap's untouchable time (beyond its time in the air) is at most this share of its recharge
  const LAND_SHORT = 70, LAND_BACK = 60;  // a leap's `land`: 'short' stops this far before the target, 'back' this far behind you
  const RAMP_FADE = 1.5;                 // ramp: one stack fades per RAMP_FADE game s without a hit
  const gtime = () => G.Game.st.time;   // game time (a pause or the game's speed doesn't change it)
  const PASSIVE = new Set(['guard', 'weather', 'terrain']);
  // Colours that don't wake a sleeping enemy: burn, poison (enemy.js update) and lava.
  const DOT = new Set(['#ff9a4d', '#d47cf0']);

  // ---------------- upgrades and evolutions of the new families ----------------
  // Only with the keys G.Moves understands (moves.js applyMods: dmg, cd, radius, dur, width,
  // stun, knock... times; count, stacks... plus).
  const LADDERS = {
    leap: [
      { t: '+40% damage', m: { dmg: 1.4 } }, { t: '+30% landing area', m: { radius: 1.3 } },
      { t: '-25% recharge', m: { cd: 0.75 } }, { t: '+60% damage and +20% landing area', m: { dmg: 1.6, radius: 1.2 } }],
    recoil: [
      { t: '+40% damage', m: { dmg: 1.4 } }, { t: '+30% distance', m: { radius: 1.3 } },
      { t: '-25% recharge', m: { cd: 0.75 } }, { t: '+60% damage and wider', m: { dmg: 1.6, width: 1.4 } }],
    ramp: [
      { t: '+35% damage', m: { dmg: 1.35 } }, { t: 'Builds up one more time', m: { stacks: 1 } },
      { t: '+25% reach', m: { radius: 1.25 } }, { t: '-20% recharge and +30% damage', m: { cd: 0.8, dmg: 1.3 } }],
    guard: [
      { t: '+40% duration', m: { dur: 1.4 } }, { t: '-20% recharge', m: { cd: 0.8 } },
      { t: '+50% damage', m: { dmg: 1.5 } }, { t: '+30% duration and a bigger blast', m: { dur: 1.3, radius: 1.3 } }],
    sleep: [
      { t: '+40% damage', m: { dmg: 1.4 } }, { t: '+25% area', m: { radius: 1.25 } },
      { t: 'They sleep 40% longer', m: { stun: 1.4 } }, { t: '-25% recharge and +25% area', m: { cd: 0.75, radius: 1.25 } }],
    weather: [
      { t: '+40% duration', m: { dur: 1.4 } }, { t: '-20% recharge', m: { cd: 0.8 } },
      { t: '+40% duration', m: { dur: 1.4 } }, { t: '-25% recharge', m: { cd: 0.75 } }],
    terrain: [
      { t: '+30% area', m: { radius: 1.3 } }, { t: '+40% duration', m: { dur: 1.4 } },
      { t: '-20% recharge', m: { cd: 0.8 } }, { t: '+30% area and +30% duration', m: { radius: 1.3, dur: 1.3 } }],
    wave: [
      { t: '+40% damage', m: { dmg: 1.4 } }, { t: '+25% wider', m: { width: 1.25 } },
      { t: '+30% distance', m: { radius: 1.3 } }, { t: '-25% recharge and +40% damage', m: { cd: 0.75, dmg: 1.4 } }],
    metronome: [
      { t: 'The moves it calls are one level higher', m: {} }, { t: '-20% recharge', m: { cd: 0.8 } },
      { t: 'The moves it calls are one level higher', m: {} }, { t: 'One level higher and -20% recharge', m: { cd: 0.8 } }],
    transform: [
      { t: 'The copied move is one level higher', m: {} }, { t: '+40% duration', m: { dur: 1.4 } },
      { t: '-20% recharge', m: { cd: 0.8 } }, { t: 'One level higher and +40% duration', m: { dur: 1.4 } }]
  };
  // On evolving (with its condition, like the others): { t, m } with multipliers (MUL) or additions (ADD).
  const EVO = {
    leap:    { t: '×1.9 damage, bigger landing and less recharge', m: { dmg: 1.9, radius: 1.3, cd: 0.8 } },
    recoil:  { t: '×1.8 damage and half the recoil', m: { dmg: 1.8, recoil: 0.5 } },
    ramp:    { t: '×1.7 damage and it builds up twice as fast', m: { dmg: 1.7, step: 2 } },
    guard:   { t: '×1.8 damage, lasts longer and recharges faster', m: { dmg: 1.8, dur: 1.3, cd: 0.8 } },
    sleep:   { t: '×1.8 damage, bigger area and longer sleep', m: { dmg: 1.8, radius: 1.3, stun: 1.3 } },
    wave:    { t: '×1.8 damage, a wider and longer wave', m: { dmg: 1.8, width: 1.3, radius: 1.2 } }
  };
  const MUL = ['dmg', 'cd', 'radius', 'dur', 'width', 'stun', 'knock', 'recoil', 'step', 'speed', 'mult', 'size', 'life', 'spread'];
  function mods(s, m) {
    for (const k in m) {
      if (MUL.includes(k)) s[k] = (s[k] != null ? s[k] : 1) * m[k];
      else s[k] = m[k];
    }
  }
  const evoInfo = G.Moves.evoInfo;
  G.Moves.evoInfo = function (m, statsTaken) {
    const ev = EVO[m.kind], e = G.Moves.EVO[m.id];
    if (!ev) return evoInfo.apply(this, arguments);
    if (!e || m.evolved || m.lvl < m.def.maxLvl) return null;
    const [name, needs] = e;
    return { name, needs, needName: needs ? G.Moves.NEED_NAME[needs] : 'Nivel máximo', text: ev.t,
             ready: !needs || !!(statsTaken && statsTaken[needs]) };
  };
  const evolve = G.Moves.evolve;
  G.Moves.evolve = function (m) {
    const ev = EVO[m.kind], e = G.Moves.EVO[m.id];
    if (!ev) return evolve.apply(this, arguments);
    if (!e || m.evolved) return false;
    mods(m, ev.m);
    m.baseName = m.name; m.name = e[0]; m.evolved = true;
    return true;
  };

  // Family badges for the move icon (js/ui/icons.js, 5×5).
  Object.assign(G.Icons.KIND_GLYPH, {
    leap:      ['..#..', '.#.#.', '#...#', '.....', '#####'],
    recoil:    ['#..#.', '.#..#', '..###', '.#..#', '#..#.'],
    ramp:      ['....#', '...##', '..###', '.####', '#####'],
    guard:     ['#####', '#...#', '#...#', '.#.#.', '..#..'],
    sleep:     ['####.', '..#..', '.#...', '####.', '....#'],
    weather:   ['.##..', '####.', '.....', '#.#.#', '.#.#.'],
    terrain:   ['.....', '.###.', '#####', '.###.', '.....'],
    wave:      ['.##..', '#..#.', '...#.', '..#.#', '##..#'],
    metronome: ['.###.', '#...#', '..##.', '.....', '..#..'],
    transform: ['##.##', '#...#', '.....', '#...#', '##.##']
  });

  // ---------------- what stays on the map ----------------
  let fields = [];
  /** Damage to every enemy in a circle (like Combat.blast). */
  function blast(pl, m, x, y, r, dmg, knock = 0) {
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) { C.hit(pl, e, dmg, col(m), e.x - x, e.y - y, knock, m); n++; }
    for (const p of G.World.propsInCircle(x, y, r)) G.World.damageProp(p, dmg, col(m));
    return n;
  }
  /** Farthest free spot from (sx, sy) towards (tx, ty) (where to land or how far to charge). */
  function freeTo(pl, sx, sy, tx, ty, step = 8, walk = false) {
    const d = Math.hypot(tx - sx, ty - sy), ca = (tx - sx) / (d || 1), sa = (ty - sy) / (d || 1);
    if (!walk) {
      for (let k = d; k > 0; k -= step) { const x = sx + ca * k, y = sy + sa * k; if (G.World.isFree(x, y, pl.r * 0.8, true)) return [x, y, k]; }
      return [sx, sy, 0];
    }
    let len = 0;
    for (let k = step; k <= d; k += step) { if (!G.World.isFree(sx + ca * k, sy + sa * k, pl.r * 0.8, true)) break; len = k; }
    return [sx + ca * len, sy + sa * len, len];
  }
  /** Where an attack with a spot goes: the target (if in reach) or in front of you. */
  function spot(pl, m, far = 140) {
    const t = C.spotFor(pl, m);
    return t ? [t.x, t.y, t] : [pl.x + Math.cos(pl.aim) * far, pl.y + Math.sin(pl.aim) * far, null];
  }

  // ---------------- leap ----------------
  X.leap = {
    target: true, reach: m => 300,
    run(pl, m, ghost) {
      const [x, y] = spot(pl, m, 160);
      // The blast's spot (bx, by) and where you come down (tx, ty): see `land` above.
      const land = (m.chain || 1) > 1 ? 'on' : m.land || 'on', d = Math.hypot(x - pl.x, y - pl.y) || 1;
      let [bx, by] = freeTo(pl, pl.x, pl.y, x, y), tx = bx, ty = by;
      if (land === 'stay') { tx = pl.x; ty = pl.y; }
      else if (land === 'short') { const k = Math.max(0, d - LAND_SHORT) / d; [tx, ty] = freeTo(pl, pl.x, pl.y, pl.x + (x - pl.x) * k, pl.y + (y - pl.y) * k); bx = tx; by = ty; }
      else if (land === 'back') [tx, ty] = freeTo(pl, pl.x, pl.y, pl.x - (x - pl.x) / d * LAND_BACK, pl.y - (y - pl.y) / d * LAND_BACK, 8, true);
      const dur = m.dur || 0.65;
      pl._labLeap = { t: 0, dur, sx: pl.x, sy: pl.y, tx, ty, style: m.leap || 'fly' };
      // Untouchable in the air, and after landing by the target (on it, or 'short'), within LEAP_UPTIME of the
      // recharge: with 0.6 s after every landing an evolved Fly was never hit at all (fork/survival-lab.cjs).
      const after = land === 'on' || land === 'short' ? LEAP_GRACE : 0.15;
      if (!ghost) pl.invuln = Math.max(pl.invuln || 0, dur, Math.min(dur + after, LEAP_UPTIME * m.cd * pl.cdMul));
      fields.push({ kind: 'leap', owner: pl, ghost, m, t: 0, dur, x: bx, y: by, px: tx, py: ty, land, sx: pl.x, sy: pl.y, left: (m.chain || 1) - 1 });
      const v = G.VFX.forMove(m);
      G.FX.burst(pl.x, pl.y - 4, m.leap === 'dig' ? '#aa7c3c' : m.leap === 'dive' ? '#8ccaff' : col(m), 12, 140);
      for (let i = 0; i < 4; i++) G.FX.sp(v.proj, v.pal, pl.x + G.U.rand(-10, 10), pl.y - 6, { vy: m.leap === 'dig' ? 30 : -120, life: 0.35 });
    }
  };
  function tickLeap(f, dt) {
    const pl = f.owner, L = pl._labLeap;
    const px = f.px != null ? f.px : f.x, py = f.py != null ? f.py : f.y;
    if (!f.ghost && L) {
      const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
      pl.x = f.sx + (px - f.sx) * e; pl.y = f.sy + (py - f.sy) * e;
    }
    if (f.t < f.dur) return false;
    if (L) delete pl._labLeap;
    // A teammate's copy: the blast where its puppet came down (it lands where the blast is), else the spot.
    const onYou = !f.land || f.land === 'on' || f.land === 'short';
    const x = f.ghost && onYou ? pl.x : f.x, y = f.ghost && onYou ? pl.y : f.y, m = f.m;
    G.FX.ring(x, y, 6, m.radius, col(m), 0.4, 5);
    G.FX.burst(x, y - 6, col(m), 16, 200);
    if (G.Camera.sees(x, y, 40)) G.Audio.sfx('break');
    if (!f.ghost && !pl.dead) {
      G.World.collide(pl);
      blast(pl, m, x, y, m.radius, m.dmg * pl.atkFor(m), m.knock || 120);
      if (m.stun) for (const e of G.EnemyMgr.queryCircle(x, y, m.radius)) if (!e.dead) e.applyStun(m.stun * (boss(e) ? 0.35 : 1));
      G.Camera.kick(0.3);
      if (f.left > 0) chainLeap(pl, f, x, y);
    }
    return true;
  }
  // chain (Shadow Force): after a strike, it vanishes again and reappears on the nearest enemy it
  // hasn't hit yet (within chainR), up to `chain` strikes in all, untouchable the whole time.
  function chainLeap(pl, f, x, y) {
    const m = f.m, done = f.done || new Set();
    for (const e of G.EnemyMgr.queryCircle(x, y, m.radius)) done.add(e);
    let next = null, best = Infinity;
    for (const e of G.EnemyMgr.queryCircle(x, y, m.chainR || 240)) {
      const d = G.U.dist(x, y, e.x, e.y);
      if (!e.dead && !done.has(e) && d < best) { best = d; next = e; }
    }
    if (!next) return;
    const [tx, ty] = freeTo(pl, x, y, next.x, next.y), dur = m.chainDur || 0.32;
    pl._labLeap = { t: 0, dur, sx: x, sy: y, tx, ty, style: m.leap || 'fly' };
    pl.invuln = Math.max(pl.invuln || 0, dur + LEAP_GRACE);
    fields.push({ kind: 'leap', owner: pl, ghost: false, m, t: 0, dur, x: tx, y: ty, sx: x, sy: y, left: f.left - 1, done });
    G.FX.burst(x, y - 4, col(m), 10, 120);
  }

  // ---------------- recoil ----------------
  X.recoil = {
    target: true, reach: m => m.radius + 60,
    run(pl, m, ghost) {
      const v = G.VFX.forMove(m), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), sx = pl.x, sy = pl.y;
      const [ex, ey, len] = freeTo(pl, sx, sy, sx + ca * m.radius, sy + sa * m.radius, 8, true);
      for (let d = 0; d <= len; d += 18) G.FX.sp(v.proj || 'streak', v.pal, sx + ca * d, sy + sa * d - G.LIFT * 0.6, { life: 0.28, angle: pl.aim, scale: 1.3 });
      G.FX.slash(ex, ey - G.LIFT * 0.5, pl.aim, 44, 2.6, col(m), v);
      G.FX.ring(ex, ey, 6, 46, col(m), 0.3, 4);
      if (ghost) return;
      // You stay where you were (policy (a), js/fork/lab/mobility.js, which also aims it).
      pl.invuln = Math.max(pl.invuln || 0, 0.3);
      const w = m.width || 36, mx = (sx + ex) / 2, my = (sy + ey) / 2, d0 = m.dealt || 0, dmg = m.dmg * pl.atkFor(m);
      const struck = [];
      for (const e of G.EnemyMgr.queryCircle(mx, my, len / 2 + w)) {
        if (C.segDist2(sx, sy, ex, ey, e.x, e.y) <= (w / 2 + e.r) ** 2) { C.hit(pl, e, dmg, col(m), ca, sa, m.knock || 100, m); struck.push(e); }
      }
      for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) if (C.segDist2(sx, sy, ex, ey, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, dmg, col(m));
      recoil(pl, m, (m.dealt || 0) - d0, struck.some(e => e.dead));
      if (G.LabMobility) G.LabMobility.after(pl, m);
    }
  };
  /**
   * The recoil of a cast that dealt `done`: `recoil` × it, within what's left of RECOIL_PER_S of your
   * max HP in the last second (against a crowd every cast hit the old 12 % cap: ~10 % HP a second on
   * top of the contact damage); a KO gives half of it back. Never knocks you out.
   */
  function recoil(pl, m, done, ko) {
    if (!(done > 0) || pl.labAbility === 'rock-head' || pl.labAbility === 'magic-guard') return;
    const t = gtime(), log = (pl._labRecoil || []).filter(x => t - x.t < 1);
    const used = log.reduce((a, x) => a + x.r, 0);
    let r = Math.min(done * (m.recoil || 0.25), Math.max(0, pl.maxHp * RECOIL_PER_S - used));
    if (r > 0) log.push({ t, r });
    pl._labRecoil = log;
    if (ko) r *= 0.5;
    if (r > 0 && pl.hp > 1) {
      pl.hp = Math.max(1, pl.hp - r);
      if (r >= 1) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 4, '-' + Math.round(r), '#ffae5c');
    }
  }

  // ---------------- ramp ----------------
  X.ramp = {
    target: true, reach: m => m.radius + 30,
    run(pl, m, ghost) {
      const v = G.VFX.forMove(m), c = col(m);
      // A roll (Rollout, Ice Ball) no longer moves you (it closed in up to 80 px a cast, into the crowd
      // you were kiting): it swings at the target like melee.
      // A pause in the hits (kiting, a slot switch, a miss) takes one stack per RAMP_FADE s, not all of them.
      if (!ghost && m._ramp > 0) {
        const steps = Math.floor((gtime() - (m._rampAt || 0)) / RAMP_FADE);
        if (steps > 0) { m._ramp = Math.max(0, m._ramp - steps); m._rampAt += steps * RAMP_FADE; }
      }
      const n = ghost ? 0 : m._ramp || 0, k = 1 + n * (m.step || 0.35);
      G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, m.radius * (1 + n * 0.08), m.arc || 2, c, v);
      if (m.roll) for (let i = 0; i < 3; i++) G.FX.sp(v.proj || 'rock', v.pal, pl.x + G.U.rand(-8, 8), pl.y - 4, { vx: -Math.cos(pl.aim) * 60, vy: -30, life: 0.3 });
      if (ghost) return;
      const half = Math.min(m.arc || 2, 6.2832) / 2;
      let hits = 0;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
        if (!C.inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
        C.hit(pl, e, m.dmg * pl.atkFor(m) * k, c, e.x - pl.x, e.y - pl.y, m.knock || 50, m);
        hits++;
      }
      for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) if (C.inArc(pl.x, pl.y, p.x, p.y, pl.aim, half)) G.World.damageProp(p, m.dmg * pl.atkFor(m) * k, c);
      const was = m._ramp || 0;
      if (hits) { m._ramp = Math.min(m.stacks || 4, was + 1); m._rampAt = gtime(); }
      if (m._ramp > was) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, '×' + (1 + m._ramp * (m.step || 0.35)).toFixed(1), c);
    }
  };

  // ---------------- guard ----------------
  /** Anything about to hit you? (so it casts on its own from any slot). */
  function threat(pl, r = 110) {
    if (G.EnemyMgr.queryCircle(pl.x, pl.y, r * 0.8).some(e => !e.dead)) return true;
    return G.Projectiles.all().some(p => !p.friendly && G.U.dist2(p.x, p.y, pl.x, pl.y) < r * r);
  }
  X.guard = {
    target: true, reach: m => 0,                       // never from Combat.tickMove: C.tick (below) casts it if something is about to hit you
    run(pl, m, ghost) {
      pl._labGuard = { t: m.dur || 0.9, dur: m.dur || 0.9, m, stored: 0, ghost };
      G.FX.ring(pl.x, pl.y - pl.bodyH * 0.4, pl.r * 3, pl.r * 1.4, col(m), 0.3, 3);
      if (!ghost) G.Audio.sfx('shot', { kind: 'buff', type: m.type });
    }
  };
  function guardEnd(pl, g) {
    const m = g.m;
    if (m.mode !== 'counter' || g.ghost || pl.dead) return;
    const dmg = m.dmg * pl.atkFor(m) + g.stored * (m.mult || 2);
    G.FX.ring(pl.x, pl.y, pl.r, m.radius || 90, col(m), 0.4, 5);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col(m), 18, 220);
    blast(pl, m, pl.x, pl.y, m.radius || 90, dmg, 160);
    if (g.stored > 0) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, 'Counter!', col(m), true);
    G.Camera.kick(0.2);
  }

  // ---------------- sleep ----------------
  X.sleep = {
    target: true, reach: m => 300,
    run(pl, m, ghost) {
      const t = C.spotFor(pl, m);
      if (!t) return;
      fields.push({ kind: 'sleepzone', owner: pl, ghost, m, t: 0, delay: m.delay || 0.5, x: t.x, y: t.y, r: m.radius, dmg: m.dmg * pl.atkFor(m) });
    }
  };

  // ---------------- weather ----------------
  // Rain Dance, Sunny Day, Sandstorm, Snowscape: they used to bring the real weather (the
  // arena event, 16 s every 22 s, for everyone): on almost all the time and far too strong. Now
  // a spell of their weather around you (`wxzone`, it follows you): rain and sun boost the Water and
  // Fire moves used inside (×1.3, like the terrains), sand wears down the enemies inside
  // and snow slows them. The arena's weather is still only the one that comes at random.
  const WXZ = {
    rain: { boost: 'water', color: '#4fa8ff' },
    sun:  { boost: 'fire', color: '#ffb43d' },
    sand: { chip: true, color: '#d8b46a' },
    snow: { slow: true, color: '#cfefff' }
  };
  X.weather = {
    target: false, reach: m => 999,
    run(pl, m, ghost) {
      if (!WXZ[m.wx]) return;
      for (const f of fields) if (f.kind === 'wxzone' && f.owner === pl && f.m.id === m.id) f.gone = true;
      const r = m.radius || 130;
      fields.push({ kind: 'wxzone', owner: pl, ghost, m, t: 0, life: m.dur || 4, x: pl.x, y: pl.y, r, wx: m.wx, tick: 0 });
      G.FX.ring(pl.x, pl.y, 8, r, WXZ[m.wx].color, 0.5, 4);
    }
  };
  /** The weather zones (x, y) is in (yours and your friends'). */
  const wxAt = (x, y) => fields.filter(f => f.kind === 'wxzone' && !f.gone && ((x - f.x) / f.r) ** 2 + ((y - f.y) / (f.r * 0.62)) ** 2 <= 1);
  function tickWx(f, dt) {
    if (f.owner.dead) return true;
    f.x = f.owner.x; f.y = f.owner.y;                     // it follows you
    const z = WXZ[f.wx];
    if (G.Camera.sees(f.x, f.y, f.r) && Math.random() < dt * 14) {
      const a = Math.random() * 6.2832, rr = Math.random() * f.r, x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr * 0.6;
      if (f.wx === 'rain') G.FX.sp('drop', 'water', x, y - 40, { vy: 160, life: 0.25, angle: Math.PI / 2 });
      else if (f.wx === 'snow') G.FX.px(x, y - 30, '#ffffff', { vy: 30, life: 0.9 });
      else if (f.wx === 'sand') G.FX.px(x, y - 6, z.color, { vx: 70, vy: -6, life: 0.6 });
      else G.FX.px(x, y, z.color, { vy: -26, life: 0.7 });
    }
    if ((f.tick -= dt) > 0 || f.ghost) return false;
    f.tick = 0.5;
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
      if (e.dead) continue;
      if (z.chip) C.hit(f.owner, e, (f.m.dmg || 6) * f.owner.atkFor(f.m), z.color, e.x - f.x, e.y - f.y, 0, f.m);
      if (z.slow) e.applySlow(f.m.slow || 0.35, 0.6);
    }
    return false;
  }

  // ---------------- terrain ----------------
  const TERRAIN = {
    electric: { boost: 'electric', color: '#ffd21a' },
    grassy:   { heal: 0.015, color: '#45b23c' },
    psychic:  { boost: 'psychic', color: '#ff4f9a' },
    misty:    { shield: 0.25, color: '#ff8acb' }
  };
  X.terrain = {
    target: false, reach: m => 999,
    run(pl, m, ghost) {
      // One at a time per player.
      for (const f of fields) if (f.kind === 'terrain' && f.owner === pl) f.gone = true;
      fields.push({ kind: 'terrain', owner: pl, ghost, m, t: 0, life: m.dur || 9, x: pl.x, y: pl.y, r: m.radius || 150, terr: m.terr });
      G.FX.ring(pl.x, pl.y, 8, m.radius || 150, TERRAIN[m.terr].color, 0.5, 4);
    }
  };
  /** Terrains (x, y) is in (yours and your friends'). */
  const terrainsAt = (x, y) => fields.filter(f => f.kind === 'terrain' && !f.gone && ((x - f.x) / f.r) ** 2 + ((y - f.y) / (f.r * 0.62)) ** 2 <= 1);

  // ---------------- wave ----------------
  X.wave = {
    target: true, reach: m => (m.radius || 300) * 0.8,
    run(pl, m, ghost) {
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      fields.push({ kind: 'wave', owner: pl, ghost, m, t: 0, x: pl.x, y: pl.y, ca, sa, d: 0, hits: new Set(),
                    w: m.width || 150, sp: m.speed || 240, len: m.radius || 300, dmg: m.dmg * pl.atkFor(m) });
      if (!ghost) G.Camera.kick(0.1);
    }
  };
  function tickWave(f, dt) {
    const pl = f.owner, m = f.m;
    f.d += f.sp * dt;
    const fx = f.x + f.ca * f.d, fy = f.y + f.sa * f.d, half = f.w / 2;
    for (const e of G.EnemyMgr.queryCircle(fx, fy, half + 30)) {
      if (e.dead) continue;
      const px = e.x - f.x, py = e.y - f.y, along = px * f.ca + py * f.sa, side = -px * f.sa + py * f.ca;
      if (Math.abs(along - f.d) > 22 + e.r || Math.abs(side) > half + e.r) continue;
      if (!f.ghost && !f.hits.has(e.id)) { f.hits.add(e.id); C.hit(pl, e, f.dmg, col(m), f.ca, f.sa, 0, m); }
      // The wave carries them: whoever has the real enemies (like combat.js's whirlpool).
      if (!e.remote && authority()) { const k = f.sp * dt * (boss(e) ? 0.2 : 0.85); e.x += f.ca * k; e.y += f.sa * k; }
    }
    if (!f.ghost) for (const p of G.World.propsInCircle(fx, fy, half)) if (!f.hits.has('p' + p.id)) { f.hits.add('p' + p.id); G.World.damageProp(p, f.dmg, col(m)); }
    if (G.World.isWall(fx, fy) && f.d > 40) f.len = Math.min(f.len, f.d + 20);
    return f.d >= f.len;
  }

  // ---------------- metronome ----------------
  const NO_CALL = new Set(['orbit', 'buff', 'trail', 'weather', 'terrain', 'guard', 'metronome', 'transform',
                           'heal', 'screen', 'shout', 'endure', 'focus', 'ally']);     // kinds2.js's support kinds too (and support.js's)
  let callable = null;
  function randomMove() {
    if (!callable) callable = Object.values(G.Moves.BY_ID).filter(d => !NO_CALL.has(d.kind)).map(d => d.id);
    return G.U.pick(callable);
  }
  /** An instance of `id` whose damage is credited to `m` (per-move summary). */
  function borrowed(id, lvl, m) {
    const d = G.Moves.BY_ID[id];
    const inst = G.Moves.instance(id, Math.max(1, Math.min(lvl, d.maxLvl)));
    Object.defineProperty(inst, 'dealt', { get: () => 0, set: v => { m.dealt = (m.dealt || 0) + v; } });
    return inst;
  }
  X.metronome = {
    target: true, reach: m => 300,
    run(pl, m, ghost) {
      const id = m._pick || randomMove();
      m._pick = null;
      const inst = borrowed(id, m.lvl, m);
      G.FX.ring(pl.x, pl.y - pl.bodyH * 0.5, 4, pl.r * 3, '#ffd23f', 0.3, 2);
      if (!ghost) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, G.T(inst.name, 'move'), col(inst));
      C.run(pl, inst);
    }
  };
  // In a group, the others see the move that came out (not "Metronome", which would roll another).
  const coopCast = G.Coop.cast;
  G.Coop.cast = function (pl, m) {
    if (m && m.kind === 'metronome') {
      m._pick = randomMove();
      return coopCast.call(this, pl, { id: m._pick, lvl: Math.min(m.lvl, G.Moves.BY_ID[m._pick].maxLvl), evolved: false });
    }
    return coopCast.apply(this, arguments);
  };

  // ---------------- transform ----------------
  /** What it casts while transformed into that species: its starting move (if it's not an orbit or support). */
  function copiedMove(mon) {
    const ok = id => { const d = G.Moves.BY_ID[id]; return d && !NO_CALL.has(d.kind); };
    const s = G.Moves.startFor(mon);
    if (ok(s)) return s;
    for (const t of mon.types) { const id = (G.Moves.POOL[t] || []).find(ok); if (id) return id; }
    return 'tackle';
  }
  function tfLook(p, dex) {
    const a = new G.Sprites.Animator(dex, G.Sprites.playerScale(dex), false);
    a.dir = p.anim.dir;
    p.anim = a;
    p.bodyH = G.Sprites.bodyHeight(dex, G.Sprites.playerScale(dex));
  }
  X.transform = {
    target: true, reach: m => 360,
    run(pl, m, ghost) {
      const tf = pl._labTf;
      if (tf && tf.t > 0) {
        if (!ghost) m.t = Math.max(0.05, tf.inst.cd * pl.cdMul);
        C.run(pl, tf.inst);
        return;
      }
      const t = C.spotFor(pl, m), mon = t && G.DEX_BY[t.dex];
      if (!mon || !G.SPRITE_META[t.dex]) return;
      const mon0 = pl.mon, mon1 = Object.assign({}, pl.mon, { types: mon.types.slice() });
      pl._labTf = { t: m.dur || 10, dex: t.dex, mon0, mon1, inst: borrowed(copiedMove(mon), m.lvl, m) };
      if (!pl.remote) pl.mon = mon1;
      G.Sprites.preload([t.dex]);
      tfLook(pl, t.dex);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ff9ed8', 24, 180);
      G.FX.ring(pl.x, pl.y, 6, 60, '#ff9ed8', 0.4, 4);
      if (!ghost) { G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, mon.name, '#ff9ed8', true); m.t = 0.4; }
    }
  };
  function tfEnd(p) {
    const tf = p._labTf;
    delete p._labTf;
    if (p.mon === tf.mon1) p.mon = tf.mon0;
    G.Admin.repaint(p);                                // its usual look (or its Mega)
    G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ff9ed8', 12, 120);
  }

  // ---------------- enemy statuses: asleep and confused ----------------
  function sleep(e, dur) {
    if (!e || e.dead) return;
    dur *= boss(e) ? 0.35 : 1;
    if (e.remote) { G.Net.toHost({ k: 'labst', id: e.id, s: 'z', v: Math.round(dur * 10) / 10 }); return; }
    e.labSleep = Math.max(e.labSleep || 0, dur);
    e.stunT = Math.max(e.stunT || 0, dur);
    e._sleepAt = now();
  }
  function confuse(e, dur) {
    if (!e || e.dead) return;
    dur *= boss(e) ? 0.3 : 1;
    if (e.remote) { G.Net.toHost({ k: 'labst', id: e.id, s: 'c', v: Math.round(dur * 10) / 10 }); return; }
    e.labConf = Math.max(e.labConf || 0, dur);
  }
  // Any hit from a move with `conf` or `sleep` (Combat calls G.RunStats.tag on every
  // hit of yours, from any family, right before the damage).
  const tag = G.RunStats.tag;
  G.RunStats.tag = function (e, m) {
    tag.apply(this, arguments);
    if (m && m.conf) confuse(e, m.conf);
    if (m && m.sleep && m.kind !== 'sleep') sleep(e, m.sleep);
  };

  const E = G.Enemy.prototype;
  const ehurt = E.hurt;
  E.hurt = function (amount, color) {
    // A hit wakes it (not a burn or poison, nor the hit from the sleep move itself).
    if (!this.remote && this.labSleep > 0 && !DOT.has(color) && now() - (this._sleepAt || 0) > 250) {
      this.labSleep = 0; this.stunT = 0;
    }
    return ehurt.apply(this, arguments);
  };
  const eupdate = E.update;
  E.update = function (dt, pl) {
    if (this.labSleep > 0) { this.labSleep -= dt; if (this.labSleep <= 0) { this.labSleep = 0; this.stunT = 0; } }
    if (!(this.labConf > 0) || this.dead || !pl) return eupdate.apply(this, arguments);
    // Confused: it heads for a random spot instead of you (shoots there, if it's one that
    // shoots), doesn't attack you on touch and hits whoever is next to it.
    this.labConf -= dt;
    this.touchCd = Math.max(this.touchCd, 0.2);
    if (!this._conf || (this._conf.t -= dt) <= 0) {
      const a = Math.random() * 6.2832;
      this._conf = { t: G.U.rand(0.4, 0.8), x: this.x + Math.cos(a) * 120, y: this.y + Math.sin(a) * 120 };
    }
    this._confHit = (this._confHit || 0) - dt;
    if (this._confHit <= 0) {
      this._confHit = 0.45;
      for (const o of G.EnemyMgr.queryCircle(this.x, this.y, this.r + 26)) {
        if (o === this || o.dead) continue;
        o.hurt(this.dmg * 1.5 + 4, '#ff9ed8', o.x - this.x, o.y - this.y, 80);
        break;
      }
    }
    return eupdate.call(this, dt, { x: this._conf.x, y: this._conf.y, r: 8, level: pl.level, dead: false });
  };
  // Asleep: "Z" above instead of the little stars; confused: little birds circling.
  const edraw = E.draw;
  E.draw = function (ctx) {
    const z = this.labSleep > 0 || this.labSleepNet > 0, c = this.labConf > 0 || this.labConfNet > 0;
    if (!z && !c) return edraw.apply(this, arguments);
    const st = this.stunT;
    if (z) this.stunT = 0;
    try { edraw.apply(this, arguments); } finally { this.stunT = st; }
    if (this.dead) return;
    const t = now() / 1000, y0 = this.y - this.bodyH - 8;
    ctx.save();
    if (z) {
      ctx.font = '700 8px Pixelify,"Segoe UI",sans-serif';
      ctx.fillStyle = '#d8e8ff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.8 + i * 0.5) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.strokeText('Z', this.x + 4 + k * 8, y0 - k * 12);
        ctx.fillText('Z', this.x + 4 + k * 8, y0 - k * 12);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * 2.094;
        G.VFX.draw(ctx, 'ring', 'psychic', this.x + Math.cos(a) * 10, y0 + Math.sin(a) * 3, { scale: 0.45 });   // confused (hearts looked like healing)
      }
    }
    ctx.restore();
  };

  // ---------------- your Pokémon: shields, leap, transform ----------------
  const P = G.Player.prototype;
  const phurt = P.hurt;
  P.hurt = function (amount, type = null, pure = false, cat = null) {
    const g = this._labGuard;
    if (g && g.t > 0 && !this.dead && !this.god && !pure && !(this.invuln > 0)) {
      if (g.m.mode === 'protect') {
        if (now() - (g.noteAt || 0) > 500) { g.noteAt = now(); G.FX.dmgText(this.x, this.y - this.bodyH - 8, 'Protected', col(g.m)); }
        return;
      }
      // Counter (the Aegis, plan A3): a hit of its category is blocked and stored for the blast.
      if (g.m.storeAll || !g.m.cat || !cat || g.m.cat === cat) {
        g.stored += amount;
        if (now() - (g.noteAt || 0) > 500) { g.noteAt = now(); G.FX.dmgText(this.x, this.y - this.bodyH - 8, 'Blocked', col(g.m)); }
        return;
      }
      amount *= 0.5;
    }
    // Misty Terrain: less damage while you're inside.
    if (!pure && terrainsAt(this.x, this.y).some(f => TERRAIN[f.terr].shield)) amount *= 1 - TERRAIN.misty.shield;
    return phurt.call(this, amount, type, pure, cat);
  };
  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.call(this, m);
    if (!m || !fields.length) return k;
    return terrainsAt(this.x, this.y).some(f => TERRAIN[f.terr].boost === m.type)
      || wxAt(this.x, this.y).some(f => WXZ[f.wx].boost === m.type) ? k * 1.3 : k;
  };
  // On touching you while a shield is up: Spiky Shield hurts, Baneful Bunker poisons, King's Shield slows.
  const strike = E.strike;
  E.strike = function (pl) {
    strike.call(this, pl);
    const g = pl && !pl.remote && pl._labGuard;
    if (!g || !(g.t > 0) || this.dead) return;
    if (g.m.thorns) this.hurt(g.m.thorns * pl.atkFor(g.m), col(g.m), this.x - pl.x, this.y - pl.y, 90);
    if (g.m.poison) this.applyPoison(g.m.poison);
    if (g.m.slow) this.applySlow(g.m.slow, 2);
  };
  const KIND_AS = { leap: 'dash', recoil: 'dash', ramp: 'melee', guard: 'buff', sleep: 'beam', weather: 'buff',
                    terrain: 'aura', wave: 'projectile', metronome: 'buff', transform: 'buff' };
  const cast = P.cast;
  P.cast = function (m) {
    const as = m && KIND_AS[m.kind];
    const r = cast.call(this, as ? { kind: as, cd: m.cd, type: m.type } : m);
    // Its own animation (signatures, phase 5: G.LabAnims), if the species has it.
    const a = m && m.anim && G.LabAnims && G.LabAnims.pick(this, m.anim);
    if (a) { this.anim.play(a, { speed: Math.max(1, (G.LabAnims.len(this, a) || 0.4) / (Math.max(0.12, m.cd * this.cdMul) * 0.9)) }); this.attackFace = 0.35; }
    return r;
  };
  const pdraw = P.draw;
  P.draw = function (ctx) {
    const L = this._labLeap, g = this._labGuard;
    if (L) {
      const k = Math.min(1, L.t / L.dur);
      if (L.style === 'fly') {
        G.Sprites.drawShadow(ctx, this.dex, this.x, this.y, this.scale * (1 - Math.sin(k * Math.PI) * 0.5));
        ctx.save(); ctx.translate(0, -Math.sin(k * Math.PI) * 110);
        try { pdraw.apply(this, arguments); } finally { ctx.restore(); }
      } else if (k > 0.12 && k < 0.88) {
        // Underground, underwater or in the shadows: you only see where it's going.
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = L.style === 'dig' ? '#6e4c1e' : L.style === 'dive' ? '#3d8bff' : '#33256a';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.2, this.r * 0.5, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      } else pdraw.apply(this, arguments);
    } else pdraw.apply(this, arguments);
    if (g && g.t > 0 && !this.dead) {
      const c = col(g.m), a = Math.min(1, g.t * 4);
      ctx.save();
      ctx.globalAlpha = (0.3 + Math.sin(now() / 60) * 0.06) * a;
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - this.bodyH * 0.45, this.r * 1.8, this.bodyH * 0.75, 0, 0, 6.2832);
      ctx.globalAlpha *= 0.4; ctx.fill(); ctx.globalAlpha = 0.8 * a; ctx.stroke();
      ctx.restore();
    }
  };

  // ---------------- every frame ----------------
  // Support moves (PASSIVE) cast on their own from the slots that aren't the active one.
  const ctick = C.tick;
  // Shields (guard) also from the active slot, with their own clock (_gt): Combat never
  // casts them (reach 0), because their target could be a rock or a chest (pl.target) and they got wasted.
  C.tick = function (dt, pl) {
    ctick.apply(this, arguments);
    if (!pl || pl.dead) return;
    for (const grp of pl.slots) {
      const act = grp === pl.activeGroup();
      for (const m of grp) {
        if (!PASSIVE.has(m.kind) || (act && m.kind !== 'guard')) continue;
        const k = m.kind === 'guard' ? '_gt' : 't';
        m[k] = (m[k] || 0) - dt;
        if (m[k] > 0) continue;
        if (m.kind === 'guard' && !threat(pl)) { m[k] = 0.05; continue; }
        m[k] = Math.max(0.05, m.cd * pl.cdMul);
        if (act) pl.cast(m);
        if (G.Coop.active) G.Coop.cast(pl, m);
        m.castAt = now();
        C.run(pl, m);
      }
    }
  };

  /** A player's timers (yours or a friend's puppet). */
  function tickPlayer(p, dt) {
    if (p._labLeap) p._labLeap.t += dt;
    const g = p._labGuard;
    if (g && (g.t -= dt) <= 0) { delete p._labGuard; guardEnd(p, g); }
    if (p._labTf && (p._labTf.t -= dt) <= 0) tfEnd(p);
  }

  const update = C.updateFields;
  C.updateFields = function (dt) {
    update.apply(this, arguments);
    const pl = G.Game.player;
    if (pl) tickPlayer(pl, dt);
    if (G.Coop.active) for (const p of G.Coop.puppets()) tickPlayer(p, dt);
    // Grassy Terrain: heals while you're inside.
    if (pl && !pl.dead && terrainsAt(pl.x, pl.y).some(f => TERRAIN[f.terr].heal)) pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * TERRAIN.grassy.heal * dt);
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt;
      let done = f.gone || !f.owner || (f.life && f.t >= f.life);
      if (!done) {
        if (f.kind === 'leap') done = tickLeap(f, dt);
        else if (f.kind === 'wave') done = tickWave(f, dt);
        else if (f.kind === 'wxzone') done = tickWx(f, dt);
        else if (f.kind === 'sleepzone' && f.t >= f.delay) {
          G.FX.ring(f.x, f.y, 4, f.r, col(f.m), 0.4, 3);
          const v = G.VFX.forMove(f.m);     // its drawing: notes for singing, spores, shadows...
          for (let k = 0; k < 6; k++) G.FX.sp(v.proj, v.pal, f.x + G.U.rand(-f.r, f.r) * 0.6, f.y - 6, { vy: -50, life: 0.6 });
          if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
            if (e.dead) continue;
            if (f.dmg > 0) C.hit(f.owner, e, f.dmg, col(f.m), e.x - f.x, e.y - f.y, 0, f.m);
            sleep(e, f.m.stun || 2.4);
          }
          done = true;
        } else if (f.kind === 'terrain' && Math.random() < dt * 6 && G.Camera.sees(f.x, f.y, f.r)) {
          const a = Math.random() * 6.2832, rr = Math.random() * f.r;
          G.FX.px(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6, TERRAIN[f.terr].color, { vy: -18, life: 0.6 });
        }
      }
      if (done) fields.splice(i, 1);
    }
    netTick(dt);
  };

  const ground = C.drawGroundFields;
  C.drawGroundFields = function (ctx) {
    ground.apply(this, arguments);
    const t = now() / 1000;
    for (const f of fields) {
      if (!G.Camera.sees(f.x, f.y, (f.r || f.w || 60) + 60) && f.kind !== 'wave') continue;
      ctx.save();
      if (f.kind === 'terrain' || f.kind === 'wxzone') {
        const a = Math.min(1, (f.life - f.t) * 1.5, f.t * 4), c = f.kind === 'wxzone' ? WXZ[f.wx].color : TERRAIN[f.terr].color;
        ctx.globalAlpha = 0.13 * a; ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 20;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'sleepzone') {
        const k = G.U.clamp(f.t / f.delay, 0, 1), c = col(f.m);
        ctx.globalAlpha = 0.12 + 0.2 * k; ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * k, f.r * k * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'leap') {
        const k = G.U.clamp(f.t / f.dur, 0, 1), c = col(f.m);
        ctx.globalAlpha = 0.25 + 0.35 * k; ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.m.radius * (0.4 + 0.6 * k), f.m.radius * 0.6 * (0.4 + 0.6 * k), 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'wave') {
        const c = col(f.m), cx = f.x + f.ca * f.d, cy = f.y + f.sa * f.d, a = Math.atan2(f.sa, f.ca);
        ctx.translate(cx, cy); ctx.rotate(a); ctx.scale(1, 0.62);
        ctx.globalAlpha = 0.28; ctx.fillStyle = c;
        ctx.fillRect(-26, -f.w / 2, 30, f.w);
        ctx.globalAlpha = 0.6; ctx.fillRect(0, -f.w / 2, 5, f.w);
      }
      ctx.restore();
    }
  };
  const air = C.drawAirFields;
  C.drawAirFields = function (ctx) {
    air.apply(this, arguments);
    const t = now() / 1000;
    for (const f of fields) {
      if (f.kind !== 'wave') continue;
      const v = G.VFX.forMove(f.m), half = f.w / 2, cx = f.x + f.ca * f.d, cy = f.y + f.sa * f.d;
      for (let s = -half; s <= half; s += 16) {
        const x = cx - f.sa * s, y = cy + f.ca * s * 0.62 - 6 - Math.abs(Math.sin(t * 9 + s)) * 5;
        G.VFX.draw(ctx, v.proj, v.pal, x, y, { scale: 1.1, angle: Math.atan2(f.sa, f.ca), frame: Math.floor(t * 10 + s) });
      }
    }
  };
  const clear = C.clearFields;
  C.clearFields = function (owner) {
    clear.apply(this, arguments);
    fields = owner ? fields.filter(f => f.owner !== owner) : [];
    if (!owner) netSent = '';
  };

  // ---------------- network ----------------
  let netT = 0, netSent = '';
  /** Host: every 0.3 s, who is asleep and who is confused (if it changed or some still are). */
  function netTick(dt) {
    if (!G.Coop.active || !G.Coop.isHost || (netT -= dt) > 0) return;
    netT = 0.3;
    const z = [], c = [];
    for (const e of G.EnemyMgr.all()) { if (e.dead) continue; if (e.labSleep > 0) z.push(e.id); if (e.labConf > 0) c.push(e.id); }
    const k = z.join() + '|' + c.join();
    if (k === netSent && !z.length && !c.length) return;
    netSent = k;
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, { k: 'labes', z, c });
  }
  G.Net.on((from, msg) => {
    if (!msg || !G.Coop.active) return;
    if (G.Coop.isHost) {
      if (!G.Coop.mate(from)) return;
      if (msg.k === 'labst') {
        const e = G.EnemyMgr.get(msg.id), v = Math.min(6, Math.max(0, +msg.v || 0));
        if (!e || e.dead || e.remote || !v) return;
        // It already comes with the boss reduction applied (on the guest): here it's applied as is.
        if (msg.s === 'z') { e.labSleep = Math.max(e.labSleep || 0, v); e.stunT = Math.max(e.stunT || 0, v); e._sleepAt = now(); }
        else if (msg.s === 'c') e.labConf = Math.max(e.labConf || 0, v);
      }
    } else if (msg.k === 'labes' && from === G.Net.hostUid) {
      const z = new Set(msg.z || []), c = new Set(msg.c || []);
      for (const e of G.EnemyMgr.all()) {
        if (!e.remote) continue;
        e.labSleepNet = z.has(e.id) ? 1 : 0;
        e.labConfNet = c.has(e.id) ? 1 : 0;
        if (e.labConfNet) e.touchCd = Math.max(e.touchCd, 0.5);    // the copy doesn't hit you (combat.js)
      }
    }
  });

  return { LADDERS, EVO, PASSIVE, TERRAIN, WXZ, sleep, confuse, terrainsAt, wxAt, randomMove,
           get fieldCount() { return fields.length; }, fields: () => fields };
})();
