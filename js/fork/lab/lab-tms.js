/* ============ lab-tms.js — Kecleon sells Lab TMs with Lab on (MrSurvivor fork) ============
 * Plan D7 (owner's answer G5). Upstream's Kecleon shop (js/data/shop.js) sells 8 TMs a day from its own
 * moves (G.TM_MOVES). With the Lab setting on, a 9th daily slot sells one of the Lab moves that species
 * learn by TM in the games and upstream doesn't sell (Protect, Reflect, Surf, Fly, Flare Blitz, Stored
 * Power...: LAB_TMS, built from G.LabData.learn's TM group). Same one for everyone each day (the date in
 * Kecleon's timezone, G.Shop.today), priced like upstream's (300 + 6 x its power in the games, status 400).
 * A Lab TM is taught like any other (collection card → Teach TM; G.TM_OF lists it with Lab on, unless its
 * Lab list already has it), and it stays Lab-only: it joins the Lab list (lab.js labList), never a normal
 * run's (lab.js filters Lab moves out of the normal pool). Its shop row says so ("LAB" and a note).
 * Hooks: G.Shop.dailyTms, G.TM_OF, G.TM_PRICE (data), #shop-body (a MutationObserver marks the rows).
 * Texts in English. Test: fork/test-kecleon.cjs.
 */
G.LabTms = (() => {
  const D = G.LabData;
  const on = () => !!(G.Settings.get('lab') || (G.Lab && G.Lab.active));
  const isLab = id => !!(G.Moves.BY_ID[id] && G.Moves.BY_ID[id].lab && !G.Moves.BY_ID[id].sig && !G.Moves.BY_ID[id].coop);   // (co-op moves: support.js's cards only)

  // LAB_TMS[id] = the species that learn it by TM in the games (Lab moves upstream doesn't sell).
  const LAB_TMS = {}, BY_DEX = {};
  for (const mon of G.DEX) {
    const L = G.Lab.learnOf(mon.dex);
    for (const id in L) {
      if (L[id] !== 'tm' || !isLab(id) || G.TM_MOVES[id]) continue;
      (LAB_TMS[id] = LAB_TMS[id] || []).push(mon.dex);
      (BY_DEX[mon.dex] = BY_DEX[mon.dex] || []).push(id);
    }
  }
  // Price: upstream's formula (js/data/tms.js), from the move's power in the games.
  for (const id in LAB_TMS) {
    const p = D.POWER[D.MOVES.indexOf(id)] || 0;
    G.TM_PRICE[id] = p ? Math.round((300 + 6 * p) / 10) * 10 : 400;
  }

  /** What this species can be taught with Lab on: upstream's TMs plus the Lab TMs its Lab list doesn't have. */
  const tmOf = G.TM_OF;
  G.TM_OF = dex => {
    const l = tmOf(dex), extra = on() && BY_DEX[dex];
    if (!extra || !G.DEX_BY[dex]) return l;
    const has = G.Lab.poolFor(G.DEX_BY[dex], true);
    const add = extra.filter(id => !has.includes(id) && !l.includes(id));
    return add.length ? l.concat(add) : l;
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  /** Today's Lab TM (the same for everyone). */
  function today(skip = []) {
    const all = Object.keys(LAB_TMS).sort().filter(id => !skip.includes(id));
    return all.length ? all[Math.floor(hash('kecleon-lab:' + G.Shop.today()) * all.length)] : null;
  }
  const daily = G.Shop.dailyTms;
  G.Shop.dailyTms = function () {
    const list = daily.apply(this, arguments);
    const id = on() && today(list);
    return id ? list.concat([id]) : list;
  };
  // shop.js buy() checks its own dailyTms (not G.Shop's), so today's Lab TM is bought here, the way buy() does it.
  const buy = G.Shop.buy;
  G.Shop.buy = function (key) {
    const id = typeof key === 'string' && key.startsWith('tm:') ? key.slice(3) : null, s = G.DB.save;
    if (!id || !LAB_TMS[id] || !s) return buy.apply(this, arguments);
    if (!on() || !G.Shop.dailyTms().includes(id)) return { ok: false, error: G.T('Esa MT ya no está a la venta.') };
    const price = G.Shop.tmPrice(id);
    if (s.coins < price) return { ok: false, error: G.T('No tienes Pokémonedas suficientes.') };
    s.coins -= price;
    s.tms = s.tms || {}; s.tms[id] = Math.min(999, (s.tms[id] || 0) + 1);
    G.DB.commit();
    return { ok: true };
  };

  // The shop: a LAB tag on a Lab TM's row, and what that means.
  const NOTE = 'Lab TM: the move works in Lab runs only.';
  G.I18n.add({ [NOTE]: NOTE }, 'en');
  function mark(box) {
    for (const b of box.querySelectorAll('[data-buy^="tm:"]')) {
      const id = b.dataset.buy.slice(3), row = b.closest('.upg-item');
      if (!isLab(id) || !row || row.querySelector('.lab-tm')) continue;
      const title = row.querySelector('b');
      if (title) title.insertAdjacentHTML('beforeend', ' <span class="lab-badge lab-tm">LAB</span>');
      const sub = row.querySelector('.sub');
      if (sub) sub.insertAdjacentHTML('beforeend', ` <span class="lab-tm-note">${NOTE}</span>`);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('shop-body');
    if (box) new MutationObserver(() => mark(box)).observe(box, { childList: true });
  });

  return { LAB_TMS, BY_DEX, today, isLab, NOTE };
})();
