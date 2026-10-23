/* ============ bond-skip.js — "Keep them apart" on the bond screen (MrSurvivor fork) ============
 * A bond (js/ui/run-ui.js showBond) can be turned down: the "Keep them apart" button spends it without
 * joining any moves and gives +2.5 % damage to every move for the rest of the run (pl.atkMul, which
 * Lab's resume keeps; several stack: ×1.050625...), the first MAX times in a run (pl.bondsKept counts
 * them; was +10 % with no limit until 2026-10-23). After that the button still keeps them apart, with no
 * bonus, and says so. Per player, so co-op needs nothing more: the
 * screen closes as after a pick and game.js offerBond's callback, given null, just carries on.
 * The button waits out the cards' 1 s guard like they do. Test: fork/test-bond-skip.cjs.
 */
G.BondSkip = (() => {
  const K = 1.025, MAX = 5;
  const left = pl => Math.max(0, MAX - ((pl && pl.bondsKept) || 0));
  const label = pl => left(pl) ? `Keep them apart (+2.5% damage, ${left(pl)} of ${MAX} left)` : 'Keep them apart (no bonus left)';
  const showBond = G.RunUI.showBond;

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
    let b = document.getElementById('bond-skip');
    if (!b) {
      const row = document.getElementById('bond-back').parentElement;
      b = document.createElement('button');
      b.id = 'bond-skip'; b.className = 'btn'; b.type = 'button';
      b.setAttribute('translate', 'no');
      b.dataset.sfx = 'none';
      row.appendChild(b);
    }
    b.textContent = label(G.Game.player);
    b.onclick = () => skip(cb);
    return r;
  };
  G.I18n.add({ 'Kept apart: +2.5% damage to every move': 'Kept apart: +2.5% damage to every move', 'Kept apart': 'Kept apart' }, 'en');
  return { K, MAX, skip };
})();
