/* ============ choice-lock.js — the Choice Band asks which move it locks (MrSurvivor fork) ============
 * Upstream's Choice Band (+40 % damage, js/data/items.js) locks you into whatever slot was active
 * when you picked it up (Player.setActive refuses to switch). Now, with two or more slots, picking
 * it up keeps the game stopped and the item screen (#scr-item, so its 1-4 keys, the co-op freeze and
 * every "is a choice open" check apply) asks which slot to lock into; that slot becomes the active
 * one and the band keeps it. One slot: nothing to ask, as before.
 * Hooks: offerItem in js/game.js (needed() before a pickup with no item, ask() once it's on).
 * Test: fork/test-choice-lock.cjs.
 */
G.ChoiceLock = (() => {
  G.I18n.add({ '+40% de daño, pero no puedes cambiar de movimiento.': '+40% damage, but you\'re locked into the move you choose when you pick it up.' }, 'en');
  const $ = id => document.getElementById(id);
  const GUARD = 1000;                 // ms the cards ignore clicks (run-ui.js's guard: keys pressed mid-fight)
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Is there a choice to make? (two or more slots) */
  const needed = pl => !!pl && pl.slots.length > 1 && pl.slots.every(s => s && s.length);

  /** Lock into this slot: what Player.setActive does, without its Choice Band refusal. */
  function lock(pl, i) {
    if (i !== pl.active) {
      pl.active = i;
      G.Projectiles.clearOrbs(pl);
      for (const m of pl.slots[i]) m.t = Math.min(m.t, m.cd * 0.35);
    }
    const m = pl.slots[i][0];
    G.Audio.sfx('select');
    G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, 6, pl.r * 3.4, G.U.TYPE_COLOR[m.type], 0.3, 3);
  }

  /** Shows the pick (→ true), then lock + done(); false when there's nothing to ask. */
  function ask(pl, done) {
    if (!needed(pl)) return false;
    const scr = $('scr-item'), h = scr.querySelector('h2'), sub = scr.querySelector('.sub'), box = $('item-cards');
    const was = [h.innerHTML, sub.innerHTML];
    const band = G.T(G.Items.BY.choiceband.name);
    h.textContent = band;
    sub.innerHTML = `Lock into which move? You can't switch while you hold it · <kbd>1</kbd>–<kbd>${pl.slots.length}</kbd>`;
    box.innerHTML = '';
    box.classList.add('choice-lock', 'guard');
    const until = performance.now() + GUARD;
    setTimeout(() => box.classList.remove('guard'), GUARD);
    pl.slots.forEach((g, i) => {
      const m = g[0], col = G.U.TYPE_COLOR[m.type];
      const names = g.map(x => esc(G.T(x.name, 'move'))).join(' + ');
      const el = document.createElement('div');
      el.className = 'card' + (i === pl.active ? ' evo' : '');
      el.innerHTML = `<div class="ico" style="background:${col}33">${G.Icons.html('move:' + m.id, 32)}</div>
        <div class="txt"><div class="nm">${names} <span class="tag-chip" style="background:${col}">Lv.${m.lvl}</span>${i === pl.active ? ' <small>(current)</small>' : ''}</div>
        <div class="ds">${m.desc || ''}</div></div>
        <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => {
        if (performance.now() < until) return;
        G.UI.hide('scr-item');
        [h.innerHTML, sub.innerHTML] = was;
        box.classList.remove('choice-lock', 'guard');
        lock(pl, i);
        done();
      };
      box.appendChild(el);
    });
    G.UI.show('scr-item');
    return true;
  }

  return { needed, ask };
})();
