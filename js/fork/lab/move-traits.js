/* ============ move-traits.js — the close-range and mobility moves' own identity, in Lab runs (MrSurvivor fork) ============
 * fork/PLAN-2026-10-22.md A3 (stream A). The one ladder per kind makes every melee move a 360° swing at
 * level 5, and most upstream moves differ from their kind only in numbers. In a Lab run these get a trait
 * from fields the game already has, registered in G.LabMech.ID (js/fork/lab/mech.js, Phase 10: `add`
 * fields, `upsAt` steps, `evo`, `note`), so there is one identity table for every stream:
 *
 *   reach   Vine Whip, Wing Attack (Drill Peck): 60 % longer and a narrow arc
 *   heavy   Tackle, Body Slam, Dragon Claw: 60 % more knockback and a 0.3 s flinch (the first hit on
 *           each enemy stuns it, G.LabKinds2 `flinch`)
 *   leech   Bug Bite, Play Rough: heal 25 % of the damage (G.LabKinds2 `leech`, capped per second)
 *   flinch  Lick, Bite: the first hit on each enemy stuns it (paralysis, flinching)
 *   parry   Karate Chop, Metal Claw: for PARRY s after each swing, the first hit you take is blocked
 *           and whoever is closest is stunned (once per swing; below)
 * None of the 11 swings all around any more: 360° stays only on moves whose name says so (spins). Their
 * 4th upgrade is "+50 % damage and +20 % reach" and their evolution ×1.9 damage, more reach, a wider arc.
 *   U-turn        a pivot (js/fork/lab/mobility.js): after the hit you switch to the next slot
 *   Flame Charge  `rush`: each cast stacks a speed boost (+8 %, 4 s, up to 3)
 *
 * Also here: the moves a run starts with are made before G.Lab.active (in G.Game.startRun), so they
 * missed their Lab identity; right after the run starts they're swapped for Lab copies (retrofit, for
 * every G.LabMech.ID move). And the move's box says a Lab mover comes back (policy (a)).
 * Hooks: G.LabMech.ID entries, wraps G.Game.startRun, G.MoveText.tipNotes, G.Player.prototype.cast and
 * hurt. Test: fork/test-close-range.cjs.
 */
G.LabTraits = (() => {
  const lab = () => !!(G.Lab && G.Lab.active);
  const PARRY = 0.3;
  const STEP4 = { t: '+50% damage and +20% range', m: { dmg: 1.5, radius: 1.2 } };
  const EVO = { t: '×1.9 damage, more range and a wider arc', m: { dmg: 1.9, radius: 1.3, arc: 1.3 } };
  const TEXT = {
    reach: 'Lab: long reach in a narrow arc.',
    heavy: 'Lab: heavy. It knocks enemies far back, and its first hit on each one makes it flinch.',
    leech: 'Lab: heals you for 25% of the damage it deals.',
    flinch: 'Lab: the first hit on each enemy makes it flinch.',
    parry: 'Lab: parry. Right after each swing, the first hit you take is blocked and the nearest enemy is stunned.',
    pivot: 'Lab: pivot. After the hit you switch to your next move.',
    rush: 'Lab: each charge makes you faster for a while (up to 3 times).'
  };
  const melee = (trait, add) => d => ({ add: Object.assign({ labTrait: trait }, add(d)), upsAt: { 4: STEP4 }, evo: EVO, note: TEXT[trait] });
  const TRAITS = {
    'vine-whip':    melee('reach', d => ({ radius: d.radius * 1.6, arc: d.arc * 0.6 })),
    'wing-attack':  melee('reach', d => ({ radius: d.radius * 1.6, arc: d.arc * 0.6 })),
    'tackle':       melee('heavy', d => ({ knock: d.knock * 1.6, flinch: 0.3 })),
    'body-slam':    melee('heavy', d => ({ knock: d.knock * 1.6, flinch: 0.3 })),
    'dragon-claw':  melee('heavy', d => ({ knock: d.knock * 1.6, flinch: 0.3 })),
    'bug-bite':     melee('leech', () => ({ leech: 0.25 })),
    'play-rough':   melee('leech', () => ({ leech: 0.25 })),
    'lick':         melee('flinch', () => ({ flinch: 0.5 })),
    'bite':         melee('flinch', () => ({ flinch: 0.4 })),
    'karate-chop':  melee('parry', () => ({ parry: PARRY })),
    'metal-claw':   melee('parry', () => ({ parry: PARRY })),
    'u-turn':       () => ({ add: { labTrait: 'pivot', pivot: true }, note: TEXT.pivot }),
    'flame-charge': () => ({ add: { labTrait: 'rush', rush: 0.08, rushDur: 4, rushStacks: 3 }, note: TEXT.rush })
  };
  const M = G.LabMech;
  for (const id in TRAITS) M.ID[id] = TRAITS[id](G.Moves.BY_ID[id]);
  const MOVER = 'Lab: it goes the way you\'re walking (toward your target when you stand still), hits everything in its path, and you stay where you are.';
  // In Lab the close-range cut is 35 % (js/fork/lab/kinds2.js LAB_CLOSE): the box says so.
  const CLOSE_ES = 'Cuerpo a cuerpo: mientras está activo recibes un 25 % menos de daño.';
  const CLOSE_LAB = 'Close range: you take 35% less damage while it’s active.';
  M.keep(...Object.values(TEXT), STEP4.t, EVO.t, MOVER, CLOSE_LAB);

  /** The run's first moves were made before G.Lab.active: swap them for their Lab copies. */
  function retrofit(pl) {
    const swap = new Map();
    for (const m of pl.moves) {
      if (!M.ID[m.id] || m.labId) continue;
      const n = G.Moves.instance(m.id, m.lvl);
      if (m.evolved) G.Moves.evolve(n);
      n.t = m.t; n.since = m.since;
      swap.set(m, n);
    }
    if (!swap.size) return;
    pl.moves = pl.moves.map(m => swap.get(m) || m);
    for (const g of pl.slots) for (let i = 0; i < g.length; i++) g[i] = swap.get(g[i]) || g[i];
  }
  document.addEventListener('DOMContentLoaded', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function () {
      const r = startRun.apply(this, arguments);
      if (lab() && G.Game.player) retrofit(G.Game.player);
      return r;
    };
  });

  // The move's box (js/fork/move-text.js): a Lab mover comes back.
  const tipNotes = G.MoveText.tipNotes;
  G.MoveText.tipNotes = function (m) {
    const out = tipNotes.apply(this, arguments);
    if (!m || !lab()) return out;
    for (const n of out) if (n[0] === CLOSE_ES) n[0] = CLOSE_LAB;
    if (G.LabMobility && G.LabMobility.lined(m)) out.push([MOVER, '#7fe0d0']);
    return out;
  };

  // ---------------- parry ----------------
  const P = G.Player.prototype, cast = P.cast, hurt = P.hurt;
  P.cast = function (m) {
    if (m && m.parry && !this.remote) { m._swingAt = G.Game.st.time; m._parried = false; }
    return cast.apply(this, arguments);
  };
  P.hurt = function (amount, type, pure) {
    if (!this.remote && !this.dead && !pure && !(this.invuln > 0) && !this.god) {
      const m = this.activeGroup().find(x => x.parry && !x._parried && G.Game.st.time - (x._swingAt || -1e9) <= x.parry);
      if (m) {
        m._parried = true;
        this.invuln = Math.max(this.invuln || 0, 0.2);
        let e = null, bd = Infinity;
        for (const o of G.EnemyMgr.queryCircle(this.x, this.y, 70)) { const d = G.U.dist(this.x, this.y, o.x, o.y); if (!o.dead && d < bd) { bd = d; e = o; } }
        if (e) e.applyStun((e.boss || e.judge) ? 0.15 : 0.5);
        G.FX.dmgText(this.x, this.y - this.bodyH - 8, 'Parry!', G.U.TYPE_COLOR[m.type]);
        G.FX.ring(this.x, this.y - this.bodyH * 0.4, this.r, this.r * 2.6, G.U.TYPE_COLOR[m.type], 0.25, 3);
        return;
      }
    }
    return hurt.apply(this, arguments);
  };

  return { TRAITS, retrofit, PARRY };
})();
