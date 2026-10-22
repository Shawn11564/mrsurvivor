/* ============ player-manager.js — the admin's Player Manager (MrSurvivor fork) ============
 * Opened from the admin menu (js/fork/admin.js), for the ADMINS accounts only (the server checks
 * it too: firestore.rules lets only the admin's uid read every save and write these edits).
 *
 *   List      every player with a cloud save or a public profile (saves + profiles, read once
 *             when it opens; Refresh reads them again), searchable, filtered by online / in a
 *             run / in a lobby, with live status while the manager is open (presence.js).
 *   Player    their profile and live status (screen, lobby, run), Join (js/fork/drop-in.js),
 *             coins / tickets / gems (give or take), every Pokémon with its shiny and radiant
 *             (give, remove, delete), their stats, and three resets: Pokémon only; Pokémon,
 *             coins and tickets; full (their public profile is cleared too).
 *   Bulk      tick players (or all of a filter) and give them currencies or a Pokémon, or reset them.
 *
 * Every edit is a transaction on saves/{uid} made of edits the game's merge keeps
 * (js/fork/player-edits.js), then a poke so an online player sees it at once (presence.js).
 * Anything that removes something asks first; resets and bulk resets ask you to type to confirm.
 * Test: fork/test-player-manager.cjs; names in English (Type: Null): fork/test-admin-names.cjs.
 */
G.PlayerManager = (() => {
  const PE = () => G.PlayerEdits;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (+n || 0).toLocaleString('en-US');
  const now = () => (G.Social && G.Social.now ? G.Social.now() : Date.now());
  const ONLINE = 100000, PAGE = 60;

  let el = null, fs = null;
  const players = new Map();       // uid -> { uid, name, title, favs, medals, raw, sum, at, ban, hasSave, hasProfile }
  const pres = new Map();          // uid -> { at, n, st }
  let unPres = null, watchT = 0, loadedAt = 0, openedAt = 0, loading = false;
  const sel = new Set();
  let cur = null;                  // the uid on the right
  let view = 'empty';              // 'empty' | 'player' | 'bulk'
  let filter = 'all', query = '', monTab = 'all', monQuery = '', monShown = PAGE;
  let busy = false;

  // ---------------- data ----------------

  const msOf = v => (v && v.toMillis ? v.toMillis() : +v || 0);
  const fv = () => firebase.firestore.FieldValue;

  async function load() {
    if (loading) return;
    loading = true;
    renderList();
    try {
      const [saves, profs] = await Promise.all([fs.collection('saves').get(), fs.collection('profiles').get()]);
      players.clear();
      for (const d of saves.docs) {
        const x = d.data(), s = x.save || {};
        players.set(d.id, { uid: d.id, name: s.name || '?', title: '', favs: [], raw: s, sum: PE().summary(s),
          at: msOf(x.updatedAt), ban: x.ban === true, hasSave: true, hasProfile: false });
      }
      for (const d of profs.docs) {
        const x = d.data();
        const p = players.get(d.id) || { uid: d.id, raw: null, sum: null, at: 0, hasSave: false };
        Object.assign(p, { name: x.name || p.name || '?', title: x.title || '', favs: Array.isArray(x.favs) ? x.favs : [],
          medals: (x.best && x.best.medals) | 0, hasProfile: true });
        players.set(d.id, p);
      }
      loadedAt = Date.now();
    } catch (e) {
      toast('Could not load players: ' + (e.code || e.message));
    }
    loading = false;
    renderList();
    renderEmpty();
    if (view === 'player') renderPlayer();
    if (view === 'bulk') renderBulk();
  }

  /** One player the list didn't have yet (they appeared after it was read): their save and profile. */
  async function loadOne(uid) {
    try {
      const [sv, pr] = await Promise.all([fs.collection('saves').doc(uid).get(), fs.collection('profiles').doc(uid).get()]);
      const p = players.get(uid) || { uid, name: '?', title: '', favs: [], raw: null, sum: null, at: 0 };
      if (sv.exists) { const x = sv.data(); Object.assign(p, { raw: x.save || {}, sum: PE().summary(x.save || {}), at: msOf(x.updatedAt), ban: x.ban === true, hasSave: true, name: (x.save || {}).name || p.name }); }
      if (pr.exists) { const x = pr.data(); Object.assign(p, { name: x.name || p.name, title: x.title || '', favs: Array.isArray(x.favs) ? x.favs : [], hasProfile: true }); }
      p.stub = false;
      players.set(uid, p);
      renderList();
      if (cur === uid && view === 'player') renderPlayer();
      if (view === 'bulk') renderBulk();
    } catch (e) { /* stays a stub */ }
  }

  /** The live statuses written while you watch (presence.js). */
  function listenPresence() {
    if (unPres) return;
    const since = firebase.firestore.Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
    unPres = fs.collection('apres').where('at', '>', since).onSnapshot(snap => {
      let mine = false;
      snap.docChanges().forEach(ch => {
        const x = ch.doc.data({ serverTimestamps: 'estimate' });
        if (ch.type === 'removed') pres.delete(ch.doc.id);
        else pres.set(ch.doc.id, { at: msOf(x.at), n: x.n, st: x.st || {} });
        if (!players.has(ch.doc.id) && !loading) {
          players.set(ch.doc.id, { uid: ch.doc.id, name: x.n || '?', title: '', favs: [], raw: null, sum: null, at: 0, hasSave: false, stub: true });
          loadOne(ch.doc.id);
        }
        if (ch.doc.id === cur) mine = true;
      });
      renderList();
      renderEmpty();
      if (mine && view === 'player') renderStatus();
    }, e => console.warn('[PlayerManager] presence:', e.code || e.message));
  }

  const live = () => fs.collection('adm').doc('live');
  /** Players report their status while this is in the future (presence.js). */
  function watch(on) {
    return live().set({ watch: on ? now() + 5 * 60 * 1000 : 0 }, { merge: true }).catch(e => console.warn('[PlayerManager] watch:', e.code || e.message));
  }
  /** Old pokes and commands out of adm/live (it's read by every player). */
  async function prune() {
    try {
      const d = await live().get();
      const x = d.exists ? d.data() : {}, old = now() - 3600 * 1000, del = { pokes: {}, cmd: {} };
      let n = 0;
      for (const u in x.pokes || {}) if (+x.pokes[u] < old) { del.pokes[u] = fv().delete(); n++; }
      for (const u in x.cmd || {}) if (!(x.cmd[u] && +x.cmd[u].at >= old)) { del.cmd[u] = fv().delete(); n++; }
      if (n) await live().set(del, { merge: true });
    } catch (e) { /* next time */ }
  }
  /** Tells online players to bring in their edited save. */
  function poke(uids) {
    if (!uids.length) return Promise.resolve();
    const t = now(), pokes = {};
    for (const u of uids) pokes[u] = t;
    return live().set({ pokes }, { merge: true }).catch(e => console.warn('[PlayerManager] poke:', e.code || e.message));
  }
  function command(uid, k) { return live().set({ cmd: { [uid]: { k, at: now() } } }, { merge: true }); }

  /** One edit on a player's cloud save: fn(save) changes it. → fn's result. */
  async function edit(uid, fn) {
    const ref = fs.collection('saves').doc(uid);
    let res, saved;
    await fs.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw { code: 'no-save', message: 'no cloud save yet' };
      const d = snap.data(), s = d.save || {};
      res = fn(s);
      saved = JSON.parse(JSON.stringify(s));
      // rev + 1: a device that saves on upstream's terms (rev, no merge) is turned away and merges first.
      tx.set(ref, { save: saved, updatedAt: fv().serverTimestamp(), v: Number.isInteger(d.v) ? d.v : 3, rev: (Number.isInteger(d.rev) ? d.rev : 0) + 1 },
        { mergeFields: ['save', 'updatedAt', 'v', 'rev'] });
    });
    const p = players.get(uid);
    if (p) { p.raw = saved; p.sum = PE().summary(saved); p.at = Date.now(); p.hasSave = true; }
    return res;
  }

  /** A reset player's public profile: favourites (and for a full reset title, records and medals). */
  async function clearProfile(uid, kind) {
    const ref = fs.collection('profiles').doc(uid), d = await ref.get();
    if (!d.exists) return;
    const upd = { favs: [], at: fv().serverTimestamp() };
    if (kind === 'full') Object.assign(upd, { title: '', medals: [], best: { solo: 0, group: 0, level: 0, bosses: 0, legends: 0, kills: 0, medals: 0 } });
    await ref.update(upd);
    const p = players.get(uid);
    if (p) { p.favs = []; if (kind === 'full') { p.title = ''; p.medals = 0; } }
  }

  /** One edit on many players, a few at a time. → { ok: [uids], failed: [[uid, why]] } */
  async function many(uids, fn, onStep) {
    const ok = [], failed = [], queue = uids.slice();
    let done = 0;
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try { await fn(u); ok.push(u); } catch (e) { failed.push([u, e.message || e.code || String(e)]); }
        done++;
        if (onStep) onStep(done, uids.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    await poke(ok);
    return { ok, failed };
  }

  // ---------------- status words ----------------

  const presOf = uid => pres.get(uid);
  const isOnline = uid => { const p = presOf(uid); return !!p && now() - p.at < ONLINE; };
  function ago(ms) {
    if (!ms) return 'never';
    const s = Math.max(0, (now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }
  const PS = { playing: '', paused: 'paused', levelup: 'picking a level-up card', choice: 'picking an item', held: 'waiting for a teammate',
               over: 'on the run summary', dead: 'down', resuming: 'resuming' };
  // This window is translate="no": the dex's Spanish names (Código Cero) through the dictionary (Type: Null).
  const monName = dex => G.DEX_BY[dex] ? G.T(G.DEX_BY[dex].name) : '#' + dex;
  function where(st) {
    if (!st) return '';
    if (st.s === 'login') return 'On the login screen';
    if (st.s === 'run') {
      const mode = st.mode === 'solo' ? 'Solo run' : st.mode === 'host' ? 'Co-op run (host)' : 'Co-op run';
      return mode + ' · ' + G.U.mmss(st.t || 0) + ' · Lv ' + (st.lv || 1) + (PS[st.ps] ? ' · ' + PS[st.ps] : '');
    }
    if (st.s === 'lobby') return 'In a co-op lobby (' + (st.rn || 1) + '/4' + (st.ro ? '' : ', closed') + ')' + (st.scr && st.scr !== 'Co-op lobby' ? ' · ' + st.scr : '');
    return st.scr ? 'In the menus · ' + st.scr : 'In the menus';
  }
  function short(uid) {
    const p = presOf(uid);
    if (isOnline(uid)) return where(p.st);
    if (p) return 'Last seen ' + ago(p.at);
    const q = players.get(uid);
    return q && q.at ? 'Saved ' + ago(q.at) : 'Offline';
  }

  // ---------------- the window ----------------

  const CSS = `
#pm{position:fixed;inset:14px;z-index:9002;display:flex;flex-direction:column;background:#0b1019;color:#e6f0fb;border:2px solid #ff8ad8;
  border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);font:14px "Segoe UI",system-ui,sans-serif;cursor:auto;overflow:hidden}
#pm *{box-sizing:border-box}
#pm .hidden{display:none!important}
#pm button{font:inherit;cursor:pointer}
#pm input,#pm select{font:inherit;color:#e6f0fb;background:#0c131f;border:1px solid #2f3f5c;border-radius:7px;padding:6px 9px}
#pm input:focus,#pm select:focus{outline:none;border-color:#79b8ff}
#pm h2,#pm h3,#pm h4{font-family:Pixelify,"Segoe UI",sans-serif;font-weight:700;margin:0}
.pm-top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #1f2a3d;background:#101827}
.pm-top h2{font-size:20px;color:#ff8ad8}
.pm-count{color:#8fa3bf;font-size:13px}
.pm-grow{flex:1}
.pm-btn{padding:6px 12px;background:#172338;color:#e6f0fb;border:1px solid #2f4a70;border-radius:7px}
.pm-btn:hover:not(:disabled){background:#1f3150;border-color:#79b8ff}
.pm-btn:disabled{opacity:.45;cursor:default}
.pm-btn.go{background:#163a2a;border-color:#3e9b6a;color:#b9f5d3}
.pm-btn.go:hover:not(:disabled){background:#1d4d37;border-color:#5fe08a}
.pm-btn.warn{background:#3a1720;border-color:#8a3446;color:#ffc2cc}
.pm-btn.warn:hover:not(:disabled){background:#4e1d2a;border-color:#ff5f6d}
.pm-btn.pink{background:#3a1530;border-color:#ff8ad8;color:#ffc4ec}
.pm-btn.sm{padding:3px 9px;font-size:12px}
.pm-x{width:34px;height:34px;border-radius:8px;background:transparent;border:1px solid #2f3f5c;color:#c9d6e8;font-size:16px}
.pm-x:hover{border-color:#ff8ad8;color:#ff8ad8}
.pm-body{flex:1;display:grid;grid-template-columns:360px 1fr;min-height:0}
.pm-side{display:flex;flex-direction:column;border-right:1px solid #1f2a3d;min-height:0;background:#0d1420}
.pm-side .pm-tools{padding:12px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #1f2a3d}
.pm-chips{display:flex;gap:6px;flex-wrap:wrap}
.pm-chip{padding:4px 10px;border-radius:99px;border:1px solid #2f3f5c;background:transparent;color:#a9bad2;font-size:12px}
.pm-chip.on{background:#3a1530;border-color:#ff8ad8;color:#ffc4ec}
.pm-chip b{font-weight:600;margin-left:4px;color:inherit;opacity:.8}
.pm-selbar{display:flex;align-items:center;gap:8px;font-size:12px;color:#8fa3bf}
.pm-selbar label{display:flex;align-items:center;gap:6px;cursor:pointer}
.pm-list{flex:1;overflow:auto;padding:6px}
.pm-row{display:grid;grid-template-columns:18px 10px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent}
.pm-row:hover{background:#131d2e}
.pm-row.cur{background:#1a1730;border-color:#5a2f58}
.pm-row input{margin:0;width:15px;height:15px;accent-color:#ff8ad8}
.pm-row .who{min-width:0}
.pm-row .who b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-row .who small{display:block;color:#7f93b0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-row .meta{display:flex;gap:7px;font-size:12px;color:#a9bad2;white-space:nowrap}
.pm-dot{width:10px;height:10px;border-radius:50%;background:#3a4558;display:inline-block;flex:none}
.pm-dot.on{background:#5fe08a;box-shadow:0 0 0 3px rgba(95,224,138,.18)}
.pm-dot.idle{background:#ffc24a;box-shadow:0 0 0 3px rgba(255,194,74,.16)}
.pm-sh{color:#ffd23f}.pm-rad{color:#ffb347}
.pm-empty{color:#7f93b0;text-align:center;padding:40px 16px}
.pm-main{overflow:auto;padding:18px 20px 30px;min-height:0}
.pm-head{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;margin-bottom:14px}
.pm-head .pic{width:96px;height:84px;border-radius:12px;background:radial-gradient(circle at 50% 70%,#1d2a42,#111827);display:flex;align-items:center;justify-content:center}
.pm-head h3{font-size:24px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.pm-head h3 small{font:600 13px "Segoe UI",sans-serif;color:#ffd23f}
.pm-sub{color:#8fa3bf;font-size:12px;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.pm-uid{font-family:Consolas,monospace;background:#101827;border:1px solid #23314a;border-radius:6px;padding:1px 7px;cursor:pointer;color:#a9bad2}
.pm-uid:hover{border-color:#79b8ff}
.pm-tag{font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid #8a3446;color:#ffc2cc}
.pm-favs{display:flex;gap:4px;margin-top:6px}
.pm-live{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:11px;background:#101a2a;border:1px solid #213049;margin-bottom:14px}
.pm-live .txt{flex:1;min-width:0}
.pm-live .txt b{display:block}
.pm-live .txt small{color:#8fa3bf;font-size:12px}
.pm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}
.pm-card{background:#0f1726;border:1px solid #1f2b40;border-radius:12px;padding:14px}
.pm-card.wide{grid-column:1/-1}
.pm-card h4{font-size:15px;color:#ffd23f;margin-bottom:10px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.pm-card h4 small{font:12px "Segoe UI",sans-serif;color:#8fa3bf}
.pm-card.danger{border-color:#4e1d2a;background:#140e15}
.pm-card.danger h4{color:#ff8a98}
.pm-cur{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
.pm-cur div{background:#0b121e;border:1px solid #1f2b40;border-radius:9px;padding:8px;text-align:center}
.pm-cur small{display:block;color:#8fa3bf;font-size:11px}
.pm-cur b{font:700 16px Pixelify,"Segoe UI",sans-serif}
.pm-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pm-line input[type=number]{width:110px}
.pm-line .grow{flex:1;min-width:140px}
.pm-tabs{display:flex;gap:6px;margin:10px 0}
.pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin-top:10px}
.pm-mon{position:relative;background:#0b121e;border:1px solid #1f2b40;border-radius:10px;padding:4px 4px 6px;text-align:center;cursor:pointer}
.pm-mon:hover{border-color:#79b8ff}
.pm-mon canvas{display:block;margin:0 auto}
.pm-mon b{display:block;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-mon small{color:#6f839f;font-size:11px}
.pm-mon .bd{position:absolute;top:4px;right:6px;font-size:13px;display:flex;gap:2px}
.pm-mon.sh{border-color:#5b4c1a}.pm-mon.rad{border-color:#6b4520}
.pm-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.pm-stats div{background:#0b121e;border:1px solid #1f2b40;border-radius:9px;padding:7px 9px}
.pm-stats small{display:block;color:#8fa3bf;font-size:11px}
.pm-stats b{font:700 15px Pixelify,"Segoe UI",sans-serif}
.pm-danger{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #2a1820}
.pm-danger:first-of-type{border-top:0}
.pm-danger div{flex:1}
.pm-danger b{display:block;color:#ffd9de}
.pm-danger small{color:#a88e96;font-size:12px}
.pm-names{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 14px}
.pm-names span{background:#172338;border:1px solid #2f4a70;border-radius:99px;padding:2px 9px;font-size:12px}
.pm-bulkcur{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
.pm-bulkcur label{font-size:11px;color:#8fa3bf;display:flex;flex-direction:column;gap:4px}
.pm-bulkcur input{width:100%}
.pm-log{margin-top:12px;font-size:12px;color:#a9bad2;white-space:pre-wrap}
.pm-bar{height:6px;border-radius:99px;background:#1a2537;overflow:hidden;margin-top:8px}
.pm-bar i{display:block;height:100%;background:#ff8ad8;width:0;transition:width .2s}
.pm-modal{position:absolute;inset:0;background:rgba(4,7,12,.72);display:flex;align-items:center;justify-content:center;z-index:5;padding:16px}
.pm-box{background:#101827;border:1px solid #33456a;border-radius:12px;padding:18px 20px;width:100%;max-width:440px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.pm-box h3{font-size:18px;margin-bottom:8px}
.pm-box p{color:#b8c7dc;margin:0 0 12px;line-height:1.45}
.pm-box input{width:100%;margin-bottom:12px}
.pm-box .acts{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.pm-mon-acts{display:flex;flex-direction:column;gap:7px;margin:4px 0 12px}
.pm-mon-acts .pm-btn{text-align:left}
.pm-mon-pics{display:flex;gap:10px;justify-content:center;margin-bottom:10px}
.pm-mon-pics figure{margin:0;text-align:center;font-size:11px;color:#8fa3bf}
.pm-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:#172338;border:1px solid #2f4a70;border-radius:9px;padding:8px 14px;z-index:6;pointer-events:none;max-width:80%;text-align:center}
.pm-back{display:none}
@media (max-width:820px){
  #pm{inset:0;border-radius:0;border-width:0}
  .pm-body{grid-template-columns:1fr}
  .pm-side{border-right:0}
  #pm.detail .pm-side{display:none}
  #pm:not(.detail) .pm-main{display:none}
  .pm-back{display:inline-block;margin-bottom:12px}
  .pm-cur,.pm-bulkcur{grid-template-columns:repeat(3,1fr)}
  .pm-head{grid-template-columns:auto 1fr}
}`;

  const HTML = `
<header class="pm-top">
  <h2>Player Manager</h2><span class="pm-count" id="pm-count"></span><span class="pm-grow"></span>
  <button class="pm-btn" data-a="refresh" title="Read every player again">↻ Refresh</button>
  <button class="pm-x" data-a="close" title="Close (Esc)">✕</button>
</header>
<div class="pm-body">
  <aside class="pm-side">
    <div class="pm-tools">
      <input id="pm-q" type="search" placeholder="Search by name or uid" autocomplete="off">
      <div class="pm-chips" id="pm-filter"></div>
      <div class="pm-selbar">
        <label><input type="checkbox" id="pm-all"> Select all shown</label><span class="pm-grow"></span>
        <span id="pm-nsel"></span><button class="pm-btn sm pink" data-a="bulk" id="pm-bulk">Bulk actions</button>
      </div>
    </div>
    <div class="pm-list" id="pm-list"></div>
  </aside>
  <main class="pm-main" id="pm-main"></main>
</div>
<datalist id="pm-dex"></datalist>
<div class="pm-modal hidden" id="pm-modal"></div>
<div class="pm-toast hidden" id="pm-toast"></div>`;

  let toastT = 0;
  function toast(msg, ms = 2600) {
    const t = el.querySelector('#pm-toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }

  function build() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    el = document.createElement('div');
    el.id = 'pm'; el.className = 'hidden'; el.setAttribute('translate', 'no');
    el.innerHTML = HTML;
    el.style.display = 'none';
    document.body.appendChild(el);
    // Keys typed here stay here (input.js listens on window); Esc closes the dialog, then the window.
    el.addEventListener('keyup', e => e.stopPropagation());
    el.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key !== 'Escape') return;
      e.preventDefault();
      const m = el.querySelector('#pm-modal');
      if (!m.classList.contains('hidden')) m.dispatchEvent(new Event('cancel'));
      else close();
    });
    el.addEventListener('click', onClick);
    el.querySelector('#pm-q').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderList(); });
    el.querySelector('#pm-all').addEventListener('change', e => {
      for (const p of shownList()) { if (e.target.checked) sel.add(p.uid); else sel.delete(p.uid); }
      renderList();
      if (view === 'bulk') renderBulk();
    });
    el.querySelector('#pm-dex').innerHTML = G.DEX.filter(p => G.SPRITE_META[p.dex]).map(p => `<option value="${esc(G.T(p.name))} #${p.dex}">`).join('');
  }

  function open() {
    if (!G.Admin || !G.Admin.isAdmin() || !G.DB.fb) { G.UI.toast('Player Manager: admins only, signed in to the cloud'); return; }
    if (!el) build();
    fs = G.DB.fb.fs;
    G.Admin.close();
    el.style.display = 'flex';
    el.classList.remove('hidden');
    openedAt = Date.now();
    listenPresence();
    watch(true);
    prune();
    clearInterval(watchT);
    // Each write of adm/live is one read for every online player: the window renews it every 3 min (it lasts 5).
    let n = 0;
    watchT = setInterval(() => { if (++n % 6 === 0) watch(true); renderList(); renderEmpty(); if (view === 'player') renderStatus(); }, 30 * 1000);
    if (!loadedAt || Date.now() - loadedAt > 10 * 60 * 1000) load(); else renderList();
    if (view === 'player') renderPlayer(); else if (view === 'empty') renderEmpty();
    el.querySelector('#pm-q').focus();
  }

  function close() {
    if (!el || el.style.display === 'none') return;
    el.style.display = 'none';
    el.classList.add('hidden');
    hideModal();
    clearInterval(watchT); watchT = 0;
    if (unPres) { unPres(); unPres = null; }
    watch(false);
  }
  const isOpen = () => !!el && el.style.display !== 'none';

  // ---------------- dialogs ----------------

  function hideModal() { const m = el && el.querySelector('#pm-modal'); if (m) { m.classList.add('hidden'); m.innerHTML = ''; } }

  /**
   * A confirm dialog. type: text to type before the confirm button works.
   * → Promise<boolean>
   */
  function ask({ title, body, ok = 'Confirm', danger = true, type = '' }) {
    return new Promise(done => {
      const m = el.querySelector('#pm-modal');
      m.innerHTML = `<div class="pm-box" role="alertdialog"><h3>${esc(title)}</h3><p>${body}</p>
        ${type ? `<p style="font-size:12px;margin-bottom:6px">Type <b>${esc(type)}</b> to confirm.</p><input id="pm-type" autocomplete="off">` : ''}
        <div class="acts"><button class="pm-btn" data-m="no">Cancel</button><button class="pm-btn ${danger ? 'warn' : 'go'}" data-m="yes" ${type ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
      m.classList.remove('hidden');
      const yes = m.querySelector('[data-m=yes]'), inp = m.querySelector('#pm-type');
      const end = v => { m.onclick = null; m.removeEventListener('cancel', no); hideModal(); done(v); };
      const no = () => end(false);
      if (inp) {
        inp.oninput = () => { yes.disabled = inp.value.trim() !== type; };
        inp.onkeydown = e => { if (e.key === 'Enter' && !yes.disabled) end(true); };
        setTimeout(() => inp.focus(), 30);
      } else setTimeout(() => yes.focus(), 30);
      m.addEventListener('cancel', no);
      m.onclick = e => {
        if (e.target === m) return no();
        const b = e.target.closest('[data-m]');
        if (b && !b.disabled) end(b.dataset.m === 'yes');
      };
    });
  }

  // ---------------- the list ----------------

  const FILTERS = [['all', 'All'], ['online', 'Online'], ['run', 'In a run'], ['lobby', 'In a lobby']];
  function matches(p) {
    if (query && !(String(p.name).toLowerCase().includes(query) || p.uid.toLowerCase().includes(query))) return false;
    if (filter === 'all') return true;
    if (!isOnline(p.uid)) return false;
    const st = presOf(p.uid).st;
    return filter === 'online' || (filter === 'run' && st.s === 'run') || (filter === 'lobby' && st.s === 'lobby');
  }
  function shownList() {
    return [...players.values()].filter(matches).sort((a, b) =>
      (isOnline(b.uid) - isOnline(a.uid)) || String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));
  }

  function renderList() {
    if (!isOpen()) return;
    const all = [...players.values()], online = all.filter(p => isOnline(p.uid));
    const count = k => k === 'all' ? all.length : online.filter(p => k === 'online' || presOf(p.uid).st.s === k).length;
    el.querySelector('#pm-count').textContent = loading && !all.length ? 'Loading players…'
      : `${fmt(all.length)} players · ${fmt(online.length)} online` + (Date.now() - openedAt < 6000 ? ' (checking…)' : '');
    el.querySelector('#pm-filter').innerHTML = FILTERS.map(([k, n]) =>
      `<button class="pm-chip${filter === k ? ' on' : ''}" data-f="${k}">${n}<b>${count(k)}</b></button>`).join('');
    const list = shownList(), box = el.querySelector('#pm-list');
    const prevTop = box.scrollTop;
    if (!list.length) box.innerHTML = `<div class="pm-empty">${loading ? 'Loading…' : players.size ? 'No player matches.' : 'No players yet.'}</div>`;
    else box.innerHTML = list.map(p => {
      const on = isOnline(p.uid), hid = on && presOf(p.uid).st.hid, s = p.sum;
      return `<div class="pm-row${p.uid === cur && view === 'player' ? ' cur' : ''}" data-u="${esc(p.uid)}">
        <input type="checkbox" data-sel="${esc(p.uid)}" ${sel.has(p.uid) ? 'checked' : ''} title="Select for bulk actions">
        <i class="pm-dot${on ? (hid ? ' idle' : ' on') : ''}" title="${on ? (hid ? 'Online, tab in the background' : 'Online') : 'Offline'}"></i>
        <div class="who"><b>${esc(p.name)}${p.uid === (G.DB.fb && G.DB.fb.uid) ? ' <span style="color:#ff8ad8;font-weight:400">(you)</span>' : ''}</b><small>${esc(short(p.uid))}</small></div>
        <div class="meta">${s ? `<span title="Pokémon">${s.owned}</span>${s.shiny ? `<span class="pm-sh" title="Shinies">✦${s.shiny}</span>` : ''}${s.radiant ? `<span class="pm-rad" title="Radiants">◆${s.radiant}</span>` : ''}` : '<span title="No cloud save">—</span>'}</div>
      </div>`;
    }).join('');
    box.scrollTop = prevTop;
    const shownSel = list.filter(p => sel.has(p.uid)).length;
    const all_ = el.querySelector('#pm-all');
    all_.checked = list.length > 0 && shownSel === list.length;
    all_.indeterminate = shownSel > 0 && shownSel < list.length;
    el.querySelector('#pm-nsel').textContent = sel.size ? sel.size + ' selected' : '';
    el.querySelector('#pm-bulk').disabled = !sel.size;
  }

  // ---------------- nothing picked yet ----------------

  function renderEmpty() {
    if (view !== 'empty') return;
    const all = [...players.values()], on = all.filter(p => isOnline(p.uid));
    const n = k => on.filter(p => presOf(p.uid).st.s === k).length;
    const tile = (v, t) => `<div><small>${t}</small><b>${fmt(v)}</b></div>`;
    el.querySelector('#pm-main').innerHTML = `
      <div style="max-width:620px;margin:40px auto 0;text-align:center">
        <h3 style="font-size:22px;color:#ff8ad8;margin-bottom:6px">Pick a player</h3>
        <p style="color:#8fa3bf;margin:0 0 22px">Click a name to see their profile, live status, currencies and Pokémon.
          Tick several (or "Select all shown") for bulk gifts and resets.</p>
        <div class="pm-stats" style="text-align:left">${tile(all.length, 'Players')}${tile(on.length, 'Online now')}${tile(n('run'), 'In a run')}${tile(n('lobby'), 'In a lobby')}${tile(n('menu'), 'In the menus')}</div>
        <p style="color:#6f839f;font-size:12px;margin-top:22px">Online status is live only while this window is open: players report it when you're watching, so it costs nothing otherwise.</p>
      </div>`;
  }

  // ---------------- one player ----------------

  const sprite = (dex, w, h, opts) => G.SPRITE_META[dex] ? G.UI.spriteCanvas(dex, w, h, opts) : document.createElement('canvas');

  function renderStatus() {
    const box = el.querySelector('#pm-live');
    if (!box || !cur) return;
    const p = presOf(cur), on = isOnline(cur), st = on ? p.st : null;
    let title = on ? where(st) : p ? 'Offline · last seen ' + ago(p.at) : 'Offline';
    const bits = [];
    if (st && st.s === 'run') {
      bits.push('Playing ' + monName(st.dex) + (st.rad ? ' (radiant)' : st.sh ? ' (shiny)' : ''));
      if (st.lab) bits.push('Lab mode');
    }
    if (st && st.rm) bits.push((st.rh ? 'Hosting' : 'In') + ' a room with ' + (st.rp || '…'));
    if (st && st.scr && st.s === 'run') bits.push('Screen: ' + st.scr);
    if (st && st.hid) bits.push('Tab in the background');
    if (st && st.mob) bits.push('Touch device');
    if (st && st.ver && G.Updater && G.Updater.version && !G.Updater.version.startsWith(st.ver)) bits.push('Older build ' + st.ver);
    if (!on && !p) bits.push(Date.now() - openedAt < 6000 ? 'Checking…' : 'Not seen since the manager opened');
    const canJoin = on && (st.s === 'lobby' || st.s === 'run') && cur !== (G.DB.fb && G.DB.fb.uid);
    const label = st && st.s === 'lobby' ? 'Join lobby' : 'Join run';
    const why = G.Game.state !== 'ui' ? 'Finish your own run first' : st && st.s === 'lobby' && st.rn >= 4 ? 'The lobby is full' : '';
    box.innerHTML = `<i class="pm-dot${on ? (st.hid ? ' idle' : ' on') : ''}"></i>
      <div class="txt"><b>${esc(title)}</b><small>${esc(bits.join(' · '))}</small></div>
      ${canJoin ? `<button class="pm-btn go" data-a="join" ${why ? `disabled title="${esc(why)}"` : ''}>${label}</button>` : ''}`;
  }

  function monVariant(s, dex) {
    if (monTab === 'radiant') return 'radiant';
    if (monTab === 'shiny') return 'shiny';
    return (s.radiant || {})[dex] && G.Radiant && G.Radiant.has(dex) ? 'radiant' : (s.shiny || {})[dex] ? 'shiny' : 'normal';
  }

  function renderMons(s) {
    const box = el.querySelector('#pm-mons');
    if (!box) return;
    const owned = s.owned || {}, shiny = s.shiny || {}, rad = s.radiant || {};
    let list = Object.keys(owned).map(Number).filter(d => G.DEX_BY[d]).sort((a, b) => a - b);
    if (monTab === 'shiny') list = list.filter(d => shiny[d]);
    if (monTab === 'radiant') list = list.filter(d => rad[d]);
    if (monQuery) list = list.filter(d => monName(d).toLowerCase().includes(monQuery) || String(d) === monQuery.replace('#', ''));
    const grid = document.createElement('div');
    grid.className = 'pm-grid';
    for (const d of list.slice(0, monShown)) {
      const v = monVariant(s, d), c = document.createElement('div');
      c.className = 'pm-mon' + (rad[d] ? ' rad' : shiny[d] ? ' sh' : '');
      c.dataset.dex = d;
      c.title = monName(d) + ' — click to manage';
      c.appendChild(sprite(d, 88, 72, { scale: 2, hero: true, shiny: v === 'shiny', radiant: v === 'radiant' }));
      c.insertAdjacentHTML('beforeend', `<b>${esc(monName(d))}</b><small>#${d}</small>
        <span class="bd">${shiny[d] ? '<span class="pm-sh" title="Shiny">✦</span>' : ''}${rad[d] ? '<span class="pm-rad" title="Radiant">◆</span>' : ''}</span>`);
      grid.appendChild(c);
    }
    box.innerHTML = '';
    if (!list.length) box.innerHTML = `<div class="pm-empty" style="padding:20px">${Object.keys(owned).length ? 'None match.' : 'No Pokémon.'}</div>`;
    else box.appendChild(grid);
    if (list.length > monShown) box.insertAdjacentHTML('beforeend', `<div style="text-align:center;margin-top:10px"><button class="pm-btn" data-a="more">Show ${Math.min(PAGE, list.length - monShown)} more (${list.length - monShown} left)</button></div>`);
  }

  function renderPlayer() {
    const main = el.querySelector('#pm-main'), p = players.get(cur);
    el.classList.add('detail');
    if (!p) { main.innerHTML = '<div class="pm-empty">Player not found.</div>'; return; }
    const s = p.raw || {}, sum = p.sum || PE().summary({}), st = s.stats || {};
    const curTile = (k, n) => `<div><small>${n}</small><b>${fmt(PE().bal(s, k))}</b></div>`;
    const stat = (n, v) => `<div><small>${n}</small><b>${v}</b></div>`;
    main.innerHTML = `
      <button class="pm-btn sm pm-back" data-a="back">‹ Players</button>
      <div class="pm-head">
        <div class="pic" id="pm-pic"></div>
        <div>
          <h3>${esc(p.name)}${p.title ? `<small>${esc(p.title)}</small>` : ''}</h3>
          <div class="pm-sub"><span class="pm-uid" data-a="copy" title="Copy the uid">${esc(p.uid)}</span>
            ${p.ban ? '<span class="pm-tag">Leaderboard ban</span>' : ''}
            <span>${p.hasSave ? 'Cloud save ' + ago(p.at) : 'No cloud save yet'}</span>
            ${s.created ? `<span>Joined ${new Date(s.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div>
          <div class="pm-favs" id="pm-favs"></div>
        </div>
      </div>
      <div class="pm-live" id="pm-live"></div>
      ${p.hasSave ? `
      <div class="pm-cards">
        <section class="pm-card">
          <h4>Currencies</h4>
          <div class="pm-cur">${curTile('c', 'Coins')}${curTile('t1', 'Tickets')}${curTile('t10', '×10 tickets')}${curTile('t25', 'Rainbow ×25')}${curTile('gm', 'Gems')}</div>
          <div class="pm-line"><input type="number" id="pm-amt" min="1" value="1000">
            <select id="pm-curk" class="grow">${Object.keys(PE().CUR).map(k => `<option value="${k}">${PE().CUR[k].name}</option>`).join('')}</select>
            <button class="pm-btn go" data-a="give-cur">Give</button><button class="pm-btn warn" data-a="take-cur">Take</button></div>
        </section>
        <section class="pm-card">
          <h4>Give Pokémon</h4>
          <div class="pm-line"><input id="pm-give-mon" class="grow" list="pm-dex" placeholder="Name or #">
            <select id="pm-give-var"><option value="normal">Normal</option><option value="shiny">Shiny</option><option value="radiant">Radiant</option></select>
            <button class="pm-btn go" data-a="give-mon">Give</button></div>
          <div class="pm-line" style="margin-top:10px"><span style="color:#8fa3bf;font-size:12px">Everything:</span>
            <button class="pm-btn sm" data-a="give-all" data-v="normal">All Pokémon</button>
            <button class="pm-btn sm" data-a="give-all" data-v="shiny">All shinies</button>
            <button class="pm-btn sm" data-a="give-all" data-v="radiant">All radiants</button></div>
        </section>
        <section class="pm-card wide">
          <h4>Pokémon <small>${fmt(sum.owned)} owned · <span class="pm-sh">✦ ${fmt(sum.shiny)} shiny</span> · <span class="pm-rad">◆ ${fmt(sum.radiant)} radiant</span>${s.partner ? ' · partner ' + esc(monName(s.partner)) : ''}</small></h4>
          <div class="pm-line">
            <div class="pm-chips">${[['all', 'All'], ['shiny', '✦ Shiny'], ['radiant', '◆ Radiant']].map(([k, n]) => `<button class="pm-chip${monTab === k ? ' on' : ''}" data-mt="${k}">${n}</button>`).join('')}</div>
            <span class="pm-grow"></span><input id="pm-mq" type="search" placeholder="Find a Pokémon" value="${esc(monQuery)}" style="width:200px">
          </div>
          <div id="pm-mons"></div>
        </section>
        <section class="pm-card wide">
          <h4>Stats</h4>
          <div class="pm-stats">${stat('Runs', fmt(st.runs))}${stat('Best time', G.U.mmss(st.bestTime | 0))}${stat('Best level', fmt(st.bestLevel))}
            ${stat('Best group time', G.U.mmss(st.bestGroupTime | 0))}${stat('Group runs', fmt(st.groupRuns))}${stat('Defeated', fmt(st.totalKills))}
            ${stat('Bosses', fmt(st.bossesTotal))}${stat('Rifts won', fmt(st.riftWins))}${stat('Gacha pulls', fmt(st.pulls))}
            ${stat('Coins earned', fmt(st.coinsEarned))}${stat('Achievements', fmt(Object.keys(s.ach || {}).length))}${stat('Legends beaten', fmt(Object.keys(s.legends || {}).length))}</div>
        </section>
        <section class="pm-card wide danger">
          <h4>Danger zone</h4>
          <div class="pm-danger"><div><b>Reset Pokémon</b><small>Every Pokémon, shiny and radiant, with their upgrades and candies. They take the personality test again for a new starter. Profile favourites are cleared.</small></div>
            <button class="pm-btn warn" data-a="reset" data-k="mons">Reset Pokémon</button></div>
          <div class="pm-danger"><div><b>Reset Pokémon, coins and tickets</b><small>As above, and coins go back to ${fmt(G.DB.START_COINS)}, tickets and gems to 0.</small></div>
            <button class="pm-btn warn" data-a="reset" data-k="monscur">Reset all three</button></div>
          <div class="pm-danger"><div><b>Full reset</b><small>A brand new save with the same name: Pokémon, currencies, upgrades, stats, achievements, missions… Their public profile (favourites, title, records, medals) is cleared too.</small></div>
            <button class="pm-btn warn" data-a="reset" data-k="full">Full reset</button></div>
        </section>
      </div>` : `<div class="pm-card"><p style="margin:0;color:#8fa3bf">This player has a profile but has never saved to the cloud, so there's nothing to edit yet. Their save appears once their game uploads it.</p></div>`}`;
    const pic = main.querySelector('#pm-pic');
    if (s.partner && G.DEX_BY[s.partner]) pic.appendChild(sprite(s.partner, 96, 84, { scale: 2, hero: true, lively: true, shiny: !!s.partnerShiny, radiant: !!(s.radiant || {})[s.partner] && !(s.radOff || {})[s.partner] }));
    const favs = main.querySelector('#pm-favs');
    for (const f of (p.favs || []).slice(0, 3)) if (G.DEX_BY[f.dex]) { const c = sprite(f.dex, 40, 36, { scale: 1, shiny: !!f.shiny }); c.title = 'Favourite: ' + monName(f.dex); favs.appendChild(c); }
    const mq = main.querySelector('#pm-mq');
    if (mq) mq.addEventListener('input', e => { monQuery = e.target.value.trim().toLowerCase(); monShown = PAGE; renderMons(players.get(cur).raw || {}); });
    renderStatus();
    renderMons(s);
    renderList();
  }

  /** Opens a player, with a fresh read of their save (one read). */
  async function show(uid) {
    if (cur !== uid) { monTab = 'all'; monQuery = ''; monShown = PAGE; }
    cur = uid; view = 'player';
    renderPlayer();
    const p = players.get(uid);
    if (!p) return;
    try {
      const d = await fs.collection('saves').doc(uid).get();
      if (d.exists && cur === uid) {
        Object.assign(p, { raw: d.data().save || {}, at: msOf(d.data().updatedAt), ban: d.data().ban === true, hasSave: true });
        p.sum = PE().summary(p.raw);
        renderPlayer();
      }
    } catch (e) { toast('Could not read the save: ' + (e.code || e.message)); }
  }

  /** "Pikachu #25", "25", "pikachu", "Type: Null" or "Código Cero" -> its number; unknown -> 0. */
  function dexOf(v) {
    v = String(v || '').trim();
    const n = +(v.match(/#?(\d+)$/) || [])[1];
    if (n && G.DEX_BY[n]) return n;
    v = v.toLowerCase();
    const m = G.DEX.find(q => G.T(q.name).toLowerCase() === v || q.name.toLowerCase() === v);
    return m ? m.dex : 0;
  }
  const canVariant = (dex, v) => v === 'normal' || (v === 'shiny' ? G.Sprites.hasShiny(dex) : !!(G.Radiant && G.Radiant.has(dex)));
  function allOf(v) {
    return G.DEX.filter(p => G.SPRITE_META[p.dex] && canVariant(p.dex, v)).map(p => p.dex);
  }

  /** Runs an edit on the open player, then shows the result. */
  async function act(fn, done) {
    if (busy) return;
    busy = true;
    const uid = cur;
    try {
      const r = await edit(uid, fn);
      await poke([uid]);
      if (done) toast(done(r));
    } catch (e) { toast('Failed: ' + (e.message || e.code)); }
    busy = false;
    if (cur === uid && view === 'player') renderPlayer();
  }

  async function monMenu(dex) {
    const p = players.get(cur), s = (p && p.raw) || {};
    const has = { shiny: !!(s.shiny || {})[dex], radiant: !!(s.radiant || {})[dex] };
    const m = el.querySelector('#pm-modal');
    m.innerHTML = `<div class="pm-box"><h3>${esc(monName(dex))} <span style="color:#6f839f;font-size:13px">#${dex}</span></h3>
      <div class="pm-mon-pics" id="pm-mpics"></div>
      <div class="pm-mon-acts">
        ${!has.shiny && G.Sprites.hasShiny(dex) ? '<button class="pm-btn go" data-m="give-shiny">✦ Give the shiny</button>' : ''}
        ${!has.radiant && G.Radiant && G.Radiant.has(dex) ? '<button class="pm-btn go" data-m="give-radiant">◆ Give the radiant</button>' : ''}
        ${has.shiny ? '<button class="pm-btn warn" data-m="rm-shiny">Remove the shiny</button>' : ''}
        ${has.radiant ? '<button class="pm-btn warn" data-m="rm-radiant">Remove the radiant</button>' : ''}
        <button class="pm-btn warn" data-m="rm-all">Delete ${esc(monName(dex))}${has.shiny || has.radiant ? ' (with its shiny and radiant)' : ''}</button>
      </div>
      <div class="acts"><button class="pm-btn" data-m="no">Close</button></div></div>`;
    const pics = m.querySelector('#pm-mpics');
    const fig = (cap, opts) => { const f = document.createElement('figure'); f.appendChild(sprite(dex, 84, 72, Object.assign({ scale: 2, lively: true }, opts))); f.insertAdjacentHTML('beforeend', `<figcaption>${cap}</figcaption>`); pics.appendChild(f); };
    fig('Normal', {});
    if (has.shiny) fig('✦ Shiny', { shiny: true });
    if (has.radiant) fig('◆ Radiant', { radiant: true });
    m.classList.remove('hidden');
    const choice = await new Promise(done => {
      const end = v => { m.onclick = null; m.removeEventListener('cancel', no); done(v); };
      const no = () => end('no');
      m.addEventListener('cancel', no);
      m.onclick = e => { if (e.target === m) return no(); const b = e.target.closest('[data-m]'); if (b) end(b.dataset.m); };
    });
    hideModal();
    const name = monName(dex);
    if (choice === 'give-shiny' || choice === 'give-radiant') {
      const v = choice.slice(5);
      return act(s2 => PE().give(s2, dex, v), () => `Gave ${name} (${v})`);
    }
    if (!choice.startsWith('rm-')) return;
    const v = choice.slice(3);
    const what = v === 'all' ? name + (has.shiny || has.radiant ? ', with its shiny and radiant' : '') : 'the ' + v + ' ' + name;
    if (!await ask({ title: 'Delete ' + (v === 'all' ? name : 'the ' + v) + '?', ok: 'Delete',
      body: `${esc(p.name)} loses ${esc(what)}. This can't be undone (you can give it back later).` })) return;
    act(s2 => PE().remove(s2, dex, v), () => `Removed ${what}`);
  }

  async function onClick(e) {
    const t = e.target;
    const chk = t.closest('[data-sel]');
    if (chk) { if (chk.checked) sel.add(chk.dataset.sel); else sel.delete(chk.dataset.sel); renderList(); if (view === 'bulk') renderBulk(); return; }
    const f = t.closest('[data-f]');
    if (f) { filter = f.dataset.f; renderList(); return; }
    const mt = t.closest('[data-mt]');
    if (mt) { monTab = mt.dataset.mt; monShown = PAGE; renderPlayer(); return; }
    const mon = t.closest('.pm-mon');
    if (mon) { monMenu(+mon.dataset.dex); return; }
    const row = t.closest('.pm-row');
    if (row && !t.closest('[data-a]')) { show(row.dataset.u); return; }
    const b = t.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a, p = players.get(cur);
    const $ = id => el.querySelector('#pm-' + id);
    switch (a) {
      case 'close': close(); break;
      case 'refresh': load(); break;
      case 'back': view = 'empty'; cur = null; el.classList.remove('detail'); renderEmpty(); renderList(); break;
      case 'bulk': view = 'bulk'; renderBulk(); break;
      case 'more': monShown += PAGE; renderMons(p.raw || {}); break;
      case 'copy': try { await navigator.clipboard.writeText(cur); toast('uid copied'); } catch (err) { toast(cur); } break;
      case 'join': join(); break;
      case 'give-cur': case 'take-cur': {
        const k = $('curk').value, n = Math.floor(+$('amt').value || 0), name = PE().CUR[k].name.toLowerCase();
        if (n <= 0) { toast('Enter an amount'); return; }
        if (a === 'take-cur' && !await ask({ title: 'Take ' + name + '?', ok: 'Take', body: `Take <b>${fmt(n)} ${esc(name)}</b> from ${esc(p.name)} (never below 0).` })) return;
        act(s => PE().addCur(s, k, a === 'give-cur' ? n : -n), d => (d >= 0 ? 'Gave ' : 'Took ') + fmt(Math.abs(d)) + ' ' + name);
        break;
      }
      case 'give-mon': {
        const dex = dexOf($('give-mon').value), v = $('give-var').value;
        if (!dex) { toast('Pick a Pokémon'); return; }
        if (!canVariant(dex, v)) { toast(monName(dex) + ' has no ' + v + ' form'); return; }
        act(s => PE().give(s, dex, v), added => added ? `Gave ${monName(dex)}${v === 'normal' ? '' : ' (' + v + ')'}` : 'They already had it');
        break;
      }
      case 'give-all': {
        const v = b.dataset.v, list = allOf(v);
        if (!await ask({ title: 'Give every ' + (v === 'normal' ? 'Pokémon' : v) + '?', danger: false, ok: 'Give ' + list.length,
          body: `${esc(p.name)} gets all ${list.length} ${v === 'normal' ? 'Pokémon' : v + ' forms'} they don't have yet.` })) return;
        act(s => list.filter(d => PE().give(s, d, v)).length, n => `Gave ${n} ${v === 'normal' ? 'Pokémon' : v + 's'}`);
        break;
      }
      case 'reset': {
        const k = b.dataset.k, kind = PE().KINDS[k].name;
        if (!await ask({ title: kind + ' for ' + p.name + '?', ok: 'Reset', type: p.name,
          body: `This is permanent. ${k === 'full' ? 'Everything but their name is erased, and their public profile is cleared.' : k === 'mons' ? 'Every Pokémon they have goes.' : 'Every Pokémon goes, and their coins, tickets and gems are reset.'} If they're online, their game reloads when they're back in the menus.` })) return;
        await act(s => PE().reset(s, k), () => kind + ' done');
        try { await clearProfile(cur, k); } catch (err) { toast('Reset done, but the profile could not be cleared: ' + (err.code || err.message)); }
        if (view === 'player') renderPlayer();
        break;
      }
      case 'bulk-cur': case 'bulk-mon': case 'bulk-reset': bulk(a, b); break;
    }
  }

  async function join() {
    const p = players.get(cur), pr = presOf(cur);
    if (!p || !pr) return;
    const btn = el.querySelector('[data-a=join]');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
    const uid = cur;
    const r = await G.DropIn.join(uid, p.name, pr.st, () => { const x = presOf(uid); return x && isOnline(uid) ? x.st : null; });
    if (r.ok) {
      close();
      if (G.Admin.close) G.Admin.close();
      G.UI.toast(r.how === 'lobby' ? 'You joined ' + p.name + '\'s lobby' : 'You joined ' + p.name + '\'s run', 3000);
    } else {
      // The room's own errors (social.js) are the dictionary's Spanish keys; this window isn't translated.
      toast(r.error ? G.T(r.error) : 'Could not join', 4200);
      renderStatus();
    }
  }

  // ---------------- bulk ----------------

  function renderBulk() {
    const main = el.querySelector('#pm-main');
    el.classList.add('detail');
    const list = [...sel].map(u => players.get(u)).filter(Boolean);
    const saves = list.filter(p => p.hasSave);
    if (!list.length) { view = 'empty'; main.innerHTML = '<div class="pm-empty">Tick some players first.</div>'; renderList(); return; }
    const k = Object.keys(PE().CUR);
    main.innerHTML = `
      <button class="pm-btn sm pm-back" data-a="back">‹ Players</button>
      <h3 style="font-size:22px">Bulk actions <span style="font:13px 'Segoe UI';color:#8fa3bf">${list.length} selected${saves.length < list.length ? ` · ${list.length - saves.length} without a cloud save (skipped)` : ''}</span></h3>
      <div class="pm-names">${list.slice(0, 40).map(p => `<span>${esc(p.name)}</span>`).join('')}${list.length > 40 ? `<span>+${list.length - 40} more</span>` : ''}</div>
      <div class="pm-cards">
        <section class="pm-card wide">
          <h4>Give currencies <small>to each selected player</small></h4>
          <div class="pm-bulkcur">${k.map(c => `<label>${PE().CUR[c].name}<input type="number" min="0" placeholder="0" data-bc="${c}"></label>`).join('')}</div>
          <button class="pm-btn go" data-a="bulk-cur">Give to ${saves.length} player${saves.length === 1 ? '' : 's'}</button>
        </section>
        <section class="pm-card wide">
          <h4>Give a Pokémon <small>to each selected player</small></h4>
          <div class="pm-line"><input id="pm-bmon" class="grow" list="pm-dex" placeholder="Name or #">
            <select id="pm-bvar"><option value="normal">Normal</option><option value="shiny">Shiny</option><option value="radiant">Radiant</option></select>
            <button class="pm-btn go" data-a="bulk-mon">Give to ${saves.length}</button></div>
        </section>
        <section class="pm-card wide danger">
          <h4>Reset <small>every selected player</small></h4>
          ${Object.keys(PE().KINDS).map(r => `<div class="pm-danger"><div><b>${PE().KINDS[r].name}</b><small>${r === 'full' ? 'Brand new saves, public profiles cleared.' : r === 'mons' ? 'Every Pokémon, shiny and radiant goes; favourites cleared.' : 'Pokémon, coins, tickets and gems.'}</small></div>
            <button class="pm-btn warn" data-a="bulk-reset" data-k="${r}">Reset ${saves.length}</button></div>`).join('')}
        </section>
      </div>
      <div class="pm-bar hidden" id="pm-bbar"><i></i></div><div class="pm-log" id="pm-blog"></div>`;
    renderList();
  }

  async function bulk(a, b) {
    if (busy) return;
    const list = [...sel].map(u => players.get(u)).filter(p => p && p.hasSave), uids = list.map(p => p.uid);
    if (!uids.length) { toast('None of them has a cloud save'); return; }
    const n = uids.length + ' player' + (uids.length === 1 ? '' : 's');
    let fn, what, ok;
    if (a === 'bulk-cur') {
      const amounts = {};
      el.querySelectorAll('[data-bc]').forEach(i => { const v = Math.floor(+i.value || 0); if (v > 0) amounts[i.dataset.bc] = v; });
      if (!Object.keys(amounts).length) { toast('Enter at least one amount'); return; }
      what = Object.entries(amounts).map(([c, v]) => fmt(v) + ' ' + PE().CUR[c].name.toLowerCase()).join(', ');
      ok = await ask({ title: 'Give to ' + n + '?', danger: false, ok: 'Give', body: `Each one gets <b>${esc(what)}</b>.` });
      fn = s => { for (const c in amounts) PE().addCur(s, c, amounts[c]); };
    } else if (a === 'bulk-mon') {
      const dex = dexOf(el.querySelector('#pm-bmon').value), v = el.querySelector('#pm-bvar').value;
      if (!dex) { toast('Pick a Pokémon'); return; }
      if (!canVariant(dex, v)) { toast(monName(dex) + ' has no ' + v + ' form'); return; }
      what = monName(dex) + (v === 'normal' ? '' : ' (' + v + ')');
      ok = await ask({ title: 'Give ' + what + ' to ' + n + '?', danger: false, ok: 'Give', body: `Each one who doesn't have it yet gets <b>${esc(what)}</b>.` });
      fn = s => PE().give(s, dex, v);
    } else {
      const k = b.dataset.k;
      what = PE().KINDS[k].name;
      const word = 'RESET ' + uids.length;
      ok = await ask({ title: what + ' for ' + n + '?', ok: 'Reset ' + n, type: word,
        body: `This is permanent and can't be undone, for <b>every</b> selected player with a save.` });
      fn = s => PE().reset(s, k);
      if (ok) fn.after = u => clearProfile(u, k).catch(() => {});
    }
    if (!ok) return;
    busy = true;
    const bar = el.querySelector('#pm-bbar'), log = el.querySelector('#pm-blog');
    bar.classList.remove('hidden'); log.textContent = 'Working…';
    const res = await many(uids, async u => { await edit(u, fn); if (fn.after) await fn.after(u); },
      (d, t) => { bar.firstChild.style.width = Math.round(d / t * 100) + '%'; log.textContent = `${d} / ${t}…`; });
    busy = false;
    log.textContent = `${what}: done for ${res.ok.length} of ${uids.length}.` +
      (res.failed.length ? '\nFailed: ' + res.failed.map(([u, why]) => (players.get(u) || {}).name + ' (' + why + ')').join(', ') : '');
    toast(`Done for ${res.ok.length} of ${uids.length}`);
    renderList();
  }

  // Esc with the window open belongs to it, also when the focus is outside it.
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen() && !el.contains(e.target)) { e.preventDefault(); e.stopPropagation(); const m = el.querySelector('#pm-modal'); if (!m.classList.contains('hidden')) m.dispatchEvent(new Event('cancel')); else close(); }
  }, true);

  return { open, close, get isOpen() { return isOpen(); }, command, poke, edit, show,
    /** For tests: what the manager holds. */ get players() { return players; }, get pres() { return pres; } };
})();
