/* ============ gacha.js — un banner por generación ============
 * Lógica pura: no toca la interfaz. La pantalla está en ui/gacha-ui.js.
 *
 * 9 banners (Kanto ... Paldea). Cada uno con su propio pity.
 * Probabilidades por tirada:  1★ 46.35% · 2★ 30% · 3★ 17% · 4★ 6.5% · 5★ 0.15% (fork)
 * Garantías:
 *   - la tirada ×10 trae al menos un 4★ o superior
 *   - desde la tirada 180 sin 5★ en ese banner, el 5★ sube 2 puntos por tirada (fork)
 *   - a las 220 tiradas sin 5★ en ese banner, el siguiente es 5★ seguro (fork; era 70)
 * Shiny: 1 de cada 100 tiradas sale en su versión shiny.
 * Repetidos: se convierten en Pokémonedas (los shiny repetidos, el triple).
 *
 * Se tira con TICKETS (se consiguen jugando):
 *   ×1   1 ticket
 *   ×10  10 tickets normales, o 1 ticket ×10 (eliges con qué)
 */
G.Gacha = (() => {
  /** ¿Qué gasta una tirada de n? → { t1, t10 } o null si no te llega. */
  /** @param use  't1' (tickets normales) o 't10' (un ticket ×10, sólo para la ×10) */
  function costOf(save, n, use = 't1') {
    const t = save.tickets || { t1: 0, t10: 0 };
    if (n === 10 && use === 't10') return t.t10 >= 1 ? { t1: 0, t10: 1 } : null;
    return t.t1 >= n ? { t1: n, t10: 0 } : null;
  }
  // Fork (MrSurvivor): Legendaria al 0,15 % (era 1,5 %; lo que sobra va a Común) y pity a 220 (era 70).
  const RATES = [[1, 46.35], [2, 30], [3, 17], [4, 6.5], [5, 0.15]];
  const PITY_5 = 220;
  // Fork: pity blando. Desde la tirada 180 sin Legendaria, su probabilidad sube 2 puntos por
  // tirada (lo que gana sale de las demás rarezas, en proporción); la 220 es segura.
  const SOFT_PITY = 180, SOFT_STEP = 2;
  /** % de Legendaria en la tirada número k sin ella en ese banner. */
  function legendRate(k) {
    if (k >= PITY_5) return 100;
    return Math.min(100, RATES[4][1] + Math.max(0, k - SOFT_PITY + 1) * SOFT_STEP);
  }
  const SHINY_RATE = 1 / 100;
  const REFUND = { 1: 15, 2: 30, 3: 60, 4: 120, 5: 300 };
  let forceShiny = 0;           // para pruebas y vídeos: las N próximas salen shiny

  const RARITY_NAME = { 1: 'Común', 2: 'Poco común', 3: 'Rara', 4: 'Épica', 5: 'Legendaria' };
  const RARITY_COLOR = { 1: '#9fb1c9', 2: '#5fe08a', 3: '#4fb4ff', 4: '#c47bff', 5: '#ffcb3d' };

  const BANNERS = [
    { gen: 1, name: 'Kanto',   color: ['#3a1d6e', '#1b2f78', '#0f4d6e'] },
    { gen: 2, name: 'Johto',   color: ['#5a2a1a', '#7a3d1f', '#2d4a6e'] },
    { gen: 3, name: 'Hoenn',   color: ['#0f4d6e', '#1b6a5a', '#2a3d78'] },
    { gen: 4, name: 'Sinnoh',  color: ['#2a2a5e', '#3d3d8a', '#5a2a6e'] },
    { gen: 5, name: 'Teselia', color: ['#1a1a2a', '#3a3a4e', '#2a4a6e'] },
    { gen: 6, name: 'Kalos',   color: ['#4a1a3a', '#2a3a7a', '#1a5a7a'] },
    { gen: 7, name: 'Alola',   color: ['#7a3a1a', '#1a6a6a', '#2a4a8a'] },
    { gen: 8, name: 'Galar',   color: ['#4a1a5a', '#1a3a6a', '#6a1a3a'] },
    { gen: 9, name: 'Paldea',  color: ['#6a2a1a', '#4a1a5a', '#1a4a6a'] }
  ];

  function inBanner(p, gen) { return p.gen === gen && !!G.SPRITE_META[p.dex]; }

  /** Pokémon de una rareza en un banner. */
  function pool(rarity, gen) { return G.DEX.filter(p => inBanner(p, gen) && p.rarity === rarity); }

  /** Pool no vacío más cercano (algunas generaciones tienen rarezas casi vacías). */
  function poolNear(rarity, gen) {
    for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      const r = rarity + d;
      if (r < 1 || r > 5) continue;
      const p = pool(r, gen);
      if (p.length) return { rarity: r, list: p };
    }
    return { rarity, list: G.DEX.filter(p => inBanner(p, gen)) };
  }

  function rollRarity(min = 1, leg = RATES[4][1]) {
    const rest = (100 - leg) / (100 - RATES[4][1]);
    const rates = RATES.filter(([r]) => r >= min).map(([r, w]) => [r, r === 5 ? leg : w * rest]);
    const total = rates.reduce((a, [, w]) => a + w, 0);
    let x = Math.random() * total;
    for (const [r, w] of rates) { x -= w; if (x <= 0) return r; }
    return rates[rates.length - 1][0];
  }

  /** Los 3 más fuertes de la generación, para el cartel del banner. */
  function featured(gen) {
    return G.DEX.filter(p => inBanner(p, gen) && p.rarity === 5)
      .sort((a, b) => b.bst - a.bst).slice(0, 3).map(p => p.dex);
  }

  /**
   * Hace `n` tiradas en el banner `gen` sobre el guardado `save` (lo modifica).
   * Devuelve null si no hay monedas, o la lista de resultados:
   *   { dex, rarity, shiny, isNew, refund }
   */
  function pull(save, n, gen = 1, use = 't1') {
    const cost = costOf(save, n, use);
    if (!cost) return null;
    save.tickets.t1 -= cost.t1;
    save.tickets.t10 -= cost.t10;
    save.pity = save.pity || {};
    save.shiny = save.shiny || {};
    save.pity[gen] = save.pity[gen] || 0;

    const out = [];
    for (let i = 0; i < n; i++) {
      save.pity[gen]++;
      let want;
      const leg = legendRate(save.pity[gen]);
      if (leg >= 100) want = 5;
      else if (n === 10 && i === n - 1 && !out.some(r => r.rarity >= 4)) want = rollRarity(4, leg);
      else want = rollRarity(1, leg);

      const { rarity, list } = poolNear(want, gen);
      if (rarity === 5) save.pity[gen] = 0;
      let mon = G.U.pick(list);
      let shiny = G.Sprites.hasShiny(mon.dex) && (forceShiny > 0 ? (forceShiny--, true) : Math.random() < SHINY_RATE);
      // Los shiny no se repiten: si ya tienes ese, sale otro de la misma rareza
      // cuyo shiny te falte; si los tienes todos, sale normal.
      if (shiny && save.shiny[mon.dex]) {
        const missing = list.filter(p => G.Sprites.hasShiny(p.dex) && !save.shiny[p.dex]);
        if (missing.length) mon = G.U.pick(missing);
        else shiny = false;
      }

      let isNew = false, refund = 0;
      if (shiny) {
        isNew = !save.shiny[mon.dex];
        if (isNew) save.shiny[mon.dex] = { at: Date.now(), from: 'gacha' };
        else refund = REFUND[rarity] * 3;
        if (!save.owned[mon.dex]) save.owned[mon.dex] = { at: Date.now(), from: 'gacha' };
      } else {
        isNew = !save.owned[mon.dex];
        if (isNew) save.owned[mon.dex] = { at: Date.now(), from: 'gacha' };
        else refund = REFUND[rarity];
      }
      save.coins += refund;
      out.push({ dex: mon.dex, rarity, shiny, isNew, refund });
    }
    save.stats.pulls = (save.stats.pulls || 0) + n;
    return out;
  }

  return { debugForceShiny(n = 1) { forceShiny = n; },
           costOf, RATES, PITY_5, SOFT_PITY, SOFT_STEP, legendRate, SHINY_RATE, REFUND, RARITY_NAME, RARITY_COLOR, BANNERS,
           pool, featured, pull };
})();
