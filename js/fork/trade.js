/* ============ trade.js — trading Pokémon between friends (MrSurvivor fork) ============
 * Two friends open a trade window, each puts up Pokémon from their collection, both confirm,
 * a 3 s countdown runs (either can back out), and each game moves the Pokémon in its own save.
 * There is no server of ours: every save is written only by its owner (firestore.rules), so the
 * trade is a Firestore document whose rules only let it end the way both players agreed to.
 *
 *   trades/{id}      a, b (who asked, who was asked), users [a, b], na (a's name), st:
 *                    'ask' (waiting for b) | 'open' (both in the window) | 'done' | 'off' (by: who left),
 *                    oa / ob (each side's offer: '25n' Pikachu, '25s' its shiny, '150r' radiant Mewtwo),
 *                    rv (+1 on every offer change), ka / kb (the rv each side confirmed, 0 = not) and
 *                    ta / tb (when), ha / hb (heartbeats), pend (who still has to apply it, once done),
 *                    done (when), at (last write).
 *   trades/{id}/h/{uid}   what that player has ({ o, s, r }: dex lists), so the other sees "has it".
 *   trades/{id}/m/{msg}   the chat: { u, t, at }.
 *   tl/{uid}         { t }: the one trade a player is in. A trade can only finish while both players'
 *                    locks point at it, and a lock can't leave a finished trade its player hasn't
 *                    applied yet, so one Pokémon can't go into two trades (two tabs, two devices).
 *
 * The rules (firestore.rules, "trading") check every step: only your own offer and confirmation are
 * yours to write; a confirmation names the offer version it saw (rv) and only counts for that one, so
 * any change to either offer unconfirms both; 'done' needs both confirmations of the current offers,
 * 3 s after the later one (and under 60 s), both players still there (heartbeat) and both locks.
 * Nothing leaves a save before 'done': offers are only proposals, so leaving, closing the window or
 * reloading never loses anything.
 *
 * Applying it (applyTo, pure): what you gave goes as a tombstone (save.trDel['o25'|'s25'|'r150'] =
 * when; merge keeps an entry only if it's dated after it, so another device's copy can't bring it
 * back), what you got is added dated after any tombstone, and save.trd[id] records it (applying twice
 * does nothing). The game applies it to this copy at once, then in one transaction with the cloud
 * save it removes you from `pend` (the rules check the save it writes has trd[id]), with retries;
 * every page load checks the lock's trade too, so a closed tab or another device still gets it.
 *
 * What moves: the Pokémon (or its shiny / radiant form) and nothing else. Upgrades, TMs, Mints,
 * Capsules, prestige, start moves and candies stay with the account that bought them; nature and
 * ability are the receiver's own (G.Mons rolls them per account). Trading needs the cloud and a
 * nickname. Hooks: G.DB.txWith (js/core/db.js), G.forkMerge (outermost, after player-edits.js),
 * G.Social.start. UI: js/fork/trade-ui.js. Test: fork/test-trade.cjs (Firebase emulator).
 */
G.Trade = (() => {
  const MAX = 20;                       // Pokémon per side
  const ASK_TTL = 3 * 60 * 1000;        // an unanswered request
  const COUNT = 3000;                   // the countdown (the rules ask for 3 s too)
  const BEAT = 20 * 1000;               // heartbeat while in the window
  const AWAY = 60 * 1000, GONE = 150 * 1000;
  const KEEP_LOG = 300;                 // trade records kept in the save
  const RESUME = 'ms.trade';

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const atOf = e => (isObj(e) ? +e.at || 0 : +e || 0);
  const msOf = v => (v && v.toMillis ? v.toMillis() : +v || 0);
  const now = () => (G.Social && G.Social.now ? G.Social.now() : Date.now());
  const fts = () => firebase.firestore.FieldValue.serverTimestamp();
  const COLL = { n: 'owned', s: 'shiny', r: 'radiant' };
  const TAG = { n: 'o', s: 's', r: 'r' };            // tombstone keys, as player-edits.js names them

  // ---------------- items ----------------

  const ITEM = /^(\d{1,4})([nsr])$/;
  const radOk = dex => !!(G.Radiant && G.Radiant.has(dex));
  /** '25s' → { dex: 25, v: 's', key } or null if it isn't a real Pokémon (or that radiant doesn't exist). */
  function parse(it) {
    const m = typeof it === 'string' && ITEM.exec(it);
    if (!m) return null;
    const dex = +m[1], v = m[2];
    if (!G.DEX_BY[dex] || (v === 'r' && !radOk(dex))) return null;
    return { dex, v, key: dex + v };
  }
  /** An offer as sent: real items only, no repeats, at most MAX. */
  function clean(list) {
    const seen = new Set(), out = [];
    for (const it of Array.isArray(list) ? list : []) {
      const p = parse(it);
      if (p && !seen.has(p.key) && out.length < MAX) { seen.add(p.key); out.push(p); }
    }
    return out;
  }
  const owns = (s, it) => !!(s && isObj(s[COLL[it.v]]) && s[COLL[it.v]][it.dex]);

  /**
   * What you can put up: a radiant, a shiny, or the Pokémon itself once it has neither (so you never
   * lose more than you offered). why: 'partner' for your partner (pick another one first).
   */
  function offerable(s) {
    const out = [];
    if (!s) return out;
    for (const d of Object.keys(s.owned || {})) {
      const dex = +d;
      if (!G.DEX_BY[dex]) continue;
      const rad = !!(isObj(s.radiant) && s.radiant[dex]) && radOk(dex), sh = !!(isObj(s.shiny) && s.shiny[dex]);
      if (rad) out.push({ dex, v: 'r', key: dex + 'r' });
      if (sh) out.push({ dex, v: 's', key: dex + 's' });
      if (!rad && !sh) out.push({ dex, v: 'n', key: dex + 'n', why: dex === +s.partner ? 'partner' : '' });
    }
    return out;
  }
  /** Why you can't (or can no longer) give it: '' if you can. */
  function cantGive(s, it) {
    if (!owns(s, it)) return 'gone';
    if (it.v === 'n' && ((isObj(s.shiny) && s.shiny[it.dex]) || (isObj(s.radiant) && s.radiant[it.dex]))) return 'variant';
    if (it.v === 'n' && it.dex === +s.partner) return 'partner';
    return '';
  }
  /** What a save has, for the other player's "has it" marks. */
  function haveOf(s) {
    const l = c => Object.keys((s && isObj(s[c]) && s[c]) || {}).map(Number).filter(d => G.DEX_BY[d]);
    return { o: l('owned'), s: l('shiny'), r: l('radiant') };
  }
  const hasIn = (have, it) => !!have && (have[TAG[it.v]] || []).includes(it.dex);

  // ---------------- applying a finished trade (pure, on a save object) ----------------

  function tomb(s, tag, dex, v) {
    const k = tag + dex;
    s.trDel[k] = Math.max(+s.trDel[k] || 0, v);
  }
  /** The time a new entry needs to outlive every tombstone of it (trades, the admin's, a ritual's sacrifice). */
  function after(s, v, dex, at) {
    const k = TAG[v] + dex;
    let t = Math.max(+s.trDel[k] || 0, +(s.admDel || {})[k] || 0);
    if (v === 's') t = Math.max(t, +(s.sac || {})[dex] || 0);
    return Math.max(at, t + 1);
  }
  function give(s, it, at) {
    const c = s[COLL[it.v]];
    if (!isObj(c) || !c[it.dex]) return;
    // The Pokémon itself only goes if it has no shiny or radiant left (they need it).
    if (it.v === 'n' && ((isObj(s.shiny) && s.shiny[it.dex]) || (isObj(s.radiant) && s.radiant[it.dex]))) return;
    tomb(s, TAG[it.v], it.dex, Math.max(at, atOf(c[it.dex])));
    delete c[it.dex];
  }
  function take(s, it, at) {
    const put = v => {
      const c = s[COLL[v]] = isObj(s[COLL[v]]) ? s[COLL[v]] : {};
      if (!c[it.dex]) c[it.dex] = { at: after(s, v, it.dex, at), from: 'trade' };
    };
    put('n');
    if (it.v !== 'n') put(it.v);
    if (it.v === 'r' && isObj(s.radOff)) delete s.radOff[it.dex];
  }
  /** Another partner if yours is gone (the most played one left), and no shiny partner without its shiny. */
  function fixPartner(s) {
    const owned = isObj(s.owned) ? s.owned : {};
    if (s.partner != null && !owned[s.partner]) {
      const left = Object.keys(owned).filter(d => G.DEX_BY[d]).sort((x, y) => (+(s.pused || {})[y] || 0) - (+(s.pused || {})[x] || 0));
      if (left.length) { s.partner = +left[0]; s.partnerShiny = false; }
    }
    if (s.partnerShiny && !(isObj(s.shiny) && s.shiny[s.partner])) s.partnerShiny = false;
    if (isObj(s.profile) && Array.isArray(s.profile.favs)) {
      s.profile.favs = s.profile.favs.filter(f => f && owned[f.dex])
        .map(f => (f.shiny && !(isObj(s.shiny) && s.shiny[f.dex]) ? Object.assign({}, f, { shiny: false }) : f));
    }
  }
  function prune(s) {
    const ids = Object.keys(s.trd);
    if (ids.length <= KEEP_LOG) return;
    ids.sort((x, y) => (+s.trd[y].at || 0) - (+s.trd[x].at || 0)).slice(KEEP_LOG).forEach(id => delete s.trd[id]);
  }
  /** Your side of trade t: [what you give, what you get]. */
  const sides = (t, me) => (me === t.a ? [clean(t.oa), clean(t.ob)] : [clean(t.ob), clean(t.oa)]);

  /** Applies finished trade t (with its id) to save s as player `me`. → false if it was already in. */
  function applyTo(s, t, me) {
    if (!s || !t || !t.id || t.st !== 'done' || (me !== t.a && me !== t.b)) return false;
    s.trd = isObj(s.trd) ? s.trd : {};
    if (s.trd[t.id]) return false;
    s.trDel = isObj(s.trDel) ? s.trDel : {};
    const at = msOf(t.done) || Date.now();
    const [out, got] = sides(t, me);
    for (const it of out) give(s, it, at);
    for (const it of got) take(s, it, at);
    const other = me === t.a ? t.b : t.a;
    s.trd[t.id] = { at, w: String(other).slice(0, 128), out: out.map(i => i.key), in: got.map(i => i.key) };
    prune(s);
    fixPartner(s);
    s.updated = Date.now();
    return true;
  }

  // ---------------- merging two copies of a save (G.forkMerge) ----------------

  // player-edits.js re-merges both copies itself when one missed an admin reset (that merge runs this
  // hook on the right copies); then this outer call must not bring back what the reset took.
  const resetGap = (x, y) => Object.keys((y && y.admW) || {}).some(id => !((x && x.admW) || {})[id]);
  const before = G.forkMerge;
  G.forkMerge = (r, a, b) => {
    if (before) before(r, a, b);
    if (resetGap(a, b) || resetGap(b, a)) return;
    const trd = {}, del = {};
    for (const s of [a, b]) {
      if (isObj(s.trd)) for (const id in s.trd) if (!trd[id]) trd[id] = s.trd[id];
      if (isObj(s.trDel)) for (const k in s.trDel) del[k] = Math.max(del[k] || 0, +s.trDel[k] || 0);
    }
    if (!Object.keys(trd).length && !Object.keys(del).length) return;
    r.trd = trd; prune(r);
    r.trDel = del;
    // An entry stays only if it's dated after every tombstone of it; the earliest such one wins.
    for (const k in del) {
      const v = { o: 'n', s: 's', r: 'r' }[k[0]], dex = k.slice(1);
      if (!v) continue;
      const coll = COLL[v];
      let lim = Math.max(del[k], +(r.admDel || {})[k] || 0);
      if (v === 's') lim = Math.max(lim, +(r.sac || {})[dex] || 0);
      const keep = [r, a, b].map(s => isObj(s[coll]) && s[coll][dex]).filter(e => e && atOf(e) > lim)
        .sort((x, y) => atOf(x) - atOf(y))[0];
      if (keep) (r[coll] = isObj(r[coll]) ? r[coll] : {})[dex] = keep;
      else if (isObj(r[coll])) delete r[coll][dex];
    }
    fixPartner(r);
  };

  // ---------------- the trade, live ----------------

  let fb = null, uid = null, booted = false;
  let cur = null;               // { id, t (the doc, with id), mine, ... } while you're in a trade
  let unT = null, unM = null, beatT = 0, retryT = 0, countT = 0;
  let msgs = [];
  let theirHave = null;
  const asks = new Map();       // id -> trade doc: requests to you
  let unAsk = null;
  const listeners = new Set();
  const emit = what => listeners.forEach(fn => { try { fn(what); } catch (e) { console.warn('[Trade]', e); } });

  const T = id => fb.fs.collection('trades').doc(id);
  const L = u => fb.fs.collection('tl').doc(u);
  const side = t => (t.a === uid ? 'a' : 'b');
  const otherOf = t => (t.a === uid ? t.b : t.a);
  const withId = snap => Object.assign({ id: snap.id }, snap.data());
  /** A player's name: from your friends list, else the one the request came with. */
  const nameOf = (u, t) => {
    const f = G.Social && G.Social.friends.find(x => x.uid === u);
    t = t || (cur && cur.t);
    return f ? f.name : (t && t.a === u && typeof t.na === 'string' && t.na.slice(0, 24)) || 'your friend';
  };

  /** After logging in (G.Social has a nickname): requests to you, an unfinished trade, a reload's trade. */
  function boot() {
    if (booted || !G.DB.online || !G.Social.me) return;
    booted = true;
    fb = G.DB.fb; uid = fb.uid;
    listenAsks();
    checkLock().catch(e => console.warn('[Trade] check:', e.code || e.message));
  }
  async function stop() {
    if (!booted) return;
    if (cur) await Promise.race([leave('logout'), new Promise(r => setTimeout(r, 3000))]);
    if (unAsk) { unAsk(); unAsk = null; }
    asks.clear();
    booted = false; fb = null; uid = null;
    emit('asks');
  }

  /** Requests come only from friends (the rules check it); listened to from the start, like party invites. */
  function listenAsks() {
    if (unAsk) return;
    unAsk = fb.fs.collection('trades').where('b', '==', uid).where('st', '==', 'ask').onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type === 'removed') { asks.delete(ch.doc.id); return; }
        const t = withId(ch.doc);
        // An old one its sender never closed (they closed the game): closed here, so it isn't read again.
        if (msOf(t.at) && now() - msOf(t.at) > ASK_TTL * 2) { asks.delete(t.id); ch.doc.ref.update({ st: 'off', by: uid, at: fts() }).catch(() => {}); return; }
        asks.set(t.id, t);
      });
      emit('asks');
    }, e => console.warn('[Trade] requests:', e.code || e.message));
  }
  /** Fresh requests, oldest first (expired ones are left for their sender to close). */
  function requests() {
    return [...asks.values()].filter(t => t.st === 'ask' && now() - msOf(t.at) < ASK_TTL && (!cur || cur.id !== t.id))
      .sort((x, y) => msOf(x.at) - msOf(y.at));
  }

  /**
   * Your lock's trade: finished and the cloud still waiting for you (pend) → applied (and the cloud
   * told; once you're off pend your cloud save has it, which this copy merged when it loaded); still
   * open and this tab was in it before reloading → back into it.
   */
  async function checkLock() {
    const ls = await L(uid).get();
    if (!ls.exists || !ls.data().t) { forget(); return; }
    const ts = await T(ls.data().t).get();
    if (!ts.exists) { forget(); return; }
    const t = withId(ts);
    if (t.st === 'done' && (t.pend || []).includes(uid)) {
      const fresh = applyLocal(t);
      settleCloud(t);
      if (fresh) emit({ k: 'applied', t, late: true });
      forget();
      return;
    }
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem(RESUME) || 'null'); } catch (e) { /* nothing */ }
    if (r && r.id === t.id && r.uid === uid && (t.st === 'open' || (t.st === 'ask' && t.a === uid))) {
      attach(t, true);
      emit('resumed');
    } else {
      if (r && r.id === t.id) {
        forget();
        if (t.st === 'off') emit({ k: 'ended', why: t.by === uid ? 'you' : 'left', name: nameOf(otherOf(t), t) });
      }
      // A trade left open by a tab that's gone (no heartbeat from you for a while): closed, nothing traded.
      if (t.st === 'open' && now() - (msOf(t['h' + side(t)]) || msOf(t.at)) > 45000) T(t.id).update({ st: 'off', by: uid, at: fts() }).catch(() => {});
    }
  }
  function remember() {
    try { if (cur) sessionStorage.setItem(RESUME, JSON.stringify({ id: cur.id, uid, t: Date.now() })); } catch (e) { /* nothing */ }
  }
  function forget() { try { sessionStorage.removeItem(RESUME); } catch (e) { /* nothing */ } }

  /**
   * The start of a trade (asking or accepting), in one transaction with your save: your lock's old
   * trade is applied first if it finished and you hadn't (the rules won't move the lock off it), or
   * closed if it was still open; then the lock points at this one and `write` makes it.
   */
  async function begin(write) {
    let fresh = null;
    await G.DB.txWith(async (tx, merged) => {
      fresh = null;
      const ls = await tx.get(L(uid));
      const old = ls.exists && ls.data().t ? ls.data().t : null;
      const ps = old ? await tx.get(T(old)) : null;
      const prev = ps && ps.exists ? withId(ps) : null;
      const target = await write.read(tx);
      let wrote = false;
      if (prev && prev.st === 'done' && (prev.pend || []).includes(uid)) {
        applyTo(merged, prev, uid);
        tx.update(T(prev.id), { pend: firebase.firestore.FieldValue.arrayRemove(uid), at: fts() });
        fresh = prev; wrote = true;
      } else if (prev && (prev.st === 'ask' || prev.st === 'open') && prev.id !== write.id) {
        tx.update(T(prev.id), { st: 'off', by: uid, at: fts() });
      }
      write.write(tx, target);
      tx.set(L(uid), { t: write.id, at: fts() });
      return wrote;
    });
    if (fresh) { applyLocal(fresh); emit({ k: 'applied', t: fresh, late: true }); }
  }

  /** Asks a friend to trade. → { ok, error? } */
  async function ask(friend) {
    if (!booted) return { ok: false, error: 'Trading needs an online account with a nickname.' };
    if (cur) return { ok: false, error: "You're already in a trade." };
    const f = G.Social.friends.find(x => x.uid === friend);
    if (!f || f.status !== 'ok') return { ok: false, error: 'You can only trade with your friends.' };
    if (G.Game.state !== 'ui') return { ok: false, error: 'Finish your run first.' };
    const id = fb.fs.collection('trades').doc().id;
    const doc = { a: uid, b: friend, users: [uid, friend], na: G.Social.me.name, st: 'ask', oa: [], ob: [], rv: 0,
                  ka: 0, kb: 0, ta: null, tb: null, ha: fts(), hb: null, pend: [], at: fts() };
    try {
      await begin({ id, read: async () => null, write: tx => tx.set(T(id), doc) });
    } catch (e) { return { ok: false, error: failText(e) }; }
    attach(Object.assign({ id }, doc, { at: null, ha: null }), false);
    return { ok: true };
  }

  /** Accepts a request. → { ok, error? } */
  async function accept(id) {
    if (!booted) return { ok: false, error: 'Trading needs an online account with a nickname.' };
    if (cur && cur.id !== id) await leave('switch');
    let t = null;
    try {
      await begin({
        id,
        read: async tx => {
          const s = await tx.get(T(id));
          t = s.exists ? withId(s) : null;
          if (!t || t.st !== 'ask' || t.b !== uid || now() - msOf(t.at) > ASK_TTL) throw { code: 'gone' };
          return t;
        },
        write: tx => tx.update(T(id), { st: 'open', hb: fts(), at: fts() })
      });
    } catch (e) {
      asks.delete(id); emit('asks');
      return { ok: false, error: e && e.code === 'gone' ? 'That trade request has expired.' : failText(e) };
    }
    asks.delete(id);
    attach(Object.assign({}, t, { st: 'open' }), false);
    return { ok: true };
  }

  async function decline(id) {
    asks.delete(id); emit('asks');
    try { await T(id).update({ st: 'off', by: uid, at: fts() }); } catch (e) { /* already gone */ }
  }

  function failText(e) {
    const c = (e && e.code) || '';
    if (c === 'permission-denied') return "Couldn't start the trade (permission-denied). If you just saved, try again in 20 seconds.";
    if (c === 'unavailable' || c === 'offline') return 'No connection: try again in a moment.';
    return "Couldn't start the trade (" + (c || 'error') + ').';
  }

  /** Into the window: listen to the trade and its chat, heartbeat, publish what you have. */
  function attach(t, resumed) {
    detach();
    cur = { id: t.id, t, resumed, since: Date.now(), sentHave: false, changed: false, doneTry: 0 };
    msgs = []; theirHave = null;
    remember();
    unT = T(t.id).onSnapshot({ includeMetadataChanges: true }, snap => {
      if (!cur || cur.id !== t.id || !snap.exists) return;
      onTrade(withId(snap), snap.metadata.hasPendingWrites);
    }, e => console.warn('[Trade] trade:', e.code || e.message));
    clearInterval(beatT);
    beatT = setInterval(tick, 1000);
    emit('open');
  }
  function detach() {
    if (unT) { unT(); unT = null; }
    if (unM) { unM(); unM = null; }
    clearInterval(beatT); beatT = 0; clearTimeout(retryT); clearTimeout(countT);
  }

  function onTrade(t, pendingWrites) {
    const prev = cur.t;
    cur.t = t;
    if (t.st === 'open' && !unM) listenChat();
    if (t.st === 'open' && !cur.sentHave) {
      cur.sentHave = true;
      T(t.id).collection('h').doc(uid).set(haveOf(G.DB.save)).catch(e => console.warn('[Trade] have:', e.code || e.message));
      if (cur.resumed && t['k' + side(t)]) unconfirm();       // back after a reload: look again before trading
      beat();
    }
    if (t.st === 'open' && !theirHave) loadHave(t);
    // An offer changed after someone confirmed: say so (the rules already void the old confirmations).
    const anyOk = d => d.rv > 0 && (d.ka === d.rv || d.kb === d.rv);
    if (prev && prev.rv !== t.rv && anyOk(prev)) cur.changed = true;
    if (anyOk(t)) cur.changed = false;
    if (t.st === 'done') { finish(t); return; }
    if (t.st === 'off') { end(t.by === uid ? 'you' : 'left'); return; }
    // Both confirmed the current offers (as the server has it): the countdown.
    const both = t.st === 'open' && t.rv > 0 && t.ka === t.rv && t.kb === t.rv;
    if (both && !pendingWrites && !cur.count) {
      cur.count = { rv: t.rv, end: performance.now() + COUNT };
      clearTimeout(countT);
      countT = setTimeout(tryDone, COUNT + 50);
    } else if (!both && cur.count) { cur.count = null; clearTimeout(countT); }
    emit('trade');
  }

  function loadHave(t) {
    if (cur.haveLoading) return;
    cur.haveLoading = true;
    const id = t.id;
    T(id).collection('h').doc(otherOf(t)).get().then(s => {
      if (!cur || cur.id !== id) return;
      cur.haveLoading = false;
      if (s.exists) { theirHave = s.data(); emit('trade'); }
      else setTimeout(() => { if (cur && cur.id === id && !theirHave) loadHave(cur.t); }, 1500);
    }, () => { if (cur) cur.haveLoading = false; });
  }

  function listenChat() {
    const id = cur.id;
    unM = T(id).collection('m').orderBy('at', 'desc').limit(60).onSnapshot(snap => {
      if (!cur || cur.id !== id) return;
      msgs = snap.docs.map(d => Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' }))).reverse();
      emit('chat');
    }, e => console.warn('[Trade] chat:', e.code || e.message));
  }

  let lastSay = 0;
  /** → { ok, error? } */
  async function say(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!cur || !text || cur.t.st !== 'open') return { ok: false };
    if (performance.now() - lastSay < 700) return { ok: false, error: 'Slow down a little.' };
    lastSay = performance.now();
    try { await T(cur.id).collection('m').add({ u: uid, t: text, at: fts() }); return { ok: true }; }
    catch (e) { return { ok: false, error: "Couldn't send (" + (e.code || 'error') + ').' }; }
  }

  function beat() {
    if (!cur || cur.t.st !== 'open') return;
    cur.beatAt = Date.now();
    T(cur.id).update({ ['h' + side(cur.t)]: fts(), at: fts() }).catch(() => {});
  }

  /** Every second while in a trade: heartbeat, an unanswered request, the other player gone, a run started. */
  function tick() {
    if (!cur) return;
    const t = cur.t;
    if (t.st !== 'open' && t.st !== 'ask') return;
    if (G.Game.state !== 'ui') { leave('run'); return; }
    // Your request: 3 minutes (from when it was sent, or from coming back to it after a reload).
    if (t.st === 'ask') {
      const sent = Math.max(msOf(t.at) ? Date.now() - (now() - msOf(t.at)) : 0, cur.since);
      if (Date.now() - sent > ASK_TTL) { leave('noanswer'); return; }
    } else {
      if (Date.now() - (cur.beatAt || 0) > BEAT) beat();
      if (awayFor() > GONE) { leave('gone'); return; }
    }
    emit('tick');
  }
  /** How long the other player's heartbeat has been quiet (ms, by the server's clock). */
  function awayFor() {
    if (!cur) return 0;
    const t = cur.t, h = msOf(t['h' + (side(t) === 'a' ? 'b' : 'a')]) || msOf(t.at);
    return h ? Math.max(0, now() - h) : 0;
  }

  // ---------------- your moves ----------------

  const mineOf = t => clean(t['o' + side(t)]);
  const theirsOf = t => clean(t['o' + (side(t) === 'a' ? 'b' : 'a')]);

  /** Puts your offer to `keys` (a list of item keys). → { ok, error? } */
  async function setOffer(keys) {
    if (!cur || cur.t.st !== 'open') return { ok: false };
    const s = G.DB.save;
    const list = clean(keys).filter(it => !cantGive(s, it)).map(it => it.key);
    if (JSON.stringify(list) === JSON.stringify(mineOf(cur.t).map(i => i.key))) return { ok: true };
    try {
      await T(cur.id).update({ ['o' + side(cur.t)]: list, rv: firebase.firestore.FieldValue.increment(1), at: fts() });
      return { ok: true };
    } catch (e) { return { ok: false, error: "Couldn't change your offer (" + (e.code || 'error') + ').' }; }
  }
  function toggle(key) {
    if (!cur) return Promise.resolve({ ok: false });
    const l = mineOf(cur.t).map(i => i.key);
    const i = l.indexOf(key);
    if (i >= 0) l.splice(i, 1);
    else if (l.length >= MAX) return Promise.resolve({ ok: false, error: `At most ${MAX} Pokémon each.` });
    else l.push(key);
    return setOffer(l);
  }

  /** Why you can't confirm now ('' if you can). */
  function cantConfirm() {
    if (!cur || cur.t.st !== 'open') return 'The trade isn\'t open yet.';
    const t = cur.t, mine = mineOf(t), theirs = theirsOf(t);
    if (!mine.length && !theirs.length) return 'Put up a Pokémon first (or wait for theirs).';
    const raw = t['o' + (side(t) === 'a' ? 'b' : 'a')] || [];
    if (raw.length !== theirs.length) return 'Their offer has something that isn\'t a real Pokémon.';
    const bad = mine.find(it => cantGive(G.DB.save, it));
    if (bad) return `You no longer have ${G.DEX_BY[bad.dex].name}: take it out of your offer.`;
    return '';
  }

  /** → { ok, error? } */
  async function confirmIt() {
    const why = cantConfirm();
    if (why) return { ok: false, error: why };
    const t = cur.t, s = side(t);
    try {
      await T(cur.id).update({ ['k' + s]: t.rv, ['t' + s]: fts(), at: fts() });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.code === 'permission-denied' ? 'The offer just changed: have a look and confirm again.' : "Couldn't confirm (" + (e.code || 'error') + ').' };
    }
  }
  async function unconfirm() {
    if (!cur || cur.t.st !== 'open') return { ok: false };
    const s = side(cur.t);
    try { await T(cur.id).update({ ['k' + s]: 0, ['t' + s]: null, at: fts() }); return { ok: true }; }
    catch (e) { return { ok: false, error: "Couldn't unconfirm (" + (e.code || 'error') + ').' }; }
  }

  /**
   * The countdown is over: finish it (either game may; the first one in wins). The rules check the 3 s
   * by the server's clock, so a game a little ahead of it is turned away and tries again.
   */
  async function tryDone() {
    if (!cur || !cur.count) return;
    const id = cur.id, rv = cur.count.rv;
    try {
      await fb.fs.runTransaction(async tx => {
        const s = await tx.get(T(id));
        const t = s.data();
        if (!t || t.st !== 'open' || t.rv !== rv || t.ka !== rv || t.kb !== rv) throw { code: 'changed' };
        tx.update(T(id), { st: 'done', pend: t.users, done: fts(), at: fts() });
      });
      cur && (cur.doneTry = 0);
    } catch (e) {
      if (!cur || cur.id !== id || !cur.count || cur.count.rv !== rv) return;
      if (e && e.code === 'changed') return;
      // Too early by the server's clock, or the other player's game hasn't been heard from: again shortly.
      cur.doneTry++;
      if (cur.doneTry < 40) { clearTimeout(countT); countT = setTimeout(tryDone, cur.doneTry < 6 ? 400 : 1500); }
      else { cur.count = null; cur.doneTry = 0; unconfirm(); emit({ k: 'stuck' }); }
    }
  }

  /** Leaves the trade (nothing is traded). why: 'you' | 'run' | 'logout' | 'gone' | 'noanswer' | 'switch'. */
  function leave(why = 'you') {
    if (!cur) return Promise.resolve();
    const id = cur.id, t = cur.t;
    const w = t.st === 'ask' || t.st === 'open' ? T(id).update({ st: 'off', by: uid, at: fts() }).catch(() => {}) : Promise.resolve();
    end(why, true);
    return w;
  }

  function end(why, mine) {
    if (!cur) return;
    const t = cur.t, name = nameOf(otherOf(t), t);
    detach();
    cur = null; theirHave = null; msgs = [];
    forget();
    emit({ k: 'ended', why: mine ? why : why === 'you' ? 'you' : 'left', name, wasAsk: t.st === 'ask' });
  }

  /** The trade went through: into this copy of your save now, then the cloud. */
  function finish(t) {
    if (!cur || cur.finishing) return;
    if (!t.done || !msOf(t.done)) return;            // (wait for the server's time)
    cur.finishing = true;
    const fresh = applyLocal(t);
    const [out, got] = sides(t, uid);
    detach();
    cur = null; theirHave = null;
    forget();
    settleCloud(t);
    emit({ k: 'applied', t, out, got, name: nameOf(otherOf(t), t), fresh });
  }

  function applyLocal(t) {
    const s = G.DB.save;
    if (!s) return false;
    const fresh = applyTo(s, t, uid);
    if (fresh) G.DB.commit(true);
    return fresh;
  }

  /** Tells the cloud (with your save, in one transaction), retrying until it's in. */
  const settling = new Set();
  function settleCloud(t, n = 0, me = uid) {
    if (!booted || uid !== me || settling.has(t.id)) return;
    settling.add(t.id);
    const go = () => G.DB.txWith(async (tx, merged) => {
      const s = await tx.get(T(t.id));
      const d = s.exists ? withId(s) : null;
      if (!d || d.st !== 'done' || !(d.pend || []).includes(uid)) return false;
      applyTo(merged, d, uid);
      // (arrayRemove: the other game may take itself off at the same moment.)
      tx.update(T(t.id), { pend: firebase.firestore.FieldValue.arrayRemove(uid), at: fts() });
      return true;
    });
    go().then(() => { settling.delete(t.id); emit('settled'); }, e => {
      settling.delete(t.id);
      console.warn('[Trade] saving the trade:', e.code || e.message);
      if (!booted) return;
      // Most likely your save went up under 20 s ago (the rules' limit): try again.
      const ms = Math.min(5 * 60e3, [8e3, 15e3, 25e3, 45e3, 90e3][n] || 180e3);
      setTimeout(() => settleCloud(t, n + 1, me), ms);
    });
  }

  // A reload during the countdown: take your confirmation back if the page lets us (the trade itself
  // comes back after the reload, unconfirmed).
  addEventListener('pagehide', () => {
    if (!cur || cur.t.st !== 'open') return;
    remember();
    if (cur.t['k' + side(cur.t)]) unconfirm();
  });

  // Logging in, out.
  G.DB.onLeave(() => stop());
  if (G.Social) {
    const start = G.Social.start;
    G.Social.start = async function () {
      const r = await start.apply(this, arguments);
      if (r === 'ok') boot();
      return r;
    };
    G.Social.on(what => { if (what === 'stop') stop(); else if (!booted && G.Social.me) boot(); });
  }

  return {
    MAX, COUNT, ASK_TTL, parse, clean, offerable, cantGive, haveOf, hasIn, applyTo,
    boot, ask, accept, decline, leave, toggle, setOffer, confirm: confirmIt, unconfirm, say, cantConfirm, awayFor,
    requests, on(fn) { listeners.add(fn); }, off(fn) { listeners.delete(fn); },
    nameOf, sides,
    get uid() { return uid; },
    get ready() { return booted; },
    get cur() { return cur; },
    get trade() { return cur && cur.t; },
    get mine() { return cur ? mineOf(cur.t) : []; },
    get theirs() { return cur ? theirsOf(cur.t) : []; },
    get theirHave() { return theirHave; },
    get msgs() { return msgs; },
    get countLeft() { return cur && cur.count ? Math.max(0, cur.count.end - performance.now()) : -1; },
    get changed() { return !!(cur && cur.changed); },
    get side() { return cur ? side(cur.t) : ''; },
    get other() { return cur ? otherOf(cur.t) : ''; }
  };
})();
