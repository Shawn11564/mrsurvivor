/* ============ remember.js — screens remember their last tab (MrSurvivor) ============
 * Settings (G.SettingsUI) and Missions / Achievements / Profile (G.GoalsUI) open on the last
 * tab you looked at, also after a reload, closing the browser or playing a run.
 * It's saved on this device (localStorage). Opening on a given tab
 * (the name at the top → Profile) uses it and remembers it.
 * The collection's filters and sort order are saved by js/ui/menu.js (key ms.dex).
 */
(() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nothing */ } };

  /** ui: G.SettingsUI or G.GoalsUI; tabs: its buttons; ok(t): whether that tab can be opened here. */
  function remember(ui, key, tabs, attr, ok) {
    const open = ui.open;
    ui.open = function (t) {
      if (!t) { const saved = get(key); if (saved && ok(saved)) t = saved; }
      if (t) put(key, t);
      return open.call(this, t);
    };
    // The screen itself handles clicks on the tabs; here they're only noted.
    document.querySelector(tabs).addEventListener('click', e => {
      const b = e.target.closest('[' + attr + ']');
      if (b) put(key, b.getAttribute(attr));
    });
  }

  const usable = sel => t => { const b = document.querySelector(sel + '[data-t="' + t + '"]'); return !!b && !b.classList.contains('hidden'); };
  remember(G.SettingsUI, 'ms.tab.settings', '#set-tabs', 'data-t', usable('#set-tabs '));
  remember(G.GoalsUI, 'ms.tab.goals', '#goals-tabs', 'data-tab', t => !!document.querySelector('#goals-tabs [data-tab="' + t + '"]'));

  // Its buttons call the inner open: point them at this one. The pause button always
  // opened Sound; now it opens the last tab.
  const init = G.SettingsUI.init;
  G.SettingsUI.init = function () {
    const r = init.apply(this, arguments);
    G.UI.$('btn-settings').onclick = () => G.SettingsUI.open();
    G.UI.$('btn-pause-settings').onclick = () => G.SettingsUI.open();
    return r;
  };
})();
