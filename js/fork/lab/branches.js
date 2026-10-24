/* ============ branches.js — branching upgrades in Lab runs (MrSurvivor fork) ============
 * Plan B2 (fork/PLAN-2026-10-22.md), fork/LAB.md "Phase 11: builds". In a Lab run, a move from
 * TABLE at level 3 doesn't get its plain upgrade to level 4: the hand shows two "Branch" cards for it
 * instead (keys up:<id>:a / up:<id>:b), and the one you take changes how the move works for the rest
 * of the run (stored as m.branch, with m.branchName). Each move has three branches; each run only
 * offers two of them (Halls of Torment's rule: at most 2 of a move's 3 branches per run), rolled the
 * first time its branch comes up and kept for the run (pl._labBrPair, so a reroll can't fish for the
 * third). A branch is:
 *   mul / add / set   fields multiplied, added or set (the game's own fields: burn, slow, homing,
 *                     pierce, hex...; Lab's hit effects: leech, flinch, revenge, cut, conf...)
 *                     (on top of the move's own level 4 upgrade)
 *   like              it becomes that move: its kind and numbers at level 4, and its later upgrades
 *                     (Flamethrower → Fire Spin turns the cone into Wrap's bind, still Fire and burning)
 *   k                 × damage, so each branch lands near the plain move's damage
 *                     (node fork/balance-lab.cjs --branches measures them)
 *   pivot             Volt Switch: switching to this move casts it at once, and that cast hits ×pivot
 * The move keeps its id, name, type and category; its evolution follows its kind at the time.
 *
 * Where it goes:
 *   - G.Moves.nextUpText / levelUp: a branched `like` move climbs its new kind's ladder.
 *   - G.Moves.instance(id, lvl, br): builds a move with its branch (resume.js keeps `br`).
 *   - Co-op: G.Coop.cast sends the branch in the level's tens (lvl + 10 × branch: 1 a, 2 b, 3 c) and
 *     G.Combat.ghostCast reads it back, so a teammate's branched move draws as it is.
 *   - A Lab evolution of the Pokémon (growth.js evolveTo) keeps its moves: the branch stays.
 * Test: fork/test-builds.cjs (solo) and fork/test-builds-coop.cjs (two players).
 */
G.LabBranches = (() => {
  const BR_LVL = 3;                              // the move's level when its branch comes up (the upgrade to 4)
  const KEYS = ['a', 'b', 'c'], IDX = { a: 1, b: 2, c: 3 };
  const GOLD = '#ffd23f';

  const TABLE = {
    flamethrower: {
      a: { n: 'Fire Spin', like: 'wrap', t: 'Becomes a bind: rings of fire hold the nearest enemies in place and burn them the whole time.' },
      b: { n: 'Heat Wave', k: 1.25, mul: { arc: 2 }, add: { count: 4 }, t: 'A much wider fan: twice the spread and 4 more flames.' },
      c: { n: 'Fire Blast', set: { burn: 3 }, add: { pierce: 1 }, t: 'Each flame adds 3 burn stacks at once and goes through one more enemy.' }
    },
    thunderbolt: {
      a: { n: 'Discharge', k: 0.8, like: 'discharge', t: 'Becomes an aura: electricity shocks everything around you, all the time.' },
      b: { n: 'Volt Switch', set: { pivot: 1.6 }, t: 'Switching to this move casts it at once, and that cast hits 60% harder.' },
      c: { n: 'Thunder', add: { count: 2 }, set: { hex: 1.6 }, t: '+2 jumps, and 60% more damage to enemies that are burned, poisoned, slowed or stunned.' }
    },
    ember: {
      a: { n: 'Flame Burst', add: { pierce: 2 }, mul: { size: 1.5 }, t: 'Bigger fireballs that go through 2 more enemies.' },
      b: { n: 'Mystical Fire', k: 0.8, add: { count: 1 }, set: { homing: 5 }, t: 'Homing flames: one more fireball, and they chase enemies.' },
      c: { n: 'Searing Shot', k: 1.8, like: 'heat-wave', t: 'Becomes a ring: burning fireballs burst out in every direction.' }
    },
    'water-gun': {
      a: { n: 'Hydro Pump', k: 1.8, like: 'hydro-pump', t: 'Becomes a beam: a powerful jet of water through everything in a line.' },
      b: { n: 'Bubble Beam', add: { count: 1 }, set: { slow: 0.4 }, t: 'One more shot, and its hits slow enemies.' },
      c: { n: 'Scald', set: { burn: 1 }, mul: { dmg: 1.15 }, t: 'Boiling water: its hits burn and deal 15% more damage.' }
    },
    'vine-whip': {
      a: { n: 'Power Whip', mul: { radius: 1.5 }, t: '50% more range: the whips lash much further out.' },
      b: { n: 'Horn Leech', set: { leech: 0.4 }, t: 'You heal 40% of the damage it does (up to 5% of your HP a second).' },
      c: { n: 'Bullet Seed', k: 1.15, like: 'seed-bomb', t: 'Becomes a ranged attack: seeds that bounce from enemy to enemy.' }
    },
    'thunder-shock': {
      a: { n: 'Nuzzle', set: { flinch: 0.6 }, t: 'The first hit on each enemy paralyses it for 0.6 s.' },
      b: { n: 'Shock Wave', k: 0.8, set: { homing: 6 }, add: { count: 1 }, t: 'Never misses: one more bolt, and the bolts home in on enemies.' },
      c: { n: 'Charge Beam', k: 2.4, like: 'flash-cannon', t: 'Becomes a beam: a line of electricity through everything in front of you.' }
    },
    confusion: {
      a: { n: 'Psybeam', k: 2.5, like: 'psybeam', t: 'Becomes a beam: a wide psychic ray through everything in a line.' },
      b: { n: 'Psywave', set: { conf: 1.5 }, t: 'Its hits confuse enemies for 1.5 s: they stagger, stop attacking you and hit their neighbours.' },
      c: { n: 'Psychic', k: 2.0, like: 'psychic', t: 'Becomes a ring: homing psychic orbs burst out in every direction.' }
    },
    bite: {
      a: { n: 'Hyper Fang', set: { flinch: 0.7 }, t: 'The first bite on each enemy makes it flinch: stopped for 0.7 s.' },
      b: { n: 'Jaw Lock', k: 1.25, like: 'bind', t: 'Becomes a bind: you lock your jaws on the nearest enemies and keep biting while they can\'t move.' },
      c: { n: 'Assurance', set: { revenge: 1.6 }, t: '60% more damage if you were hit in the last 1.5 s.' }
    },
    'karate-chop': {
      a: { n: 'Low Sweep', set: { slow: 0.5 }, t: 'Sweeps their legs: its hits slow enemies by half.' },
      b: { n: 'Vital Throw', k: 1.8, like: 'circle-throw', t: 'Becomes a throw: grab the nearest enemy and hurl it into the others.' },
      c: { n: 'Brick Break', set: { cut: 0.08 }, t: 'Each hit takes at least 8% of the HP the enemy has left (bosses much less).' }
    },
    'ice-beam': {
      a: { n: 'Frost Breath', k: 0.5, like: 'dragon-breath', set: { slow: 0.6 }, t: 'Becomes a cone: a wide breath of frost that slows everything in front of you.' },
      b: { n: 'Freezing Glare', set: { flinch: 0.8 }, t: 'Freezes: the first hit on each enemy stops it for 0.8 s.' },
      c: { n: 'Blizzard', k: 0.7, like: 'hail', set: { slow: 0.5 }, t: 'Becomes a hailstorm: ice falls on the enemies around you and slows them.' }
    },
    'shadow-ball': {
      a: { n: 'Ominous Wind', k: 1.7, like: 'ominous-wind', t: 'Becomes a vortex: a ghostly whirl pulls enemies in and hurts them.' },
      b: { n: 'Astral Barrage', set: { homing: 5 }, add: { count: 1 }, t: 'One more orb, and the orbs chase enemies.' },
      c: { n: 'Spirit Shackle', set: { slow: 0.5 }, t: 'Pins their shadows: its hits slow enemies by half.' }
    },
    sludge: {
      a: { n: 'Sludge Bomb', add: { poison: 2 }, mul: { size: 1.3 }, t: 'Bigger blobs that add 3 poison stacks at once.' },
      b: { n: 'Toxic Spikes', like: 'toxic-spikes', t: 'Becomes mines: poison traps on the ground that burst when stepped on.' },
      c: { n: 'Gunk Shot', k: 1.1, like: 'acid-spray', t: 'Bouncing gunk: the blob bounces from enemy to enemy, poisoning each one.' }
    }
  };
  // What a `like` branch takes from the other move: everything but who the move is.
  const OWN = new Set(['id', 'def', 'lvl', 't', 'name', 'desc', 'type', 'cat', 'look', 'sig', 'evo', 'lab', 'promote', 'maxLvl', 'ups', 'since']);
  // The game's own upgrade rules (moves.js applyMods), for a `like` move's later upgrades.
  const MULT = ['dmg', 'cd', 'speed', 'radius', 'dur', 'amount', 'arc', 'width', 'spread', 'life', 'size', 'rate', 'pull', 'knock', 'stun', 'charge'];
  const ADD = ['count', 'pierce', 'stacks', 'bounce'], BASE = { count: 1, spread: 0.3 };
  function ladderStep(s, m) {
    for (const k in m) {
      const v = s[k] != null ? s[k] : BASE[k];
      if (MULT.includes(k) && v != null) s[k] = v * m[k];
      else if (ADD.includes(k)) s[k] = (v || 0) + m[k];
      else s[k] = m[k];
    }
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lab = () => !!(G.Lab && G.Lab.active);
  const branchOf = m => m && m.branch && TABLE[m.id] && TABLE[m.id][m.branch];
  /** Is the move's next upgrade its branch? */
  const atPoint = m => !!(m && TABLE[m.id] && !m.branch && m.lvl === BR_LVL && m.def && m.def.maxLvl > BR_LVL);
  const likeDef = b => b && b.like && G.Moves.BY_ID[b.like];

  /** Turns `m` (level 3) into its branch `key` at level 4. */
  function applyBranch(m, key) {
    const b = TABLE[m.id] && TABLE[m.id][key];
    if (!b || m.branch) return false;
    if (b.like) {
      // Only the other move's own fields (and what its ladder changes): not what another Lab file adds to it.
      const ref = G.Moves.instance(b.like, BR_LVL + 1), d = G.Moves.BY_ID[b.like];
      const its = new Set(Object.keys(d).concat(Object.keys(BASE), ...d.ups.map(u => Object.keys(u.m))));
      for (const k of Object.keys(ref)) if (!OWN.has(k) && its.has(k)) m[k] = ref[k];
    } else if (m.def.ups[BR_LVL - 1]) ladderStep(m, m.def.ups[BR_LVL - 1].m);   // its own level 4 upgrade too
    if (b.k) m.dmg *= b.k;
    for (const k in b.mul || {}) m[k] = (m[k] != null ? m[k] : BASE[k] != null ? BASE[k] : 1) * b.mul[k];
    for (const k in b.add || {}) m[k] = (m[k] != null ? m[k] : BASE[k] || 0) + b.add[k];
    Object.assign(m, b.set || {});
    m.branch = key; m.branchName = b.n;
    m.lvl = BR_LVL + 1;
    return true;
  }

  // ---------------- the game's move functions ----------------
  const instance = G.Moves.instance;
  /** As the game's, plus `br`: the move with that branch (if it has reached it). */
  G.Moves.instance = function (id, lvl = 1, br) {
    const b = br && TABLE[id] && TABLE[id][br];
    if (!b || lvl <= BR_LVL) return instance.apply(this, arguments);
    const m = instance.call(this, id, BR_LVL);
    applyBranch(m, br);
    while (m.lvl < lvl && G.Moves.levelUp(m)) { /* climbs */ }
    return m;
  };
  const levelUp = G.Moves.levelUp;
  G.Moves.levelUp = function (s) {
    const d = likeDef(branchOf(s));
    if (!d || s.lvl >= s.def.maxLvl || !d.ups[s.lvl - 1]) return levelUp.apply(this, arguments);
    ladderStep(s, d.ups[s.lvl - 1].m);
    s.lvl++;
    return true;
  };
  const nextUpText = G.Moves.nextUpText;
  G.Moves.nextUpText = function (s) {
    const d = likeDef(branchOf(s));
    if (d && s.lvl < s.def.maxLvl && d.ups[s.lvl - 1]) return d.ups[s.lvl - 1].t;
    return nextUpText.apply(this, arguments);
  };

  // ---------------- the cards ----------------
  /** The two branches this run offers for the move (rolled once per run and move). */
  function pairFor(pl, id) {
    const p = pl._labBrPair = pl._labBrPair || {};
    if (!p[id] || p[id].length !== 2) {
      const k = KEYS.filter(x => TABLE[id][x]);
      for (let i = k.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [k[i], k[j]] = [k[j], k[i]]; }
      p[id] = k.slice(0, 2).sort();
    }
    return p[id];
  }
  function card(m, key) {
    const b = TABLE[m.id][key];
    return { w: 8, type: 'up', key: 'up:' + m.id + ':' + key, branch: key, icon: 'move:' + m.id, color: G.U.TYPE_COLOR[m.type],
      tag: 'Branch · Lv.' + (BR_LVL + 1),
      title: esc(G.T(m.name, 'move')) + ' → ' + esc(b.n),
      desc: esc(b.t) + (b.like || !m.def.ups[BR_LVL - 1] ? '' : ' Plus its level 4 upgrade: ' + esc(G.T(m.def.ups[BR_LVL - 1].t)) + '.')
        + ' <span class="fit-low">The other branch will be locked for this run.</span>',
      apply: p => choose(p, m, key) };
  }
  /** Taking a branch card. */
  function choose(pl, m, key) {
    if (!applyBranch(m, key)) return;
    (pl._labBranch = pl._labBranch || {})[m.id] = key;
    G.FX.ring(pl.x, pl.y, 8, 120, GOLD, 0.7, 5);
    G.Spawner.say(G.T(m.name, 'move') + ' → ' + m.branchName, 2.4, true);
  }
  // Cards that never give way to the second branch card.
  const keep = c => !c || c.type === 'evo' || c.rare || c.syn || c.branch || (c.key && /^(grow|rare|syn)/.test(c.key));
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl, n = 3) {
    const hand = offer.apply(this, arguments);
    if (!lab() || !pl || pl !== G.Game.player || !Array.isArray(hand)) return hand;
    const i = hand.findIndex(c => c && c.type === 'up' && c.key && !c.branch && atPoint(pl.moves.find(m => 'up:' + m.id === c.key)));
    if (i < 0) return hand;
    const m = pl.moves.find(x => 'up:' + x.id === hand[i].key), [a, b] = pairFor(pl, m.id);
    hand[i] = card(m, a);
    // The second one takes the place of the least important other card: a stat, a new move, another upgrade.
    let j = -1;
    for (const t of ['stat', 'new', 'up']) { j = hand.map((c, k) => (k !== i && c && c.type === t && !keep(c) ? k : -1)).filter(k => k >= 0).pop(); if (j >= 0) break; }
    if (j >= 0 && j !== undefined) hand[j] = card(m, b);
    else hand.push(card(m, b));
    return hand;
  };

  // ---------------- Volt Switch (pivot) ----------------
  const P = G.Player.prototype;
  const setActive = P.setActive;
  P.setActive = function (i) {
    const was = this.active, r = setActive.apply(this, arguments);
    if (this.active !== was) for (const m of this.activeGroup()) if (m.pivot) { m.t = 0; m._pivotReady = true; }
    return r;
  };
  const cast = P.cast;
  P.cast = function (m) {
    if (m && m._pivotReady && !this.remote) { m._pivotReady = false; m._pivotOn = true; }
    return cast.apply(this, arguments);
  };
  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.apply(this, arguments);
    return m && m._pivotOn && m.pivot ? k * m.pivot : k;
  };
  // The boosted cast is the one in the frame it came out in (its shots take their damage then).
  const tick = G.Combat.tick;
  G.Combat.tick = function (dt, pl) {
    if (pl && pl.moves) for (const m of pl.moves) if (m._pivotOn) m._pivotOn = false;
    return tick.apply(this, arguments);
  };

  // ---------------- co-op: the branch travels with each cast ----------------
  const coopCast = G.Coop.cast;
  G.Coop.cast = function (pl, m) {
    const i = m && m.branch && IDX[m.branch];
    if (!i) return coopCast.apply(this, arguments);
    const lv = m.lvl;
    m.lvl = lv + 10 * i;
    try { return coopCast.apply(this, arguments); } finally { m.lvl = lv; }
  };
  const ghostCast = G.Combat.ghostCast;
  G.Combat.ghostCast = function (pl, id, lvl, aim, evolved) {
    const i = Math.floor((lvl | 0) / 10) % 10;
    if (!i) return ghostCast.apply(this, arguments);
    const br = KEYS[i - 1], real = (lvl | 0) - 10 * i, inst = G.Moves.instance;
    G.Moves.instance = function (id2, lv2) { return inst.call(this, id2, lv2, id2 === id ? br : undefined); };
    try { return ghostCast.call(this, pl, id, real, aim, evolved); } finally { G.Moves.instance = inst; }
  };

  // ---------------- what you see ----------------
  const tipNotes = G.MoveText.tipNotes;
  G.MoveText.tipNotes = function (m) {
    const out = tipNotes.apply(this, arguments), b = branchOf(m);
    if (b) out.push(['Branch: ' + b.n + '. ' + b.t, GOLD]);
    return out;
  };
  G.Lab.pauseLine(pl => {
    const got = pl.moves.filter(branchOf);
    return got.length ? 'Branches: ' + got.map(m => esc(G.T(m.baseName || m.name, 'move')) + ' → ' + esc(m.branchName)).join(', ') + '.' : '';
  });
  // The dictionary's word-by-word pass mustn't touch these names (fork/test-english.cjs).
  const names = {};
  for (const id in TABLE) for (const k in TABLE[id]) names[TABLE[id][k].n] = TABLE[id][k].n;
  G.I18n.add(names, 'en');

  return { TABLE, BR_LVL, applyBranch, atPoint, pairFor, branchOf };
})();
