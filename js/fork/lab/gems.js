/* ============ gems.js — gems (Lab first, MrSurvivor fork) ============
 * A rare currency from Lab runs (save.gems, in the coins-and-tickets ledger: CUR in
 * js/core/db.js): defeating an enemy drops one 0.7 % of the time; a boss, always one; a legendary,
 * two (G.Progress.kill). With the Lab setting on, in Upgrades:
 *   - 100 gems: reset the Pokémon's upgrades and get back all the coins they cost
 *     (save.ureset[dex] counts the resets: merging two copies keeps the upgrades of the one
 *     with more, as with prestige; js/fork/prestige.js);
 *   - 100 gems: go up a prestige level (js/fork/prestige.js charges it).
 * Texts in English, like the Lab. Test: fork/test-gems.cjs.
 */
G.Gems = (() => {
  const $ = id => document.getElementById(id);
  const RATE = 0.007, RESET = 100;
  const save = () => G.DB.save;
  const have = () => ((save() && save().gems) | 0);
  const lab = () => !!(G.Lab && G.Lab.active);

  function give(n) {
    const s = save(), pl = G.Game.player;
    if (!s || !(n > 0)) return;
    s.gems = (s.gems | 0) + n;
    G.DB.commit();
    if (pl) {
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, '+' + n + (n > 1 ? ' gems' : ' gem'), '#7fffd4', true);
      G.FX.ring(pl.x, pl.y, 6, 50, '#7fffd4', 0.4, 3);
    }
    G.Audio.sfx('shiny');
  }
  const kill = G.Progress.kill;
  G.Progress.kill = function (e) {
    const r = kill.apply(this, arguments);
    if (lab() && e) {
      const legend = e.legend || (G.Rift.inArena && e.boss);
      if (legend) give(2); else if (e.boss) give(1); else if (Math.random() < RATE) give(1);
    }
    return r;
  };

  /** Coins that dex's bought upgrades cost. */
  function spent(dex) {
    const lv = G.DB.upgradesOf(dex) || {};
    let c = 0;
    for (const u of G.Upgrades.LIST) for (let l = 0; l < Math.min(u.max, lv[u.id] || 0); l++) c += G.Upgrades.cost(u.id, l);
    return c;
  }
  function reset(dex) {
    const s = save(), back = spent(dex);
    if (have() < RESET || !back) return 0;
    s.gems -= RESET;
    s.coins += back;
    s.pupg = s.pupg || {}; s.pupg[dex] = {};
    s.ureset = s.ureset && typeof s.ureset === 'object' ? s.ureset : {};
    s.ureset[dex] = (s.ureset[dex] | 0) + 1;
    G.DB.commit(true);
    return back;
  }

  // ---------------- Upgrades ----------------
  let sure = false;
  const dexNow = () => { const sel = $('upg-mon'); return sel && +sel.value; };
  function render() {
    const list = $('upg-list'), dex = dexNow();
    let box = $('gems-panel');
    if (!list || !dex || !G.DEX_BY[dex] || !G.Settings.get('lab')) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'gems-panel';
      box.className = 'panel';
      box.style.cssText = 'margin-top:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap';
      list.insertAdjacentElement('afterend', box);
    }
    const g = have(), back = spent(dex), ok = g >= RESET && back > 0;
    box.innerHTML = `<div><b translate="no">Gems (Lab): <span class="gems-n" style="color:#7fffd4">${g}</span></b>
        <div class="gems-what" translate="no" style="font-size:13px;color:var(--muted)">${back ? `Reset ${G.DEX_BY[dex].name}'s upgrades for ${RESET} gems and get the ${back.toLocaleString()} coins they cost back.` : 'Nothing bought to reset.'} Prestige also costs ${RESET} gems. Rare in Lab runs: bosses always drop one, legendaries two.</div></div>
      ${back ? `<button class="btn small ${ok ? 'gold' : ''}" data-reset translate="no" ${ok ? '' : 'disabled'}>${sure && ok ? `Confirm: ${RESET} gems, +${back.toLocaleString()} coins` : `Reset upgrades (${RESET} gems)`}</button>` : ''}`;
    const btn = box.querySelector('[data-reset]');
    if (btn) btn.onclick = () => {
      if (!sure) { sure = true; render(); return; }
      sure = false;
      const got = reset(dex);
      if (got) {
        G.Audio.sfx('buy'); G.UI.refreshCoins();
        G.UI.toast(`${G.DEX_BY[dex].name}: upgrades reset, +${got.toLocaleString()} coins`, 2600);
        const sel = $('upg-mon'); if (sel) sel.dispatchEvent(new Event('change'));
      }
      render();
    };
  }
  const show = G.UI.show;
  G.UI.show = function (id) {
    const r = show.apply(this, arguments);
    if (id === 'scr-upgrades') Promise.resolve().then(() => {
      sure = false; render();
      const list = $('upg-list');
      if (list && !list._gems) { list._gems = true; new MutationObserver(() => render()).observe(list, { childList: true }); }
      const sel = $('upg-mon');
      if (sel && !sel._gems) { sel._gems = true; sel.addEventListener('change', () => { sure = false; Promise.resolve().then(render); }); }
    });
    return r;
  };

  return { RATE, RESET, give, have, spent, reset };
})();
