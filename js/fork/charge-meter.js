/* ============ charge-meter.js — aro de carga sobre tu Pokémon (fork MrSurvivor) ============
 * Los ataques de espera larga (remolinos como Viento Aciago, torretas como Fuego Fatuo, y
 * los de carga, Hiperrayo y Rayo Solar) se pasan segundos sin hacer nada entre uno y otro, y
 * la barra de abajo queda lejos de donde miras. Encima de tu Pokémon, un aro pequeño:
 *   - se llena con el color del tipo mientras se recarga;
 *   - lleno y quieto: listo, esperando a un enemigo a su alcance;
 *   - Hiperrayo y Rayo Solar, mientras cargan (antes de que salga el rayo): aro claro que
 *     brilla y se llena en lo que dura la carga;
 *   - al salir el ataque, un destello.
 * Sólo el tuyo (de los compañeros no se sabe la recarga). No toca player.js: envuelve
 * Player.prototype.draw. Prueba: fork/test-moves.cjs.
 */
(() => {
  const KINDS = new Set(['vortex', 'turret', 'charge']);
  const R = 8, FLASH = 0.25;
  // El color del tipo, aclarado: los oscuros (Fantasma, Siniestro...) no se veían sobre el fondo.
  const light = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k)); return `rgb(${c})`; };

  /** Estado del aro para el movimiento m de pl: { st: 'ready'|'charging'|'recharging', frac, flash }. */
  function state(m, pl) {
    const total = Math.max(0.05, m.cd * pl.cdMul), since = total - Math.max(0, m.t);
    const charge = m.kind === 'charge' ? Math.min(m.charge || 0.75, total) : 0;
    // El ataque sale al lanzarlo; los de carga, al acabar la carga.
    const fired = since - charge;
    const flash = fired >= 0 && fired < FLASH ? 1 - fired / FLASH : 0;
    // Listo y sin blanco a su alcance, Combat.tickMove lo deja esperando en 0,05 s.
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
      // fondo y aro tenue
      ctx.globalAlpha = 0.7; ctx.fillStyle = 'rgba(10,14,22,.8)';
      ctx.beginPath(); ctx.arc(x, y, R + 3, 0, 6.2832); ctx.fill();
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.stroke();
      if (s.st === 'charging') {
        // Cargando: claro, con brillo, y el centro latiendo en el color del tipo.
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
        // Destello al salir el ataque: un aro que se abre y se apaga.
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
