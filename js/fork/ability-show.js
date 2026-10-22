/* ============ ability-show.js — the run's ability, shown in every run (MrSurvivor fork) ============
 * Plan D6. Upstream picks an ability for every run (game.js: pl.setAbility(G.Mons.abilityOf(dex).id)) but never
 * shows it during the run. Lab runs already did ("LAB · Blaze" at the top, "Ability: ..." in the pause menu,
 * js/fork/lab/lab.js); this does the same for normal runs, for everyone:
 *   - a small tag at the top of the screen: "Ability · Blaze"
 *   - the pause menu: "Ability: Blaze" and what it does (upstream's text, js/data/ability-fx.js)
 * In a Lab run nothing is added (Lab's tag and block say it). Only your own Pokémon (pl.abilId).
 * Texts in English. Test: fork/test-lab-abilities.cjs part 9.
 */
G.AbilityShow = (() => {
  const esc = s => G.Lab.esc(s);
  /** { name, desc } of the run's ability, or null (none, or a Lab run: Lab shows its own). */
  function info() {
    const pl = G.Game && G.Game.player;
    if (!pl || !pl.abilId || G.Lab.active) return null;
    return G.LabAbilities.describe(pl.abilId, pl.mon, true);
  }

  const st = document.createElement('style');
  st.textContent = '.abil-hud { background: rgba(20,24,38,.78); color: #e6eefb; border: 1px solid rgba(230,240,251,.25); }';
  document.head.appendChild(st);
  const hud = document.createElement('div');
  hud.id = 'abil-hud';
  hud.className = 'lab-badge lab-hud abil-hud hidden';
  hud.setAttribute('translate', 'no');
  document.body.appendChild(hud);
  function badge() {
    const a = ['playing', 'paused', 'levelup', 'resuming'].includes(G.Game && G.Game.state) ? info() : null;
    hud.classList.toggle('hidden', !a);
    if (a && hud.textContent !== 'Ability · ' + a.name) hud.textContent = 'Ability · ' + a.name;
  }
  setInterval(badge, 400);

  const showPause = G.RunUI.showPause;
  G.RunUI.showPause = function () {
    const r = showPause.apply(this, arguments), a = info(), box = document.getElementById('pause-sum');
    if (a && box) box.insertAdjacentHTML('afterbegin', `<div class="lab-pause abil-pause" translate="no">Ability: <b>${esc(a.name)}</b> <small>${esc(a.desc)}</small></div>`);
    return r;
  };

  return { info, badge };
})();
