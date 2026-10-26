/* ============ bond-skip.js — "Keep them apart" on the bond screen (MrSurvivor fork) ============
 * A bond (js/ui/run-ui.js showBond) can be turned down: the "Keep them apart" button spends it without
 * joining any moves and gives +2.5 % damage to every move for the rest of the run (pl.atkMul, which
 * js/fork/lab/resume.js keeps; several stack: ×1.050625...), the first MAX times in a run (pl.bondsKept counts
 * them; was +10 % with no limit until 2026-10-23). After that the button still keeps them apart, with no
 * bonus, and says so. Per player, so co-op needs nothing more: the
 * screen closes as after a pick and game.js offerBond's callback, given null, just carries on.
 * The button waits out the cards' 1 s guard like they do. It's a card the shape and size of the move
 * cards, under them (in its own .cards box, since renderBond empties #bond-cards on every step), in the
 * blue of a button, with a hotkey: the number after the last move card (it follows the step's cards).
 * Test: fork/test-bond-skip.cjs.
 */
G.BondSkip = (() => {
  const K = 1.025, MAX = 5;
  const left = pl => Math.max(0, MAX - ((pl && pl.bondsKept) || 0));
  const detail = pl => left(pl) ? `+2.5% damage, ${left(pl)} of ${MAX} left` : 'no bonus left';
  const showBond = G.RunUI.showBond;
  const $ = id => document.getElementById(id);
  /** Its hotkey: the next number after the move cards. */
  const hotkey = () => $('bond-cards').querySelectorAll('.card').length + 1;
  /** As tall as the shortest move card on screen (theirs vary with their text). */
  function fit() {
    const b = $('bond-skip');
    if (!b) return;
    b.style.minHeight = '';
    // (offsetHeight: the layout's, without the screen's opening zoom.)
    const hs = [...$('bond-cards').querySelectorAll('.card')].map(c => c.offsetHeight).filter(h => h > 0);
    if (hs.length) b.style.minHeight = Math.min(...hs) + 'px';
  }

  function skip(cb) {
    const pl = G.Game.player, cards = document.getElementById('bond-cards');
    if (!pl || !G.UI.isOpen('scr-bond') || (cards && cards.classList.contains('guard'))) return;
    pl.bonds = Math.max(0, pl.bonds - 1);
    const bonus = left(pl) > 0;
    if (bonus) pl.atkMul *= K;
    pl.bondsKept = (pl.bondsKept || 0) + 1;
    G.UI.hide('scr-bond');
    G.Audio.sfx('confirm');
    if (bonus) G.FX.ring(pl.x, pl.y, 8, 110, '#ffd23f', 0.6, 5);
    G.Spawner.say(bonus ? 'Kept apart: +2.5% damage to every move' : 'Kept apart', 2.6, true);
    cb(null);
  }

  G.RunUI.showBond = function (opt, cb) {
    const r = showBond.apply(this, arguments);
    let b = $('bond-skip');
    if (!b) {
      const cards = $('bond-cards'), box = document.createElement('div');
      box.id = 'bond-skip-box'; box.className = 'cards';
      b = document.createElement('div');
      b.id = 'bond-skip'; b.className = 'card bond-skip';
      b.setAttribute('role', 'button');
      b.setAttribute('translate', 'no');
      b.dataset.sfx = 'none';
      box.appendChild(b);
      cards.after(box);
      // The number and the guard's dimming follow the move cards (a pair's second step has one fewer).
      new MutationObserver(() => {
        const k = b.querySelector('.key');
        if (k) k.textContent = hotkey();
        box.classList.toggle('guard', cards.classList.contains('guard'));
        fit();
      }).observe(cards, { childList: true, attributes: true, attributeFilter: ['class'] });
      addEventListener('resize', () => { if (G.UI.isOpen('scr-bond')) fit(); });
      addEventListener('keydown', e => {
        if (e.repeat || !G.UI.isOpen('scr-bond')) return;
        const n = hotkey();
        if (e.code === 'Digit' + n || e.code === 'Numpad' + n) b.click();
      });
    }
    b.innerHTML = `<div class="ico">${G.Icons.html('fist', 32)}</div>
      <div class="txt"><div class="nm">Keep them apart</div><div class="ds">${detail(G.Game.player)}</div></div>
      <div class="key">${hotkey()}</div>`;
    $('bond-skip-box').classList.toggle('guard', $('bond-cards').classList.contains('guard'));
    fit();
    b.onclick = () => skip(cb);
    return r;
  };
  G.I18n.add({ 'Kept apart: +2.5% damage to every move': 'Kept apart: +2.5% damage to every move', 'Kept apart': 'Kept apart' }, 'en');
  return { K, MAX, skip };
})();
