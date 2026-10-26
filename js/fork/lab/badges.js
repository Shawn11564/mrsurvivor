/* ============ badges.js — "good / bad for you" arrows on moves (MrSurvivor fork) ============
 * In a run, everything that changes how good a move is for YOUR Pokémon gets a
 * small arrow stuck to the word it judges ("Fire ▲ · Special ▲"): green up (good), yellow
 * down (a bit worse), red down (much worse); over enemies, the type chart's: magenta
 * (x4), green (x2), yellow (1/2), red (1/4 and immune). There are 4 arrows (js/fork/lab/badge-art.js);
 * the art is the artist's, a PNG from the Asset Admin (js/fork/icon-overrides.json).
 * What each move gets (marks):
 *   - type: green if it's your type AND gives you extra damage (single type only: Player.monoType)
 *   - physical/special: green at 95 % or more of your damage (G.Stats.fit), yellow from 65 %,
 *     red below; an attack booster (Swords Dance, Nasty Plot), green if it's on your
 *     good side and yellow if not. Speed, defence and healing: nothing (they help everyone the same).
 * Where: level-up cards (new-move ones, signatures included), the move bar's tooltip box
 * (one-line hook in hud.js drawTip) and the type-chart arrows over enemies
 * (one-line hook in enemy.js: enemyMark). At half their size (the 18×18 PNG, at 9; the level-up
 * cards' at 2/3, 12, since 22-10-2026): left of the enemy's health bar, or centred above it if it has none yet.
 * The enemy ones replace the game's own (bigger and always
 * left of where the bar would go, which covered the enemy).
 * Texts in English only. Test: fork/test-badges.cjs.
 */
G.LabBadges = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = (ctx, k, s, x, y) => G.I18n.rawCanvas(ctx, k, s, x, y);
  const on = () => !!G.Lab.active;

  // js/fork/lab/badge-art.js draws the 4 arrows (also for the gallery in fork/asset-admin.html).
  const { NAMES, EFF } = G.LabBadgeArt;

  // ---------------- what each move gets ----------------
  const BUFF_CAT = { patk: 'physical', satk: 'special' };

  /** { type, cat } of d (a definition or a run's move) for mon: 'lb-g' / 'lb-y' / 'lb-r' or null. */
  function marks(mon, d) {
    const out = { type: null, cat: null };
    if (!mon || !d) return out;
    if (d.kind !== 'buff' && d.cat) {
      if (mon.types.length === 1 && d.type === mon.types[0]) out.type = 'lb-g';
      const f = G.Stats.fit(mon, d.cat);
      out.cat = f >= 0.95 ? 'lb-g' : f >= 0.65 ? 'lb-y' : 'lb-r';
    } else if (d.kind === 'buff' && BUFF_CAT[d.stat] && (d.also || []).some(a => BUFF_CAT[a.stat] && BUFF_CAT[a.stat] !== BUFF_CAT[d.stat])) {
      out.cat = 'lb-g';                                  // both sides (Work Up, Fillet Away): good for everyone
    } else if (d.kind === 'buff' && BUFF_CAT[d.stat]) {
      out.cat = G.Stats.fit(mon, BUFF_CAT[d.stat]) >= 0.95 ? 'lb-g' : 'lb-y';
    }
    return out;
  }

  // All at half size (21-10-2026: at 18 they covered the enemy and the text). From G.Icons.canvas's canvas,
  // which is the artist's PNG (or the code drawing if it hasn't arrived): smoothing only when it shrinks.
  // The level-up cards' a bit bigger (22-10-2026, the user): 2/3 of the PNG, 12 px.
  const HALF = 0.5, CARD = 2 / 3;
  const size = (n, k = HALF) => { const c = G.Icons.canvas(n); return { c, w: c.width * k, h: c.height * k }; };
  function paint(ctx, n, x, y) {
    const s = size(n), prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = s.c.width > s.w * (Math.abs(ctx.getTransform().a) || 1) + 0.5;
    ctx.drawImage(s.c, x, y, s.w, s.h);
    ctx.imageSmoothingEnabled = prev;
    return s;
  }

  // ---------------- level-up cards ----------------
  // Inside the chip, stuck to each word. The chip is "Nuevo · " + c.tag: "Nuevo · Fuego" stays
  // one text (i18n translates it as usual) and " · Especial" goes in already translated and isn't translated again.
  // The <img> by hand: G.Icons.html doesn't go below ×1 (asset-overrides.js swaps it if the PNG arrives later).
  const img = n => {
    if (!n) return '';
    const s = size(n, CARD), smooth = s.c.width > s.w * (devicePixelRatio || 1) ? ' style="image-rendering:auto"' : '';
    return `<img class="pix lb-a" src="${G.Icons.url(n)}" width="${s.w}" height="${s.h}" alt="" draggable="false"${smooth}>`;
  };
  // A signature's card is gold ('evo', key still 'new:', js/fork/lab/lab.js): its chip is "Signature · " + the same.
  function decorate(c, mon) {
    if (!c.key || !c.key.startsWith('new:') || (c.type !== 'new' && c.type !== 'evo')) return;
    const d = G.Moves.BY_ID[c.key.slice(4)];
    const mk = marks(mon, d);
    if (!d || (!mk.type && !mk.cat)) return;
    const word = G.T(d.cat ? G.Stats.NAME[d.cat] : 'Mejora');
    const tag = G.U.TYPE_NAME[d.type] + img(mk.type) + `<span translate="no"> · ${word}</span>` + img(mk.cat);
    c.tag = c.type === 'evo' ? `<span translate="no">Signature · ${G.T(G.U.TYPE_NAME[d.type])}</span>` + img(mk.type) + `<span translate="no"> · ${word}</span>` + img(mk.cat) : tag;
  }

  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const list = offer.apply(this, arguments);
    if (on() && pl && pl.mon) list.forEach(c => decorate(c, pl.mon));
    return list;
  };

  // ---------------- the move bar's tooltip box (hud.js drawTip) ----------------
  /** The box's whole type and category line, with each arrow after its word (true: hud.js draws nothing more). */
  function tipLine(ctx, m, pl, x, o) {
    if (!on() || !pl) return false;
    const mk = marks(pl.mon, m);
    if (!mk.type && !mk.cat) return false;
    const tn = G.T(G.U.TYPE_NAME[m.type]);
    ctx.font = F(800, 10);
    const tw = raw(ctx, 'measureText', tn).width + 12;
    ctx.beginPath(); ctx.roundRect(x, o - 11, tw, 15, 4); ctx.fillStyle = G.U.TYPE_COLOR[m.type]; ctx.fill();
    ctx.fillStyle = '#10131a'; ctx.textAlign = 'left'; raw(ctx, 'fillText', tn, x + 6, o);
    // Each arrow at half size, centred on the line.
    const arrowAt = (n, ax) => paint(ctx, n, ax, o - 3.5 - size(n).h / 2).w;
    let cx = x + tw + 3;
    if (mk.type) cx += arrowAt(mk.type, cx) + 3;
    const cn = G.T(m.cat ? G.Stats.NAME[m.cat] : 'Mejora');
    ctx.font = F(700, 10); ctx.fillStyle = '#c9d3e6';
    raw(ctx, 'fillText', cn, cx + 3, o);
    cx += 3 + raw(ctx, 'measureText', cn).width + 3;
    if (mk.cat) arrowAt(mk.cat, cx);
    return true;
  }

  // ---------------- enemy arrows ----------------
  // 'eff:up:x2' -> 'lb-g'. enemy.js asks G.Icons.canvas (for the size) and G.Icons.draw with the same name.
  const effName = n => {
    if (typeof n !== 'string' || !n.startsWith('eff:')) return n;      // in every run
    const t = EFF[n.split(':')[2]];
    return t ? 'lb-' + t : n;
  };
  const canvas = G.Icons.canvas, draw = G.Icons.draw;
  G.Icons.canvas = function (n) { return canvas.call(this, effName(n)); };
  G.Icons.draw = function (ctx, n, ...a) { return draw.call(this, ctx, effName(n), ...a); };

  /**
   * e's arrow (enemy.js hook; true: enemy.js doesn't draw its own). w is the width of its health
   * bar. With a bar (bosses, or already hurt), left of it and centred on it, like the usual one;
   * without a bar, centred above it where the bar will go (or above the healer / shielder / summoner icon).
   */
  function enemyMark(ctx, e, eff, w) {
    const n = effName(eff), s = size(n), bar = e.y - e.bodyH - 10;   // the bar: 3.4 tall
    if (e.boss || e.hp < e.maxHp) paint(ctx, n, e.x - w / 2 - s.w - 1, bar + 1.7 - s.h / 2);
    else paint(ctx, n, e.x - s.w / 2, (SUPPORT[e.behavior] ? e.y - e.bodyH - 18 - 1 : bar + 3.4) - s.h);
    return true;
  }
  const SUPPORT = { healer: 1, shielder: 1, summoner: 1 };   // the ones with an icon above them (enemy.js SUP)

  return { marks, tipLine, effName, enemyMark, NAMES };
})();
