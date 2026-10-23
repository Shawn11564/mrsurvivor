/* ============ change-log.js — the admin's Change Log (MrSurvivor fork) ============
 * Admin menu > Change Log (the ADMINS accounts only): every change made to the game, by day,
 * newest first, so the owner can see what the sessions added, buffed, nerfed or fixed.
 *
 *   Data      js/fork/changes.json, read when the window opens (not bundled: a new line shows
 *             without a rebuild). Each line: k kind (new, buff, nerf, change, fix, removed; buff and
 *             nerf: the thing named got stronger / weaker), s who (all, lab, admin), a area,
 *             t text, n the numbers (was -> now), c commit(s), linked to GitHub.
 *   Upstream  PokéSurvivor's own notes (G.CHANGELOG, already filtered by changelog-filter.js) from
 *             the fork's first day on, under their date, folded.
 *   Filters   kind and who chips, area list, search; kept on this device (ps.chlog).
 *
 * Every commit that changes the game adds its lines to changes.json (CLAUDE.local.md);
 * fork/test-changes.cjs checks the history against it and opens this window.
 */
G.ChangeLog = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REPO = 'https://github.com/Shawn11564/mrsurvivor/commit/';
  const FORK_START = '2026-10-20';
  const KINDS = [['new', 'New'], ['buff', 'Buff'], ['nerf', 'Nerf'], ['change', 'Changed'], ['removed', 'Removed'], ['fix', 'Fixed']];
  const KIND = Object.fromEntries(KINDS);
  const WHO = [['all', 'Everyone'], ['lab', 'Lab'], ['admin', 'Admin & tools']];
  const KEY = 'ps.chlog';

  let el = null, data = null, loading = null;
  // Filters: kinds and who shown (empty set = all of them), area ('' = any), text, upstream notes.
  let st = { kinds: [], who: [], area: '', q: '', up: true, open: {} };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ kinds: st.kinds, who: st.who, area: st.area, up: st.up })); } catch (e) { /* nothing */ } };

  const CSS = `
#chl{position:fixed;inset:14px;z-index:9002;display:flex;flex-direction:column;background:#0b1019;color:#e6f0fb;border:2px solid #ff8ad8;
  border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);font:14px "Segoe UI",system-ui,sans-serif;cursor:auto;overflow:hidden}
#chl *{box-sizing:border-box}
#chl button{font:inherit;cursor:pointer}
#chl input,#chl select{font:inherit;color:#e6f0fb;background:#0c131f;border:1px solid #2f3f5c;border-radius:7px;padding:6px 9px}
#chl input:focus,#chl select:focus{outline:none;border-color:#79b8ff}
#chl h2,#chl h3{font-family:Pixelify,"Segoe UI",sans-serif;font-weight:700;margin:0}
.chl-top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #1f2a3d;background:#101827;flex-wrap:wrap}
.chl-top h2{font-size:20px;color:#ff8ad8}
.chl-count{color:#8fa3bf;font-size:13px}
.chl-grow{flex:1}
.chl-top input[type=search]{width:240px;max-width:100%}
.chl-x{width:34px;height:34px;border-radius:8px;background:transparent;border:1px solid #2f3f5c;color:#c9d6e8;font-size:16px}
.chl-x:hover{border-color:#ff8ad8;color:#ff8ad8}
.chl-bar{display:flex;align-items:center;gap:8px 14px;padding:10px 16px;border-bottom:1px solid #1f2a3d;background:#0d1420;flex-wrap:wrap}
.chl-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chl-chips>span{color:#6f839f;font-size:12px;margin-right:2px}
.chl-chip{padding:4px 10px;border-radius:99px;border:1px solid #2f3f5c;background:transparent;color:#a9bad2;font-size:12px}
.chl-chip:hover{border-color:#79b8ff}
.chl-chip b{font-weight:600;margin-left:5px;opacity:.75}
.chl-chip.on{color:#0b1019;border-color:transparent}
.chl-chip.on b{opacity:.65}
.chl-tog{display:flex;align-items:center;gap:6px;font-size:12px;color:#a9bad2;cursor:pointer}
.chl-tog input{margin:0;width:15px;height:15px;accent-color:#ff8ad8}
.chl-body{flex:1;display:grid;grid-template-columns:200px 1fr;min-height:0}
.chl-rail{border-right:1px solid #1f2a3d;overflow:auto;padding:10px 8px;background:#0d1420}
.chl-rail a{display:block;padding:8px 10px;border-radius:8px;color:#c9d6e8;text-decoration:none;margin-bottom:2px}
.chl-rail a:hover{background:#131d2e}
.chl-rail a b{display:block;font-weight:600;font-size:13px}
.chl-rail a small{color:#7f93b0;font-size:11px}
.chl-spark{display:flex;height:4px;border-radius:2px;overflow:hidden;margin-top:5px;background:#1a2436}
.chl-main{overflow:auto;padding:16px 22px 40px;min-height:0;scroll-behavior:smooth}
.chl-day{margin-bottom:26px;scroll-margin-top:8px}
.chl-dh{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid #1f2a3d;margin-bottom:12px}
.chl-dh h3{font-size:20px;color:#ffd23f}
.chl-dh .ttl{color:#c9d6e8;font-size:14px;flex:1;min-width:200px}
.chl-sum{display:flex;gap:6px;flex-wrap:wrap}
.chl-sum span{font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid;white-space:nowrap}
.chl-grp{margin:0 0 12px}
.chl-grp h4{margin:0 0 6px;font:700 12px "Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase}
.chl-it{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;padding:8px 12px;border-radius:9px;background:#0f1726;border:1px solid #1a2538;margin-bottom:5px}
.chl-it:hover{border-color:#2f4a70}
.chl-k{font:700 10px "Segoe UI",sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:3px 0;width:62px;text-align:center;border-radius:5px;color:#0b1019;align-self:start;margin-top:1px}
.chl-t{line-height:1.45;min-width:0}
.chl-n{display:inline-block;margin-top:4px;font:12px Consolas,"Cascadia Mono",monospace;color:#cfe3ff;background:#0b121e;border:1px solid #23314a;border-radius:6px;padding:2px 8px}
.chl-meta{grid-column:2;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chl-tag{font-size:11px;padding:0 7px;border-radius:99px;border:1px solid #2f3f5c;color:#a9bad2}
.chl-tag.lab{border-color:#7a5cff;color:#c9b8ff}
.chl-tag.admin{border-color:#ff8ad8;color:#ffc4ec}
.chl-c{font:11px Consolas,monospace;color:#6f839f;text-decoration:none}
.chl-c:hover{color:#79b8ff;text-decoration:underline}
.chl-up{margin-top:10px;border:1px dashed #2a3a55;border-radius:10px;background:#0c1320}
.chl-up summary{cursor:pointer;padding:9px 12px;color:#9db0c9;font-size:13px;list-style-position:inside}
.chl-up summary b{color:#c9d6e8}
.chl-up ul{margin:0;padding:0 14px 12px 32px;color:#b7c5d9;line-height:1.5}
.chl-up li{margin:3px 0}
.chl-up li i{font-style:normal;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-right:6px}
.chl-empty{color:#7f93b0;text-align:center;padding:50px 16px}
.chl-foot{padding:8px 16px;border-top:1px solid #1f2a3d;color:#6f839f;font-size:12px;background:#101827}
@media (max-width:820px){.chl-body{grid-template-columns:1fr}.chl-rail{display:none}.chl-main{padding:12px 12px 30px}}`;

  const COL = { new: '#5fe08a', buff: '#79b8ff', nerf: '#ff6b7a', change: '#ffc24a', removed: '#b18cff', fix: '#9fb2c8' };

  const HTML = `
<header class="chl-top">
  <h2>Change Log</h2><span class="chl-count" id="chl-count"></span><span class="chl-grow"></span>
  <input id="chl-q" type="search" placeholder="Search changes" autocomplete="off">
  <button class="chl-x" data-a="close" title="Close (Esc)">✕</button>
</header>
<div class="chl-bar">
  <div class="chl-chips" id="chl-kinds"></div>
  <div class="chl-chips" id="chl-who"></div>
  <select id="chl-area" title="Area"></select>
  <label class="chl-tog"><input type="checkbox" id="chl-upt"> Upstream notes</label>
</div>
<div class="chl-body">
  <nav class="chl-rail" id="chl-rail"></nav>
  <main class="chl-main" id="chl-main"></main>
</div>
<div class="chl-foot">Buff / Nerf: the thing named got stronger / weaker. LAB: Lab runs or the Lab setting only. Click a commit to see its code on GitHub.</div>`;

  function build() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    el = document.createElement('div');
    el.id = 'chl'; el.setAttribute('translate', 'no');
    el.innerHTML = HTML;
    el.style.display = 'none';
    document.body.appendChild(el);
    // Keys typed here stay here (input.js listens on window); Esc closes.
    el.addEventListener('keyup', e => e.stopPropagation());
    el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a, v = b.dataset.v;
      if (a === 'close') return close();
      if (a === 'kind' || a === 'who') {
        const list = a === 'kind' ? st.kinds : st.who;
        const i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        keep(); render();
      }
    });
    el.querySelector('#chl-q').addEventListener('input', e => { st.q = e.target.value.trim().toLowerCase(); render(); });
    el.querySelector('#chl-area').addEventListener('change', e => { st.area = e.target.value; keep(); render(); });
    el.querySelector('#chl-upt').addEventListener('change', e => { st.up = e.target.checked; keep(); render(); });
    el.querySelector('#chl-rail').addEventListener('click', e => {
      const a = e.target.closest('a[data-d]');
      if (!a) return;
      e.preventDefault();
      const day = el.querySelector(`.chl-day[data-d="${a.dataset.d}"]`);
      if (day) day.scrollIntoView({ block: 'start' });
    });
  }

  function load() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    const own = document.querySelector('script[src*="app.min.js"], script[src*="js/game.js"]');
    const url = new URL('fork/changes.json', own ? own.src : location.href).href + '?t=' + Date.now();
    loading = fetch(url, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => (data = j))
      .finally(() => { loading = null; });
    return loading;
  }

  // ---------------- what's shown ----------------

  const dateLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const commits = it => (Array.isArray(it.c) ? it.c : it.c ? [it.c] : []);
  const shown = it => (!st.kinds.length || st.kinds.includes(it.k)) && (!st.who.length || st.who.includes(it.s))
    && (!st.area || it.a === st.area)
    && (!st.q || [it.t, it.n, it.a, KIND[it.k], ...commits(it)].join(' ').toLowerCase().includes(st.q));
  /** Upstream's notes for a day, in English: [{ k, t }] (k: new / change / fix). They're for everyone and have no area. */
  function upstream(d) {
    const v = (G.CHANGELOG || []).find(x => x.d === d);
    if (!v || d < FORK_START || st.area || (st.who.length && !st.who.includes('all'))) return [];
    const en = l => (Array.isArray(l) ? l[1] || l[0] : l);
    return [['new', v.new], ['change', v.chg], ['fix', v.fix]].flatMap(([k, l]) => (l || []).map(x => ({ k, t: en(x) })))
      .filter(x => (!st.kinds.length || st.kinds.includes(x.k)) && (!st.q || x.t.toLowerCase().includes(st.q)));
  }
  const upTitle = d => { const v = (G.CHANGELOG || []).find(x => x.d === d); return v && v.title ? (Array.isArray(v.title) ? v.title[1] || v.title[0] : v.title) : ''; };

  function counts(items) {
    const n = {};
    for (const it of items) n[it.k] = (n[it.k] || 0) + 1;
    return n;
  }

  function chips() {
    const all = data.days.flatMap(d => d.items);
    // Kind counts follow the other filters, so they say what a click would show.
    const base = all.filter(it => (!st.who.length || st.who.includes(it.s)) && (!st.area || it.a === st.area));
    const nk = counts(base);
    el.querySelector('#chl-kinds').innerHTML = '<span>Kind</span>' + KINDS.map(([k, name]) => {
      const on = st.kinds.includes(k);
      return `<button class="chl-chip${on ? ' on' : ''}" data-a="kind" data-v="${k}" style="${on ? `background:${COL[k]}` : `border-color:${COL[k]}55`}">${name}<b>${nk[k] || 0}</b></button>`;
    }).join('');
    const nw = {};
    for (const it of all) nw[it.s] = (nw[it.s] || 0) + 1;
    el.querySelector('#chl-who').innerHTML = '<span>For</span>' + WHO.map(([w, name]) => {
      const on = st.who.includes(w);
      return `<button class="chl-chip${on ? ' on' : ''}" data-a="who" data-v="${w}" style="${on ? 'background:#ff8ad8' : ''}">${name}<b>${nw[w] || 0}</b></button>`;
    }).join('');
    const areas = [...new Set(all.map(it => it.a))].sort();
    if (st.area && !areas.includes(st.area)) st.area = '';
    el.querySelector('#chl-area').innerHTML = '<option value="">Every area</option>' + areas.map(a => `<option${a === st.area ? ' selected' : ''}>${esc(a)}</option>`).join('');
    el.querySelector('#chl-upt').checked = st.up;
  }

  function itemHtml(it) {
    const tag = it.s === 'all' ? '' : `<span class="chl-tag ${it.s}">${it.s === 'lab' ? 'LAB' : 'ADMIN'}</span>`;
    const cs = commits(it).map(c => `<a class="chl-c" href="${REPO + esc(c)}" target="_blank" rel="noopener" title="See this commit on GitHub">${esc(c)}</a>`).join(' ');
    return `<div class="chl-it" data-k="${it.k}">
  <span class="chl-k" style="background:${COL[it.k]}">${KIND[it.k]}</span>
  <div class="chl-t">${esc(it.t)}${it.n ? `<br><span class="chl-n">${esc(it.n).replace(/ -&gt; /g, ' → ')}</span>` : ''}</div>
  <div class="chl-meta">${it.a.toLowerCase() === it.s ? '' : `<span class="chl-tag">${esc(it.a)}</span>`}${tag}${cs}</div>
</div>`;
  }

  function sumHtml(n) {
    return KINDS.filter(([k]) => n[k]).map(([k, name]) => `<span style="color:${COL[k]};border-color:${COL[k]}66">${n[k]} ${name.toLowerCase()}</span>`).join('');
  }

  function render() {
    if (!el || !data) return;
    chips();
    const days = data.days.map(d => ({ d: d.d, title: d.title, items: d.items.filter(shown), up: st.up ? upstream(d.d) : [] }))
      .filter(d => d.items.length || d.up.length);
    const total = days.reduce((a, d) => a + d.items.length, 0), all = data.days.reduce((a, d) => a + d.items.length, 0);
    el.querySelector('#chl-count').textContent = total === all ? `${all} changes over ${data.days.length} days`
      : `${total} of ${all} changes`;

    el.querySelector('#chl-rail').innerHTML = days.map(d => {
      const n = counts(d.items), sum = d.items.length || 1;
      const bar = KINDS.filter(([k]) => n[k]).map(([k]) => `<i style="flex:${n[k] / sum};background:${COL[k]}"></i>`).join('');
      return `<a href="#" data-d="${d.d}"><b>${esc(dateLabel(d.d))}</b><small>${d.items.length} change${d.items.length === 1 ? '' : 's'}${d.up.length ? ` · ${d.up.length} upstream` : ''}</small><div class="chl-spark">${bar}</div></a>`;
    }).join('');

    const main = el.querySelector('#chl-main');
    if (!days.length) { main.innerHTML = '<div class="chl-empty">No changes match these filters.</div>'; return; }
    main.innerHTML = days.map(d => {
      const groups = KINDS.map(([k, name]) => [k, name, d.items.filter(it => it.k === k)]).filter(g => g[2].length);
      const up = d.up.length ? `<details class="chl-up"${st.open[d.d] ? ' open' : ''} data-d="${d.d}"><summary>From PokéSurvivor (upstream) · <b>${esc(upTitle(d.d))}</b> · ${d.up.length} note${d.up.length === 1 ? '' : 's'}</summary><ul>${
        d.up.map(x => `<li><i style="color:${COL[x.k]}">${KIND[x.k]}</i>${esc(x.t)}</li>`).join('')}</ul></details>` : '';
      return `<section class="chl-day" data-d="${d.d}">
  <div class="chl-dh"><h3>${esc(dateLabel(d.d))}</h3><span class="ttl">${esc(d.title || '')}</span><div class="chl-sum">${sumHtml(counts(d.items))}</div></div>
  ${groups.map(([k, name, list]) => `<div class="chl-grp"><h4 style="color:${COL[k]}">${name} · ${list.length}</h4>${list.map(itemHtml).join('')}</div>`).join('')}
  ${up}
</section>`;
    }).join('');
    for (const det of main.querySelectorAll('details.chl-up')) det.addEventListener('toggle', () => { st.open[det.dataset.d] = det.open; });
  }

  async function open() {
    if (!G.Admin || !G.Admin.isAdmin()) { G.UI.toast('Change Log: admins only'); return; }
    if (!el) build();
    G.Admin.close();
    el.style.display = 'flex';
    el.querySelector('#chl-q').value = st.q;
    el.querySelector('#chl-main').innerHTML = '<div class="chl-empty">Loading…</div>';
    try { await load(); } catch (e) {
      el.querySelector('#chl-main').innerHTML = `<div class="chl-empty">Couldn't read js/fork/changes.json (${esc(e.message)}).</div>`;
      return;
    }
    render();
    el.querySelector('#chl-q').focus();
  }

  function close() { if (el) el.style.display = 'none'; }
  const isOpen = () => !!el && el.style.display !== 'none';

  return { open, close, isOpen, reload() { data = null; return isOpen() ? open() : load(); } };
})();
