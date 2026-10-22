/* ============ player-edits.js — admin edits to a save that survive merging (MrSurvivor fork) ============
 * The Player Manager (js/fork/player-manager.js) edits a player's CLOUD save, but the player
 * also has copies in their browsers, and merge() in js/core/db.js joins them: collections are
 * a union (a deleted Pokémon would come back from the other copy) and coins are the sum of each
 * device's ledger line (a plain number change would be undone). So every edit here is one that
 * merge keeps:
 *
 *   Coins, tickets, gems   on their own ledger line, save.led.adm = { c: [given, taken], ... }:
 *                          merge takes the biggest of each line, so two copies never count it twice.
 *   Give a Pokémon         owned / shiny / radiant entry dated now (the union keeps it).
 *   Delete a Pokémon       a tombstone, save.admDel['o25'|'s25'|'r25'] = when: after every merge,
 *                          an entry from before its tombstone is dropped; one caught (or given)
 *                          later stays.
 *   Reset                  an epoch, save.admW[id] = { at, kind }: a copy that hasn't had that
 *                          reset yet gets it before merging (what it had from before goes).
 *                          kind: 'mons' (Pokémon only), 'monscur' (+ coins, tickets and gems),
 *                          'full' (everything but the name).
 *
 * Hook: G.forkMerge (called at the end of merge(), js/core/db.js), chained after radiant.js's.
 * Pure functions on a plain save object; nothing here reads or writes the database.
 * Test: fork/test-player-edits.cjs (no server), fork/test-player-manager.cjs (emulator).
 */
G.PlayerEdits = (() => {
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const START = () => (G.DB && G.DB.START_COINS) || 500;

  // The currencies, as the ledger in js/core/db.js names them (CUR).
  const CUR = {
    c:   { name: 'Coins',         get: s => s.coins, set: (s, v) => { s.coins = v; } },
    t1:  { name: 'Tickets',       get: s => (s.tickets || {}).t1, set: (s, v) => { tk(s).t1 = v; } },
    t10: { name: '×10 tickets',   get: s => (s.tickets || {}).t10, set: (s, v) => { tk(s).t10 = v; } },
    t25: { name: 'Rainbow ×25',   get: s => (s.tickets || {}).t25, set: (s, v) => { tk(s).t25 = v; } },
    gm:  { name: 'Gems',          get: s => s.gems, set: (s, v) => { s.gems = v; } }
  };
  const tk = s => (s.tickets = isObj(s.tickets) ? s.tickets : { t1: 0, t10: 0 });
  const bal = (s, k) => num(CUR[k].get(s));

  /** The save's ledger; an old save without one starts it from its balance (as db.js does). */
  function ledger(s) {
    if (!isObj(s.led)) {
      const base = {};
      for (const k in CUR) base[k] = [bal(s, k), 0];
      s.led = { base };
    }
    return s.led;
  }

  /** Gives (d > 0) or takes (d < 0, never below 0) a currency. → what actually changed. */
  function addCur(s, k, d) {
    d = Math.trunc(+d || 0);
    if (!CUR[k] || !d) return 0;
    const b = bal(s, k);
    if (d < 0) d = -Math.min(b, -d);
    if (!d) return 0;
    const led = ledger(s), e = led.adm = isObj(led.adm) ? led.adm : {};
    const p = e[k] = Array.isArray(e[k]) ? e[k] : [0, 0];
    if (d > 0) p[0] = num(p[0]) + d; else p[1] = num(p[1]) - d;
    CUR[k].set(s, b + d);
    return d;
  }

  // ---------------- Pokémon ----------------

  const COLL = { o: 'owned', s: 'shiny', r: 'radiant' };
  const entry = at => ({ at, from: 'admin' });

  /** variant: 'normal' | 'shiny' | 'radiant'. → true if it added something. */
  function give(s, dex, variant = 'normal', at = Date.now()) {
    dex = String(dex | 0);
    let added = false;
    s.owned = isObj(s.owned) ? s.owned : {};
    if (!s.owned[dex]) { s.owned[dex] = entry(at); added = true; }
    if (variant === 'shiny') {
      s.shiny = isObj(s.shiny) ? s.shiny : {};
      if (!s.shiny[dex]) { s.shiny[dex] = entry(at); added = true; }
    }
    if (variant === 'radiant') {
      s.radiant = isObj(s.radiant) ? s.radiant : {};
      if (!s.radiant[dex]) { s.radiant[dex] = entry(at); added = true; }
      if (isObj(s.radOff)) delete s.radOff[dex];
    }
    return added;
  }

  /** Another Pokémon to play with, if the partner is gone: the most played one left. */
  function fixPartner(s) {
    const owned = isObj(s.owned) ? s.owned : {};
    if (s.partner != null && !owned[s.partner]) {
      const left = Object.keys(owned).sort((a, b) => (+(s.pused || {})[b] || 0) - (+(s.pused || {})[a] || 0));
      s.partner = left.length ? +left[0] : null;
      s.partnerShiny = false;
    }
    if (s.partnerShiny && !(isObj(s.shiny) && s.shiny[s.partner])) s.partnerShiny = false;
  }
  /** Profile favourites they no longer have (or no longer have shiny). */
  function fixFavs(s) {
    if (!isObj(s.profile) || !Array.isArray(s.profile.favs)) return;
    s.profile.favs = s.profile.favs.filter(f => f && isObj(s.owned) && s.owned[f.dex])
      .map(f => (f.shiny && !(isObj(s.shiny) && s.shiny[f.dex]) ? Object.assign({}, f, { shiny: false }) : f));
  }

  /** variant: 'all' (the Pokémon, with its shiny and radiant) | 'shiny' | 'radiant'. */
  function remove(s, dex, variant = 'all', at = Date.now()) {
    dex = String(dex | 0);
    s.admDel = isObj(s.admDel) ? s.admDel : {};
    const kill = tag => { const c = s[COLL[tag]]; if (isObj(c)) delete c[dex]; s.admDel[tag + dex] = at; };
    if (variant === 'all') { kill('o'); kill('s'); kill('r'); }
    else if (variant === 'shiny') kill('s');
    else if (variant === 'radiant') kill('r');
    fixPartner(s);
    fixFavs(s);
  }

  // ---------------- resets ----------------

  // Maps by Pokémon (dex -> something): what goes with the Pokémon in a Pokémon reset.
  const BY_DEX = ['pupg', 'dfav', 'pused', 'pstart', 'pbind', 'pban', 'prest', 'ureset', 'radOff', 'shinyOff'];
  const atOf = e => (isObj(e) ? +e.at || 0 : +e || 0);

  function resetMons(s, at) {
    for (const coll of ['owned', 'shiny', 'radiant', 'sac']) {
      if (!isObj(s[coll])) continue;
      for (const d of Object.keys(s[coll])) if (atOf(s[coll][d]) <= at) delete s[coll][d];
    }
    const owned = s.owned = isObj(s.owned) ? s.owned : {};
    for (const m of BY_DEX) if (isObj(s[m])) for (const d of Object.keys(s[m])) if (!owned[d]) delete s[m][d];
    if (isObj(s.lab)) { delete s.lab.candy; delete s.lab.cpts; }
    fixPartner(s);
    fixFavs(s);
    // With nothing left, the personality test runs again and gives a starter.
    if (!Object.keys(owned).length) { s.partner = null; s.partnerShiny = false; s.starter = null; s.personality = null; }
  }

  function resetCur(s) {
    s.coins = START();
    s.tickets = { t1: 0, t10: 0, t25: 0 };
    s.gems = 0;
    const base = {};
    for (const k in CUR) base[k] = [k === 'c' ? START() : 0, 0];
    s.led = { base };
  }

  // Kept by a full reset (the rest goes back to empty, whatever the field: new ones too).
  const KEEP = ['name', 'created', 'updated', 'v', 'pupgDone', 'admW', 'admDel'];
  const emptyOf = v => (Array.isArray(v) ? [] : isObj(v) ? {} : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : typeof v === 'string' ? '' : null);
  function resetFull(s) {
    const stats = isObj(s.stats) ? s.stats : {};
    for (const k of Object.keys(s)) if (!KEEP.includes(k)) s[k] = emptyOf(s[k]);
    s.stats = {};
    for (const k in stats) s.stats[k] = 0;
    s.partner = null; s.partnerShiny = false; s.starter = null; s.personality = null;
    s.profile = { favs: [], title: '' };
    resetCur(s);
  }

  const KINDS = {
    mons: { name: 'Pokémon only', apply: (s, at) => resetMons(s, at) },
    monscur: { name: 'Pokémon, coins and tickets', apply: (s, at) => { resetMons(s, at); resetCur(s); } },
    full: { name: 'Full reset', apply: (s, at) => resetFull(s, at) }
  };

  /** Resets a save and remembers it (so its other copies get it too). → the reset's id. */
  function reset(s, kind, at = Date.now(), id = null) {
    if (!KINDS[kind]) throw new Error('unknown reset ' + kind);
    id = id || ('w' + at.toString(36) + Math.random().toString(36).slice(2, 6));
    KINDS[kind].apply(s, at);
    s.admW = isObj(s.admW) ? s.admW : {};
    s.admW[id] = { at, kind };
    return id;
  }

  // ---------------- merging (G.forkMerge) ----------------

  const clone = o => JSON.parse(JSON.stringify(o));
  /** Resets in `from` that `s` hasn't had, oldest first. */
  const missing = (s, from) => Object.keys(from.admW || {}).filter(id => !(s.admW || {})[id])
    .sort((x, y) => from.admW[x].at - from.admW[y].at);
  function catchUp(s, ids, from) {
    for (const id of ids) {
      const w = from.admW[id];
      if (!w || !KINDS[w.kind]) continue;
      KINDS[w.kind].apply(s, +w.at || 0);
      s.admW = isObj(s.admW) ? s.admW : {};
      s.admW[id] = { at: +w.at || 0, kind: w.kind };
    }
  }

  /** Tombstones: an entry from before its tombstone goes; one dated after it stays (from either copy). */
  function bury(r, a, b) {
    const tomb = {};
    for (const s of [a, b]) for (const k in (isObj(s.admDel) ? s.admDel : {})) tomb[k] = Math.max(tomb[k] || 0, +s.admDel[k] || 0);
    if (!Object.keys(tomb).length) return;
    r.admDel = tomb;
    for (const k in tomb) {
      const coll = COLL[k[0]], dex = k.slice(1);
      if (!coll) continue;
      const after = [a, b].map(s => isObj(s[coll]) && s[coll][dex]).filter(e => e && atOf(e) > tomb[k])
        .sort((x, y) => atOf(x) - atOf(y))[0];
      if (after) (r[coll] = isObj(r[coll]) ? r[coll] : {})[dex] = after;
      else if (isObj(r[coll])) delete r[coll][dex];
    }
    fixPartner(r);
    fixFavs(r);
  }

  const before = G.forkMerge;
  G.forkMerge = (r, a, b) => {
    const ma = missing(a, b), mb = missing(b, a);
    if (ma.length || mb.length) {
      // A copy that missed a reset gets it first, then the two merge as usual.
      const a2 = clone(a), b2 = clone(b);
      catchUp(a2, ma, b); catchUp(b2, mb, a);
      const r2 = G.DB.merge(a2, b2);
      for (const k of Object.keys(r)) delete r[k];
      Object.assign(r, r2);
      return;
    }
    if (before) before(r, a, b);
    const w = {};
    for (const s of [a, b]) Object.assign(w, s.admW || {});
    if (Object.keys(w).length) r.admW = w;
    bury(r, a, b);
  };

  // ---------------- reading a save (the manager's views) ----------------

  /** A short summary for the player list. */
  function summary(s) {
    s = s || {};
    const n = c => Object.keys(isObj(s[c]) ? s[c] : {}).length;
    return { owned: n('owned'), shiny: n('shiny'), radiant: n('radiant'),
      coins: bal(s, 'c'), t1: bal(s, 't1'), t10: bal(s, 't10'), t25: bal(s, 't25'), gems: bal(s, 'gm'),
      partner: s.partner || null, runs: (s.stats || {}).runs | 0 };
  }

  return { CUR, KINDS, addCur, give, remove, reset, summary, bal,
    /** For tests: the merge hook alone. */ merge: (r, a, b) => G.forkMerge(r, a, b) };
})();
