/* ============ slow-look.js — frenar se nota (fork MrSurvivor) ============
 * 1. Bola Neblina frenaba un 30 % durante 1,2 s, sin que se viera: parecía que no hacía nada.
 *    Ahora un 40 % durante 2 s (`slowDur`, un campo del fork para cualquier movimiento).
 * 2. `slowDur`: Combat aplica el frenado de un golpe con Enemy.applySlow(m.slow), siempre 1,2 s.
 *    G.RunStats.tag(e, m) va justo antes en ese mismo golpe (js/systems/combat.js hit y resolve),
 *    así que aquí se apunta el slowDur de ese movimiento y applySlow lo usa. Un invitado lo manda
 *    al anfitrión con la duración (G.Coop.status, un quinto campo opcional en js/net/coop.js).
 * 3. Un enemigo frenado lleva un anillo azul hielo a los pies (como el disco de quemado y
 *    envenenado), también en la pantalla de los invitados (el bit 8 de estado de coop.js).
 * Prueba: fork/test-slow-look.cjs.
 */
(() => {
  const mb = G.Moves.BY_ID['mist-ball'];
  if (mb) { mb.slow = 0.4; mb.slowDur = 2; }

  let next = 0;                        // slowDur del golpe que se está aplicando
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
