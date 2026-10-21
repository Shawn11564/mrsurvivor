/* ============ half-new.js — la mitad de las Legendarias, nuevas (fork MrSurvivor, Lab primero) ============
 * Con el ajuste Lab encendido, cuando sale una Legendaria, la mitad de las veces es una que aún no
 * tienes (mientras quede alguna en ese banner); la otra mitad, cualquiera, como siempre. Gancho de una
 * línea en js/systems/gacha.js (G.GachaPick, al elegir el Pokémon de la rareza que ha salido).
 * Prueba: fork/test-half-new.cjs.
 */
G.GachaPick = (list, rarity, save) => {
  if (rarity !== 5 || !G.Settings.get('lab') || !save || Math.random() >= 0.5) return null;
  const fresh = list.filter(p => !(save.owned && save.owned[p.dex]));
  return fresh.length ? G.U.pick(fresh) : null;
};
// La nota en el gacha (con Lab encendido), como rainbow.js: después de que el gacha pinte las suyas.
if (G.PityBar) {
  const draw = G.PityBar.draw;
  G.PityBar.draw = function () {
    const r = draw.apply(this, arguments);
    Promise.resolve().then(() => {
      const note = document.getElementById('gacha-rates') && document.getElementById('gacha-rates').querySelector('.note');
      if (note && G.Settings.get('lab') && !note.querySelector('.nhalf')) note.insertAdjacentHTML('beforeend', '<br><span class="nhalf" translate="no">· Lab: half of the Legendaries you pull are ones you don\'t have yet (while the banner has any).</span>');
    });
    return r;
  };
}
