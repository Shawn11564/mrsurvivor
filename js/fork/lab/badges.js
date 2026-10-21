/* ============ badges.js — flechas de "te viene bien / mal" en los movimientos (Lab, fork MrSurvivor) ============
 * En una partida Lab, cada cosa que cambia lo bueno que es un movimiento para TU Pokémon lleva una
 * flechita pegada a la palabra que juzga ("Fire ▲ · Special ▲"): verde arriba (bien), amarilla
 * abajo (algo peor), roja abajo (mucho peor); sobre los enemigos, la de la tabla de tipos: magenta
 * (x4), verde (x2), amarilla (1/2), roja (1/4 e inmune). Son 4 flechas (js/fork/lab/badge-art.js);
 * el dibujo es el del artista, un PNG del Asset Admin (js/fork/icon-overrides.json).
 * Qué lleva cada movimiento (marks):
 *   - tipo: verde si es de tu tipo Y te da daño de más (sólo con un tipo: Player.monoType)
 *   - físico/especial: verde con el 95 % o más de tu daño (G.Stats.fit), amarilla desde el 65 %,
 *     roja por debajo; un potenciador de ataque (Danza Espada, Maquinación), verde si es de tu
 *     lado bueno y amarilla si no. Velocidad, defensa y curación: nada (sirven a todos igual).
 * Dónde: cartas de subir de nivel (sólo las de movimiento nuevo), el recuadro de la barra
 * (gancho de una línea en hud.js drawTip) y las flechas de la tabla de tipos sobre los enemigos
 * (G.Icons.canvas/draw: 'eff:...' se cambia por la nuestra).
 * Textos sólo en inglés, como el resto del Lab. Prueba: fork/test-badges.cjs.
 */
G.LabBadges = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = (ctx, k, s, x, y) => G.I18n.rawCanvas(ctx, k, s, x, y);
  const on = () => !!G.Lab.active;

  // Las 4 flechas las dibuja js/fork/lab/badge-art.js (también para la galería de fork/asset-admin.html).
  const { NAMES, EFF } = G.LabBadgeArt;

  // ---------------- qué lleva cada movimiento ----------------
  const BUFF_CAT = { patk: 'physical', satk: 'special' };

  /** { type, cat } de d (definición o movimiento de la partida) para mon: 'lb-g' / 'lb-y' / 'lb-r' o null. */
  function marks(mon, d) {
    const out = { type: null, cat: null };
    if (!mon || !d) return out;
    if (d.kind !== 'buff' && d.cat) {
      if (mon.types.length === 1 && d.type === mon.types[0]) out.type = 'lb-g';
      const f = G.Stats.fit(mon, d.cat);
      out.cat = f >= 0.95 ? 'lb-g' : f >= 0.65 ? 'lb-y' : 'lb-r';
    } else if (d.kind === 'buff' && BUFF_CAT[d.stat]) {
      out.cat = G.Stats.fit(mon, BUFF_CAT[d.stat]) >= 0.95 ? 'lb-g' : 'lb-y';
    }
    return out;
  }

  // ---------------- cartas de subir de nivel ----------------
  // Dentro del chip, pegadas a cada palabra. El chip es "Nuevo · " + c.tag: "Nuevo · Fuego" se queda
  // en un solo texto (lo traduce i18n como siempre) y " · Especial" va ya traducido y sin traducir otra vez.
  const img = n => n ? G.Icons.html(n, 13, 'lb-a') : '';
  function decorate(c, mon) {
    if (c.type !== 'new' || !c.key) return;
    const d = G.Moves.BY_ID[c.key.slice(4)];
    const mk = marks(mon, d);
    if (!mk.type && !mk.cat) return;
    const word = G.T(d.cat ? G.Stats.NAME[d.cat] : 'Mejora');
    c.tag = G.U.TYPE_NAME[d.type] + img(mk.type) + `<span translate="no"> · ${word}</span>` + img(mk.cat);
  }

  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const list = offer.apply(this, arguments);
    if (on() && pl && pl.mon) list.forEach(c => decorate(c, pl.mon));
    return list;
  };

  // ---------------- recuadro de la barra (hud.js drawTip) ----------------
  /** La línea de tipo y categoría del recuadro, entera, con cada flecha detrás de su palabra (true: hud.js no pinta más). */
  function tipLine(ctx, m, pl, x, o) {
    if (!on() || !pl) return false;
    const mk = marks(pl.mon, m);
    if (!mk.type && !mk.cat) return false;
    const tn = G.T(G.U.TYPE_NAME[m.type]);
    ctx.font = F(800, 10);
    const tw = raw(ctx, 'measureText', tn).width + 12;
    ctx.beginPath(); ctx.roundRect(x, o - 11, tw, 15, 4); ctx.fillStyle = G.U.TYPE_COLOR[m.type]; ctx.fill();
    ctx.fillStyle = '#10131a'; ctx.textAlign = 'left'; raw(ctx, 'fillText', tn, x + 6, o);
    // Cada flecha a su tamaño (13, o el del PNG del artista), centrada en la línea.
    const arrowAt = (n, ax) => { const c = G.Icons.canvas(n); G.Icons.draw(ctx, n, ax, o - 3.5 - c.height / 2, c.width); return c.width; };
    let cx = x + tw + 3;
    if (mk.type) cx += arrowAt(mk.type, cx) + 3;
    const cn = G.T(m.cat ? G.Stats.NAME[m.cat] : 'Mejora');
    ctx.font = F(700, 10); ctx.fillStyle = '#c9d3e6';
    raw(ctx, 'fillText', cn, cx + 3, o);
    cx += 3 + raw(ctx, 'measureText', cn).width + 3;
    if (mk.cat) arrowAt(mk.cat, cx);
    return true;
  }

  // ---------------- flechas de los enemigos ----------------
  // 'eff:up:x2' -> 'lb-g'. enemy.js pide G.Icons.canvas (para el tamaño) y G.Icons.draw con el mismo nombre.
  const effName = n => {
    if (!on() || typeof n !== 'string' || !n.startsWith('eff:')) return n;
    const t = EFF[n.split(':')[2]];
    return t ? 'lb-' + t : n;
  };
  const canvas = G.Icons.canvas, draw = G.Icons.draw;
  G.Icons.canvas = function (n) { return canvas.call(this, effName(n)); };
  G.Icons.draw = function (ctx, n, ...a) { return draw.call(this, ctx, effName(n), ...a); };

  return { marks, tipLine, effName, NAMES };
})();
