/* ============ spectate-cut.js — la cámara del caído y los saltos lejanos (MrSurvivor) ============
 * En grupo, caído, la cámara sigue al compañero que miras (G.Game, watched). Dos cosas la hacían
 * cruzar el mapa entero, pintando cada trozo de suelo por el camino (G.Tiles.paintChunk, a mano y
 * sin límite por fotograma): tirones de segundos.
 *   1. G.Camera.follow siempre se deslizaba: al caer, al cambiar de compañero o si el que miras
 *      aparece lejos, viajaba hasta él. Ahora, si el objetivo está a más de ~1,5 pantallas, salta.
 *   2. La grieta (js/systems/rift.js begin/finish) lleva a todos a la arena (~200 000 px), pero la
 *      última posición de red del compañero seguía en el mapa, y netUpdate (js/entities/player.js),
 *      con más de 300 px de diferencia, lo devolvía allí hasta que llegaba la suya: con el anfitrión
 *      caído mirando a un invitado, la cámara iba al mapa y volvía. Ahora, si a un compañero lo ha
 *      movido algo que no es la red (un salto de más de 1000 px) y su posición de red sigue donde
 *      estaba antes del salto, se queda donde lo pusieron hasta que llega una posición suya que ya
 *      ha saltado también (a donde sea: al volver de la grieta cada uno vuelve a su sitio, no al
 *      tuyo), o 3 s. Si su posición de red ya no está donde estaba (saltó antes que tú) o ya está
 *      donde lo pusieron (el principio de una partida), no se retiene: manda la red.
 * Lo comprueba fork/test-coop-spectate.cjs.
 */
(() => {
  // 1. La cámara salta a un objetivo lejano en vez de deslizarse.
  const follow = G.Camera.follow;
  G.Camera.follow = function (tx, ty, dt) {
    const far = 1.5 * Math.max(this.VIEW_W, this.w || 0, this.h || 0);
    if (Math.abs(tx - this.x) > far || Math.abs(ty - this.y) > far) { this.x = tx; this.y = ty; }
    return follow.call(this, tx, ty, dt);
  };

  // 2. Un compañero movido por un salto espera a que su posición de red llegue allí.
  const JUMP = 1000, HOLD = 3;
  const P = G.Player.prototype, netUpdate = P.netUpdate;
  P.netUpdate = function (dt) {
    const n = this.net;
    if (n && this._lx !== undefined && Math.hypot(this.x - this._lx, this.y - this._ly) > JUMP) {
      // Salto local: si la red aún lo tiene en el sitio de antes, se espera a la suya.
      const before = Math.hypot(n.x - this._lx, n.y - this._ly) <= JUMP, there = Math.hypot(n.x - this.x, n.y - this.y) <= JUMP;
      this._hold = before && !there ? { x: n.x, y: n.y, t: HOLD } : null;
    }
    const h = this._hold;
    let res;
    if (h && n && (h.t -= dt) > 0 && Math.hypot(n.x - h.x, n.y - h.y) <= JUMP) {
      // Su dueño aún no ha saltado (o es un mensaje de antes del salto): se queda donde está.
      const nx = n.x, ny = n.y;
      n.x = this.x; n.y = this.y;
      try { res = netUpdate.call(this, dt); } finally { n.x = nx; n.y = ny; }
    } else {
      this._hold = null;
      res = netUpdate.call(this, dt);
    }
    this._lx = this.x; this._ly = this.y;
    return res;
  };
})();
