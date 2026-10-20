/* ============ remember.js — las pantallas recuerdan su última pestaña (MrSurvivor) ============
 * Ajustes (G.SettingsUI) y Misiones / Logros / Perfil (G.GoalsUI) se abren en la última
 * pestaña que miraste, también tras recargar, cerrar el navegador o jugar una partida.
 * Se guarda en este dispositivo (localStorage). Abrir con una pestaña concreta
 * (el nombre de arriba → Perfil) la usa y la recuerda.
 * Los filtros y el orden de la colección los guarda js/ui/menu.js (clave ms.dex).
 */
(() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };

  /** ui: G.SettingsUI o G.GoalsUI; tabs: sus botones; ok(t): si esa pestaña se puede abrir aquí. */
  function remember(ui, key, tabs, attr, ok) {
    const open = ui.open;
    ui.open = function (t) {
      if (!t) { const saved = get(key); if (saved && ok(saved)) t = saved; }
      if (t) put(key, t);
      return open.call(this, t);
    };
    // Los clics en las pestañas los atiende la propia pantalla; aquí sólo se apuntan.
    document.querySelector(tabs).addEventListener('click', e => {
      const b = e.target.closest('[' + attr + ']');
      if (b) put(key, b.getAttribute(attr));
    });
  }

  const usable = sel => t => { const b = document.querySelector(sel + '[data-t="' + t + '"]'); return !!b && !b.classList.contains('hidden'); };
  remember(G.SettingsUI, 'ms.tab.settings', '#set-tabs', 'data-t', usable('#set-tabs '));
  remember(G.GoalsUI, 'ms.tab.goals', '#goals-tabs', 'data-tab', t => !!document.querySelector('#goals-tabs [data-tab="' + t + '"]'));

  // Sus botones llaman al open de dentro: se pasan al de aquí. El de la pausa abría
  // siempre Sonido; ahora, la última pestaña.
  const init = G.SettingsUI.init;
  G.SettingsUI.init = function () {
    const r = init.apply(this, arguments);
    G.UI.$('btn-settings').onclick = () => G.SettingsUI.open();
    G.UI.$('btn-pause-settings').onclick = () => G.SettingsUI.open();
    return r;
  };
})();
