/* ============ toughness.js — defensa como aguante y tope de velocidad (Lab primero, fork MrSurvivor) ============
 * En una partida Lab:
 *   - La defensa (dmgReduce de mejoras, cartas, objetos, prestigio, y el potenciador de defensa) es
 *     AGUANTE: recibes 1 / (1 + aguante) del daño. +100 % es la mitad; tope +200 % (un tercio).
 *     Antes se restaba tal cual (hasta un 80 % menos), y apilarla llegaba a casi no recibir daño.
 *   - La velocidad tiene tope: ×2,5 de la tuya (mejoras, cartas y potenciadores juntos). Con el tope
 *     ya alcanzado, la carta Carrera (+velocidad) no sale.
 *   - La carta Coraza dice "aguante" en vez de "reducción de daño".
 * Ganchos: los getters reduction y spd de G.Player, G.LevelUp.offer. Fuera del Lab todo sigue igual.
 * Prueba: fork/test-toughness.cjs.
 */
G.Toughness = (() => {
  const CAP_T = 2, CAP_SPD = 2.5;
  const lab = () => !!(G.Lab && G.Lab.active);
  const P = G.Player.prototype;
  const red = Object.getOwnPropertyDescriptor(P, 'reduction'), spd = Object.getOwnPropertyDescriptor(P, 'spd');
  const tough = pl => Math.min(CAP_T, Math.max(0, pl.dmgReduce + pl.buffs.def.n * pl.buffs.def.amount));
  const spdMul = pl => pl.spdMul * (1 + pl.buffs.spd.n * pl.buffs.spd.amount);

  Object.defineProperty(P, 'reduction', { configurable: true, get() {
    if (this.remote || !lab()) return red.get.call(this);
    return 1 - 1 / (1 + tough(this));
  } });
  Object.defineProperty(P, 'spd', { configurable: true, get() {
    const s = spd.get.call(this);
    if (this.remote || !lab()) return s;
    const m = spdMul(this);
    return m > CAP_SPD ? s * CAP_SPD / m : s;
  } });

  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    let out = offer.apply(this, arguments);
    if (!lab() || !pl || !Array.isArray(out)) return out;
    // Con la velocidad en el tope, otra tanda sin Carrera (o la misma sin ella, si no sale).
    for (let i = 0; i < 20 && spdMul(pl) >= CAP_SPD && out.some(c => c.key === 'stat:spd'); i++) out = offer.apply(this, arguments);
    if (spdMul(pl) >= CAP_SPD) out = out.filter(c => c.key !== 'stat:spd');
    for (const c of out) if (c.key === 'stat:def' && typeof c.desc === 'string') {
      const n = (c.desc.match(/[\d.]+/) || ['6'])[0];
      c.desc = `+${n}% toughness: you take 1 / (1 + toughness) of the damage (+100% is half), up to +${CAP_T * 100}%.`;
    }
    return out;
  };

  return { CAP_T, CAP_SPD, tough };
})();
