/* ============ changelog-filter.js — upstream news that isn't true here (MrSurvivor) ============
 * js/data/changelog.js is upstream's and isn't touched (merges bring it in as is). Here we drop the
 * lines about things the fork doesn't have, and the dates left empty:
 *   - co-op through upstream's TURN server (2026-10-21): here it's off (turnUser in
 *     js/net/net.js) and co-op still runs on direct connections only.
 * G.CHANGELOG is changed in place, before G.NewsUI.init reads it (so the "Novedades" (News) dot
 * doesn't light up for a dropped date either). Checked by fork/test-changelog-filter.cjs.
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
