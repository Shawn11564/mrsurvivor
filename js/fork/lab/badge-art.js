/* ============ badge-art.js — las flechas de los movimientos (Lab, fork MrSurvivor) ============
 * Las 4 flechas de js/fork/lab/badges.js, en G.Icons.UI: 'lb-g' (verde, arriba), 'lb-m' (magenta,
 * arriba: x4), 'lb-y' (amarilla, abajo), 'lb-r' (roja, abajo). Es el dibujo de código (13×13); el
 * del artista va encima como PNG desde el Asset Admin (js/fork/icon-overrides.json, js/fork/asset-overrides.js).
 * Va aparte para que la galería de fork/asset-admin.html las pinte sin cargar el juego: sólo pide G.Icons.
 */
G.LabBadgeArt = (() => {
  // c: color, l: brillo (arriba-izquierda), d: sombra (abajo-derecha); el contorno, k.
  const TONE = {
    g: { up: true, c: '#3fdc6c', l: '#b9ffcb', d: '#1f9445' },
    m: { up: true, c: '#e23cff', l: '#f6bcff', d: '#9416ad' },
    y: { up: false, c: '#ffd23f', l: '#fff3a8', d: '#c08c0c' },
    r: { up: false, c: '#ff4757', l: '#ffb8bf', d: '#b31d2d' }
  };

  /**
   * Flecha de 45°: punta de 1 px que crece 1 por lado y fila (11 de ancho) y un mástil de 7.
   * 13×13 con el contorno (outline). Filas para G.Icons.
   */
  function arrow(tone) {
    const t = TONE[tone], W = 11, head = 6, H = 11, half = 5;
    const upIn = (x, r) => r < head ? Math.abs(x - half) <= r : Math.abs(x - half) <= 3;
    const isIn = (x, y) => x >= 0 && x < W && y >= 0 && y < H && upIn(x, t.up ? y : H - 1 - y);
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        if (!isIn(x, y)) { row += '.'; continue; }
        row += !isIn(x + 1, y) || !isIn(x, y + 1) ? 'd' : !isIn(x - 1, y) || !isIn(x, y - 1) ? 'l' : 'c';
      }
      rows.push(row);
    }
    return { outline: true, pal: { c: t.c, l: t.l, d: t.d }, rows };
  }

  // La flecha de cada multiplicador de la tabla de tipos sobre un enemigo.
  const EFF = { x4: 'm', x2: 'g', '1/2': 'y', '1/4': 'r', x0: 'r' };
  const NAMES = [];
  for (const t of 'gmyr') { G.Icons.UI['lb-' + t] = arrow(t); NAMES.push('lb-' + t); }

  return { NAMES, EFF };
})();
