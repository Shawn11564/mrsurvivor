/* ============ evo-hud.js — cuánto falta para evolucionar, en pantalla (Lab, fork MrSurvivor) ============
 * En una partida Lab, si tu Pokémon puede evolucionar en ella (G.LabGrowth.targets, js/fork/lab/growth.js),
 * arriba a la izquierda, debajo de la vida (y de los buffs, si hay): la cara de su evolución, su
 * nombre, "Lv N" (el nivel al que sale la carta de evolución) y una barra dorada del nivel en el
 * que empezó esta forma (1, o el nivel al que evolucionó) hasta ese, contando la experiencia que
 * llevas del nivel actual. Con varias evoluciones (Eevee), la más temprana y "+N more".
 * Al llegar al nivel, la barra se llena y parpadea ("Evolution ready!"): la carta sale en cada
 * subida hasta que la eliges o eliges la Piedra Eterna; con la Piedra Eterna (o sin evolución)
 * no se enseña nada. Sólo tu Pokémon. Textos sólo en inglés, como el resto del Lab.
 * Prueba: fork/test-evo-hud.cjs.
 */
G.LabEvoHud = (() => {
  const GOLD = '#ffd23f', W = 216, FACE = 22;
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;

  /** Lo que se enseña para pl, o null: { to, more, at, base, p (0-1), ready }. */
  function state(pl) {
    if (!pl || !pl.mon || pl._labStay || !G.Lab.active || pl !== G.Game.player) return null;
    const t = G.LabGrowth.targets(pl.dex).sort((a, b) => a[1] - b[1]);
    if (!t.length) return null;
    // El nivel en el que empezó esta forma: 1, o el de su última evolución en la partida.
    if (pl._evoDex !== pl.dex) { pl._evoBase = pl._evoDex === undefined ? 1 : pl.level; pl._evoDex = pl.dex; }
    const at = t[0][1], base = Math.min(pl._evoBase, at - 1);
    const p = G.U.clamp((pl.level - base + G.U.clamp(pl.xp / pl.xpNext, 0, 1)) / (at - base), 0, 1);
    return { to: t[0][0], more: t.length - 1, at, base, p: pl.level >= at ? 1 : p, ready: pl.level >= at };
  }

  function face(ctx, dex, x, y) {
    const m = G.SPRITE_META[dex], g = m && (m.a.Idle || Object.values(m.a)[0]);
    const s = g && G.Sprites.sheet(dex, m.a.Idle ? 'Idle' : Object.keys(m.a)[0]);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x, y, FACE, FACE);
    if (!s || !s.ready) { G.Sprites.preload([dex]); return; }
    const k = Math.min(FACE / g.w, FACE / g.h) * 1.15, dw = g.w * k, dh = g.h * k;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, FACE, FACE); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.img, 0, 0, g.w, g.h, x + (FACE - dw) / 2, y + (FACE - dh) / 2 + 2, dw, dh);
    ctx.restore();
  }

  function draw(ctx, pl) {
    const e = state(pl);
    if (!e) return;
    const sa = G.Touch.safeArea(), px = 16 + sa.left, py = 20 + sa.top;
    const buffs = Object.values(pl.buffs || {}).some(b => b.n > 0);
    const y = py + 34 + (buffs ? 19 : 0), x = px + FACE + 6, bw = W - FACE - 6;
    const pulse = e.ready ? 0.55 + 0.45 * Math.sin(performance.now() / 160) : 1;
    ctx.save();
    // Fondo oscuro, como el del clima: que se lea encima de la hierba.
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px - 3, y - 3, W + 6, FACE + 6, 6); else ctx.rect(px - 3, y - 3, W + 6, FACE + 6);
    ctx.fill();
    face(ctx, e.to, px, y);
    ctx.textBaseline = 'alphabetic';
    // Derecha: el nivel (o READY); izquierda: a qué evoluciona, sin pisar lo de la derecha.
    const right = e.ready ? 'READY' : 'Lv ' + e.at;
    ctx.font = F(800, 9);
    const rw = ctx.measureText(right).width;
    ctx.font = F(800, 10);
    let left = (e.ready ? '' : '→ ') + G.DEX_BY[e.to].name + (e.more ? ` +${e.more} more` : '');
    if (ctx.measureText(left).width > bw - rw - 6) left = (e.ready ? '' : '→ ') + G.DEX_BY[e.to].name;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(left, x, y + 9);
    ctx.fillStyle = e.ready ? `rgba(255,210,63,${pulse})` : '#eaf2ff';
    ctx.fillText(left, x, y + 9);
    ctx.textAlign = 'right';
    ctx.font = F(800, 9);
    ctx.strokeText(right, x + bw, y + 9);
    ctx.fillStyle = e.ready ? `rgba(255,210,63,${pulse})` : GOLD;
    ctx.fillText(right, x + bw, y + 9);
    // La barra: del nivel en que empezó esta forma al de la evolución.
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(x, y + 14, bw, 6);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y + 14, Math.round(bw * e.p), 6);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  const hudDraw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    const r = hudDraw.apply(this, arguments);
    try { draw(ctx, pl); } catch (e) { /* nunca romper el HUD */ }
    return r;
  };

  return { state };
})();
