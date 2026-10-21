/* ============ badges.js — flechas de "te viene bien / mal" en los movimientos (Lab, fork MrSurvivor) ============
 * Maqueta para probar en el Lab. En una partida Lab, cada cosa que cambia lo bueno que es un
 * movimiento para TU Pokémon lleva una flechita: verde arriba (bien), amarilla abajo (algo peor),
 * roja abajo (mucho peor), magenta arriba (x4 contra un enemigo). Dos formas de enseñarlo, con el
 * ajuste "Plain arrows only" (Ajustes → Experimental, o el botón / la tecla B en las cartas):
 *   - con símbolos (12 iconos): la flecha lleva dentro POR QUÉ: tipo (rombo), físico (estallido),
 *     especial (anillos); las de los enemigos, el multiplicador (x2, 1/2...)
 *   - sólo flechas (4 iconos): la flecha va pegada a la palabra que juzga ("Fire ▲ · Special ▲");
 *     las de los enemigos, sin cifras (1/4 e inmune salen iguales)
 * Qué lleva cada movimiento (marks):
 *   - tipo: verde si es de tu tipo Y te da daño de más (sólo con un tipo: Player.monoType)
 *   - físico/especial: verde con el 95 % o más de tu daño (G.Stats.fit), amarilla desde el 65 %,
 *     roja por debajo; un potenciador de ataque (Danza Espada, Maquinación), verde si es de tu
 *     lado bueno y amarilla si no. Velocidad, defensa y curación: nada (sirven a todos igual).
 * Dónde: cartas de subir de nivel (sólo las de movimiento nuevo), el recuadro de la barra
 * (gancho de una línea en hud.js drawTip) y las flechas de la tabla de tipos sobre los enemigos
 * (G.Icons.canvas/draw: 'eff:...' se cambia por la nuestra). Los iconos son de píxeles, como los
 * de ui/icons.js: se añaden a G.Icons.UI y se pintan con lo de siempre.
 * Textos sólo en inglés, como el resto del Lab. Prueba: fork/test-badges.cjs.
 */
G.LabBadges = (() => {
  const KEY = 'labPlainArrows';
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = (ctx, k, s, x, y) => G.I18n.rawCanvas(ctx, k, s, x, y);
  const on = () => !!G.Lab.active;
  const plain = () => !!G.Settings.get(KEY);

  // ---------------- dibujo ----------------
  // c: color, l: brillo (arriba-izquierda), d: sombra (abajo-derecha); el contorno y el símbolo, k.
  const TONE = {
    g: { up: true, c: '#3fdc6c', l: '#b9ffcb', d: '#1f9445' },
    m: { up: true, c: '#e23cff', l: '#f6bcff', d: '#9416ad' },
    y: { up: false, c: '#ffd23f', l: '#fff3a8', d: '#c08c0c' },
    r: { up: false, c: '#ff4757', l: '#ffb8bf', d: '#b31d2d' }
  };
  const GLYPH = {
    type: ['..#..', '.###.', '#####', '.###.', '..#..'],
    phys: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
    spec: ['.###.', '#...#', '#.#.#', '#...#', '.###.']
  };
  // Cifras de 3×5, las mismas que las flechas de ui/icons.js.
  const DIGIT = {
    x: ['...', '...', '#.#', '.#.', '#.#'], '/': ['..#', '..#', '.#.', '#..', '#..'],
    0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
    2: ['##.', '..#', '.#.', '#..', '###'], 4: ['#.#', '#.#', '###', '..#', '..#']
  };
  const textGlyph = txt => [0, 1, 2, 3, 4].map(y => [...txt].map(ch => DIGIT[ch][y]).join('.'));

  /**
   * Flecha de 45° (punta de 1 px que crece 1 por lado y fila, y un mástil 2 px más ancho que el
   * símbolo), con el símbolo donde la punta se junta con el mástil. Sin símbolo, del mismo tamaño
   * que con uno de 5×5 (13×13 con el contorno). Filas para G.Icons (contorno: outline).
   */
  function arrow(tone, glyph) {
    const t = TONE[tone], g = glyph || GLYPH.type, gw = g[0].length, gh = g.length;
    const W = gw + 6, head = (W + 1) / 2, H = head + gh, half = (W - 1) / 2;
    // Hacia arriba: fila r de la punta con medio ancho r; luego el mástil.
    const upIn = (x, r) => r < head ? Math.abs(x - half) <= r : Math.abs(x - half) <= gw / 2 + 0.5;
    const isIn = (x, y) => x >= 0 && x < W && y >= 0 && y < H && upIn(x, t.up ? y : H - 1 - y);
    const gy = t.up ? head - 1 : H - head - gh + 1, gx = 3;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        if (!isIn(x, y)) { row += '.'; continue; }
        if (glyph && x >= gx && x < gx + gw && y >= gy && y < gy + gh && g[y - gy][x - gx] === '#') { row += 'k'; continue; }
        row += !isIn(x + 1, y) || !isIn(x, y + 1) ? 'd' : !isIn(x - 1, y) || !isIn(x, y - 1) ? 'l' : 'c';
      }
      rows.push(row);
    }
    return { outline: true, pal: { c: t.c, l: t.l, d: t.d }, rows };
  }

  // Los 4 sin símbolo, los 7 de movimientos y los 5 de enemigos: 'lb-g', 'lb-g-phys', 'lb-r-1/4'...
  const EFF = { x4: 'm', x2: 'g', '1/2': 'y', '1/4': 'r', x0: 'r' };
  const NAMES = [];
  const add = (name, def) => { G.Icons.UI[name] = def; NAMES.push(name); };
  for (const t of 'gmyr') add('lb-' + t, arrow(t, null));
  add('lb-g-type', arrow('g', GLYPH.type));
  for (const t of 'gyr') for (const s of ['phys', 'spec']) add(`lb-${t}-${s}`, arrow(t, GLYPH[s]));
  for (const [txt, t] of Object.entries(EFF)) add(`lb-${t}-${txt}`, arrow(t, textGlyph(txt)));

  // ---------------- qué lleva cada movimiento ----------------
  const BUFF_CAT = { patk: 'physical', satk: 'special' };
  const GL = { physical: 'phys', special: 'spec' };

  /** { type, cat } de d (definición o movimiento de la partida) para mon: 'lb-...' o null. */
  function marks(mon, d) {
    const out = { type: null, cat: null };
    if (!mon || !d) return out;
    if (d.kind !== 'buff' && d.cat) {
      if (mon.types.length === 1 && d.type === mon.types[0]) out.type = 'lb-g-type';
      const f = G.Stats.fit(mon, d.cat);
      out.cat = `lb-${f >= 0.95 ? 'g' : f >= 0.65 ? 'y' : 'r'}-${GL[d.cat]}`;
    } else if (d.kind === 'buff' && BUFF_CAT[d.stat]) {
      const cat = BUFF_CAT[d.stat];
      out.cat = `lb-${G.Stats.fit(mon, cat) >= 0.95 ? 'g' : 'y'}-${GL[cat]}`;
    }
    return out;
  }
  // 'lb-g-phys' -> 'lb-g' (la flecha sola).
  const bare = n => n && n.split('-').slice(0, 2).join('-');

  // ---------------- cartas de subir de nivel ----------------
  // Las dos formas van en la carta y el CSS enseña una (body.lb-plain, css/brand.css): así el botón
  // cambia sin volver a pintar las cartas. Con símbolos, detrás del nombre; sólo flechas, dentro
  // del chip, pegadas a cada palabra. El chip es "Nuevo · " + c.tag: "Nuevo · Fuego" se queda en un
  // solo texto (lo traduce i18n como siempre) y " · Especial" va ya traducido y sin traducir otra vez.
  // Con símbolos, al doble (26 px): a 13 el símbolo de dentro no se lee. Las flechas solas, a 13.
  const img = (n, cls, size = 13) => n ? G.Icons.html(n, size, cls) : '';
  function decorate(c, mon) {
    if (c.type !== 'new' || !c.key) return;
    const d = G.Moves.BY_ID[c.key.slice(4)];
    const mk = marks(mon, d);
    if (!mk.type && !mk.cat) return;
    const word = G.T(d.cat ? G.Stats.NAME[d.cat] : 'Mejora');
    c.tag = G.U.TYPE_NAME[d.type] + img(bare(mk.type), 'lb-a')
      + `<span translate="no"> · ${word}</span>` + img(bare(mk.cat), 'lb-a');
    c.title += ` <span class="lb-s">${img(mk.type, '', 26)}${img(mk.cat, '', 26)}</span>`;
  }

  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const list = offer.apply(this, arguments);
    btn().classList.toggle('hidden', !on());
    if (on() && pl && pl.mon) list.forEach(c => decorate(c, pl.mon));
    return list;
  };

  // Botón en la pantalla de cartas (sólo en partidas Lab) y tecla B.
  function btn() {
    let b = document.getElementById('lvl-badges');
    if (b) return b;
    document.getElementById('lvl-reroll').insertAdjacentHTML('afterend',
      '<button id="lvl-badges" class="btn small ghost hidden" data-sfx="none" translate="no" style="margin:10px 0 0 6px"></button>');
    b = document.getElementById('lvl-badges');
    b.onclick = flip;
    label();
    return b;
  }
  function label() {
    const b = document.getElementById('lvl-badges');
    if (b) b.innerHTML = `<span class="lab-badge">LAB</span> Badges: ${plain() ? 'arrows only' : 'arrows + symbols'} · <kbd>B</kbd>`;
  }
  function flip() { G.Settings.set(KEY, !plain()); }
  const sync = () => { document.body.classList.toggle('lb-plain', plain()); label(); };
  G.Settings.on(k => { if (k === KEY) sync(); });
  addEventListener('keydown', e => {
    if ((e.key === 'b' || e.key === 'B') && !e.repeat && on() && G.UI.isOpen && G.UI.isOpen('scr-levelup')) flip();
  });
  if (document.body) sync(); else addEventListener('DOMContentLoaded', sync);

  // ---------------- recuadro de la barra (hud.js drawTip) ----------------
  /**
   * La línea de tipo y categoría del recuadro. Con símbolos, pinta las flechas al doble a la
   * derecha (bajo "Nv.1/5", entre esa línea y la de las notas) y deja que hud.js pinte lo suyo
   * (false); sólo flechas, la pinta entera con cada flecha detrás de su palabra (true: hud.js no
   * pinta nada más).
   */
  function tipLine(ctx, m, pl, x, o, inner) {
    if (!on() || !pl) return false;
    const mk = marks(pl.mon, m);
    if (!mk.type && !mk.cat) return false;
    const S = 13;
    if (!plain()) {
      const list = [mk.type, mk.cat].filter(Boolean);
      list.forEach((n, i) => G.Icons.draw(ctx, n, x + inner - (list.length - i) * (2 * S + 2) + 2, o - 17, 2 * S));
      return false;
    }
    const tn = G.T(G.U.TYPE_NAME[m.type]);
    ctx.font = F(800, 10);
    const tw = raw(ctx, 'measureText', tn).width + 12;
    ctx.beginPath(); ctx.roundRect(x, o - 11, tw, 15, 4); ctx.fillStyle = G.U.TYPE_COLOR[m.type]; ctx.fill();
    ctx.fillStyle = '#10131a'; ctx.textAlign = 'left'; raw(ctx, 'fillText', tn, x + 6, o);
    let cx = x + tw + 3;
    if (mk.type) { G.Icons.draw(ctx, bare(mk.type), cx, o - 10, S); cx += S + 3; }
    const cn = G.T(m.cat ? G.Stats.NAME[m.cat] : 'Mejora');
    ctx.font = F(700, 10); ctx.fillStyle = '#c9d3e6';
    raw(ctx, 'fillText', cn, cx + 3, o);
    cx += 3 + raw(ctx, 'measureText', cn).width + 3;
    if (mk.cat) G.Icons.draw(ctx, bare(mk.cat), cx, o - 10, S);
    return true;
  }

  // ---------------- flechas de los enemigos ----------------
  // 'eff:up:x2' -> 'lb-g-x2' (o 'lb-g' sólo flechas). enemy.js pide G.Icons.canvas (para el tamaño)
  // y G.Icons.draw con el mismo nombre.
  const effName = n => {
    if (!on() || typeof n !== 'string' || !n.startsWith('eff:')) return n;
    const txt = n.split(':')[2], t = EFF[txt];
    return !t ? n : plain() ? 'lb-' + t : `lb-${t}-${txt}`;
  };
  const canvas = G.Icons.canvas, draw = G.Icons.draw;
  G.Icons.canvas = function (n) { return canvas.call(this, effName(n)); };
  G.Icons.draw = function (ctx, n, ...a) { return draw.call(this, ctx, effName(n), ...a); };

  // ---------------- ajuste ----------------
  const row = G.Lab.settingsRow;
  G.Lab.settingsRow = function (toggle) {
    return row.apply(this, arguments)
      + toggle(KEY, 'Plain arrows only (move badges)', 'In Lab runs, moves show small arrows: green up when they suit your Pokémon, yellow or red down when they don\'t. '
        + 'Off: each arrow has a symbol inside (type, physical, special; the multiplier over enemies). On: just the arrows, next to the word they judge. '
        + 'You can also switch on the level-up screen (B).');
  };

  return { marks, tipLine, effName, NAMES, KEY };
})();
