/* ============ candy-name.js — how many candies, next to the name (MrSurvivor fork) ============
 * In the collection, a Pokémon's page shows "🍬 N" right after its name: the candies its evolution
 * line has left to spend on stats (G.LabGrowth.left: earned minus spent; the whole line shares them,
 * so Charmander and Charizard show the same). The tooltip says how many were earned and spent and
 * where they go. Always shown, 🍬 0 too when the line has earned none.
 * Hook: G.VariantBonus.detail, which js/ui/menu.js showDetail calls once the page is drawn.
 * English only. Test: fork/test-candy.cjs part 5.
 */
(() => {
  const L = G.LabGrowth, detail = G.VariantBonus.detail;
  G.VariantBonus.detail = function (dex) {
    const r = detail.apply(this, arguments);
    const h = document.querySelector('#dex-detail h3');
    if (!h || !G.DB.save || !G.DB.save.owned[dex] || h.querySelector('.cand-name')) return r;
    const earned = L.candies(dex), left = L.left(dex);
    if (!earned && !G.Lab.enabled) return r;
    const tip = `${left} candy left for ${G.DEX_BY[dex].name}'s line (${earned} earned, ${earned - left} spent). `
      + 'Gacha duplicates give candy; spend it on stats in Upgrades.';
    h.insertAdjacentHTML('beforeend', ` <span class="cand-name" translate="no" title="${tip.replace(/"/g, '&quot;')}"
      style="font-size:13px;font-weight:600;color:#ffd23f;background:rgba(255,210,63,.12);border-radius:9px;padding:1px 7px;vertical-align:3px;white-space:nowrap">🍬 ${left}</span>`);
    return r;
  };
})();
