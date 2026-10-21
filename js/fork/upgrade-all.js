/* ============ upgrade-all.js — comprar todas las mejoras de golpe (fork MrSurvivor, Lab primero) ============
 * Con el ajuste Lab encendido, Mejoras lleva un botón "Upgrade all" para el Pokémon elegido: sube
 * cada mejora a su máximo de una vez. Antes de gastar, pide confirmar con el total en monedas. Si
 * no llega, dice cuánto falta. Las monedas salen como en una compra normal (G.DB.commit apunta el
 * gasto en la libreta). El panel se repinta cuando menu.js rehace la lista (#upg-list): así el total
 * sigue bien después de comprar una suelta. Textos en inglés, como el Lab. Prueba: fork/test-upgrade-all.cjs.
 */
G.UpgradeAll = (() => {
  const $ = id => document.getElementById(id);
  const dexNow = () => { const sel = $('upg-mon'); return sel && +sel.value; };
  let sure = false, watched = null;

  /** Lo que falta para tenerlo todo: { total, steps }. */
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
      : ok ? `${q.steps} levels left, ${q.total.toLocaleString()} coins in all.`
      : `${q.steps} levels left, ${q.total.toLocaleString()} coins in all: ${(q.total - coins).toLocaleString()} more needed.`;
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
        const sel = $('upg-mon'); if (sel) sel.dispatchEvent(new Event('change'));   // menu.js repinta la lista
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
