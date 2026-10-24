/* ============ focus-audio.js — sound only in the tab you're looking at (MrSurvivor) ============
 * The game's music and effects (js/core/audio.js, one AudioContext) kept playing in a background tab
 * or behind another window. Here the context is suspended while the page is hidden or doesn't have the
 * focus, and resumed when it gets it back (no click needed: the page was already clicked once).
 * audio.js's sfx() and music scheduler skip a context that isn't running, so nothing piles up to play
 * in a burst on returning, and the music goes on where it stopped.
 * audio.js keeps its context to itself and makes it on the first click (init(), after every script
 * has loaded): it's caught when made, by a subclass of window.AudioContext.
 * Checked by fork/test-focus-audio.cjs.
 */
(() => {
  const name = window.AudioContext ? 'AudioContext' : window.webkitAudioContext ? 'webkitAudioContext' : null;
  if (!name) return;
  const AC = window[name];
  let ctx = null;
  window[name] = class extends AC {
    constructor(o) { super(o); if (!ctx) { ctx = this; sync(); } }
  };

  const active = () => document.visibilityState === 'visible' && document.hasFocus();
  function sync() {
    if (!ctx || ctx.state === 'closed') return;
    if (!active()) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }
    else if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  addEventListener('blur', sync);
  addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);

  G.FocusAudio = { get active() { return active(); } };
})();
