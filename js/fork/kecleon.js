/* ============ kecleon.js — the fork's changes to Kecleon's shop (MrSurvivor fork) ============
 * Upstream's shop is js/data/shop.js (G.Shop), js/ui/shop-ui.js (G.ShopUI) and the collection card's
 * Mint / Capsule buttons (js/ui/menu.js monExtras). The owner's picks of 2026-10-28, from a player's and
 * the artist's ideas:
 *   - The random Mint (1,500, always on sale) never gives a neutral nature (Hardy, Docile, Bashful,
 *     Quirky, Serious: they change no stat).
 *   - The stock (the 8 TMs, and Lab's extra TM in js/fork/lab/lab-tms.js) changes every 12 h, at midnight
 *     and noon in Spain, instead of every 24 h; the TM heading says when.
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

  return { useful, period, nextChange };
})();
