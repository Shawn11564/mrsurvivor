/* ============ boss-bars.js — one health bar per nearby boss (MrSurvivor fork) ============
 * Upstream's HUD showed the bar of the first living boss in the enemy list, wherever it was. Late
 * runs often have several, so now every boss within RANGE of the camera's centre (you, or the
 * teammate you're watching while down) gets its own bar under the clock, nearest first, at most
 * MAX; past that a "+N MORE" line. Bosses further away don't show, so the stack stays short. A
 * boss off screen has a dimmer bar.
 * Hooks: js/ui/hud.js draws them (G.BossBars.draw) and moves the rift timer under them, and
 * js/systems/judgment.js its counter (G.BossBars.below). Test: fork/test-boss-bars.cjs.
 */
G.BossBars = (() => {
  const RANGE = 1100;            // world px: ~1.4 screen widths (the view is 768 wide, camera.js)
  const MAX = 4;
  const TOP = 70, H = 12, STEP = 17;
  let shown = 0, more = 0;        // what the last draw showed (below() uses it)

  /** The living bosses within RANGE of the camera, nearest first. */
  function near() {
    const cam = G.Camera, out = [];
    for (const e of G.EnemyMgr.all()) {
      if (!e.boss || e.dead) continue;
      const d = Math.hypot(e.x - cam.x, e.y - cam.y);
      if (d <= RANGE) out.push({ e, d });
    }
    return out.sort((a, b) => a.d - b.d).map(o => o.e);
  }

  /** The bars, under the clock. bar(ctx, x, y, w, h, frac, col) and F(weight, size) are hud.js's. */
  function draw(ctx, w, F, bar) {
    const list = near();
    shown = Math.min(list.length, MAX); more = list.length - shown;
    const bw = Math.min(420, w - 80), cam = G.Camera;
    ctx.textAlign = 'center';
    for (let i = 0; i < shown; i++) {
      const e = list[i], y = TOP + i * STEP;
      ctx.globalAlpha = !cam.sees(e.x, e.y, 0) ? 0.7 : 1;
      bar(ctx, (w - bw) / 2, y, bw, H, e.hp / e.maxHp, '#ffcb3d');
      ctx.font = F(800, 10);
      ctx.fillStyle = '#20160a';
      ctx.fillText(e.name.toUpperCase(), w / 2, y + 10);
    }
    ctx.globalAlpha = 1;
    if (more) {
      ctx.font = F(800, 10);
      ctx.fillStyle = '#ffcb3d';
      ctx.fillText('+' + more + ' MORE', w / 2, TOP + shown * STEP + 9);
    }
    return shown;
  }

  /** Where text under the bars goes: `y` with no bars (upstream's 76), else under the last one. */
  function below(y) {
    return shown ? y + 22 + (shown - 1) * STEP + (more ? 13 : 0) : y;
  }

  return { RANGE, MAX, near, draw, below, get shown() { return shown; }, get more() { return more; } };
})();
