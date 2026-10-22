/* ============ spectate-cut.js — the downed player's camera and long jumps (MrSurvivor) ============
 * In a group, while you're down, the camera follows the teammate you're watching (G.Game, watched). Two
 * things made it cross the whole map, painting every ground chunk on the way (G.Tiles.paintChunk, by hand
 * and with no per-frame limit): stutters lasting seconds.
 *   1. G.Camera.follow always slid: on going down, on switching teammate, or if the one you watch
 *      shows up far away, it travelled to them. Now, if the target is more than ~1.5 screens away, it jumps.
 *   2. The rift (js/systems/rift.js begin/finish) takes everyone to the arena (~200 000 px), but the
 *      teammate's last network position was still on the map, and netUpdate (js/entities/player.js),
 *      with more than 300 px of difference, sent them back there until their own position arrived: with
 *      the host down and watching a guest, the camera went to the map and back. Now, if a teammate was
 *      moved by something other than the network (a jump of more than 1000 px) and their network position
 *      is still where it was before the jump, they stay where they were put until a position of theirs
 *      arrives that has jumped too (to anywhere: coming back from the rift each player returns to their own
 *      spot, not yours), or 3 s. If their network position is no longer where it was (they jumped before
 *      you) or is already where they were put (the start of a run), they aren't held: the network rules.
 *   3. Going down cuts straight to a teammate still standing. Upstream's spectating (game.js watched,
 *      2026-10-21) starts on your own body and you pick a teammate with Q/E; here it picks the first
 *      one for you, as the fork's own spectating did before upstream had one.
 * Checked by fork/test-coop-spectate.cjs and fork/test-coop.cjs.
 */
(() => {
  // 1. The camera jumps to a far target instead of sliding.
  const follow = G.Camera.follow;
  let wasDown = false;
  G.Camera.follow = function (tx, ty, dt) {
    const far = 1.5 * Math.max(this.VIEW_W, this.w || 0, this.h || 0);
    if (Math.abs(tx - this.x) > far || Math.abs(ty - this.y) > far) { this.x = tx; this.y = ty; }
    // 3. Just gone down: watch the first teammate still standing (the camera follows them from the next frame).
    const pl = G.Game.player, down = !!(pl && pl.dead && G.Coop.active && G.Game.state === 'playing');
    if (down && !wasDown && !G.Game.watching) G.Game.cycleWatch(1);
    wasDown = down;
    return follow.call(this, tx, ty, dt);
  };

  // 2. A teammate moved by a jump waits for their network position to get there.
  const JUMP = 1000, HOLD = 3;
  const P = G.Player.prototype, netUpdate = P.netUpdate;
  P.netUpdate = function (dt) {
    const n = this.net;
    if (n && this._lx !== undefined && Math.hypot(this.x - this._lx, this.y - this._ly) > JUMP) {
      // Local jump: if the network still has them at the old spot, wait for their own position.
      const before = Math.hypot(n.x - this._lx, n.y - this._ly) <= JUMP, there = Math.hypot(n.x - this.x, n.y - this.y) <= JUMP;
      this._hold = before && !there ? { x: n.x, y: n.y, t: HOLD } : null;
    }
    const h = this._hold;
    let res;
    if (h && n && (h.t -= dt) > 0 && Math.hypot(n.x - h.x, n.y - h.y) <= JUMP) {
      // Their owner hasn't jumped yet (or this is a message from before the jump): they stay where they are.
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
