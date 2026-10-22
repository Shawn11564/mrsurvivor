/* ============ hp-above.js — your HP bar above your Pokémon (MrSurvivor fork) ============
 * Your HP used to be a bar with "HP / max" in the top left. Now it's a green bar just above your
 * Pokémon, drawn with it in the world so it follows you (enemies' bars are thin and red); hidden
 * while you're down. The top left keeps your name and level and, in co-op, the list of
 * teammates with their HP (js/ui/hud.js drawCoop).
 * Hooks: Player.prototype.draw (yours only, after it) and G.HUD.hpAbove (a two-line hook in hud.js
 * skips its bar and numbers). The Revive card's heart (js/fork/lab/revive-card.js) moved to where the
 * bar started. Test: fork/test-hp-above.cjs.
 */
G.HpAbove = (() => {
  const W = 34, H = 4.5, GAP = 5;                  // world px; GAP: between its head and the bar
  /** The bar's rectangle (world px) over pl. */
  const box = pl => ({ x: pl.x - W / 2, y: pl.y - pl.bodyH - GAP - H, w: W, h: H });

  const P = G.Player.prototype, draw = P.draw;
  P.draw = function (ctx) {
    const r = draw.apply(this, arguments);
    if (this !== G.Game.player || this.remote || this.dead || G.Game.state === 'ui') return r;
    const b = box(this), f = G.U.clamp(this.hp / this.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    ctx.fillStyle = '#5fe08a';
    ctx.fillRect(b.x, b.y, b.w * f, b.h);
    ctx.restore();
    return r;
  };
  G.HUD.hpAbove = true;

  return { box };
})();
