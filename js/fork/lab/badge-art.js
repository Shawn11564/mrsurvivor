/* ============ badge-art.js — the move arrows (MrSurvivor fork) ============
 * The 4 arrows of js/fork/lab/badges.js, in G.Icons.UI: 'lb-g' (green, up), 'lb-m' (magenta,
 * up: x4), 'lb-y' (yellow, down), 'lb-r' (red, down). This is the code drawing (13×13); the
 * artist's goes over it as a PNG from the Asset Admin (js/fork/icon-overrides.json, js/fork/asset-overrides.js).
 * It's a separate file so the gallery in fork/asset-admin.html can paint them without loading the game: it only needs G.Icons.
 */
G.LabBadgeArt = (() => {
  // c: colour, l: highlight (top-left), d: shadow (bottom-right); the outline, k.
  const TONE = {
    g: { up: true, c: '#3fdc6c', l: '#b9ffcb', d: '#1f9445' },
    m: { up: true, c: '#e23cff', l: '#f6bcff', d: '#9416ad' },
    y: { up: false, c: '#ffd23f', l: '#fff3a8', d: '#c08c0c' },
    r: { up: false, c: '#ff4757', l: '#ffb8bf', d: '#b31d2d' }
  };

  /**
   * 45° arrow: a 1 px tip that grows by 1 per side each row (11 wide) and a shaft 7 wide.
   * 13×13 with the outline. Rows for G.Icons.
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

  // The arrow for each type-chart multiplier against an enemy.
  const EFF = { x4: 'm', x2: 'g', '1/2': 'y', '1/4': 'r', x0: 'r' };
  const NAMES = [];
  for (const t of 'gmyr') { G.Icons.UI['lb-' + t] = arrow(t); NAMES.push('lb-' + t); }

  return { NAMES, EFF };
})();
