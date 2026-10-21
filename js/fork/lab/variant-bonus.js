/* ============ variant-bonus.js — lo que da el shiny o el radiante, en la ficha (Lab, fork MrSurvivor) ============
 * En la ficha de la colección (showDetail de js/ui/menu.js, gancho de una línea), debajo de los
 * stats: los extras de su shiny o su radiante en las partidas Lab (G.LabShiny.BONUS / RBONUS de
 * js/fork/lab/shiny.js), con la misma pinta que los stats: la barra normal y, al final, otro
 * trozo del color del shiny (celeste) o del radiante (naranja) con lo que suma.
 *   Experiencia y monedas   la barra va hasta +25 %; lo normal llena 1/1,25 y el extra el resto.
 *   Cambios de carta        un cuadradito por cambio: los de Mejoras (de ese Pokémon) en gris
 *                           y los del shiny o el radiante en su color.
 * Se enseña el que estás viendo (el radiante si lo usas; si no, el shiny si lo ves). Si ves el
 * normal y tienes su shiny o su radiante, sale atenuado ("Pick ... above to use it"). Viendo el
 * shiny con el radiante también tuyo, una línea dice que el radiante da más.
 * Textos sólo en inglés, como el resto del Lab. Prueba: fork/test-variant-bonus.cjs.
 */
G.VariantBonus = (() => {
  const C = { shiny: '#9ae6ff', radiant: '#ffb347' };
  const MAX = 1.25;                                // la barra de XP y monedas llega a +25 %
  const pct = v => Math.round(v * 100);

  /** Qué extras enseñar para dex: { kind: 'shiny'|'radiant', on } o null. */
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

  // Estilos aquí: dev.html no carga css/brand.css.
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

  /** Gancho de showDetail (js/ui/menu.js): viewShiny = si la ficha enseña el shiny. */
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
