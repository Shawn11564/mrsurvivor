/* ============ wheel-moves.js — the mouse wheel switches moves (MrSurvivor fork) ============
 * In a run, over the game: wheel down = the next move slot, up = the previous one (Player.cycle, like
 * E and Q), wrapping round. A mouse notch is one step; a trackpad's small steps add up to one
 * (STEP px) so a light swipe doesn't race through the slots. Only while playing: paused, on the
 * level-up screen or in a menu the wheel scrolls those as usual. Test: fork/test-wheel.cjs.
 */
(() => {
  const STEP = 40;                                  // px of wheel per step (a mouse notch is ~100)
  let acc = 0;
  addEventListener('wheel', e => {
    const pl = G.Game && G.Game.player;
    if (!pl || G.Game.state !== 'playing' || pl.dead || e.ctrlKey) { acc = 0; return; }   // ctrl: zoom
    if (e.target !== document.getElementById('game')) return;                          // over a panel: not ours
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (Math.sign(dy) !== Math.sign(acc)) acc = 0;  // turned the other way: start over
    acc += dy;
    if (Math.abs(acc) < STEP) return;
    pl.cycle(acc > 0 ? 1 : -1);
    acc = 0;
  }, { passive: false });
  // The controls hint at the start of a run (hud.js) mentions it.
  G.I18n.add({ 'WASD moverse · 1-4 / Q / E o clic en un ataque para cambiarlo · Esc pausa': 'WASD move · 1-4 / Q / E / mouse wheel or click a move to switch · Esc pause' }, 'en');
})();
