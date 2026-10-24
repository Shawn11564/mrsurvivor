/* ============ pick-chain.js — no pick delay right after another reward (MrSurvivor) ============
 * Reward cards (level-up, item, bond) can't be picked for 1 s after they show (js/ui/run-ui.js GUARD), so a
 * key pressed mid-fight doesn't pick one by accident. When one opens less than 3 s of play after the last
 * reward closed (several levels at once, an item right after a level-up), you're already picking, not
 * fighting: no guard (a one-line hook at the top of run-ui.js guard()). Measured on the run's clock
 * (G.Game.st.time), which stands still while cards are open and during the count-in after a long pick
 * (game.js countInAfter), so the level queued behind a slow pick opens without the guard too.
 * A close is seen on the screens' class (hidden), with the records read at once when guard() asks, so a
 * popup closed and reopened in the same click counts too. Checked by fork/test-pick-guard.cjs.
 */
G.PickChain = (() => {
  const RECENT = 3;                                  // seconds of play
  const SCREENS = ['scr-levelup', 'scr-item', 'scr-bond'];
  const hidden = cls => /(^|\s)hidden(\s|$)/.test(cls || '');
  // The run's clock (seconds of play), or the page's outside a run; a close counts in the run it was in
  // (each run starts its clock at 0 with a new player).
  const clock = () => (G.Game && G.Game.state !== 'ui' && G.Game.st ? G.Game.st.time : performance.now() / 1000);
  const run = () => (G.Game && G.Game.player) || null;
  let closedAt = -Infinity, closedIn = null;
  const watch = [];
  // Each record holds the class before its change: shown, then hidden after it (the next record's
  // "before", or the class now) is a close.
  function read(el, records) {
    if (!records.length) return;
    const states = records.map(r => hidden(r.oldValue)).concat(hidden(el.className));
    for (let i = 0; i + 1 < states.length; i++) if (!states[i] && states[i + 1]) { closedAt = clock(); closedIn = run(); }
  }
  for (const id of SCREENS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const mo = new MutationObserver(rs => read(el, rs));
    mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    watch.push([el, mo]);
  }
  function skip() {
    for (const [el, mo] of watch) read(el, mo.takeRecords());
    return closedIn === run() && clock() - closedAt < RECENT;
  }
  return { RECENT, skip };
})();
