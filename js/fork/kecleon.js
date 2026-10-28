/* ============ kecleon.js — the fork's changes to Kecleon's shop (MrSurvivor fork) ============
 * Upstream's shop is js/data/shop.js (G.Shop), js/ui/shop-ui.js (G.ShopUI) and the collection card's
 * Mint / Capsule buttons (js/ui/menu.js monExtras). The owner's picks of 2026-10-28, from a player's and
 * the artist's ideas:
 *   - The random Mint (1,500, always on sale) never gives a neutral nature (Hardy, Docile, Bashful,
 *     Quirky, Serious: they change no stat).
 * Hooks: a capture-phase click on the card's Mint button (upstream's handler doesn't run), and
 * G.Radiant.detail, to catch the card's redraw (the showDetail callback menu.js passes it).
 * English only. Test: fork/test-kecleon-mints.cjs.
 */
G.Kecleon = (() => {
  /** The 20 natures that raise a stat (and lower another). */
  const useful = () => G.NATURES.filter(n => n.up);

  // The collection card on screen and its redraw, caught from what menu.js's showDetail hands G.Radiant.detail.
  let cardDex = null, redraw = null;
  const radiantDetail = G.Radiant.detail;
  G.Radiant.detail = function (dex, again) {
    cardDex = dex; redraw = again;
    return radiantDetail.apply(this, arguments);
  };
  function used(msg) {
    G.DB.commit(); G.Audio.sfx('buy'); G.UI.toast(msg, 2600);
    if (redraw) redraw();
  }

  // The card's random Mint: upstream's rolls any of the other 24 natures, the 5 neutral ones too.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#dex-detail [data-extra="nat"]');
    if (!b || cardDex == null) return;
    e.stopPropagation(); e.preventDefault();
    const dex = cardDex, now = G.Mons.natureOf(dex).id;
    const n = G.U.pick(useful().filter(x => x.id !== now));
    if (!n || !G.Shop.take('mint')) return;
    G.Mons.setNature(dex, n.id);
    used(G.I18n.f('{x} ahora tiene naturaleza {x}', G.DEX_BY[dex].name, G.Mons.name(n.n)));
  }, true);

  G.I18n.add({ 'Cambia al azar la naturaleza de un Pokémon.': 'Changes a Pokémon\'s nature to a random one that raises a stat (never a neutral one).' }, 'en');

  return { useful };
})();
