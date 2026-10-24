/* ============ upgrade-all.js — buy every upgrade at once (MrSurvivor fork, Lab first) ============
 * With the Lab setting on, Upgrades has an "Upgrade all" button for the chosen Pokémon: it raises
 * every upgrade to its max in one go. Before spending, it asks to confirm with the total in coins. If
 * you can't afford it, it says how much is missing. The coins go out as in a normal purchase (G.DB.commit notes the
 * spend in the ledger). The panel repaints when menu.js rebuilds the list (#upg-list): that way the total
 * stays right after buying a single one. Texts in English, like Lab. Test: fork/test-upgrade-all.cjs.
 */
G.UpgradeAll = (() => {
  const $ = id => document.getElementById(id);
  const dexNow = () => { const sel = $('upg-mon'); return sel && +sel.value; };
  let sure = false, watched = null;

  /** What's left to max everything: { total, steps }. */
  function quote(dex) {
    const lv = G.DB.upgradesOf(dex) || {};
    let total = 0, steps = 0;
    for (const u of G.Upgrades.LIST) for (let l = lv[u.id] || 0; l < u.max; l++) { total += G.Upgrades.cost(u.id, l); steps++; }
    return { total, steps };
  }
  function buyAll(dex) {
    const s = G.DB.save, q = quote(dex);
    if (!q.steps || s.coins < q.total) return false;
    const lv = G.DB.upgradesOf(dex);
    for (const u of G.Upgrades.LIST) lv[u.id] = u.max;
    s.coins -= q.total;
    G.DB.commit(true);
    return true;
  }

  function render() {
    const list = $('upg-list'), dex = dexNow();
    let box = $('upgall-panel');
    if (!list || !dex || !G.DEX_BY[dex] || !G.Settings.get('lab')) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'upgall-panel';
      box.className = 'panel';
      box.style.cssText = 'margin-top:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap';
      list.insertAdjacentElement('afterend', box);
    }
    const q = quote(dex), coins = G.DB.save.coins, ok = q.steps > 0 && coins >= q.total;
    const what = !q.steps ? 'Every upgrade is already maxed.'
      : ok ? `${q.steps} ${q.steps === 1 ? 'level' : 'levels'} left, ${q.total.toLocaleString()} coins in total.`
      : `${q.steps} ${q.steps === 1 ? 'level' : 'levels'} left, ${q.total.toLocaleString()} coins in total: ${(q.total - coins).toLocaleString()} more needed.`;
    box.innerHTML = `<div><b translate="no">Upgrade all (Lab)</b><div class="upgall-what" translate="no" style="font-size:13px;color:var(--muted)">${what}</div></div>
      ${q.steps ? `<button class="btn small ${ok ? 'gold' : ''}" data-all translate="no" ${ok ? '' : 'disabled'}>${sure && ok ? `Confirm: spend <span class="coin"></span> ${q.total.toLocaleString()}` : 'Upgrade all'}</button>` : ''}`;
    const btn = box.querySelector('[data-all]');
    if (btn) btn.onclick = () => {
      if (!sure) { sure = true; render(); return; }
      sure = false;
      if (buyAll(dex)) {
        G.Audio.sfx('buy');
        G.UI.refreshCoins();
        G.UI.toast(`${G.DEX_BY[dex].name}: every upgrade maxed`, 2600);
        const sel = $('upg-mon'); if (sel) sel.dispatchEvent(new Event('change'));   // menu.js repaints the list
      }
      render();
    };
  }

  function watch() {
    const list = $('upg-list');
    if (!list || watched === list) return;
    watched = list;
    new MutationObserver(() => { if (!$('upgall-panel') || !document.getElementById('scr-upgrades').classList.contains('hidden')) render(); }).observe(list, { childList: true });
  }
  const show = G.UI.show;
  G.UI.show = function (id) {
    const r = show.apply(this, arguments);
    if (id === 'scr-upgrades') Promise.resolve().then(() => {
      sure = false; watch(); render();
      const sel = $('upg-mon');
      if (sel && !sel._upgall) { sel._upgall = true; sel.addEventListener('change', () => { sure = false; Promise.resolve().then(render); }); }
    });
    return r;
  };
  return { quote, buyAll, render };
})();
