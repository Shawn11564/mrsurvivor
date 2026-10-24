/* ============ toughness.js — defense as toughness, and a speed cap (Lab first, MrSurvivor fork) ============
 * In a Lab run:
 *   - Defense (dmgReduce from upgrades, cards, items, prestige, and the defense booster) is
 *     TOUGHNESS: you take 1 / (1 + toughness) of the damage. +100 % is half; capped at +200 % (a third).
 *     Before, it was subtracted as is (up to 80 % less), and stacking it got close to taking no damage.
 *   - Speed has a cap: ×2.5 of yours (upgrades, cards and boosters together). Once the cap
 *     is reached, the Carrera card (+speed) doesn't come up.
 *   - The Coraza card says "toughness" instead of "damage reduction".
 * Hooks: G.Player's reduction and spd getters, G.LevelUp.offer. Outside Lab nothing changes.
 * Test: fork/test-toughness.cjs.
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
    // With speed at the cap, another batch without Carrera (or the same one minus it, if none comes).
    for (let i = 0; i < 20 && spdMul(pl) >= CAP_SPD && out.some(c => c.key === 'stat:spd'); i++) out = offer.apply(this, arguments);
    if (spdMul(pl) >= CAP_SPD) out = out.filter(c => c.key !== 'stat:spd');
    for (const c of out) if (c.key === 'stat:def' && typeof c.desc === 'string') {
      const n = (c.desc.match(/[\d.]+/) || ['6'])[0];
      c.desc = `+${n}% toughness: you take 1 / (1 + toughness) of the damage (+100% halves it), up to +${CAP_T * 100}%.`;
    }
    return out;
  };

  return { CAP_T, CAP_SPD, tough };
})();
