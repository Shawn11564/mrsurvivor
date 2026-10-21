/* ============ changelog-filter.js — novedades de upstream que no son verdad aquí (MrSurvivor) ============
 * js/data/changelog.js es de upstream y no se toca (los merges lo traen tal cual). Aquí se quitan las
 * líneas que hablan de cosas que el fork no tiene, y las fechas que se quedan vacías:
 *   - el cooperativo por el servidor TURN de upstream (2026-10-21): aquí está apagado (turnUser en
 *     js/net/net.js) y el cooperativo sigue sólo con conexión directa.
 * Se cambia G.CHANGELOG en su sitio, antes de que G.NewsUI.init lo lea (así el punto de "Novedades"
 * tampoco se enciende por una fecha quitada). Lo comprueba fork/test-changelog-filter.cjs.
 */
(() => {
  const DROP = [/pasa por nuestro servidor/];
  const list = G.CHANGELOG || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i];
    for (const k of ['new', 'chg', 'fix']) {
      if (!Array.isArray(v[k])) continue;
      v[k] = v[k].filter(pair => !DROP.some(re => re.test(pair[0])));
      if (!v[k].length) delete v[k];
    }
    if (!v.new && !v.chg && !v.fix) list.splice(i, 1);
  }
})();
