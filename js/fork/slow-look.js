/* ============ slow-look.js — slowing shows (MrSurvivor fork) ============
 * 1. Bola Neblina (Mist Ball) slowed by 30 % for 1.2 s, with nothing to see: it looked like it did nothing.
 *    Now 40 % for 2 s (`slowDur`, a fork field for any move).
 * 2. `slowDur`: Combat applies a hit's slow with Enemy.applySlow(m.slow), always 1.2 s.
 *    G.RunStats.tag(e, m) runs just before, in that same hit (js/systems/combat.js hit and resolve),
 *    so here the move's slowDur is noted and applySlow uses it. A guest sends it
 *    to the host with the duration (G.Coop.status, an optional fifth field in js/net/coop.js).
 * 3. A slowed enemy wears an ice-blue ring at its feet (like the burn and poison
 *    disc), on the guests' screens too (status bit 8 in coop.js).
 * Test: fork/test-slow-look.cjs.
 */
(() => {
  const mb = G.Moves.BY_ID['mist-ball'];
  if (mb) { mb.slow = 0.4; mb.slowDur = 2; }

  let next = 0;                        // slowDur of the hit being applied
  const tag = G.RunStats.tag;
  G.RunStats.tag = function (e, m) { next = (m && m.slowDur) || 0; return tag.apply(this, arguments); };

  const E = G.Enemy.prototype, applySlow = E.applySlow;
  E.applySlow = function (factor, dur) {
    const d = dur === undefined && next ? next : dur;
    next = 0;
    if (this.remote) { G.Coop.status(this, 's', factor, d); return; }
    return applySlow.call(this, factor, d);
  };

  const draw = E.draw;
  E.draw = function (ctx) {
    const r = draw.apply(this, arguments);
    if (this.dead || !(this.slow > 0 || (this.net && this.net.st & 8))) return r;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(t * 6 + this.x) * 0.15;
    ctx.strokeStyle = '#9fe4ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.25, this.r * 0.52, 0, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#9fe4ff';
    ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.25, this.r * 0.52, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    return r;
  };
})();
