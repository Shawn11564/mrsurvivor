/* ============ shiny.js — los shiny, algo más que otro color, en el modo Lab (fork MrSurvivor) ============
 * Fase 7 de fork/LAB.md. En una partida Lab con tu Pokémon shiny:
 *   - sus ataques salen con SUS colores: se comparan la hoja Idle normal y la shiny, se toman los
 *     píxeles que cambian y su color más LLAMATIVO da una paleta de 5 tonos (G.VFX.PAL 'shiny{dex}');
 *     cada movimiento suyo la lleva en m.look (lab.js la pone por encima de la del tipo).
 *     El voto (paletteFrom), como el color de la lana de los pokédolls de Pokeblocks
 *     (ColorFactory.sampleDominantWools): cada píxel pesa 0,05 + croma² (croma = máx - mín de RGB:
 *     a la vez vivo y claro), así que un acento rojo le gana a un cuerpo negro o gris aunque ocupe
 *     menos. Los grises de verdad (croma < 0,06) van aparte y sólo ganan si casi no hay color (la
 *     paleta sale gris: Rayquaza shiny). El tono es la media circular de la mejor ventana de 30°
 *     (el rojo no se parte entre 355° y 5°). Charizard shiny tira llamas rojizas (sus alas);
 *     Gyarados shiny, agua roja; Metagross shiny, dorada. Si apenas cambia de color (o la hoja no se
 *     puede leer), sus ataques se quedan como siempre.
 *   - los RADIANTES (js/fork/radiant.js), igual con su hoja r/Idle ('radiant{dex}'), sin los extras
 *     del shiny; y mientras juegas con el radiante no cuentas como shiny.
 *   - pequeños extras que no tocan el ranking (no hay ranking en el Lab): +10 % de experiencia,
 *     +10 % de monedas y un cambio de cartas más (BONUS).
 * Cooperativo: el fantasma de un compañero shiny (Combat.ghostCast) también sale con su paleta.
 * Prueba: fork/test-lab.cjs.
 */
G.LabShiny = (() => {
  const BONUS = { xp: 0.1, coins: 0.1, rerolls: 1 };
  const W_BASE = 0.05, GREY = 0.06;          // el voto de cada píxel: W_BASE + croma²; por debajo de GREY, gris
  const pals = {};                         // 'shiny6' / 'radiant6' -> esa clave | null (no se distingue) ; sin calcular: undefined

  const hex = (h, s, l) => {
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function pixels(dex, shiny) {
    const s = G.Sprites.sheet(dex, 'Idle', shiny);
    if (!s || !s.ready) return null;
    const c = document.createElement('canvas');
    c.width = s.img.width; c.height = s.img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(s.img, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  }

  /**
   * La paleta de los colores que cambian de la hoja `a` (normal) a la `b` (shiny o radiante), con
   * el color más llamativo por delante (ver arriba). → [5 colores] o null si apenas cambia.
   */
  function paletteFrom(a, b) {
    const same = a.width === b.width && a.height === b.height;
    const bins = new Array(24).fill(0), vx = new Array(24).fill(0), vy = new Array(24).fill(0), sat = new Array(24).fill(0);
    let neutral = 0, n = 0;
    for (let i = 0; i < b.data.length; i += 4) {
      if (b.data[i + 3] < 128) continue;
      const r = b.data[i], g = b.data[i + 1], bl = b.data[i + 2];
      // Los píxeles que cambian de la normal a la otra (o toda la otra, si las hojas no casan).
      if (same && Math.abs(a.data[i] - r) + Math.abs(a.data[i + 1] - g) + Math.abs(a.data[i + 2] - bl) < 60) continue;
      const [h, s, l] = hsl(r, g, bl);
      if (l < 0.08 || l > 0.95) continue;                   // contornos y brillos
      const c = (Math.max(r, g, bl) - Math.min(r, g, bl)) / 255, w = W_BASE + c * c;
      n++;
      if (c < GREY) { neutral += w; continue; }
      const k = Math.floor(h / 15) % 24, rad = h * Math.PI / 180;
      bins[k] += w; vx[k] += w * Math.cos(rad); vy[k] += w * Math.sin(rad); sat[k] += s * w;
    }
    if (n < 40) return null;
    // La mejor ventana de dos cajones seguidos (30°), dando la vuelta: 345°-15° es una.
    let best = 0;
    for (let k = 1; k < 24; k++) if (bins[k] + bins[(k + 1) % 24] > bins[best] + bins[(best + 1) % 24]) best = k;
    const win = [best, (best + 1) % 24], cw = win.reduce((t, k) => t + bins[k], 0);
    if (cw < 0.2 * neutral) return [0.12, 0.3, 0.5, 0.72, 0.93].map(l => hex(0, 0, l));    // casi todo gris: paleta gris
    const h = (Math.atan2(vy[win[0]] + vy[win[1]], vx[win[0]] + vx[win[1]]) * 180 / Math.PI + 360) % 360;
    const s = G.U.clamp((sat[win[0]] + sat[win[1]]) / cw, 0.15, 0.9);
    return [hex(h, s * 0.8, 0.12), hex(h, s, 0.3), hex(h, s, 0.5), hex(h, s * 0.9, 0.72), hex(h, s * 0.5, 0.93)];
  }

  /** Clave de G.VFX.PAL con la paleta de su shiny ('shiny{dex}') o, con radiant, de su radiante
   *  ('radiant{dex}'); null si no hay diferencia clara, undefined si las hojas aún no han cargado. */
  function paletteOf(dex, radiant = false) {
    const key = (radiant ? 'radiant' : 'shiny') + dex;
    if (key in pals) return pals[key];
    if (radiant ? !(G.Radiant && G.Radiant.has(dex)) : !G.Sprites.hasShiny(dex)) return (pals[key] = null);
    let a, b;
    try { a = pixels(dex, false); b = radiant ? pixels(G.Radiant.key(dex), false) : pixels(dex, true); }
    catch (e) { return (pals[key] = null); }                 // (file:// no deja leerla)
    if (!a || !b) return undefined;
    const pal = paletteFrom(a, b);
    if (!pal) return (pals[key] = null);
    G.VFX.PAL[key] = pal;
    return (pals[key] = key);
  }

  /** Sus movimientos con su paleta (los que ya tiene; los nuevos, al aprenderlos). */
  function paint(p) {
    const key = p._labPal;
    if (!key) return;
    for (const m of p.moves) if (!m.look || m.look.pal !== key) m.look = Object.assign({}, m.look, { pal: key });
  }
  const P = G.Player.prototype, addMove = P.addMove;
  P.addMove = function () {
    const ok = addMove.apply(this, arguments);
    if (ok && this._labPal) paint(this);
    return ok;
  };

  // Los fantasmas de un compañero shiny o radiante: sus instancias, con la paleta (Combat.ghostCast las crea).
  const ghostCast = G.Combat.ghostCast;
  G.Combat.ghostCast = function (pl) {
    const key = !G.Lab.active || !pl ? null : pl.radiant ? paletteOf(pl.dex, true) : pl.shiny ? paletteOf(pl.dex) : null;
    if (!key) return ghostCast.apply(this, arguments);
    const inst = G.Moves.instance;
    G.Moves.instance = function () { const s = inst.apply(this, arguments); s.look = Object.assign({}, s.look, { pal: key }); return s; };
    try { return ghostCast.apply(this, arguments); } finally { G.Moves.instance = inst; }
  };

  function start(p) {
    p._labPal = null;
    // Con su radiante: sus colores, sin los extras del shiny (y deja de contar como shiny).
    if (G.Radiant && G.Radiant.wants(p.dex)) {
      p.shiny = false; p._labRadiant = true;
      G.Sprites.preload([p.dex], 8000, false);         // la normal, para compararla
      return;
    }
    if (!p.shiny) return;
    p.xpMul *= 1 + BONUS.xp; p.coinMul *= 1 + BONUS.coins; p.rerollBonus = (p.rerollBonus || 0) + BONUS.rerolls;
    p._labShiny = true;
    G.Sprites.preload([p.dex], 8000, false);           // la normal, para compararla
  }
  // Hasta que las dos hojas estén cargadas (y al evolucionar, la de la evolución).
  setInterval(() => {
    const p = G.Game.player;
    if (!p || !(p._labShiny || p._labRadiant) || !G.Lab.active) return;
    if (p._labPalDex !== p.dex) {
      const key = paletteOf(p.dex, !!p._labRadiant);
      if (key === undefined) return;
      p._labPalDex = p.dex; p._labPal = key;
      paint(p);
    }
  }, 300);

  G.Lab.pauseLine(p => p._labShiny ? 'Shiny: +10% XP, +10% coins and one more card reroll' + (p._labPal ? '; its moves take its shiny colours.' : '.')
    : p._labRadiant && p._labPal ? 'Radiant: its moves take its radiant colours.' : '');

  return { start, paletteOf, paletteFrom, BONUS };
})();
