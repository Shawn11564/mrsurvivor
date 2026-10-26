/* ============ evo-hud.js — how far you are from evolving, on screen (MrSurvivor fork) ============
 * In a run, if your Pokémon can evolve in it (G.LabGrowth.targets, js/fork/lab/growth.js),
 * top left, right under the HP and before the buffs and the altar power (which
 * move down to make room: G.HUD.belowHp, js/ui/hud.js): its evolution's face, its
 * name, "Lv. N" (the level where the evolution card comes up) and a gold bar from the level where
 * this form started (1, or the level it evolved at) up to that one, counting the experience
 * you have in the current level. With several evolutions (Eevee), the earliest one and "+N more".
 * On reaching the level, the bar fills and blinks ("Evolution ready!"): the card comes up on every
 * level-up until you pick it or pick the Everstone; with the Everstone (or no evolution)
 * nothing is shown. Only your Pokémon. Texts in English only, in English.
 * Test: fork/test-evo-hud.cjs.
 */
G.LabEvoHud = (() => {
  const GOLD = '#ffd23f', W = 216, FACE = 22;
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;

  /** What is shown for pl, or null: { to, more, at, base, p (0-1), ready }. */
  function state(pl) {
    if (!pl || !pl.mon || pl._labStay || !G.Lab.active || pl !== G.Game.player) return null;
    const t = G.LabGrowth.targets(pl.dex).sort((a, b) => a[1] - b[1]);
    if (!t.length) return null;
    // The level this form started at: 1, or the level of its last evolution in the run (noted by
    // growth.js evolveTo when it evolves: a level gained before the next frame used to move it).
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

  /** Draws it at (px, y) and returns the height it takes (0 if there's nothing), so what's below moves down. */
  function draw(ctx, pl, px, y) {
    const e = state(pl);
    if (!e) return 0;
    const x = px + FACE + 6, bw = W - FACE - 6;
    const pulse = e.ready ? 0.55 + 0.45 * Math.sin(performance.now() / 160) : 1;
    ctx.save();
    // Dark background, like the weather's: so it reads on top of the grass.
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px - 3, y - 3, W + 6, FACE + 6, 6); else ctx.rect(px - 3, y - 3, W + 6, FACE + 6);
    ctx.fill();
    face(ctx, e.to, px, y);
    ctx.textBaseline = 'alphabetic';
    // Right: the level (or READY); left: what it evolves into, without overlapping the right side.
    const right = e.ready ? 'READY' : 'Lv. ' + e.at;
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
    // The bar: from the level this form started at to the evolution's level.
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(x, y + 14, bw, 6);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y + 14, Math.round(bw * e.p), 6);
    ctx.globalAlpha = 1;
    ctx.restore();
    return FACE + 8;
  }

  G.HUD.belowHp = (ctx, pl, px, y) => {
    try { return draw(ctx, pl, px, y); } catch (e) { return 0; }   // never break the HUD
  };

  return { state };
})();
