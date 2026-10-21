/* ============ charge-meter.js — charge ring over your Pokémon (MrSurvivor fork) ============
 * Moves with a long wait (vortexes like Ominous Wind, turrets like Will-O-Wisp, and
 * charge moves, Hyper Beam and Solar Beam) spend seconds doing nothing between uses, and
 * the bar at the bottom is far from where you're looking. Over your Pokémon, a small ring:
 *   - fills with the type color while recharging;
 *   - full and still: ready, waiting for an enemy in range;
 *   - Hyper Beam and Solar Beam, while charging (before the beam fires): a bright ring that
 *     glows and fills over the charge time;
 *   - when the move fires, a flash.
 * Only yours (teammates' cooldowns aren't known). Doesn't touch player.js: wraps
 * Player.prototype.draw. Test: fork/test-moves.cjs.
 */
(() => {
  const KINDS = new Set(['vortex', 'turret', 'charge']);
  const R = 8, FLASH = 0.25;
  // The type color, lightened: the dark ones (Ghost, Dark...) didn't show up against the background.
  const light = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k)); return `rgb(${c})`; };

  /** Ring state for move m of pl: { st: 'ready'|'charging'|'recharging', frac, flash }. */
  function state(m, pl) {
    const total = Math.max(0.05, m.cd * pl.cdMul), since = total - Math.max(0, m.t);
    const charge = m.kind === 'charge' ? Math.min(m.charge || 0.75, total) : 0;
    // The move fires when cast; charge moves fire when the charge ends.
    const fired = since - charge;
    const flash = fired >= 0 && fired < FLASH ? 1 - fired / FLASH : 0;
    // Ready with no target in range: Combat.tickMove keeps it waiting at 0.05 s.
    if (m.t <= 0.051) return { st: 'ready', frac: 1, flash };
    if (since < charge) return { st: 'charging', frac: since / charge, flash: 0 };
    return { st: 'recharging', frac: G.U.clamp(since / total, 0, 1), flash };
  }

  function draw(ctx, pl) {
    if (pl.dead || pl.remote || pl !== G.Game.player) return;
    const ms = pl.activeGroup().filter(m => KINDS.has(m.kind));
    if (!ms.length) return;
    const calm = G.Settings.get('calm'), now = performance.now() / 1000;
    ms.forEach((m, i) => {
      const s = state(m, pl), col = G.U.TYPE_COLOR[m.type], lit = light(col, 0.4);
      const x = pl.x + (i - (ms.length - 1) / 2) * (R * 2 + 7), y = pl.y - pl.bodyH - 16;
      const top = -Math.PI / 2;
      ctx.save();
      ctx.lineCap = 'round';
      // background and faint ring
      ctx.globalAlpha = 0.7; ctx.fillStyle = 'rgba(10,14,22,.8)';
      ctx.beginPath(); ctx.arc(x, y, R + 3, 0, 6.2832); ctx.fill();
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.stroke();
      if (s.st === 'charging') {
        // Charging: bright, glowing, and the center pulsing in the type color.
        const pulse = calm ? 0.8 : 0.6 + 0.4 * Math.sin(now * 30);
        ctx.globalAlpha = 0.6 * pulse; ctx.fillStyle = lit;
        ctx.beginPath(); ctx.arc(x, y, R - 2, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = 3;
        ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x, y, R, top, top + s.frac * 6.2832); ctx.stroke();
      } else {
        ctx.globalAlpha = 1; ctx.strokeStyle = lit;
        ctx.beginPath(); ctx.arc(x, y, R, top, top + s.frac * 6.2832); ctx.stroke();
        if (s.st === 'ready') { ctx.fillStyle = lit; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.2832); ctx.fill(); }
      }
      if (s.flash > 0) {
        // Flash when the move fires: a ring that widens and fades.
        ctx.shadowBlur = 0;
        ctx.globalAlpha = s.flash; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, R + (1 - s.flash) * 9, 0, 6.2832); ctx.stroke();
      }
      ctx.restore();
    });
  }

  const P = G.Player.prototype, base = P.draw;
  P.draw = function (ctx) { base.apply(this, arguments); draw(ctx, this); };

  G.ChargeMeter = { KINDS, state };
})();
