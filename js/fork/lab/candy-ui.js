/* ============ candy-ui.js — spending candies in Upgrades (Lab, MrSurvivor fork) ============
 * With the Lab setting on, the Upgrades screen has a candy panel under the list
 * for the chosen Pokémon (its evolution line): how many are left, the points (up to 10),
 * one button per stat with what the next point costs and what it gives, and Reset.
 * The logic is in js/fork/lab/growth.js (points, spend, reset). The panel sits outside #upg-list
 * (renderUpgrades in js/ui/menu.js rebuilds it whole) and is painted when Upgrades opens and when the
 * Pokémon changes. Texts in English only, like the rest of Lab. Test: fork/test-candy.cjs.
 */
G.LabCandyUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => G.Lab.esc(s);
  const dexNow = () => { const sel = $('upg-mon'); return sel && +sel.value; };

  function render() {
    const list = $('upg-list');
    if (!list) return;
    let box = $('candy-panel');
    const on = G.Lab.enabled, dex = dexNow();
    if (!on || !dex || !G.DEX_BY[dex]) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'candy-panel';
      box.className = 'panel';
      box.style.cssText = 'margin-top:10px;padding:10px 12px';
      list.insertAdjacentElement('afterend', box);
    }
    const L = G.LabGrowth, p = L.points(dex), used = Object.values(p).reduce((a, b) => a + b, 0), left = L.left(dex);
    const full = used >= L.CANDY_MAX;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
        <b translate="no">Candy · ${esc(G.DEX_BY[dex].name)}'s line</b>
        <span translate="no" class="cand-sum" style="color:var(--muted);font-size:13px">${left} left · ${used}/${L.CANDY_MAX} points</span>
      </div>
      <div class="cand-rows" style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;margin-top:8px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap">
        <small translate="no" style="color:var(--muted)">Gacha duplicates give candy to their evolution line. A stat's 1st point costs 1 candy, its 2nd costs 2, and so on.</small>
        <button class="btn small" data-reset translate="no" ${used ? '' : 'disabled'}>Reset (refund ${L.spent(dex)})</button>
      </div>`;
    const rows = box.querySelector('.cand-rows');
    for (const k in L.CSTAT) {
      const s = L.CSTAT[k], n = p[k], cost = n + 1, can = !full && left >= cost;
      rows.insertAdjacentHTML('beforeend', `
        <b translate="no">${s.name}</b>
        <span translate="no" style="font-size:13px">${'●'.repeat(n)} ${n ? s.text(s.per * n) : '<span style="color:var(--muted)">—</span>'}</span>
        <button class="btn small ${can ? 'gold' : ''}" data-k="${k}" translate="no" ${can ? '' : 'disabled'}>+1 · ${cost} 🍬 <small>(${s.text(s.per)})</small></button>`);
    }
    rows.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { if (L.spend(dex, b.dataset.k)) G.Audio.sfx('buy'); render(); }; });
    box.querySelector('[data-reset]').onclick = () => { L.reset(dex); G.Audio.sfx('back'); render(); };
  }

  const show = G.UI.show;
  G.UI.show = function (id) {
    const r = show.apply(this, arguments);
    if (id === 'scr-upgrades') Promise.resolve().then(() => {
      render();
      const sel = $('upg-mon');
      if (sel && !sel._candy) { sel._candy = true; sel.addEventListener('change', () => Promise.resolve().then(render)); }
    });
    return r;
  };
  return { render };
})();
