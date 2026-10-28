/* ============ played-as.js — the end screen says which Pokémon you were (MrSurvivor fork) ============
 * A row at the top of the run's end screen (#over-stats, js/ui/run-ui.js showOver): "You played as"
 * with your Pokémon's sprite and name as it ended the run: shiny or radiant (js/fork/radiant.js), its
 * Mega (js/fork/mega.js: p.megaKey) or the form of the item it held (js/fork/forms.js: p.formKey).
 * In co-op, your own Pokémon (the team's summary, js/fork/run-stats.js, comes first).
 * Loaded after death-cause.js (this row goes above "What knocked you out") and before over-fit.js
 * (which sizes the box with this row in it). Test: fork/test-played-as.cjs.
 */
G.PlayedAs = (() => {
  /** What p looks like now: { key, shiny, name }. */
  function of(p) {
    const own = p.formKey || p.megaKey || p.dex;
    const key = G.Radiant ? G.Radiant.look(p, own) : own;
    const radiant = key !== own;
    const base = G.T(G.DEX_BY[p.dex].name);
    const name = p.formKey && G.DEX_BY[p.formKey] ? G.T(G.DEX_BY[p.formKey].name)
      : p.megaKey ? String(G.MEGA_FORMS[p.dex] || 'Mega').replace(/_/g, ' ') + ' ' + base : base;
    return { key, shiny: radiant || !!p.shiny, name: (radiant ? 'Radiant ' : p.shiny ? 'Shiny ' : '') + name };
  }

  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function () {
    const res = showOver.apply(this, arguments);
    const pl = G.Game.player, box = document.getElementById('over-stats');
    if (pl && box && G.DEX_BY[pl.dex]) {
      const me = of(pl);
      const el = document.createElement('div');
      el.className = 'played-as';
      // One line (label, sprite, name): a long run's end screen is already near over-fit.js's smallest zoom at 720p.
      el.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:10px;padding-top:4px;padding-bottom:4px';
      el.setAttribute('translate', 'no');                // already in the player's language
      el.innerHTML = '<span style="margin:0">You played as</span><b class="pa-who" style="display:flex;align-items:center;gap:6px"></b>';
      const b = el.querySelector('.pa-who');
      if (G.SPRITE_META[me.key]) b.appendChild(G.UI.spriteCanvas(me.key, 56, 48, { scale: 1, shiny: me.shiny }));
      b.insertAdjacentText('beforeend', me.name);
      box.insertBefore(el, box.firstChild);
    }
    return res;
  };
  return { of };
})();
