/* ============ bond-skip.js — "Keep them apart" on the bond screen (MrSurvivor fork) ============
 * A bond (js/ui/run-ui.js showBond) can be turned down: the "Keep them apart" button spends it without
 * joining any moves and gives +10 % damage to every move for the rest of the run (pl.atkMul, which
 * Lab's resume keeps; several stack: ×1.21, ×1.331...). Per player, so co-op needs nothing more: the
 * screen closes as after a pick and game.js offerBond's callback, given null, just carries on.
 * The button waits out the cards' 1 s guard like they do. Test: fork/test-bond-skip.cjs.
 */
G.BondSkip = (() => {
  const K = 1.1, LABEL = 'Keep them apart (+10% damage)';
  const showBond = G.RunUI.showBond;

  function skip(cb) {
    const pl = G.Game.player, cards = document.getElementById('bond-cards');
    if (!pl || !G.UI.isOpen('scr-bond') || (cards && cards.classList.contains('guard'))) return;
    pl.bonds = Math.max(0, pl.bonds - 1);
    pl.atkMul *= K;
    pl.bondsKept = (pl.bondsKept || 0) + 1;
    G.UI.hide('scr-bond');
    G.Audio.sfx('confirm');
    G.FX.ring(pl.x, pl.y, 8, 110, '#ffd23f', 0.6, 5);
    G.Spawner.say('Kept apart: +10% damage to every move', 2.6, true);
    cb(null);
  }

  G.RunUI.showBond = function (opt, cb) {
    const r = showBond.apply(this, arguments);
    let b = document.getElementById('bond-skip');
    if (!b) {
      const row = document.getElementById('bond-back').parentElement;
      b = document.createElement('button');
      b.id = 'bond-skip'; b.className = 'btn'; b.type = 'button';
      b.setAttribute('translate', 'no');
      b.dataset.sfx = 'none';
      b.textContent = LABEL;
      row.appendChild(b);
    }
    b.onclick = () => skip(cb);
    return r;
  };
  G.I18n.add({ [LABEL]: LABEL, 'Kept apart: +10% damage to every move': 'Kept apart: +10% damage to every move' }, 'en');
  return { K, skip };
})();
