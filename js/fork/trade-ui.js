/* ============ trade-ui.js — the trade screens (MrSurvivor fork) ============
 *   Main menu   a Trade item under Friends (pending requests show under it) opens the friend picker;
 *               the Friends screen has a Trade button on each friend too (one line in js/ui/social-ui.js).
 *   Request     a popup like a party invite (bottom right, menus only): Trade / No thanks.
 *   Window      #scr-trade: your Pokémon (search, generation, type, form, rarity, "hide ones they have",
 *               sort) on the left; what each of you puts up on the right, with each side's confirmation,
 *               Confirm / Unconfirm, the 3 s countdown and a chat. Hovering any Pokémon (or holding it
 *               on a touch screen) shows its stats at Lv. 1 and what it arrives with.
 * The rules of the trade itself are in js/fork/trade.js. English only (translate="no").
 */
G.TradeUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = G.Trade;
  const SCR = 'scr-trade', PICK = 'scr-trade-friends';
  const FRESH = 'Traded Pokémon arrive fresh: no upgrades, TMs, Mints or Capsules come with them (Lv. 1 stats, the new owner\'s own nature and ability). The upgrades and TMs you bought stay on your account.';
  const GEN = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  const V_NAME = { n: 'Normal', s: 'Shiny', r: 'Radiant' };
  const tr = (s, ctx) => (G.T ? G.T(s, ctx) : s);
  const monName = dex => tr(G.DEX_BY[dex].name);

  // ---------------- icon and styles ----------------

  G.Icons.UI.trade = { pal: { b: '#4fb4ff', d: '#2a6fb0', y: '#ffd23f', o: '#e0a020' }, rows: [
    '....k.......', '...kbk......', '..kbbbkkkkk.', '.kbbbbbbbbbk', '..kbbbkkkkk.', '...kbk......',
    '......kyk...', '.kkkkkyyyk..', 'kyyyyyyyyyk.', '.kkkkkyyyk..', '......kyk...', '.......k....'] };
  const icon = (n = 20) => G.Icons.html('trade', n);

  const css = document.createElement('style');
  css.textContent = `
#${SCR} .tr-box { width: min(1200px, 100%); height: min(800px, calc(100dvh - 86px)); display: flex; flex-direction: column; gap: 6px; }
#${SCR} h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
#${SCR} .tr-fresh { margin: 0; font-size: 13px; }
.tr-main { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 12px; min-height: 0; flex: 1; }
.tr-pick { display: flex; flex-direction: column; min-height: 0; padding: 10px; }
.tr-pick .dex-tools { margin-bottom: 6px; }
.tr-pick .filters { margin-bottom: 6px; gap: 4px; }
.tr-pick .chip { padding: 2px 8px; font-size: 12px; }
.tr-grid { flex: 1; min-height: 150px; max-height: none; grid-template-columns: repeat(auto-fill, minmax(82px, 1fr)); gap: 5px; align-content: start; }
.tr-cell { padding: 4px 2px 3px; }
.tr-cell canvas { width: 72px; height: 60px; }
.tr-cell b { font-size: 11px; }
.tr-cell .tr-v { position: absolute; top: 3px; right: 4px; }
.tr-cell.on { border-color: var(--green); background: rgba(95,224,138,.16); }
.tr-cell.on::after { content: '✔'; position: absolute; bottom: 3px; right: 6px; color: var(--green); font-size: 14px; }
.tr-cell.no { opacity: .45; cursor: not-allowed; }
.tr-cell.no:hover { transform: none; }
.tr-cell .tr-why { display: block; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-side { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; }
.tr-offer { padding: 8px 10px; }
.tr-offer h3 { display: flex; align-items: center; gap: 6px; font-size: 16px; margin: 0 0 6px; }
.tr-offer h3 .grow { flex: 1; }
.tr-ok { font-size: 12px; padding: 1px 8px; border-radius: 10px; background: rgba(0,0,0,.3); color: var(--muted); white-space: nowrap; }
.tr-ok.on { background: rgba(95,224,138,.22); color: var(--green); }
.tr-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: 4px; min-height: 66px; max-height: 150px; overflow-y: auto; }
.tr-slot { position: relative; border-radius: 8px; background: rgba(0,0,0,.25); border: 2px solid rgba(244,248,255,.18); text-align: center; padding: 2px; cursor: default; }
.tr-slot canvas { width: 56px; height: 48px; display: block; margin: 0 auto; }
.tr-slot b { display: block; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-slot .tr-v { position: absolute; top: 2px; right: 3px; }
.tr-slot.mine { cursor: pointer; }
.tr-slot.mine:hover { border-color: var(--red); }
.tr-slot.dup { border-color: var(--r4); }
.tr-slot .tr-dup { position: absolute; left: 0; right: 0; bottom: 14px; font-size: 9px; color: #e9c9ff; text-shadow: 1px 1px 0 #000; }
.tr-empty { grid-column: 1 / -1; color: var(--muted); font-size: 13px; align-self: center; text-align: center; }
.tr-arrow { text-align: center; margin: -4px 0; opacity: .8; }
.tr-act { display: flex; flex-direction: column; gap: 6px; }
.tr-status { min-height: 20px; font-size: 14px; text-align: center; color: var(--muted); }
.tr-status.warn { color: #ffcf8a; }
.tr-status.go { color: var(--gold); font-size: 22px; font-weight: 700; }
.tr-chat { flex: 1 0 110px; display: flex; flex-direction: column; padding: 8px; gap: 6px; }
.tr-msgs { flex: 1; min-height: 50px; overflow-y: auto; font-size: 13px; display: flex; flex-direction: column; gap: 2px; user-select: text; }
.tr-msgs .m b { color: #9fd4ff; } .tr-msgs .m.me b { color: var(--gold); }
.tr-msgs .m { word-wrap: break-word; }
.tr-msgs .sys { color: var(--muted); font-style: italic; }
.tr-chat form { display: flex; gap: 6px; }
.tr-chat input { flex: 1; min-width: 0; padding: 5px 8px; font-size: 14px; }
.tr-cover { position: absolute; inset: 0; z-index: 3; display: flex; align-items: safe center; justify-content: center; border-radius: inherit;
  background: rgba(8,16,40,.86); text-align: center; padding: 20px; overflow-y: auto; }
.tr-cover .in { max-width: 560px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.tr-cover .tr-slots { max-height: 220px; width: min(520px, 80vw); }
.tr-tip { position: fixed; z-index: 90; width: 270px; padding: 10px 12px; pointer-events: none; font-size: 13px; }
.tr-tip .hd { display: flex; gap: 8px; align-items: center; }
.tr-tip .hd canvas { width: 72px; height: 62px; flex: 0 0 72px; }
.tr-tip h4 { margin: 0; font-size: 16px; }
.tr-tip .stat { grid-template-columns: 66px 1fr 40px; font-size: 12px; margin: 2px 0; }
.tr-tip p { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.tr-tip p.hl { color: #cfe7ff; }
#${PICK} .box { width: min(520px, 100%); }
#trade-pop.lift { bottom: 170px; }
@media (min-height: 521px) { #${SCR}, #${PICK} { padding-top: 66px; } }
@media (max-height: 720px) {
  #${SCR} .tr-fresh { font-size: 11px; }
  .tr-slots { min-height: 54px; max-height: 108px; }
  .tr-slot canvas { width: 48px; height: 40px; }
  .tr-chat { flex-basis: 90px; }
}
@media (max-width: 860px) {
  .tr-main { grid-template-columns: 1fr; grid-auto-rows: max-content; overflow-y: auto; padding-right: 4px; }
  .tr-pick, .tr-side { min-height: auto; overflow: visible; }
  .tr-grid { flex: none; height: 232px; min-height: 0; }
  .tr-chat { flex: none; height: 170px; }
}
@media (max-height: 520px) { #${SCR} .tr-box { height: calc(100dvh - 40px); } #${SCR} .tr-fresh { font-size: 11px; } }`;
  document.head.appendChild(css);

  // ---------------- the screens ----------------

  function build() {
    if ($(SCR)) return;
    const sec = document.createElement('section');
    sec.id = SCR; sec.className = 'scr dim hidden';
    sec.setAttribute('translate', 'no');
    sec.innerHTML = `
  <div class="box tr-box">
    <div class="row between"><h2>${icon(24)} <span>Trade with <b class="gold" id="tr-who"></b></span></h2>
      <button class="btn small ghost" id="tr-leave" type="button">Leave trade</button></div>
    <p class="sub tr-fresh">${FRESH}</p>
    <div class="tr-main">
      <div class="panel tr-pick">
        <div class="dex-tools">
          <input id="tr-q" type="search" placeholder="Search your Pokémon (name or number)" autocomplete="off" spellcheck="false">
          <select id="tr-gen" title="Generation"></select>
          <select id="tr-type" title="Type"></select>
          <select id="tr-sort" title="Sort"></select>
        </div>
        <div class="filters" id="tr-filters"></div>
        <div class="row between" style="gap:6px;margin-bottom:4px"><span class="sub" id="tr-count" style="margin:0;font-size:13px"></span>
          <button class="btn small ghost hidden" id="tr-clear" type="button">Clear filters</button></div>
        <div class="grid tr-grid" id="tr-grid"></div>
      </div>
      <div class="tr-side">
        <div class="panel tr-offer"><h3>You give <small class="sub" id="tr-mine-n" style="margin:0"></small><span class="grow"></span><span class="tr-ok" id="tr-mine-ok"></span></h3>
          <div class="tr-slots" id="tr-mine"></div></div>
        <div class="tr-arrow">${icon(22)}</div>
        <div class="panel tr-offer"><h3><span id="tr-their-h"></span> <small class="sub" id="tr-their-n" style="margin:0"></small><span class="grow"></span><span class="tr-ok" id="tr-their-ok"></span></h3>
          <div class="tr-slots" id="tr-theirs"></div></div>
        <div class="tr-act">
          <div class="tr-status" id="tr-status"></div>
          <button class="btn gold" id="tr-confirm" type="button" data-sfx="none">Confirm trade</button>
        </div>
        <div class="panel tr-chat">
          <div class="tr-msgs" id="tr-msgs"></div>
          <form id="tr-chat-form" autocomplete="off"><input id="tr-chat-in" class="field" maxlength="200" placeholder="Say something…" spellcheck="false">
            <button class="btn small" type="submit">Send</button></form>
        </div>
      </div>
    </div>
    <div class="tr-cover hidden" id="tr-cover"><div class="in" id="tr-cover-in"></div></div>
  </div>`;
    document.body.appendChild(sec);

    const pick = document.createElement('section');
    pick.id = PICK; pick.className = 'scr dim hidden';
    pick.setAttribute('translate', 'no');
    pick.innerHTML = `
  <div class="box">
    <div class="row between"><h2>${icon(24)} Trade</h2><button class="btn small ghost" id="trf-back" type="button">Back</button></div>
    <p class="sub" style="margin-bottom:8px">Pick a friend to trade Pokémon with: they get a request, like a party invite. You both pick what to put up, see each other's offer, and both confirm.</p>
    <p class="note" style="margin:0 0 10px">${FRESH}</p>
    <div class="fr-list" id="trf-list"></div>
    <p class="note" id="trf-msg"></p>
  </div>`;
    document.body.appendChild(pick);

    const tip = document.createElement('div');
    tip.id = 'tr-tip'; tip.className = 'box tr-tip hidden';
    tip.setAttribute('translate', 'no');
    document.body.appendChild(tip);

    const pop = document.createElement('div');
    pop.id = 'trade-pop'; pop.className = 'box invite-pop hidden';
    pop.setAttribute('translate', 'no');
    pop.innerHTML = `<div id="tp-text"></div><p class="note" style="margin:6px 0 0;font-size:12px">Nothing moves until you both confirm.</p>
  <div class="row" style="margin-top:10px"><button id="tp-yes" class="btn gold small grow" type="button" data-sfx="confirm">Trade</button>
  <button id="tp-no" class="btn ghost small" type="button">No, thanks</button></div>`;
    document.body.appendChild(pop);

    $('tr-leave').onclick = () => { G.Trade.leave('you'); };
    $('trf-back').onclick = () => G.MenuUI.open();
    $('tr-confirm').onclick = onConfirm;
    $('tr-chat-form').onsubmit = async e => {
      e.preventDefault();
      const inp = $('tr-chat-in');
      const r = await T.say(inp.value);
      if (r.ok) inp.value = '';
      else if (r.error) G.UI.toast(r.error, 2000);
    };
    $('tr-q').oninput = () => { clearTimeout(qT); qT = setTimeout(() => { F.q = $('tr-q').value; renderGrid(); }, 150); };
    $('tp-yes').onclick = async () => {
      const t = popCur;
      hidePop();
      if (!t) return;
      const r = await T.accept(t.id);
      if (!r.ok) { G.UI.toast(r.error || "Couldn't join the trade.", 3200); G.Audio.sfx('error'); refreshPop(); }
    };
    $('tp-no').onclick = () => { if (popCur) T.decline(popCur.id); hidePop(); refreshPop(); };
    // Typing in the trade's boxes doesn't move anything or open menus.
    for (const el of [sec, pick]) el.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') e.stopPropagation(); });
  }

  /** Another screen (an invite, the room...) closes these; a trade in progress is left (nothing is traded). */
  for (const f of ['show', 'hideAll']) {
    const orig = G.UI[f];
    G.UI[f] = function (id) {
      if (id !== SCR && $(SCR) && !$(SCR).classList.contains('hidden')) {
        $(SCR).classList.add('hidden');
        hideTip();
        if (T.cur) T.leave('you');
      }
      if (id !== PICK && $(PICK)) $(PICK).classList.add('hidden');
      return orig.apply(this, arguments);
    };
  }
  const isOpen = id => !!$(id) && !$(id).classList.contains('hidden');

  // ---------------- main menu, friends ----------------

  function addMenuItem() {
    const fr = document.querySelector('#scr-menu [data-go="friends"]');
    if (!fr || document.querySelector('#scr-menu [data-go="trade"]')) return;
    const b = document.createElement('button');
    b.className = 'menu-item'; b.dataset.go = 'trade'; b.dataset.sfx = 'click'; b.type = 'button';
    b.setAttribute('translate', 'no');
    b.innerHTML = `<span class="mi-ico">${icon(26)}</span>Trade<small id="menu-trade-sub">Swap Pokémon with friends</small>`;
    b.onclick = openFriends;
    fr.after(b);
  }
  function menuLine() {
    const sub = $('menu-trade-sub');
    if (!sub) return;
    const n = T.ready ? T.requests().length : 0;
    sub.textContent = n ? (n === 1 ? '1 trade request' : n + ' trade requests') : 'Swap Pokémon with friends';
    sub.classList.toggle('gold', n > 0);
  }
  const menuInit = G.MenuUI.init;
  G.MenuUI.init = function () { const r = menuInit.apply(this, arguments); build(); addMenuItem(); return r; };
  const menuOpen = G.MenuUI.open;
  G.MenuUI.open = function () { const r = menuOpen.apply(this, arguments); menuLine(); refreshPop(); return r; };

  function openFriends() {
    if (!G.SocialUI.needOnline()) return;
    G.SocialUI.withNick(() => {
      build();
      G.UI.show(PICK);
      $('trf-msg').textContent = '';
      renderFriends();
      G.Social.ensureFriends().then(() => { if (isOpen(PICK)) renderFriends(); });
    });
  }
  function renderFriends() {
    const box = $('trf-list');
    const list = G.Social.friends.filter(f => f.status === 'ok').sort((a, b) => a.name.localeCompare(b.name));
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<p class="sub" style="margin:0">No friends yet: add one in Friends with their nickname.</p>';
      const b = document.createElement('button');
      b.className = 'btn small gold'; b.type = 'button'; b.textContent = 'Go to Friends';
      b.onclick = () => G.FriendsUI.open();
      box.appendChild(b);
      return;
    }
    for (const f of list) {
      const el = document.createElement('div');
      el.className = 'fr-row';
      el.innerHTML = `<i class="dot on"></i><b>${G.PlayerNames.html(f.uid, f.name)}</b><span class="grow"></span>`;
      const b = document.createElement('button');
      b.className = 'btn small gold'; b.type = 'button'; b.textContent = 'Send trade request';
      b.dataset.sfx = 'confirm';
      b.onclick = () => request(f.uid);
      el.appendChild(b);
      box.appendChild(el);
    }
  }
  /** The Friends screen's Trade button (js/ui/social-ui.js, render). */
  function friendButton(row, f) {
    if (!f || f.status !== 'ok') return;
    const b = document.createElement('button');
    b.className = 'btn small'; b.type = 'button'; b.textContent = 'Trade';
    b.setAttribute('translate', 'no');
    b.title = 'Trade Pokémon with ' + f.name;
    b.onclick = () => request(f.uid);
    row.appendChild(b);
  }
  async function request(friend) {
    if (T.cur) { openWindow(); return; }
    const r = await T.ask(friend);
    if (!r.ok) {
      G.Audio.sfx('error');
      if (isOpen(PICK)) { $('trf-msg').textContent = r.error; $('trf-msg').style.color = '#ffb0b8'; }
      else G.UI.toast(r.error, 3200);
      return;
    }
    openWindow();
  }

  // ---------------- the request popup ----------------

  let popCur = null;
  function hidePop() { popCur = null; const p = $('trade-pop'); if (p) p.classList.add('hidden'); }
  function refreshPop() {
    build();
    menuLine();
    const list = T.ready ? T.requests() : [];
    // (While your own request is still unanswered, theirs shows too: two friends asking each other at once.)
    if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn || (T.cur && T.trade.st !== 'ask')) { hidePop(); return; }
    const t = list[0];
    $('trade-pop').classList.toggle('lift', !$('invite-pop').classList.contains('hidden'));
    if (popCur && popCur.id === t.id) return;
    popCur = t;
    $('tp-text').innerHTML = `${icon(22)} <b class="gold">${G.PlayerNames.html(t.a, T.nameOf(t.a, t))}</b> wants to trade Pokémon with you`;
    $('trade-pop').classList.remove('hidden');
    G.Audio.sfx('shiny');
  }
  setInterval(() => { if (T.ready) refreshPop(); }, 5000);

  // ---------------- the window ----------------

  // Filters (this device remembers them, not the search).
  const F0 = () => ({ q: '', gen: 0, type: '', v: '', rar: [], hide: true, sort: 'num' });
  let F = F0();
  try { const d = JSON.parse(localStorage.getItem('ms.tradeF') || 'null'); if (d) F = Object.assign(F0(), d, { q: '' }); } catch (e) { /* nothing */ }
  const saveF = () => { try { localStorage.setItem('ms.tradeF', JSON.stringify(Object.assign({}, F, { q: undefined }))); } catch (e) { /* nothing */ } };
  const SORTS = [['num', 'Nº'], ['name', 'Name'], ['rar', 'Rarity'], ['pow', 'Power'], ['new', 'Newest']];
  let qT = 0, keyMine = '', keyTheirs = '', chatKey = '', haveSeen = false;
  setInterval(() => { if (T.countLeft >= 0 && isOpen(SCR)) render(); }, 200);

  function openWindow() {
    build();
    G.UI.show(SCR);
    G.Social.ensureFriends().then(() => render());
    $('tr-q').value = F.q;
    keyMine = keyTheirs = chatKey = ''; haveSeen = !!T.theirHave;
    tools();
    renderGrid();
    render();
  }

  function tools() {
    $('tr-gen').innerHTML = '<option value="0">All generations</option>' + GEN.map((g, i) => `<option value="${i + 1}">${g}</option>`).join('');
    $('tr-gen').value = String(F.gen);
    $('tr-gen').onchange = () => { F.gen = +$('tr-gen').value; saveF(); renderGrid(); };
    $('tr-type').innerHTML = '<option value="">All types</option>' + Object.keys(G.U.TYPE_NAME).map(t => `<option value="${t}">${esc(tr(G.U.TYPE_NAME[t]))}</option>`).join('');
    $('tr-type').value = F.type;
    $('tr-type').onchange = () => { F.type = $('tr-type').value; saveF(); renderGrid(); };
    $('tr-sort').innerHTML = SORTS.map(([k, l]) => `<option value="${k}">Sort: ${l}</option>`).join('');
    $('tr-sort').value = F.sort;
    $('tr-sort').onchange = () => { F.sort = $('tr-sort').value; saveF(); renderGrid(); };
    const fb = $('tr-filters');
    fb.innerHTML = '';
    const chip = (html, on, fn, title) => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'chip' + (on ? ' on' : ''); c.innerHTML = html;
      if (title) c.title = title;
      c.onclick = () => { fn(); saveF(); tools(); renderGrid(); };
      fb.appendChild(c);
    };
    chip('All forms', !F.v, () => { F.v = ''; });
    chip('Normal', F.v === 'n', () => { F.v = F.v === 'n' ? '' : 'n'; });
    chip(G.Icons.html('shiny', 12) + ' Shiny', F.v === 's', () => { F.v = F.v === 's' ? '' : 's'; });
    if (G.Radiant) chip(G.Radiant.icon(12) + ' Radiant', F.v === 'r', () => { F.v = F.v === 'r' ? '' : 'r'; });
    for (const r of [5, 4, 3, 2, 1]) {
      chip(G.Icons.rarity(r, 12), F.rar.includes(r), () => { F.rar = F.rar.includes(r) ? F.rar.filter(x => x !== r) : F.rar.concat(r); }, tr(G.Gacha.RARITY_NAME[r]));
    }
    chip('Hide ones they have', F.hide, () => { F.hide = !F.hide; }, 'Hide the Pokémon (and forms) your friend already has');
    $('tr-clear').onclick = () => { F = F0(); $('tr-q').value = ''; saveF(); tools(); renderGrid(); };
  }

  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Your Pokémon as the filters and sort say. */
  function list() {
    const s = G.DB.save, have = T.theirHave;
    const q = norm(F.q.trim()), num = /^#?\d+$/.test(q) ? +q.replace('#', '') : null;
    const l = T.offerable(s).filter(it => {
      const p = G.DEX_BY[it.dex];
      if (q && (num != null ? it.dex !== num : ![p.name, tr(p.name)].some(n => norm(n).includes(q)))) return false;
      if (F.gen && p.gen !== F.gen) return false;
      if (F.type && !p.types.includes(F.type)) return false;
      if (F.v && it.v !== F.v) return false;
      if (F.rar.length && !F.rar.includes(p.rarity)) return false;
      if (F.hide && have && T.hasIn(have, it) && !T.mine.some(m => m.key === it.key)) return false;
      return true;
    });
    const at = it => +((s[{ n: 'owned', s: 'shiny', r: 'radiant' }[it.v]] || {})[it.dex] || {}).at || 0;
    const VO = { r: 0, s: 1, n: 2 };
    const by = {
      num: (a, b) => a.dex - b.dex || VO[a.v] - VO[b.v],
      name: (a, b) => monName(a.dex).localeCompare(monName(b.dex)) || VO[a.v] - VO[b.v],
      rar: (a, b) => G.DEX_BY[b.dex].rarity - G.DEX_BY[a.dex].rarity || a.dex - b.dex,
      pow: (a, b) => (G.DEX_BY[b.dex].bst || 0) - (G.DEX_BY[a.dex].bst || 0) || a.dex - b.dex,
      new: (a, b) => at(b) - at(a) || a.dex - b.dex
    }[F.sort] || ((a, b) => a.dex - b.dex);
    return l.sort(by);
  }

  const PAGE = 60;
  let gl = [], shown = 0, io = null;
  function renderGrid() {
    const grid = $('tr-grid');
    if (!grid) return;
    const top = grid.scrollTop;
    grid.innerHTML = '';
    gl = list(); shown = 0;
    const busy = F.q || F.gen || F.type || F.v || F.rar.length || !F.hide || F.sort !== 'num';
    $('tr-clear').classList.toggle('hidden', !busy);
    $('tr-count').textContent = gl.length === 1 ? '1 Pokémon you can trade' : gl.length + ' Pokémon you can trade';
    if (!gl.length) { grid.innerHTML = '<p class="sub" style="grid-column:1/-1">None with these filters.</p>'; return; }
    more(Math.max(PAGE, shownWas));
    grid.scrollTop = top;
  }
  let shownWas = 0;   // (a redraw keeps as many tiles as there were, so the list doesn't jump back up)
  function more(n = PAGE) {
    const grid = $('tr-grid');
    const old = grid.querySelector('.dex-more');
    if (old) { if (io) io.unobserve(old); old.remove(); }
    const end = Math.min(gl.length, shown + n);
    for (let i = shown; i < end; i++) grid.appendChild(cell(gl[i]));
    shown = end; shownWas = shown;
    if (shown >= gl.length) return;
    const m = document.createElement('div');
    m.className = 'dex-more';
    grid.appendChild(m);
    if (!('IntersectionObserver' in window)) { more(gl.length); return; }
    io = io || new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { root: null, rootMargin: '300px' });
    io.observe(m);
  }

  const vIcon = (v, n = 12) => (v === 's' ? G.Icons.html('shiny', n) : v === 'r' && G.Radiant ? G.Radiant.icon(n) : '');
  const sprite = (it, w, h) => G.UI.spriteCanvas(it.dex, w, h, { scale: 2, hero: true, shiny: it.v === 's', radiant: it.v === 'r' });

  /** Why a Pokémon of yours can't go into the offer now ('' if it can). */
  function blocked(it) {
    if (it.why === 'partner') return 'Your partner';
    const have = T.theirHave;
    if (have && T.hasIn(have, it)) return 'They have it';
    return '';
  }

  function cell(it) {
    const p = G.DEX_BY[it.dex];
    const on = T.mine.some(m => m.key === it.key), why = on ? '' : blocked(it);
    const c = document.createElement('div');
    c.className = 'cell tr-cell' + (on ? ' on' : '') + (why ? ' no' : '');
    c.dataset.key = it.key;
    c.insertAdjacentHTML('beforeend', `<span class="no">${String(it.dex).padStart(3, '0')}</span><span class="tr-v">${vIcon(it.v)}</span>`);
    c.appendChild(sprite(it, 72, 60));
    c.insertAdjacentHTML('beforeend', `<b>${esc(monName(it.dex))}</b>${why ? `<span class="tr-why">${why}</span>` : G.UI.stars(p.rarity, 9)}`);
    c.onclick = async () => {
      if (c.dataset.held) { delete c.dataset.held; return; }
      if (!T.cur || T.trade.st !== 'open') { G.UI.toast('Wait for your friend to join the trade.', 2200); return; }
      if (why) {
        G.Audio.sfx('error');
        G.UI.toast(why === 'Your partner' ? 'Pick another partner first to trade this one.' : 'Your friend already has this one.', 2400);
        return;
      }
      G.Audio.sfx('select');
      const r = await T.toggle(it.key);
      if (!r.ok && r.error) { G.Audio.sfx('error'); G.UI.toast(r.error, 2400); }
    };
    tipOn(c, it, 'mine');
    return c;
  }

  function slot(it, whose) {
    const c = document.createElement('div');
    const dup = whose === 'theirs' && G.DB.save && ownsIt(G.DB.save, it);
    c.className = 'tr-slot' + (whose === 'mine' ? ' mine' : '') + (dup ? ' dup' : '');
    c.dataset.key = it.key;
    c.insertAdjacentHTML('beforeend', `<span class="tr-v">${vIcon(it.v, 10)}</span>`);
    c.appendChild(sprite(it, 56, 48));
    c.insertAdjacentHTML('beforeend', `${dup ? '<span class="tr-dup">You have it</span>' : ''}<b>${esc(monName(it.dex))}</b>`);
    if (whose === 'mine') {
      c.title = 'Click to take it out';
      c.onclick = async () => {
        if (c.dataset.held) { delete c.dataset.held; return; }
        G.Audio.sfx('back');
        const r = await T.toggle(it.key);
        if (!r.ok && r.error) G.UI.toast(r.error, 2400);
      };
    }
    tipOn(c, it, whose);
    return c;
  }
  const ownsIt = (s, it) => !!((s[{ n: 'owned', s: 'shiny', r: 'radiant' }[it.v]] || {})[it.dex]);

  function slots(box, items, whose, empty) {
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = `<p class="tr-empty">${empty}</p>`; return; }
    for (const it of items) box.appendChild(slot(it, whose));
  }

  /** Everything but the grid (which only changes when your offer or the filters do). */
  function render() {
    if (!isOpen(SCR)) return;
    const t = T.trade;
    if (!t) return;
    const other = T.nameOf(T.other);
    $('tr-who').innerHTML = G.PlayerNames.html(T.other, other);
    $('tr-their-h').innerHTML = G.PlayerNames.html(T.other, other) + ' gives';
    const mine = T.mine, theirs = T.theirs, side = T.side, os = side === 'a' ? 'b' : 'a';
    if (!!T.theirHave !== haveSeen) { haveSeen = !!T.theirHave; renderGrid(); }
    const km = mine.map(i => i.key).join(), kt = theirs.map(i => i.key).join() + '|' + (G.DB.save ? Object.keys(G.DB.save.owned).length : 0);
    if (km !== keyMine) {
      keyMine = km;
      slots($('tr-mine'), mine, 'mine', t.st === 'open' ? 'Click your Pokémon on the left to put them up.' : '');
      // The grid's ticks follow the offer.
      $('tr-grid').querySelectorAll('.tr-cell').forEach(c => {
        const on = mine.some(m => m.key === c.dataset.key);
        if (on !== c.classList.contains('on')) {
          const it = gl.find(x => x.key === c.dataset.key);
          if (it) c.replaceWith(cell(it));
        }
      });
    }
    if (kt !== keyTheirs) { keyTheirs = kt; slots($('tr-theirs'), theirs, 'theirs', t.st === 'open' ? 'Nothing yet.' : ''); }
    $('tr-mine-n').textContent = mine.length ? `(${mine.length}/${T.MAX})` : '';
    $('tr-their-n').textContent = theirs.length ? `(${theirs.length})` : '';
    const okMe = t.st === 'open' && t.rv > 0 && t['k' + side] === t.rv, okThem = t.st === 'open' && t.rv > 0 && t['k' + os] === t.rv;
    const ok = (el, on) => { el.textContent = on ? '✔ Confirmed' : 'Not confirmed'; el.classList.toggle('on', on); };
    ok($('tr-mine-ok'), okMe); ok($('tr-their-ok'), okThem);

    const btn = $('tr-confirm'), st = $('tr-status');
    const why = T.cantConfirm(), left = T.countLeft;
    btn.textContent = okMe ? 'Unconfirm' : 'Confirm trade';
    btn.classList.toggle('gold', !okMe);
    btn.classList.toggle('ghost', okMe);
    btn.disabled = !okMe && !!why;
    btn.title = !okMe && why ? why : '';
    st.className = 'tr-status';
    if (left >= 0) { st.classList.add('go'); st.textContent = left > 0 ? `Trading in ${Math.ceil(left / 1000)}…` : 'Trading…'; }
    else if (t.st === 'ask') st.textContent = 'Waiting for ' + other + ' to accept…';
    else if (T.awayFor() > 60000) { st.classList.add('warn'); st.textContent = other + ' seems to be away…'; }
    else if (T.changed) { st.classList.add('warn'); st.textContent = 'An offer changed: confirm again.'; }
    else if (okMe && !okThem) st.textContent = 'Waiting for ' + other + ' to confirm…';
    else if (!okMe && okThem) { st.classList.add('warn'); st.textContent = other + ' confirmed: your turn.'; }
    else st.textContent = why && (mine.length || theirs.length) ? why : 'Both of you confirm, then a 3 s countdown (either can back out).';

    // The request is still out: a cover with Cancel.
    const cover = $('tr-cover');
    if (t.st === 'ask') {
      if (cover.dataset.k !== 'ask') {
        cover.dataset.k = 'ask';
        $('tr-cover-in').innerHTML = `<h3>${icon(22)} Waiting for <span class="gold">${esc(other)}</span>…</h3>
          <p class="sub" style="margin:0">They got your trade request. It stays open for 3 minutes.</p>
          <button class="btn ghost" type="button" id="tr-cancel">Cancel request</button>`;
        $('tr-cancel').onclick = () => T.leave('you');
      }
      cover.classList.remove('hidden');
    } else if (cover.dataset.k === 'ask') { cover.dataset.k = ''; cover.classList.add('hidden'); }
    renderChat();
  }

  function renderChat() {
    const box = $('tr-msgs'), msgs = T.msgs, key = msgs.map(m => m.id).join();
    if (key === chatKey) return;
    chatKey = key;
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
    const me = T.uid, other = T.nameOf(T.other);
    box.innerHTML = msgs.length ? '' : `<span class="sys">Chat with ${esc(other)} here.</span>`;
    for (const m of msgs) {
      const el = document.createElement('div');
      el.className = 'm' + (m.u === me ? ' me' : '');
      el.innerHTML = `<b>${G.PlayerNames.html(m.u, m.u === me ? 'You' : other)}:</b> ${esc(String(m.t || '').slice(0, 200))}`;
      box.appendChild(el);
    }
    if (atEnd || msgs.length && msgs[msgs.length - 1].u === me) box.scrollTop = box.scrollHeight;
  }

  async function onConfirm() {
    const t = T.trade;
    if (!t) return;
    const confirmed = t.st === 'open' && t.rv > 0 && t['k' + T.side] === t.rv;
    const r = confirmed ? await T.unconfirm() : await T.confirm();
    if (r.ok) G.Audio.sfx(confirmed ? 'back' : 'confirm');
    else { G.Audio.sfx('error'); if (r.error) G.UI.toast(r.error, 3000); }
  }

  /** The result: what you got and what you gave. */
  function showDone(e) {
    build();
    if (!isOpen(SCR)) G.UI.show(SCR);
    hideTip();
    const cover = $('tr-cover');
    cover.dataset.k = 'done';
    $('tr-cover-in').innerHTML = `<h3>${icon(24)} Trade complete!</h3>
      <p class="sub" style="margin:0">With <b class="gold">${G.PlayerNames.htmlFor(e.name)}</b></p>
      <b>You got</b><div class="tr-slots" id="trd-got"></div>
      <b>You gave</b><div class="tr-slots" id="trd-out"></div>
      <p class="note" style="margin:0">${FRESH}</p>
      <button class="btn gold" type="button" id="trd-ok" data-sfx="confirm">OK</button>`;
    slots($('trd-got'), e.got || [], 'done', 'Nothing');
    slots($('trd-out'), e.out || [], 'done', 'Nothing');
    $('trd-ok').onclick = () => { cover.classList.add('hidden'); cover.dataset.k = ''; G.MenuUI.open(); };
    cover.classList.remove('hidden');
    G.Audio.sfx('levelup');
  }

  const ENDED = {
    you: 'You left the trade. Nothing was traded.', left: '{x} left the trade. Nothing was traded.',
    run: 'The trade was cancelled: a run started. Nothing was traded.', gone: '{x} stopped answering: trade cancelled. Nothing was traded.',
    noanswer: "{x} didn't answer the trade request.", logout: '', switch: ''
  };
  T.on(e => {
    if (e === 'asks') { refreshPop(); return; }
    if (e === 'open' || e === 'resumed') {
      hidePop();
      if (G.Game.state === 'ui') { openWindow(); if (e === 'resumed') G.UI.toast("You're back in your trade. Confirm again when you're ready.", 3000); }
      return;
    }
    if (e === 'trade' || e === 'tick' || e === 'chat') { render(); return; }
    if (e && e.k === 'stuck') { G.UI.toast("The trade couldn't go through (your friend's game didn't answer). Confirm again to retry.", 3800); return; }
    if (e && e.k === 'ended') {
      hideTip();
      const msg = (ENDED[e.why] || ENDED.you).replace('{x}', e.name);
      if (isOpen(SCR)) { $(SCR).classList.add('hidden'); if (G.Game.state === 'ui') G.MenuUI.open(); }
      if (msg) G.UI.toast(e.wasAsk && e.why === 'left' ? e.name + ' said no to the trade.' : msg, 3200);
      refreshPop();
      return;
    }
    if (e && e.k === 'applied') {
      if (e.late) {
        const [out, got] = T.sides(e.t, T.uid);
        G.UI.toast(`A trade with ${T.nameOf(e.t.a === T.uid ? e.t.b : e.t.a, e.t)} finished while you were away: you got ${got.length} and gave ${out.length} Pokémon.`, 4200);
        if (G.UI.isOpen('scr-menu')) G.MenuUI.open();
        return;
      }
      showDone(e);
    }
  });

  // ---------------- the stats card (hover, or hold on a touch screen) ----------------

  const MAX = { hp: 183, atk: 1.55, spd: 137, def: 160 };
  const STAT = { pa: 'Attack', sa: 'Sp. Atk', df: 'Defense', sd: 'Sp. Def', spd: 'Speed' };
  function tipHtml(it, whose) {
    const p = G.DEX_BY[it.dex];
    const bar = (label, v, m, txt) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div><span>${txt}</span></div>`;
    const ab = (G.Mons.slots(it.dex) || []).map((id, i) => (id ? G.Mons.abilityName(id) + (i === 2 ? ' (hidden)' : '') : '')).filter(Boolean);
    const uniq = [...new Set(ab)];
    const move = G.Moves.BY_ID[G.startMoveOf(it.dex)];
    let arrive = '';
    if (whose === 'theirs') {
      const n = G.Mons.natureOf(it.dex), a = G.Mons.abilityOf(it.dex);
      const nl = n.up ? `+${STAT[n.up]} −${STAT[n.down]}` : 'neutral';
      arrive = `<p class="hl">Yours, it would be ${esc(G.Mons.name(n.n))} (${nl}) with ${esc(G.Mons.abilityName(a.id) || '—')}.</p>`;
      if (ownsIt(G.DB.save, it)) arrive += `<p class="hl" style="color:#e9c9ff">You already have ${it.v === 'n' ? 'it' : 'its ' + V_NAME[it.v].toLowerCase() + ' form'}.</p>`;
    } else if (whose === 'mine') arrive = '<p>They get it at Lv. 1 with their own nature and ability; your upgrades and TMs stay with you.</p>';
    return `<div class="hd"><canvas width="72" height="62"></canvas><div>
        <h4>${esc(monName(it.dex))} ${vIcon(it.v, 12)}</h4>
        <div class="sub" style="margin:0;font-size:12px">Nº ${String(it.dex).padStart(3, '0')} · ${GEN[p.gen - 1] || ''} · ${V_NAME[it.v]}</div>
        <div style="margin-top:3px">${p.types.map(t => `<span class="type" style="background:${G.U.TYPE_COLOR[t]}">${esc(tr(G.U.TYPE_NAME[t]))}</span>`).join('')}</div>
        <div style="color:${G.Gacha.RARITY_COLOR[p.rarity]};font-size:12px">${G.UI.stars(p.rarity, 10)} ${esc(tr(G.Gacha.RARITY_NAME[p.rarity]))}</div>
      </div></div>
      <p style="margin:6px 0 2px">Stats at Lv. 1 (no upgrades):</p>
      ${bar('HP', p.hp, MAX.hp, p.hp)}
      ${bar('Attack', p.pa, MAX.atk, '×' + p.pa.toFixed(2))}
      ${bar('Sp. Atk', p.sa, MAX.atk, '×' + p.sa.toFixed(2))}
      ${bar('Defense', p.df, MAX.def, Math.round(p.df))}
      ${bar('Sp. Def', p.sd, MAX.def, Math.round(p.sd))}
      ${bar('Speed', p.spd, MAX.spd, Math.round(p.spd))}
      <p>Base total ${p.bst || '—'} · hits harder with ${G.Stats.sideOf(p) === 'special' ? 'special' : 'physical'} moves</p>
      ${move ? `<p>Starts with ${esc(tr(move.name, 'move'))}</p>` : ''}
      ${uniq.length ? `<p>Abilities: ${uniq.map(esc).join(' · ')}</p>` : ''}
      ${arrive}`;
  }
  let tipFor = null;
  function showTip(el, it, whose, x, y) {
    const tip = $('tr-tip');
    if (tipFor !== el) {
      tipFor = el;
      tip.innerHTML = tipHtml(it, whose);
      G.UI.sprite(tip.querySelector('canvas'), it.dex, { scale: 2, hero: true, lively: true, shiny: it.v === 's', radiant: it.v === 'r' });
    }
    tip.classList.remove('hidden');
    // The page may be zoomed (js/fork/ui-scale.js): left/top are in its units, the mouse in the window's.
    const z = parseFloat(getComputedStyle(tip).zoom) || 1;
    const r = tip.getBoundingClientRect();
    let lx = x + 18, ly = y + 14;
    if (lx + r.width > innerWidth - 6) lx = x - 18 - r.width;
    if (ly + r.height > innerHeight - 6) ly = innerHeight - 6 - r.height;
    tip.style.left = Math.max(6, lx) / z + 'px';
    tip.style.top = Math.max(6, ly) / z + 'px';
  }
  function hideTip() { tipFor = null; const t = $('tr-tip'); if (t) t.classList.add('hidden'); }
  function tipOn(el, it, whose) {
    el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') showTip(el, it, whose, e.clientX, e.clientY); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });
    let hold = 0;
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      clearTimeout(hold);
      hold = setTimeout(() => { el.dataset.held = '1'; showTip(el, it, whose, e.clientX, e.clientY); }, 450);
    });
    const up = () => { clearTimeout(hold); if (el.dataset.held) setTimeout(hideTip, 1600); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  return { open: openWindow, openFriends, friendButton, request, refreshPop, render, renderGrid,
    get filters() { return F; } };
})();
