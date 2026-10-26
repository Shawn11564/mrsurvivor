/* ============ requests.js — Requests: the artist's line to Claude (MrSurvivor fork) ============
 * A private ticket board inside the game for the staff accounts (the admin and the artist, STAFF
 * below; firestore.rules has the same list in staff()). The artist writes a change request or a
 * question, with pictures; a Claude Code session on the owner's PC picks it up (fork/requests.cjs,
 * the /requests skill), answers in the thread, makes the change, pushes it and links the commit.
 *
 *   Where      the admin menu's "Requests" button (admins), or the REQUESTS button at the bottom left
 *              (staff who aren't admins). Both show how many threads have news for you.
 *   Data       req/{id}: { by, n (name), k ('q' question | 'c' change), t (text), pics (data URLs, up to 3
 *              of ≤300 KB), st (new | working | ask | done | closed), at, up (last activity), lb (who wrote
 *              last: a uid or 'claude') }. Messages in req/{id}/m/{mid}: { by, n, t, at, pics, c (commit) }.
 *              The artist writes only their own requests and messages and may set an 'ask' back to 'new'
 *              (they answered) or close their own open request; the admin and the watcher set the rest.
 *   Pictures   pasted, dropped or attached; resized here (≤1000 px, JPEG) to fit the rules' cap, so no
 *              Storage bucket is needed. Click one to see it full size.
 *   Unread     a thread has news when its last activity is newer than when you last opened it here
 *              (ps.rq in localStorage, per device) and the last word wasn't yours.
 *   Cost       nothing is read while the window is closed except a check for changed threads every
 *              5 min (a query that returns nothing when nothing changed); the live list runs only
 *              while the window is open.
 * Test: fork/test-requests.cjs (Firebase emulator).
 */
G.Requests = (() => {
  // Staff accounts (Firebase Authentication > Users > User UID): the admins (G.Admin.ADMINS count too)
  // and the artist. firestore.rules staff() must list the same uids.
  const STAFF = ['TMD8t0i6jic7a1sg824ZP55TqOG3', 'WjnOOXwYUhcbpvMYj2XUN3dUE5P2'];   // the owner; Mello (the artist)
  const REPO = 'https://github.com/Shawn11564/mrsurvivor/commit/';
  const KEY = 'ps.rq';
  const MAX_T = 4000, MAX_PICS = 3, MAX_PIC = 300000, PIC_SIDE = 1000;
  const CHECK_MS = 5 * 60 * 1000, RECENT_MS = 30 * 24 * 3600 * 1000;
  const STATUS = { new: ['New', '#5fe08a'], working: ['Working on it', '#79b8ff'], ask: ['Waiting on you', '#ffc24a'],
                   done: ['Done', '#9fb2c8'], closed: ['Closed', '#6f839f'] };
  const KIND = { q: ['Question', '?'], c: ['Change', '✎'] };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const me = () => G.DB.fb && G.DB.fb.uid;
  const isAdmin = (u = me()) => !!(G.Admin && G.Admin.isAdmin(u));
  const isStaff = (u = me()) => !!u && (STAFF.includes(u) || isAdmin(u));
  const myName = () => (G.Social && G.Social.me && G.Social.me.name) || (G.DB.save && G.DB.save.name) || 'player';
  const ms = t => t && t.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : (typeof t === 'number' ? t : 0));
  const sts = () => firebase.firestore.FieldValue.serverTimestamp();

  let st = { seen: {}, filter: 'open' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* nothing */ } };

  let el = null, btn = null, fs = null;
  let items = new Map();                 // id -> request doc (data)
  let unList = null, unThread = null;    // live listeners while the window is open
  let view = 'list', cur = null, msgs = [];
  let draft = { pics: [] }, reply = { pics: [] }, lightbox = null;
  let checkT = 0, lastCheck = 0, checking = false;

  const CSS = `
#rq{position:fixed;inset:14px;z-index:9002;display:flex;flex-direction:column;background:#0b1019;color:#e6f0fb;border:2px solid #79b8ff;
  border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);font:14px "Segoe UI",system-ui,sans-serif;cursor:auto;overflow:hidden}
#rq *{box-sizing:border-box}
#rq button{font:inherit;cursor:pointer;color:#e6f0fb;background:#1d2c46;border:1px solid #79b8ff;border-radius:7px;padding:6px 10px}
#rq button:hover{filter:brightness(1.25)}
#rq button:disabled{opacity:.45;cursor:default;filter:none}
#rq button.pri{background:#2f6fd1;border-color:#9ccaff;font-weight:700}
#rq button.ghost{background:transparent;border-color:#2f3f5c;color:#9db0c9}
#rq textarea,#rq select,#rq input{font:inherit;color:#e6f0fb;background:#0c131f;border:1px solid #2f3f5c;border-radius:7px;padding:7px 9px}
#rq textarea{width:100%;min-height:92px;resize:vertical;line-height:1.4}
#rq textarea:focus,#rq select:focus{outline:none;border-color:#79b8ff}
#rq h2,#rq h3{font-family:Pixelify,"Segoe UI",sans-serif;font-weight:700;margin:0}
.rq-top{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #1f2a3d;background:#101827;flex-wrap:wrap}
.rq-top h2{font-size:20px;color:#79b8ff}
.rq-top .sub{color:#9db0c9;font-size:12px}
.rq-grow{flex:1}
.rq-body{flex:1;display:grid;grid-template-columns:320px 1fr;min-height:0}
.rq-list{border-right:1px solid #1f2a3d;display:flex;flex-direction:column;min-height:0;background:#0c121d}
.rq-chips{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #1f2a3d;flex-wrap:wrap}
.rq-chip{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid #2f3f5c;background:#0c131f;color:#9db0c9;cursor:pointer}
.rq-chip.on{border-color:#79b8ff;color:#e6f0fb;background:#1d2c46}
.rq-rows{flex:1;overflow:auto}
.rq-row{display:block;width:100%;text-align:left;padding:9px 12px;border:0;border-bottom:1px solid #141c2b;border-radius:0;background:transparent}
.rq-row:hover{background:#121a2a;filter:none}
.rq-row.on{background:#17233a}
.rq-row .l1{display:flex;align-items:center;gap:6px;font-size:12px;color:#9db0c9}
.rq-row .l1 b{color:#e6f0fb;font-weight:600}
.rq-row .l2{margin-top:3px;color:#c9d6e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rq-dot{width:8px;height:8px;border-radius:50%;background:#ff8ad8;flex:none;display:none}
.rq-row.unread .rq-dot{display:inline-block}
.rq-st{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:1px 6px;border-radius:5px;border:1px solid;flex:none}
.rq-k{font-size:11px;color:#9db0c9;border:1px solid #2f3f5c;border-radius:5px;padding:0 5px;flex:none}
.rq-main{display:flex;flex-direction:column;min-height:0;min-width:0}
.rq-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #1f2a3d;flex-wrap:wrap}
.rq-head h3{font-size:16px;flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rq-back{display:none}
.rq-thread{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.rq-msg{max-width:min(720px,100%);background:#121a2a;border:1px solid #1f2a3d;border-radius:10px;padding:8px 12px}
.rq-msg.claude{background:#162238;border-color:#2b4f87;align-self:flex-start}
.rq-msg.mine{align-self:flex-end;background:#1a2a24;border-color:#2a5a46}
.rq-msg .who{font-size:12px;color:#9db0c9;margin-bottom:3px}
.rq-msg .who b{color:#e6f0fb}
.rq-msg.claude .who b{color:#9ccaff}
.rq-msg .txt{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
.rq-msg .c a{font:12px Consolas,monospace;color:#79b8ff;margin-right:8px}
.rq-pics{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.rq-pics img{height:84px;max-width:160px;object-fit:cover;border-radius:6px;border:1px solid #2f3f5c;cursor:zoom-in;background:#000}
.rq-pics .pw{position:relative}
.rq-pics .pw button{position:absolute;top:-6px;right:-6px;padding:0 6px;font-size:12px;line-height:18px;border-radius:50%;background:#3a1530;border-color:#ff8ad8}
.rq-compose{padding:10px 14px;border-top:1px solid #1f2a3d;background:#101827}
.rq-compose .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
.rq-compose .hint{font-size:12px;color:#6f839f}
.rq-compose.drop{outline:2px dashed #79b8ff;outline-offset:-4px}
.rq-form{padding:14px;overflow:auto}
.rq-form label.k{display:inline-flex;gap:6px;align-items:center;margin-right:14px;color:#c9d6e8}
.rq-empty{color:#7f93b0;text-align:center;padding:50px 16px}
.rq-err{color:#ff8a94;font-size:12px}
#rq-lb{position:fixed;inset:0;z-index:9003;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;cursor:zoom-out}
#rq-lb img{max-width:96vw;max-height:96vh;border-radius:6px}
#rq-btn{position:fixed;left:8px;bottom:8px;z-index:8998;font:700 12px Pixelify,"Segoe UI",sans-serif;letter-spacing:.06em;padding:5px 10px;
  background:#162238;color:#9ccaff;border:1px solid #79b8ff;border-radius:6px;cursor:pointer}
#rq-btn:hover{filter:brightness(1.3)}
@media (max-width:820px){.rq-body{grid-template-columns:1fr}#rq.in-thread .rq-list{display:none}#rq:not(.in-thread) .rq-main{display:none}
  .rq-back{display:inline-block}#rq{inset:6px}.rq-top{padding:8px 10px}}`;

  const HTML = `
<header class="rq-top">
  <h2>Requests</h2><span class="sub" id="rq-sub"></span><span class="rq-grow"></span>
  <button class="pri" data-a="new">+ New request</button>
  <button class="ghost" data-a="close" title="Close (Esc)">✕</button>
</header>
<div class="rq-body">
  <aside class="rq-list">
    <div class="rq-chips" id="rq-chips"></div>
    <div class="rq-rows" id="rq-rows"></div>
  </aside>
  <section class="rq-main" id="rq-main"></section>
</div>`;

  const fmtAgo = t => {
    const d = Date.now() - t;
    if (!t) return 'saving…';
    if (d < 60e3) return 'just now';
    if (d < 3600e3) return Math.floor(d / 60e3) + ' min ago';
    if (d < 86400e3) return Math.floor(d / 3600e3) + ' h ago';
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + ' d ago';
    return new Date(t).toLocaleDateString();
  };
  const stChip = s => { const [name, col] = STATUS[s] || [s, '#9db0c9']; return `<span class="rq-st" style="color:${col};border-color:${col}">${esc(name)}</span>`; };
  const unread = d => d.st !== 'closed' && ms(d.up) > (st.seen[d.id] || 0) && d.lb !== me();
  const unreadCount = () => [...items.values()].filter(unread).length;

  // ---------------- data ----------------

  function remember(doc) {
    const d = doc.data({ serverTimestamps: 'estimate' });
    d.id = doc.id;
    items.set(doc.id, d);
    return d;
  }
  /** Changed threads since the last check (0 reads when nothing changed); the first time, the last 30 days. */
  async function check() {
    if (!fs || checking || !isStaff()) return;
    checking = true;
    try {
      const since = new Date(lastCheck ? lastCheck - 5 * 60e3 : Date.now() - RECENT_MS);   // 5 min of slack for clock skew
      const snap = await fs.collection('req').where('up', '>', since).orderBy('up', 'desc').limit(100).get();
      for (const doc of snap.docs) remember(doc);
      lastCheck = Math.max(lastCheck, ...snap.docs.map(d => ms(d.data().up) || 0), lastCheck || Date.now() - 60e3);
    } catch (e) { console.warn('[Requests] check:', e.code || e.message); }
    checking = false;
    badges();
  }
  function listen() {
    unlisten();
    unList = fs.collection('req').orderBy('up', 'desc').limit(200).onSnapshot(snap => {
      // The whole list each time (not only the changes), so it can't miss a thread whatever happened before.
      items = new Map();
      for (const doc of snap.docs) remember(doc);
      lastCheck = Math.max(lastCheck, ...snap.docs.map(d => ms(d.data().up) || 0));
      if (cur && items.has(cur)) { if (view === 'thread') renderHead(); } else if (cur) { cur = null; view = 'list'; renderMain(); }
      renderList(); badges();
    }, e => { console.warn('[Requests] list:', e.code || e.message); G.UI.toast("Requests: couldn't read the list (" + (e.code || 'error') + ')'); });
  }
  function unlisten() { if (unList) unList(); unList = null; if (unThread) unThread(); unThread = null; }
  function listenThread(id) {
    if (unThread) unThread();
    msgs = [];
    unThread = fs.collection('req').doc(id).collection('m').orderBy('at').onSnapshot(snap => {
      msgs = snap.docs.map(d => Object.assign(d.data({ serverTimestamps: 'estimate' }), { id: d.id }));
      if (cur === id) { renderThread(); markSeen(id); }
    }, e => console.warn('[Requests] thread:', e.code || e.message));
  }
  function markSeen(id) {
    const d = items.get(id);
    if (!d) return;
    st.seen[id] = Math.max(st.seen[id] || 0, ms(d.up) || 0);
    keep(); badges(); renderList();
  }

  async function create(kind, text, pics) {
    const ref = fs.collection('req').doc();
    const d = { by: me(), n: myName().slice(0, 24), k: kind, t: text, st: 'new', at: sts(), up: sts(), lb: me() };
    if (pics.length) d.pics = pics;
    await ref.set(d);
    return ref.id;
  }
  async function post(id, text, pics) {
    const d = items.get(id);
    const b = fs.batch();
    const m = { by: me(), n: myName().slice(0, 24), t: text, at: sts() };
    if (pics.length) m.pics = pics;
    b.set(fs.collection('req').doc(id).collection('m').doc(), m);
    const up = { up: sts(), lb: me() };
    if (d && d.st === 'ask') up.st = 'new';            // they answered: Claude's turn again
    b.update(fs.collection('req').doc(id), up);
    await b.commit();
  }
  const setStatus = (id, s) => fs.collection('req').doc(id).update({ st: s, up: sts(), lb: me() });

  // ---------------- pictures ----------------

  /** A File -> a JPEG data URL under MAX_PIC bytes (smaller and rougher until it fits). */
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let side = PIC_SIDE, q = 0.82, out = '';
        for (let i = 0; i < 8; i++) {
          const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
          const g = c.getContext('2d');
          g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);     // transparency -> black (JPEG has none)
          g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', q);
          if (out.length <= MAX_PIC) break;
          if (q > 0.5) q -= 0.15; else side = Math.round(side * 0.7);
        }
        out.length <= MAX_PIC ? res(out) : rej(new Error('too big'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image')); };
      img.src = url;
    });
  }
  async function addPics(target, files) {
    const errs = [];
    for (const f of [...files]) {
      if (!/^image\//.test(f.type)) { errs.push(f.name + ': not an image'); continue; }
      if (target.pics.length >= MAX_PICS) { errs.push('up to ' + MAX_PICS + ' pictures'); break; }
      try { target.pics.push(await shrink(f)); } catch (e) { errs.push((f.name || 'picture') + ': ' + e.message); }
    }
    renderPicks(target);
    if (errs.length) G.UI.toast(errs.join(' · '));
  }
  function renderPicks(target) {
    const box = el.querySelector(target === draft ? '#rq-dpics' : '#rq-rpics');
    if (!box) return;
    box.innerHTML = target.pics.map((p, i) => `<span class="pw"><img src="${p}" data-a="zoom" alt=""><button data-a="unpic" data-i="${i}" title="Remove">✕</button></span>`).join('');
  }
  const fileInput = target => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.id = target === draft ? 'rq-file' : 'rq-rfile';
    inp.style.display = 'none';
    inp.onchange = () => { addPics(target, inp.files); inp.value = ''; };
    return inp;
  };
  function pasteDrop(box, target) {
    box.addEventListener('paste', e => {
      const files = [...(e.clipboardData && e.clipboardData.files) || []].filter(f => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); addPics(target, files); }
    });
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drop'); });
    box.addEventListener('dragleave', () => box.classList.remove('drop'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drop'); if (e.dataTransfer) addPics(target, e.dataTransfer.files); });
  }
  function zoom(src) {
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.id = 'rq-lb'; lightbox.innerHTML = '<img alt="">';
      lightbox.onclick = () => { lightbox.style.display = 'none'; };
      document.body.appendChild(lightbox);
    }
    lightbox.querySelector('img').src = src;
    lightbox.style.display = 'flex';
  }

  // ---------------- rendering ----------------

  function badges() {
    const n = unreadCount();
    if (btn) { btn.textContent = 'REQUESTS' + (n ? ' (' + n + ')' : ''); btn.style.display = isStaff() && !isAdmin() ? '' : 'none'; }
    const ab = document.getElementById('adm-requests');
    if (ab) ab.textContent = 'Requests' + (n ? ' (' + n + ')' : '');
    if (el && el.style.display !== 'none') el.querySelector('#rq-sub').textContent = items.size ? items.size + ' thread' + (items.size === 1 ? '' : 's') + (n ? ' · ' + n + ' with news' : '') : '';
  }
  const FILTERS = [['open', 'Open'], ['done', 'Done'], ['all', 'All']];
  const shown = d => st.filter === 'all' || (st.filter === 'open' ? !['done', 'closed'].includes(d.st) : ['done', 'closed'].includes(d.st));
  function renderList() {
    if (!el) return;
    el.querySelector('#rq-chips').innerHTML = FILTERS.map(([k, n]) => `<button class="rq-chip${st.filter === k ? ' on' : ''}" data-a="filter" data-v="${k}">${n}</button>`).join('');
    const list = [...items.values()].filter(shown).sort((a, b) => ms(b.up) - ms(a.up));
    el.querySelector('#rq-rows').innerHTML = list.length ? list.map(d => `
<button class="rq-row${d.id === cur ? ' on' : ''}${unread(d) ? ' unread' : ''}" data-a="open" data-v="${esc(d.id)}">
  <div class="l1"><span class="rq-dot"></span>${stChip(d.st)}<span class="rq-k" title="${KIND[d.k] ? KIND[d.k][0] : ''}">${KIND[d.k] ? KIND[d.k][1] : '·'}</span><b>${G.PlayerNames.html(d.by, d.n)}</b><span class="rq-grow"></span><span>${fmtAgo(ms(d.up))}</span></div>
  <div class="l2">${esc((d.t || '').split('\n')[0])}${d.pics && d.pics.length ? ' 🖼' : ''}</div>
</button>`).join('') : `<div class="rq-empty">${st.filter === 'open' ? 'Nothing open. Write a new request, or ask a question.' : 'Nothing here yet.'}</div>`;
  }
  function renderMain() {
    el.classList.toggle('in-thread', view !== 'list');
    const main = el.querySelector('#rq-main');
    if (view === 'new') return renderForm(main);
    if (view === 'thread' && cur) { renderHead(); renderThread(); return; }
    main.innerHTML = `<div class="rq-empty">${items.size ? 'Pick a thread on the left, or write a new request.' : 'Write a request or a question for Claude. Pictures help: paste a screenshot into the text.'}</div>`;
  }
  function renderForm(main) {
    main.innerHTML = `
<div class="rq-head"><button class="ghost rq-back" data-a="back">‹ Back</button><h3>New request</h3></div>
<div class="rq-form" id="rq-form">
  <div style="margin-bottom:8px">
    <label class="k"><input type="radio" name="rq-kind" value="c" checked> ✎ Change request</label>
    <label class="k"><input type="radio" name="rq-kind" value="q"> ? Question</label>
  </div>
  <textarea id="rq-text" maxlength="${MAX_T}" placeholder="What should change, or what do you want to know? Say where it is in the game and what you expect. Paste screenshots here."></textarea>
  <div class="rq-pics" id="rq-dpics"></div>
  <div class="rq-compose" style="border:0;background:transparent;padding:0;margin-top:8px">
    <div class="row"><button class="pri" data-a="send" id="rq-send">Send</button><button data-a="pic">📎 Add picture</button>
      <span class="hint">Claude replies in this thread. A change lands in the game by itself once it's pushed, usually within minutes; you'll see the commit here.</span></div>
    <div class="rq-err" id="rq-err"></div>
  </div>
</div>`;
    const form = main.querySelector('#rq-form');
    form.appendChild(fileInput(draft));
    pasteDrop(form, draft);
    renderPicks(draft);
    main.querySelector('#rq-text').value = draft.text || '';
    main.querySelector('#rq-text').focus();
  }
  function renderHead() {
    const d = items.get(cur);
    if (!d) return;
    const main = el.querySelector('#rq-main');
    let head = main.querySelector('.rq-head');
    if (!head) {
      main.innerHTML = `<div class="rq-head"></div><div class="rq-thread" id="rq-thread"></div>
<div class="rq-compose" id="rq-compose">
  <textarea id="rq-rtext" maxlength="${MAX_T}" placeholder="Reply… (paste screenshots here)"></textarea>
  <div class="rq-pics" id="rq-rpics"></div>
  <div class="row"><button class="pri" data-a="reply" id="rq-reply">Send</button><button data-a="rpic">📎 Add picture</button><span class="rq-err" id="rq-rerr"></span></div>
</div>`;
      head = main.querySelector('.rq-head');
      const comp = main.querySelector('#rq-compose');
      comp.appendChild(fileInput(reply));
      pasteDrop(comp, reply);
      renderPicks(reply);
    }
    const mine = d.by === me();
    const ctl = isAdmin()
      ? `<select id="rq-status" title="Status">${Object.keys(STATUS).map(s => `<option value="${s}"${s === d.st ? ' selected' : ''}>${STATUS[s][0]}</option>`).join('')}</select>`
      : (mine && ['new', 'ask'].includes(d.st) ? '<button class="ghost" data-a="closeit">Close request</button>' : '');
    head.innerHTML = `<button class="ghost rq-back" data-a="back">‹ Back</button>${stChip(d.st)}<span class="rq-k">${KIND[d.k] ? KIND[d.k][0] : ''}</span>
<h3 title="${esc(d.t)}">${esc((d.t || '').split('\n')[0])}</h3><span class="sub" style="color:#9db0c9;font-size:12px">${G.PlayerNames.html(d.by, d.n)} · ${fmtAgo(ms(d.at))}</span>${ctl}`;
    const sel = head.querySelector('#rq-status');
    if (sel) sel.onchange = () => setStatus(cur, sel.value).catch(e => G.UI.toast("Couldn't change the status (" + (e.code || 'error') + ')'));
  }
  const picsHtml = pics => pics && pics.length ? `<div class="rq-pics">${pics.map(p => `<img src="${p}" data-a="zoom" alt="">`).join('')}</div>` : '';
  const commitsHtml = c => c ? `<div class="c">${[].concat(c).map(h => `<a href="${REPO}${esc(h)}" target="_blank" rel="noopener">${esc(String(h).slice(0, 7))}</a>`).join('')}</div>` : '';
  function msgHtml(m, first) {
    const claude = m.by === 'claude', mine = m.by === me();
    return `<div class="rq-msg${claude ? ' claude' : mine ? ' mine' : ''}">
  <div class="who"><b>${claude ? 'Claude' : G.PlayerNames.html(m.by, m.n)}</b> · ${fmtAgo(ms(m.at))}${first ? ' · ' + (KIND[m.k] ? KIND[m.k][0].toLowerCase() : '') : ''}</div>
  <div class="txt">${esc(m.t)}</div>${picsHtml(m.pics)}${commitsHtml(m.c)}
</div>`;
  }
  function renderThread() {
    const d = items.get(cur), box = el.querySelector('#rq-thread');
    if (!d || !box) return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = msgHtml(d, true) + msgs.map(m => msgHtml(m)).join('');
    if (atEnd || !box.dataset.scrolled) { box.scrollTop = box.scrollHeight; box.dataset.scrolled = '1'; }
  }

  function openThread(id) {
    cur = id; view = 'thread';
    const main = el.querySelector('#rq-main');
    main.innerHTML = '';
    reply = { pics: [] };
    listenThread(id);
    renderMain();
    markSeen(id);
    renderList();
  }

  async function act(a, b) {
    const $ = s => el.querySelector(s);
    switch (a) {
      case 'close': return close();
      case 'back': view = 'list'; cur = null; if (unThread) unThread(); unThread = null; renderMain(); renderList(); return;
      case 'filter': st.filter = b.dataset.v; keep(); renderList(); return;
      case 'open': return openThread(b.dataset.v);
      case 'new': view = 'new'; cur = null; if (unThread) unThread(); unThread = null; renderMain(); renderList(); return;
      case 'pic': return $('#rq-file').click();
      case 'rpic': return $('#rq-rfile').click();
      case 'unpic': {
        const target = b.closest('#rq-form') ? draft : reply;
        target.pics.splice(+b.dataset.i, 1); renderPicks(target); return;
      }
      case 'zoom': return zoom(b.src);
      case 'send': {
        const text = $('#rq-text').value.trim(), kind = ($('input[name=rq-kind]:checked') || {}).value || 'c';
        if (!text) { $('#rq-err').textContent = 'Write what you need first.'; return; }
        $('#rq-send').disabled = true;
        try {
          const id = await create(kind, text, draft.pics);
          draft = { pics: [] };
          G.UI.toast('Sent. Claude will answer in this thread.');
          openThread(id);
        } catch (e) { $('#rq-err').textContent = "Couldn't send (" + (e.code || e.message) + ').'; $('#rq-send').disabled = false; }
        return;
      }
      case 'reply': {
        const text = $('#rq-rtext').value.trim();
        if (!text && !reply.pics.length) { $('#rq-rerr').textContent = 'Write something first.'; return; }
        $('#rq-reply').disabled = true;
        try {
          await post(cur, text, reply.pics);
          reply = { pics: [] };
          $('#rq-rtext').value = ''; $('#rq-rerr').textContent = ''; renderPicks(reply);
        } catch (e) { $('#rq-rerr').textContent = "Couldn't send (" + (e.code || e.message) + ').'; }
        $('#rq-reply').disabled = false;
        return;
      }
      case 'closeit':
        try { await setStatus(cur, 'closed'); } catch (e) { G.UI.toast("Couldn't close it (" + (e.code || 'error') + ')'); }
        return;
    }
  }

  function ensureCss() {
    if (document.getElementById('rq-style')) return;
    const s = document.createElement('style');
    s.id = 'rq-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function build() {
    ensureCss();
    el = document.createElement('div');
    el.id = 'rq'; el.setAttribute('translate', 'no');
    el.innerHTML = HTML;
    el.style.display = 'none';
    document.body.appendChild(el);
    el.addEventListener('keyup', e => e.stopPropagation());
    el.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (lightbox && lightbox.style.display === 'flex') lightbox.style.display = 'none'; else close(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') act(e.target.id === 'rq-text' ? 'send' : 'reply');
    });
    el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a, b); });
    el.addEventListener('input', e => { if (e.target.id === 'rq-text') draft.text = e.target.value; });
  }

  function open() {
    if (!isStaff()) { G.UI.toast('Requests: staff only'); return; }
    if (!G.DB.fb) { G.UI.toast('Requests: sign in to the cloud first'); return; }
    if (!el) build();
    fs = G.DB.fb.fs;
    if (G.Admin && G.Admin.close) G.Admin.close();
    el.style.display = 'flex';
    view = cur ? 'thread' : 'list';
    renderList(); renderMain(); badges();
    listen();
    if (cur) listenThread(cur);
  }
  function close() {
    if (!el || el.style.display === 'none') return;
    el.style.display = 'none';
    unlisten();
  }
  const isOpen = () => !!el && el.style.display !== 'none';

  function init() {
    btn = document.createElement('button');
    btn.id = 'rq-btn'; btn.textContent = 'REQUESTS'; btn.setAttribute('translate', 'no');
    btn.onclick = open;
    btn.style.display = 'none';
    document.body.appendChild(btn);
    ensureCss();
    // Esc closes the window even when nothing inside it has the focus (the window's own handler
    // stops the key from getting here when something does).
    addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); close(); } });
    let was = null;
    setInterval(() => {
      const u = me() || null, staff = isStaff(u);
      // Another account (or signed out): start over, closing the window, and check again at once.
      if (u !== was) { const first = was === null; was = u; if (!first || !isOpen()) { close(); cur = null; view = 'list'; items = new Map(); lastCheck = 0; checkT = 0; } }
      if (staff && G.DB.fb) { fs = G.DB.fb.fs; if (!checkT || Date.now() - checkT > CHECK_MS) { checkT = Date.now(); check(); } }
      badges();
    }, 1000);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();

  return { open, close, isOpen, isStaff, STAFF, addPics: files => addPics(view === 'new' ? draft : reply, files),
    get items() { return items; }, get unread() { return unreadCount(); }, get current() { return cur; }, get messages() { return msgs; }, check };
})();
