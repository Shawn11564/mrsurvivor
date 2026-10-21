/* ============ move-looks.js — que cada movimiento se vea como lo que hace (fork MrSurvivor) ============
 * Los dibujos de js/entities/vfx.js (MOVE) que prometían algo que el movimiento no hace, corregidos
 * sin tocar ese archivo (los cambios de upstream llegan sin conflictos):
 *   - Hierba Lazo (id giga-drain, antes Gigadrenado): corazones que iban hacia ti, como si curase,
 *     y ya no cura. Ahora hojas que suben del suelo (sus raíces golpean desde abajo). Va por
 *     m.look, que js/fork/lab/lab.js aplica a G.VFX.forMove en todas las partidas.
 *   - Las zonas de aturdir (Tumba Rocas, Onda Trueno, Liofilización, Puño Dinámico): su dibujo
 *     (roca, rayo, esquirla, impacto) no salía nunca, sólo un círculo. Ahora cae durante el aviso,
 *     como los meteoros: Tumba Rocas dice "caen rocas" y ahora caen. Lee los campos de
 *     G.Combat.fields (un getter del fork en js/systems/combat.js).
 * Prueba: fork/test-move-truth.cjs.
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
