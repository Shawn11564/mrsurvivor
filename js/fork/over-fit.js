/* ============ over-fit.js — the run's end screen fits the screen (MrSurvivor fork) ============
 * The end box (#scr-over, js/ui/run-ui.js showOver, plus what death-cause.js and run-stats.js add)
 * was a 480 px column: a long run (what knocked you out, Arceus, coins, tickets, the moves table,
 * shinies, the record) was about 1.4 times the screen's height, so it scrolled on any monitor. Now:
 *   wide    with room (900 px; ui-scale.js always leaves 1400 when it zooms), the box is wider and the
 *           small tiles go four to a row; the Arceus, coins, tickets and old-style moves rows go two
 *           to a row (the last one alone takes the full row).
 *   fit     wide too: if it still doesn't fit, the box is zoomed down until it does, never under MIN
 *           (then it scrolls); again on resize. Phones keep upstream's layout and scroll as before: their
 *           text would get too small.
 * Wraps G.RunUI.showOver outside death-cause.js and lab.js (loads after them).
 * Test: fork/test-over-fit.cjs.
 */
(() => {
  const MIN = 0.7, WIDE = '(min-width: 900px)';
  const css = document.createElement('style');
  css.textContent = `
@media ${WIDE} {
  #scr-over > .box { width: min(980px, 100%) !important; }
  #over-stats { grid-template-columns: repeat(4, 1fr); }
  #over-stats > .over-half { grid-column: span 2 !important; }
}`;
  document.head.appendChild(css);

  const box = () => document.querySelector('#scr-over > .box');
  // The rows that take the full width but don't need it: not the table, the shinies, the record,
  // what knocked you out, the support note or a .lab-over note.
  function halves() {
    const rows = [...document.getElementById('over-stats').children].filter(el =>
      /1\s*\/\s*-1/.test(el.style.gridColumn) && !el.querySelector('table, .caught-row') &&
      !el.matches('.death-cause, .caught, .support-ask, .lab-over') && el.style.textAlign !== 'center');
    rows.forEach((el, i) => el.classList.toggle('over-half', i < rows.length - (rows.length % 2)));
  }
  function fit() {
    const b = box();
    if (!b || !G.UI.isOpen('scr-over')) return;
    b.dataset.fit = 'own';                                   // not ui-scale's squeeze (it stops at 0.8)
    if (matchMedia(WIDE).matches) G.UIScale.squeeze(b, MIN); else b.style.zoom = '';
  }

  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function () {
    const res = showOver.apply(this, arguments);
    halves();
    fit();
    return res;
  };
  addEventListener('resize', () => requestAnimationFrame(fit));
  G.OverFit = { fit, MIN };
})();
