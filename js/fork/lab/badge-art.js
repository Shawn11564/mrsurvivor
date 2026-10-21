/* ============ badge-art.js — el dibujo de las flechas de los movimientos (Lab, fork MrSurvivor) ============
 * Sólo el pixel art de js/fork/lab/badges.js: 16 iconos añadidos a G.Icons.UI (los 4 sin símbolo,
 * los 7 de movimientos y los 5 de enemigos: 'lb-g', 'lb-g-phys', 'lb-r-1/4'...). Va aparte para
 * que la galería de fork/asset-admin.html los pinte sin cargar el juego: sólo pide G.Icons.
 */
G.LabBadgeArt = (() => {
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

  const EFF = { x4: 'm', x2: 'g', '1/2': 'y', '1/4': 'r', x0: 'r' };
  const NAMES = [];
  const add = (name, def) => { G.Icons.UI[name] = def; NAMES.push(name); };
  for (const t of 'gmyr') add('lb-' + t, arrow(t, null));
  add('lb-g-type', arrow('g', GLYPH.type));
  for (const t of 'gyr') for (const s of ['phys', 'spec']) add(`lb-${t}-${s}`, arrow(t, GLYPH[s]));
  for (const [txt, t] of Object.entries(EFF)) add(`lb-${t}-${txt}`, arrow(t, textGlyph(txt)));

  return { NAMES, EFF };
})();
