/* ============ variant-bonus.js — what the shiny or the radiant gives, on the detail card (Lab, MrSurvivor fork) ============
 * On the collection's detail card (showDetail in js/ui/menu.js, a one-line hook), under the
 * stats: the extras its shiny or radiant gives in Lab runs (G.LabShiny.BONUS / RBONUS in
 * js/fork/lab/shiny.js), drawn like the stats: the normal bar and, at its end, another
 * segment in the shiny's colour (light blue) or the radiant's (orange) for what it adds.
 *   Experience and coins    the bar goes up to +25 %; the normal part fills 1/1.25 and the extra the rest.
 *   Card rerolls            one small square per reroll: the Upgrades ones (that Pokémon's) in grey
 *                           and the shiny's or radiant's in its colour.
 * It shows the one you're looking at (the radiant if you use it; if not, the shiny if you view it). If you
 * view the normal one and own its shiny or radiant, it shows dimmed ("Pick ... above to use it"). Viewing the
 * shiny when you also own the radiant, a line says the radiant gives more.
 * Texts in English only, like the rest of Lab. Test: fork/test-variant-bonus.cjs.
 */
G.VariantBonus = (() => {
  const C = { shiny: '#9ae6ff', radiant: '#ffb347' };
  const MAX = 1.25;                                // the XP and coins bar reaches +25 %
  const pct = v => Math.round(v * 100);

  /** Which extras to show for dex: { kind: 'shiny'|'radiant', on } or null. */
  function which(dex, viewShiny) {
    const rad = !!(G.Radiant && G.Radiant.owns(dex) && G.Radiant.has(dex)), sh = G.DB.ownsShiny(dex);
    if (rad && G.Radiant.wants(dex)) return { kind: 'radiant', on: true };
    if (sh && viewShiny) return { kind: 'shiny', on: true, better: rad };
    if (rad) return { kind: 'radiant', on: false };
    if (sh) return { kind: 'shiny', on: false };
    return null;
  }

  const bonus = kind => kind === 'radiant' ? G.LabShiny.RBONUS : G.LabShiny.BONUS;
  const row = (label, add) => `<div class="stat vb-row"><span>${label}</span>
      <div class="bar vb-bar"><i style="width:${(100 / MAX).toFixed(1)}%"></i><i class="vb-x" style="width:${(add * 100 / MAX).toFixed(1)}%"></i></div>
      <span class="vb-n">+${pct(add)}%</span></div>`;

  function html(dex, w) {
    const b = bonus(w.kind), name = w.kind === 'radiant' ? 'Radiant' : 'Shiny';
    const icon = w.kind === 'radiant' ? G.Radiant.icon(14) : G.Icons.html('shiny', 12);
    const base = G.Upgrades.perks(G.DB.upgradesOf(dex)).rerolls || 0;
    const pips = '<i></i>'.repeat(base) + '<i class="vb-x"></i>'.repeat(b.rerolls);
    const lab = !!G.Settings.get('lab');
    const note = !w.on ? `Pick ${name} above to use it.`
      : (lab ? 'Active in your Lab runs.' : 'Turn on Lab mode in Settings to get it.') +
        (w.better ? ` Its radiant gives more: +${pct(G.LabShiny.RBONUS.xp)}% XP and coins, +${G.LabShiny.RBONUS.rerolls} rerolls.` : '');
    return `<div class="vb-box${w.on ? '' : ' off'}" id="vb-box" data-kind="${w.kind}" style="--vb:${C[w.kind]}">
      <div class="vb-head">${icon} <b>${name} bonus</b><span class="vb-lab">LAB RUNS</span></div>
      ${row('XP', b.xp)}
      ${row('Coins', b.coins)}
      <div class="stat vb-row"><span>Rerolls</span><div class="vb-pips">${pips}</div><span class="vb-n">+${b.rerolls}</span></div>
      <p class="vb-note">${note}</p></div>`;
  }

  // Styles here: dev.html doesn't load css/brand.css.
  const CSS = `
.vb-box { margin: 8px 0 4px; padding: 6px 8px 4px; border-radius: 8px; border: 1px solid var(--vb); background: rgba(0,0,0,.18);
  box-shadow: 0 0 12px -6px var(--vb); }
.vb-box.off { opacity: .55; box-shadow: none; }
.vb-head { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--vb); }
.vb-lab { margin-left: auto; font-size: 10px; font-weight: 800; padding: 0 6px; border-radius: 999px;
  color: #9ff0e2; background: rgba(60,200,180,.2); border: 1px solid rgba(60,200,180,.6); }
.stat .vb-bar { display: flex; }
.stat .vb-bar i { background: rgba(230,240,251,.35); }
.stat .vb-bar i.vb-x, .vb-pips i.vb-x { background: var(--vb); box-shadow: 0 0 6px var(--vb); }
.vb-n { color: var(--vb); font-weight: 700; }
.vb-pips { display: flex; gap: 3px; align-items: center; height: 8px; }
.vb-pips i { width: 12px; height: 8px; border-radius: 2px; background: rgba(230,240,251,.35); }
.vb-note { margin: 2px 0 0; font-size: 12px; color: var(--muted); }`;
  let styled = false;

  /** Hook for showDetail (js/ui/menu.js): viewShiny = whether the card shows the shiny. */
  function detail(dex, viewShiny) {
    const box = document.getElementById('dex-detail');
    if (!box || !G.DB.save.owned[dex] || !G.LabShiny) return;
    const w = which(dex, viewShiny), stats = box.querySelectorAll('.stat');
    if (!w || !stats.length) return;
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    stats[stats.length - 1].insertAdjacentHTML('afterend', html(dex, w));
  }

  return { detail, which };
})();
