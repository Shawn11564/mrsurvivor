/* ============ move-looks.js — every move looks like what it does (MrSurvivor fork) ============
 * The drawings in js/entities/vfx.js (MOVE) that promised something the move doesn't do, fixed
 * without touching that file (upstream's changes come in without conflicts):
 *   - Hierba Lazo (id giga-drain, formerly Gigadrenado): hearts flowing toward you, as if it healed,
 *     and it no longer heals. Now leaves rising from the ground (its roots strike from below). Goes through
 *     m.look, which js/fork/lab/lab.js applies to G.VFX.forMove in every run.
 *   - The stun zones (Tumba Rocas, Onda Trueno, Liofilización, Puño Dinámico): their drawing
 *     (rock, bolt, shard, impact) never showed, only a circle. Now it falls during the warning,
 *     like the meteors: Tumba Rocas says "caen rocas" (rocks fall) and now they fall. Reads the fields from
 *     G.Combat.fields (a fork getter in js/systems/combat.js).
 * Test: fork/test-move-truth.cjs.
 */
(() => {
  const gk = G.Moves.BY_ID['giga-drain'];
  if (gk) gk.look = Object.assign({}, gk.look, { aura: 'leaf', rise: true, inward: false });

  const C = G.Combat, air = C.drawAirFields;
  C.drawAirFields = function (ctx) {
    air.apply(this, arguments);
    const list = C.fields;
    if (!list) return;
    const now = performance.now() / 1000;
    for (const f of list) {
      if (f.kind !== 'stunzone' || f.t >= f.delay || !f.vis || !G.Camera.sees(f.x, f.y, 200)) continue;
      const k = G.U.clamp(f.t / f.delay, 0, 1), n = f.r > 40 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const a = i * 2.1 + f.x * 0.01, d = n > 1 ? f.r * 0.45 : 0;
        const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d * 0.6;
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, x + (1 - k) * 30, y - (1 - k) * 160 - 6,
                   { scale: 1.4, angle: Math.atan2(160, -30), frame: Math.floor(now * 12) + i });
      }
    }
  };
})();
