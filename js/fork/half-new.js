/* ============ half-new.js — half of the Legendaries are new ones (MrSurvivor fork, Lab first) ============
 * With the Lab setting on, when a Legendary comes up, half the time it's one you don't have
 * yet (while that banner has any left); the other half, any of them, as always. One-line hook
 * in js/systems/gacha.js (G.GachaPick, when it picks the Pokémon for the rarity that came up).
 * Test: fork/test-half-new.cjs.
 */
G.GachaPick = (list, rarity, save) => {
  if (rarity !== 5 || !G.Settings.get('lab') || !save || Math.random() >= 0.5) return null;
  const fresh = list.filter(p => !(save.owned && save.owned[p.dex]));
  return fresh.length ? G.U.pick(fresh) : null;
};
// The note in the gacha (with Lab on), like rainbow.js: after the gacha paints its own.
if (G.PityBar) {
  const draw = G.PityBar.draw;
  G.PityBar.draw = function () {
    const r = draw.apply(this, arguments);
    Promise.resolve().then(() => {
      const note = document.getElementById('gacha-rates') && document.getElementById('gacha-rates').querySelector('.note');
      if (note && G.Settings.get('lab') && !note.querySelector('.nhalf')) note.insertAdjacentHTML('beforeend', '<br><span class="nhalf" translate="no">· Lab: half of the Legendaries you pull are ones you don\'t have yet (while the banner still has some).</span>');
    });
    return r;
  };
}
