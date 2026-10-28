/* ============ kecleon.js — the fork's changes to Kecleon's shop (MrSurvivor fork) ============
 * Upstream's shop is js/data/shop.js (G.Shop), js/ui/shop-ui.js (G.ShopUI) and the collection card's
 * Mint / Capsule buttons (js/ui/menu.js monExtras). The owner's picks of 2026-10-28, from a player's and
 * the artist's ideas:
 *   - The random Mint never gives a neutral nature (Hardy, Docile, Bashful, Quirky, Serious: they change
 *     no stat). Since the chosen-nature Mints below it isn't sold any more; ones already in a bag still work.
 *   - The stock (the 8 TMs, and Lab's extra TM in js/fork/lab/lab-tms.js) changes every 12 h, at midnight
 *     and noon in Spain, instead of every 24 h; the TM heading says when.
 *   - Chosen-nature Mints: each stock sells 3 of the 20 natures that raise a stat (never a neutral one),
 *     4,000 coins each, up to 3 of each per player per stock. They stay in the bag (and its ledger) and
 *     the card's Nature Mint button sets that nature on any Pokémon.
 * Hooks: a capture-phase click on the card's Mint button (upstream's handler doesn't run),
 * G.Radiant.detail, to catch the card's redraw (the showDetail callback menu.js passes it),
 * G.Shop.today / dailyTms / buy (loaded before lab-tms.js, which wraps them), and #shop-body
 * (a MutationObserver adds to upstream's rows).
 * English only. Test: fork/test-kecleon-mints.cjs.
 */
G.Kecleon = (() => {
  /** The 20 natures that raise a stat (and lower another). */
  const useful = () => G.NATURES.filter(n => n.up);

  // The collection card on screen and its redraw, caught from what menu.js's showDetail hands G.Radiant.detail.
  let cardDex = null, redraw = null;
  const radiantDetail = G.Radiant.detail;
  G.Radiant.detail = function (dex, again) {
    cardDex = dex; redraw = again;
    return radiantDetail.apply(this, arguments);
  };
  function used(msg) {
    G.DB.commit(); G.Audio.sfx('buy'); G.UI.toast(msg, 2600);
    if (redraw) redraw();
  }

  // The card's random Mint: upstream's rolls any of the other 24 natures, the 5 neutral ones too.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#dex-detail [data-extra="nat"]');
    if (!b || cardDex == null) return;
    e.stopPropagation(); e.preventDefault();
    const dex = cardDex, now = G.Mons.natureOf(dex).id;
    const n = G.U.pick(useful().filter(x => x.id !== now));
    if (!n || !G.Shop.take('mint')) return;
    G.Mons.setNature(dex, n.id);
    used(G.I18n.f('{x} ahora tiene naturaleza {x}', G.DEX_BY[dex].name, G.Mons.name(n.n)));
  }, true);

  G.I18n.add({ 'Cambia al azar la naturaleza de un Pokémon.': 'Changes a Pokémon\'s nature to a random one that raises a stat (never a neutral one).' }, 'en');

  // ---------------- the stock changes every 12 h ----------------
  // At midnight and noon in Kecleon's timezone (Spain), the same for everyone. Before noon the key is
  // upstream's date (the same 8 TMs it had), after noon the date + 'pm'. shop.js's own dailyTms() and buy()
  // read its private date, so the TM list and buying a TM are redone here, the way shop.js does them.
  const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function madrid() {
    const p = {};
    for (const x of clock.formatToParts(new Date())) p[x.type] = x.value;
    return p;
  }
  /** This stock's key: '20261028' before noon, '20261028pm' after. */
  function period() {
    const p = madrid();
    return p.year + p.month + p.day + (+p.hour >= 12 ? 'pm' : '');
  }
  /** Milliseconds until the stock changes. */
  function nextChange() {
    const p = madrid();
    return ((12 - (+p.hour % 12)) * 3600 - +p.minute * 60 - +p.second) * 1000;
  }
  function rng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const DAILY = 8;
  G.Shop.today = period;                              // lab-tms.js picks Lab's extra TM with it
  G.Shop.dailyTms = function () {
    const key = period(), all = Object.keys(G.TM_MOVES).sort(), r = rng('kecleon:' + key);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const list = all.slice(0, DAILY);
    const s = G.DB.save, dex = s && s.partner;
    if (dex && !list.some(id => G.Mons.canLearn(dex, id))) {
      const mine = G.Mons.learnable(dex).sort();
      if (mine.length) list[DAILY - 1] = mine[Math.floor(rng('kecleon:' + key + ':' + dex)() * mine.length)];
    }
    return list;
  };
  const buy = G.Shop.buy;
  G.Shop.buy = function (key) {
    const id = typeof key === 'string' && key.startsWith('tm:') ? key.slice(3) : null, s = G.DB.save;
    if (!id || !G.TM_MOVES[id] || !s) return buy.apply(this, arguments);
    if (!G.Shop.dailyTms().includes(id)) return { ok: false, error: G.T('Esa MT ya no está a la venta.') };
    const price = G.Shop.tmPrice(id);
    if (s.coins < price) return { ok: false, error: G.T('No tienes Pokémonedas suficientes.') };
    s.coins -= price;
    s.tms = s.tms || {}; s.tms[id] = Math.min(999, (s.tms[id] || 0) + 1);
    G.DB.commit();
    return { ok: true };
  };

  const until = () => {
    const m = Math.max(1, Math.ceil(nextChange() / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  };
  G.I18n.add({
    'MT de hoy': 'TMs on sale',
    'Cada día hay otras 8. Una MT enseña su ataque a un Pokémon que lo aprenda en los juegos, para siempre (se gasta al usarla).':
      'There are 8 new ones every 12 hours. A TM permanently teaches its move to a Pokémon that can learn it in the games (it\'s used up).',
    'Extra daily TM: available in every run.': 'Extra TM: available in every run.'
  }, 'en');
  // The TM heading says when the stock changes.
  function mark(box) {
    const h = [...box.querySelectorAll('h3')].find(x => x.textContent === G.T('MT de hoy'));
    if (h && !h.querySelector('.kec-next')) h.insertAdjacentHTML('beforeend', ` <small class="sub kec-next" style="font-weight:400">· new ones in ${until()}</small>`);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('shop-body');
    if (box) new MutationObserver(() => mark(box)).observe(box, { childList: true });
  });

  // ---------------- chosen-nature Mints ----------------
  // One bag item per nature that raises a stat: 'mint' + its id ('mintjolly'; the bag's ledger in
  // core/db.js takes ids of 12 letters at most). Each stock sells 3 of them (the same for everyone), and a
  // player can buy 3 of each in that stock: save.kmint = { p: the stock's key, n: { nature: bought } }.
  const PRICE = 4000, ON_SALE = 3, PER_STOCK = 3;
  const STAT = { pa: 'Attack', sa: 'Sp. Atk', df: 'Defense', sd: 'Sp. Def', spd: 'Speed' };
  const MINTS = {};                                   // item id -> nature
  const en = n => n.n[1];
  const effect = n => `+${STAT[n.up]} −${STAT[n.down]}`;
  const words = {};
  for (const n of useful()) {
    const id = 'mint' + n.id, name = `${en(n)} Mint`, desc = `Sets a Pokémon's nature to ${en(n)} (${effect(n)}).`;
    MINTS[id] = n.id;
    G.Shop.ITEMS[id] = { name, icon: 'mint', price: PRICE, desc, nature: n.id };
    words[name] = name; words[desc] = desc;          // (as they are: the word-by-word pass mustn't touch them)
  }
  G.I18n.add(words, 'en');

  /** The 3 chosen-nature Mints on sale in this stock (item ids). */
  function onSale() {
    const all = Object.keys(MINTS).sort(), r = rng('kecleon-mints:' + period());
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, ON_SALE);
  }
  /** How many more of a chosen-nature Mint this player can buy in this stock. */
  function left(id) {
    const k = G.DB.save && G.DB.save.kmint;
    return PER_STOCK - (k && k.p === period() ? +(k.n || {})[MINTS[id]] || 0 : 0);
  }

  // The shop and the bag list G.Shop.ORDER: this stock's chosen Mints, the ones in your bag, random Mints you
  // still have, then the Capsules. The shop drops the rows of those not on sale (mark below; the random Mint
  // isn't sold any more, owner 2026-10-28); the bag shows the ones you have.
  const base = G.Shop.ORDER.slice();
  Object.defineProperty(G.Shop, 'ORDER', {
    configurable: true,
    get() {
      const sale = onSale(), have = Object.keys(MINTS).filter(id => !sale.includes(id) && G.Shop.count(id) > 0);
      return sale.concat(have, base.slice(0, 1).filter(id => G.Shop.count(id) > 0), base.slice(1));
    }
  });

  const buyBase = G.Shop.buy;
  G.Shop.buy = function (key) {
    if (key === 'mint') return { ok: false, error: "Kecleon doesn't sell random Mints any more: pick one of his Nature Mints." };
    if (!MINTS[key]) return buyBase.apply(this, arguments);
    if (!onSale().includes(key)) return { ok: false, error: `Kecleon isn't selling ${G.Shop.ITEMS[key].name}s right now.` };
    if (left(key) <= 0) return { ok: false, error: `That's all the ${G.Shop.ITEMS[key].name}s you can buy until the shop changes (in ${until()}).` };
    const r = buyBase.apply(this, arguments);
    if (r.ok) {
      const s = G.DB.save, p = period();
      if (!s.kmint || s.kmint.p !== p) s.kmint = { p, n: {} };
      s.kmint.n[MINTS[key]] = (+s.kmint.n[MINTS[key]] || 0) + 1;
      G.DB.commit();
    }
    return r;
  };

  // Two copies of the save: the later stock's count, the higher of the two in the same stock.
  document.addEventListener('DOMContentLoaded', () => {
    const merge = G.forkMerge;
    G.forkMerge = function (r, a, b) {
      if (merge) merge.apply(this, arguments);
      const ka = a && a.kmint, kb = b && b.kmint;
      if (!ka || !kb || !ka.p || !kb.p) { if (ka || kb) r.kmint = ka || kb; return; }
      if (ka.p !== kb.p) { r.kmint = ka.p > kb.p ? ka : kb; return; }
      const n = {};
      for (const k of new Set(Object.keys(ka.n || {}).concat(Object.keys(kb.n || {})))) n[k] = Math.max(+(ka.n || {})[k] || 0, +(kb.n || {})[k] || 0);
      r.kmint = { p: ka.p, n };
    };
  });

  // The shop's rows: only this stock's chosen Mints (no random Mint), each saying how many you can still buy.
  function markMints(box) {
    const sale = onSale();
    for (const b of box.querySelectorAll('[data-buy^="mint"]')) {
      const id = b.dataset.buy, row = b.closest('.upg-item');
      if (!row || (!MINTS[id] && id !== 'mint')) continue;
      if (!sale.includes(id)) { row.remove(); continue; }
      if (row.querySelector('.kec-left')) continue;
      const n = left(id), sub = row.querySelector('.sub');
      if (sub) sub.insertAdjacentHTML('beforeend', `<br><span class="kec-left ${n ? 'gold' : ''}">${n
        ? `${n} of ${PER_STOCK} left for you · new stock in ${until()}` : `Sold out for you · new stock in ${until()}`}</span>`);
      if (!n) b.disabled = true;
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('shop-body');
    if (box) new MutationObserver(() => markMints(box)).observe(box, { childList: true });
  });

  // The collection card: a Nature Mint button next to the random Mint, with a pick of the ones in your bag.
  let pickOpen = false, pickDex = null;
  function cardMints(dex) {
    const row = document.querySelector('#dex-detail .mon-extra .mx-row');
    if (dex !== pickDex) { pickOpen = false; pickDex = dex; }
    if (!row || !G.DB.save.owned[dex] || row.querySelector('[data-kmint]')) return;
    const now = G.Mons.natureOf(dex).id;
    const have = Object.keys(MINTS).filter(id => MINTS[id] !== now && G.Shop.count(id) > 0);
    if (!have.length) return;
    const total = have.reduce((a, id) => a + G.Shop.count(id), 0);
    row.insertAdjacentHTML('beforeend', `<button class="btn small" data-kmint>${G.Icons.html('mint', 14)} <span>Nature Mint</span> <small>×${total}</small></button>`);
    const host = document.getElementById('mx-picker');
    if (!pickOpen || !host) return;
    host.innerHTML = `<div class="panel ban-picker kmint-pick"><div class="ban-moves">${have.map(id => {
      const n = G.NATURE_BY[MINTS[id]];
      return `<button class="chip" data-kmint-v="${id}" translate="no">${G.Icons.html('mint', 16)} ${en(n)} <small>${effect(n)} ×${G.Shop.count(id)}</small></button>`;
    }).join('')}</div></div>`;
  }
  const detailBase = G.Radiant.detail;
  G.Radiant.detail = function (dex) {
    const r = detailBase.apply(this, arguments);
    cardMints(dex);
    return r;
  };
  document.addEventListener('click', e => {
    if (!e.target.closest || cardDex == null) return;
    const open = e.target.closest('#dex-detail [data-kmint]'), pick = e.target.closest('#dex-detail [data-kmint-v]');
    if (open) { pickOpen = !pickOpen; G.Audio.sfx('select'); if (redraw) redraw(); return; }
    if (!pick) return;
    const dex = cardDex, id = pick.dataset.kmintV, n = G.NATURE_BY[MINTS[id]];
    if (!n || !G.Shop.take(id)) return;
    G.Mons.setNature(dex, n.id);
    pickOpen = false;
    used(G.I18n.f('{x} ahora tiene naturaleza {x}', G.DEX_BY[dex].name, G.Mons.name(n.n)));
  });

  return { useful, period, nextChange, onSale, left, MINTS, PRICE, PER_STOCK };
})();
