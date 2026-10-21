/* ============ radiant.js — radiant forms and the ritual (MrSurvivor fork) ============
 * A radiant is a third variant of a Pokémon (normal, shiny, radiant) with its own
 * recoloured sheets in assets/pokemon/{dex}/r/ (its Lab signature ones in r/lab/ and its
 * Mega's in m{dex}/r/), made with the kit (radiant-kit/index.html). Which ones exist is set by
 * G.RADIANTS (js/fork/radiant-list.js, written by fork/radiants.cjs during the build), plus the ones
 * in js/fork/radiants.json (refresh: what's published with fork/radiant-admin.cjs without redoing the
 * build). Each has its rarity (1-5): its weight in the ritual (WEIGHT).
 *
 *   Sprites   each radiant is registered in G.SPRITE_META under the key '{dex}/r' (and 'm{dex}/r'),
 *             with the normal form's geometry: G.Sprites loads it from {dex}/r/{Anim}.png without
 *             changing anything. G.UI.sprite / spriteCanvas accept opts.radiant.
 *   Save      save.radiant: dex -> { at, from } (the ones you have); save.radOff: dex -> 1 if
 *             you'd rather not use it (like save.shinyOff: if you have it, it's used by default).
 *   Ritual    you sacrifice 10 shinies (you pick them) and ONE comes out at random from ALL the
 *             radiants that exist, more or less likely by its rarity. The sacrificed ones lose their shiny (the normal Pokémon
 *             stays); save.sac: dex -> date of the sacrifice. If you get one you already had, DUP_COINS.
 *             Warns before sacrificing a shiny legendary (can be turned off: G.Settings
 *             'radWarn', per device) and asks you to confirm.
 *   Merge     G.forkMerge (called by merge() in js/core/db.js): union of radiants, the latest
 *             sacrifice of each, and a sacrificed shiny only comes back if it was caught AFTER
 *             the sacrifice (otherwise the union of shinies would bring it back from the other copy).
 *   In a run  your Pokémon is radiant if you have it and want it (G.Game.startRun). In a group, each
 *             room member carries `rad` (G.LobbyPick, js/fork/coop-random.js) and the others
 *             see it radiant. The Mega and the Lab's Transform go through G.Admin.repaint (look).
 *   Menu      the Normal / Shiny / Radiant selector (partner and detail card) and the mark in the
 *             collection: one-line hooks in js/ui/menu.js (menu, cell, detail), and the
 *             collection's Radiant filter (dexF.rad). If you have the radiant, it beats the shiny
 *             unless you've picked Normal or Shiny for that Pokémon (radOff).
 *   Roll      the 1-ticket gacha one (js/ui/slots.js in #pull-fx): it stops on its rarity's ball.
 * Texts in English only, like Lab mode. Test: fork/test-radiant.cjs.
 */
G.Radiant = (() => {
  const NEED = 10;                 // shinies per roll
  const DUP_COINS = 3000;          // if you get one you already had
  const COLOR = '#ffb347';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const LIST = G.RADIANTS || {};

  // ---------------- sprites ----------------

  const key = dex => dex + '/r';
  /** Does dex's radiant exist (with its sheets registered)? */
  const has = dex => !!(LIST[dex] && G.SPRITE_META[key(dex)]);
  function register(dex) {
    const m = G.SPRITE_META[dex];
    if (!m) return;
    const a = {};
    for (const k in m.a) if (!k.startsWith('lab/')) a[k] = m.a[k];
    const lab = G.LAB_ANIMS && G.LAB_ANIMS[dex];
    for (const k of LIST[dex].lab || []) if (lab && lab.a[k]) a['lab/' + k] = lab.a[k];
    G.SPRITE_META[key(dex)] = { s: m.s, a, hv: m.hv };
    const mm = G.SPRITE_META['m' + dex];
    if (LIST[dex].mega && mm) G.SPRITE_META[key('m' + dex)] = { s: mm.s, a: Object.assign({}, mm.a), hv: mm.hv };
  }
  for (const dex in LIST) register(dex);

  // The ones published after this build (fork/radiant-admin.cjs uploads js/fork/radiants.json without
  // redoing app.min.js): read on load and when the ritual opens, and added to the list.
  async function refresh() {
    try {
      const own = document.querySelector('script[src*="app.min.js"], script[src*="js/game.js"]');
      const r = await fetch(new URL('fork/radiants.json', own ? own.src : location.href).href + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json();
      let changed = false;
      for (const d in j) {
        if (!G.DEX_BY[d] || JSON.stringify(LIST[d]) === JSON.stringify(j[d])) continue;
        LIST[d] = j[d]; register(d); changed = true;
      }
      return changed;
    } catch (e) { return false; }                      // no network or no file: the build's ones
  }

  // Each radiant's rarity (1-5; set by fork/radiant-admin.cjs, else the Pokémon's): its weight in the ritual.
  const WEIGHT = { 1: 40, 2: 25, 3: 15, 4: 7, 5: 3 };
  const tier = dex => (LIST[dex] && LIST[dex].rarity) || (G.DEX_BY[dex] && G.DEX_BY[dex].rarity) || 1;
  const weight = dex => WEIGHT[tier(dex)] || WEIGHT[1];
  /** Chance (0-1) that the ritual gives dex, among those in pool. */
  const chance = (dex, all = pool()) => all.includes(+dex) ? weight(dex) / all.reduce((s, d) => s + weight(d), 0) : 0;
  function draw(all) {
    let r = Math.random() * all.reduce((s, d) => s + weight(d), 0);
    for (const d of all) if ((r -= weight(d)) < 0) return d;
    return all[all.length - 1];
  }

  /** G.Admin.repaint: p's sprite key (base = its Pokémon or its Mega) if it's radiant. */
  function look(p, base) {
    return p.radiant && G.SPRITE_META[key(base)] && (base === p.dex || base === 'm' + p.dex) ? key(base) : base;
  }

  // opts.radiant: dex's radiant (with sparkles, like the shiny).
  const sprite = G.UI.sprite, spriteCanvas = G.UI.spriteCanvas;
  const swap = (dex, opts) => opts && opts.radiant && has(dex) ? [key(dex), Object.assign({}, opts, { shiny: true })] : [dex, opts];
  G.UI.sprite = (cv, dex, opts) => sprite(cv, ...swap(dex, opts));
  G.UI.spriteCanvas = (dex, w, h, opts) => { const [d, o] = swap(dex, opts); return spriteCanvas(d, w, h, o); };

  // Lab signatures with their radiant sheet (r/lab/), if there is one; if not, the usual one.
  if (G.LabAnims) {
    const pick = G.LabAnims.pick;
    G.LabAnims.pick = function (pl, prefs) {
      if (!pl || !pl.anim || pl.anim.dex !== key(pl.dex)) return pick.apply(this, arguments);
      const m = G.SPRITE_META[key(pl.dex)];
      for (const p of prefs || []) {
        if (G.Sprites.ANIMS.includes(p)) return p;
        if (m.a['lab/' + p]) return 'lab/' + p;
      }
      return null;
    };
  }

  // ---------------- save ----------------

  const save = () => G.DB.save;
  const owns = dex => !!(save() && save().radiant && save().radiant[dex]);
  /** Use dex's radiant? Yes if you have it, it exists and you haven't picked something else. */
  const wants = dex => owns(dex) && has(dex) && !(save().radOff && save().radOff[dex]);
  /** Records the choice (without saving: the caller does G.DB.commit()). */
  function set(dex, on) {
    const s = save();
    s.radOff = s.radOff || {};
    if (on) delete s.radOff[dex]; else s.radOff[dex] = 1;
  }
  const pool = () => Object.keys(LIST).map(Number).filter(d => G.DEX_BY[d] && has(d));
  const shinies = () => Object.keys(save().shiny || {}).map(Number).filter(d => G.DEX_BY[d]);
  const isLegend = dex => !!(G.DEX_BY[dex] && G.DEX_BY[dex].leg);

  /**
   * The ritual: sacrifices those 10 shinies and gives a random radiant from all that exist.
   * → { ok, dex, dup, coins } or { ok: false, why }
   */
  function sacrifice(list) {
    const s = save(), mine = new Set(shinies());
    const dexes = [...new Set((list || []).map(Number))];
    if (dexes.length !== NEED || !dexes.every(d => mine.has(d))) return { ok: false, why: 'pick' };
    const all = pool();
    if (!all.length) return { ok: false, why: 'empty' };
    const now = Date.now();
    s.sac = s.sac || {};
    for (const d of dexes) { delete s.shiny[d]; s.sac[d] = now; }
    if (dexes.includes(s.partner)) s.partnerShiny = false;
    const dex = draw(all);                           // by its rarity (WEIGHT)
    s.radiant = s.radiant || {};
    const dup = !!s.radiant[dex];
    if (dup) s.coins += DUP_COINS;
    else {
      s.radiant[dex] = { at: now, from: 'ritual' };
      G.DB.grant(dex, 'ritual');
      if (s.radOff) delete s.radOff[dex];
    }
    G.DB.commit();
    return { ok: true, dex, dup, coins: dup ? DUP_COINS : 0 };
  }

  // Merging two copies of the save (merge() in js/core/db.js, on its result r).
  G.forkMerge = (r, a, b) => {
    const sac = {}, rad = {};
    for (const s of [a, b]) {
      for (const d in s.sac || {}) sac[d] = Math.max(sac[d] || 0, +s.sac[d] || 0);
      for (const d in s.radiant || {}) if (!rad[d] || (s.radiant[d].at || 0) < (rad[d].at || 0)) rad[d] = s.radiant[d];
    }
    if (Object.keys(sac).length) r.sac = sac;
    if (Object.keys(rad).length) r.radiant = rad;
    r.shiny = r.shiny || {};
    for (const d in sac) {
      const after = [a, b].map(s => s.shiny && s.shiny[d]).filter(e => e && (e.at || 0) > sac[d])
        .sort((x, y) => (x.at || 0) - (y.at || 0))[0];
      if (after) r.shiny[d] = after; else delete r.shiny[d];
    }
  };

  // ---------------- in the run ----------------

  document.addEventListener('DOMContentLoaded', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function () {
      const r = startRun.apply(this, arguments);
      const pl = G.Game.player;
      if (pl && wants(pl.dex)) paint(pl);
      // Group teammates: whatever their room entry says.
      const room = G.Social && G.Social.room;
      if (G.Coop.active && room) for (const m of G.Coop.mates) {
        const info = room.members.find(x => x.uid === m.uid);
        if (info && info.rad === true && m.pl && has(m.pl.dex)) paint(m.pl);
      }
      return r;
    };
  });
  function paint(p) {
    p.radiant = true;
    p.shiny = false;                                  // looks radiant: doesn't count as shiny (nor get its Lab extras)
    G.Sprites.preload([key(p.dex)], 8000);
    for (const k of LIST[p.dex].lab || []) G.Sprites.sheet(key(p.dex), 'lab/' + k);
    G.Admin.repaint(p);
  }

  // ---------------- menu (hooks in js/ui/menu.js) ----------------

  const ICON = 'radiant';
  G.Icons.UI[ICON] = { pal: { y: COLOR, w: '#fff3c4', o: '#e0762b' }, rows: [
    '.....kk.....', '....kyyk....', '....kyyk....', '...kyyyyk...', '.kkyywwyykk.', 'kyyywwwwyyyk',
    'kyyywwwwyyyo', '.kkyywwyykk.', '...kyyyyk...', '....kyyk....', '....kyok....', '.....kk.....'] };
  const icon = (n = 12) => G.Icons.html(ICON, n);

  /** Draws the Normal / Shiny / Radiant selector in `seg` for dex; choose(v) on click (0, 1, 2). */
  function segment(seg, dex, cur, choose) {
    seg.querySelectorAll('[data-v="2"]').forEach(b => b.remove());
    const r = document.createElement('button');
    r.type = 'button'; r.dataset.v = '2'; r.className = 'rad';
    r.innerHTML = icon() + ' Radiant';
    seg.appendChild(r);
    const sh = seg.querySelector('[data-v="1"]');
    if (sh && !G.DB.ownsShiny(dex)) sh.classList.add('hidden');
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', +b.dataset.v === cur);
      b.onclick = () => { if (+b.dataset.v !== cur) choose(+b.dataset.v); };
    });
  }

  /** Main menu: your radiant partner and the selector. reopen = G.MenuUI.open. */
  function menu(reopen) {
    const s = save(), dex = s.partner, mon = G.DEX_BY[dex], seg = $('menu-shiny');
    // Clear out last time's (the menu is redrawn over the same elements).
    $('menu-partner').classList.remove('radiant');
    seg.querySelectorAll('[data-v="2"]').forEach(b => b.remove());
    seg.querySelectorAll('[data-v="1"]').forEach(b => { b.classList.remove('hidden'); b.innerHTML = G.Icons.html('shiny', 12) + ' Shiny'; });
    if (!mon || !owns(dex) || !has(dex)) return;
    const on = wants(dex);
    seg.classList.remove('hidden');
    segment(seg, dex, on ? 2 : s.partnerShiny && G.DB.ownsShiny(dex) ? 1 : 0, v => {
      set(dex, v === 2);
      if (v !== 2) { s.partnerShiny = v === 1; if (G.ShinyPref) G.ShinyPref.set(dex, v === 1); }
      G.DB.commit();
      G.Audio.sfx('confirm');
      reopen();
    });
    if (!on) return;
    const cv = $('menu-partner');
    G.UI.sprite(cv, dex, { lively: true, scale: 4, hero: true, radiant: true });
    cv.style.setProperty('--stage-c', COLOR);
    cv.classList.remove('shiny'); cv.classList.add('radiant');
    $('menu-partner-name').innerHTML = esc(mon.name) + ' ' + icon(24);
  }
  /** Collection cell: the mark, and the radiant sprite if it's your partner and you use it. */
  function cell(el, dex) {
    if (!owns(dex) || !has(dex)) return;
    el.insertAdjacentHTML('beforeend', `<span class="rad-badge" title="You have its radiant">${icon(14)}</span>`);
    if (dex !== save().partner || !wants(dex)) return;
    const old = el.querySelector('canvas');
    if (old) old.replaceWith(G.UI.spriteCanvas(dex, 92, 80, { scale: 2, shadow: true, radiant: true }));
  }

  /** Collection detail card: the Radiant button and its sprite. redraw() redraws the card. */
  function detail(dex, redraw, regrid) {
    if (!owns(dex) || !has(dex)) return;
    const box = $('dex-detail'), big = $('dex-big');
    let seg = box.querySelector('.seg');
    if (!seg) {
      seg = document.createElement('div');
      seg.className = 'seg';
      seg.innerHTML = '<button data-v="0">Normal</button>';
      big.after(seg);
    }
    const on = wants(dex), shBtn = seg.querySelector('[data-v="1"]');
    const shinyOn = !!(shBtn && shBtn.classList.contains('on'));
    const before = [...seg.querySelectorAll('button')].map(b => [b.dataset.v, b.onclick]);
    segment(seg, dex, on ? 2 : shinyOn ? 1 : 0, v => {
      set(dex, v === 2);
      G.DB.commit();
      const orig = before.find(([k]) => +k === v);
      // Normal / Shiny: what the menu already did (saves the shiny preference and redraws).
      if (v !== 2 && orig && orig[1]) orig[1](); else redraw();
      if (dex === save().partner) regrid();
    });
    if (!on) return;
    G.UI.sprite(big, dex, { lively: true, spin: true, scale: 3, hero: true, radiant: true });
    big.style.setProperty('--stage-c', COLOR);
    big.classList.remove('shiny'); big.classList.add('radiant');
    const pick = $('dex-pick');
    if (pick) pick.textContent = pick.textContent.replace(/\s*\(shiny\)$/, '') + ' (radiant)';
  }

  // ---------------- the ritual ----------------

  const SCR = 'scr-radiant';
  let chosen = new Set(), confirming = false, rolling = false;
  const warnOn = () => G.Settings.get('radWarn') !== false;

  function build() {
    if ($(SCR)) return;
    const sec = document.createElement('section');
    sec.id = SCR; sec.className = 'scr dim hidden';
    sec.innerHTML = `
  <div class="box wide rad-box">
    <div class="row between"><h2>${icon(22)} Radiant Ritual</h2><button class="btn small ghost" id="rad-back" type="button">Back</button></div>
    <p class="sub" style="margin:2px 0 8px">Sacrifice <b>${NEED} shiny Pokémon</b> to summon <b>one radiant</b>, at random from every radiant
      in the game. The sacrificed Pokémon lose their shiny form for good (you keep the normal ones).</p>
    <div class="rad-pool" id="rad-pool"></div>
    <div class="row rad-bar">
      <b id="rad-count"></b>
      <button class="btn small ghost" id="rad-auto" type="button">Fill with the commonest</button>
      <button class="btn small ghost" id="rad-clear" type="button">Clear</button>
      <input id="rad-q" type="search" placeholder="Search your shinies" autocomplete="off">
      <label class="rad-opt"><input type="checkbox" id="rad-warn"> Warn me before sacrificing a shiny legendary</label>
    </div>
    <div class="grid rad-grid" id="rad-grid"></div>
    <div class="rad-warning hidden" id="rad-warning"></div>
    <div class="row" style="margin-top:10px;gap:8px;justify-content:flex-end">
      <button class="btn gold" id="rad-go" type="button" data-sfx="confirm"></button>
    </div>
  </div>`;
    document.body.appendChild(sec);
    $('rad-back').onclick = close;
    $('rad-auto').onclick = auto;
    $('rad-clear').onclick = () => { chosen.clear(); confirming = false; render(); };
    $('rad-q').oninput = grid;
    $('rad-warn').onchange = e => { G.Settings.set('radWarn', e.target.checked); confirming = false; render(); };
    $('rad-go').onclick = go;
    // So typing in the search box doesn't move anything or open menus.
    sec.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') e.stopPropagation(); });
  }

  function openRitual() {
    build();
    chosen = new Set([...chosen].filter(d => G.DB.ownsShiny(d)));
    confirming = false;
    G.UI.show(SCR);
    render();
    refresh().then(ch => { if (ch && G.UI.isOpen(SCR)) render(); });
  }
  function close() {
    if (rolling) return;
    $(SCR).classList.add('hidden');
    G.MenuUI.open();
  }
  // Another screen (an invite, the room...) closes the ritual's.
  for (const f of ['show', 'hideAll']) {
    const orig = G.UI[f];
    G.UI[f] = function (id) { if (id !== SCR && $(SCR) && !rolling) $(SCR).classList.add('hidden'); return orig.apply(this, arguments); };
  }

  const order = (a, b) => G.DEX_BY[a].rarity - G.DEX_BY[b].rarity || a - b;
  function auto() {
    const free = shinies().filter(d => !chosen.has(d) && !isLegend(d) && d !== save().partner).sort(order);
    while (chosen.size < NEED && free.length) chosen.add(free.shift());
    confirming = false;
    render();
  }

  function render() {
    const all = pool(), mine = shinies();
    $('rad-pool').innerHTML = all.length
      ? `<span class="sub">${all.length} radiant${all.length === 1 ? '' : 's'} to win:</span>`
      : '<span class="sub">No radiant forms have been added to the game yet, so there is nothing to summon.</span>';
    for (const d of all) {
      const w = document.createElement('span');
      w.className = 'rad-prize' + (owns(d) ? ' got' : '');
      w.title = `${G.DEX_BY[d].name}: ${(chance(d, all) * 100).toFixed(1)}% chance` + (owns(d) ? ' (you have it)' : '');
      w.appendChild(G.UI.spriteCanvas(d, 56, 52, { scale: 1, radiant: true }));
      $('rad-pool').appendChild(w);
    }
    $('rad-count').textContent = `${chosen.size} / ${NEED} chosen` + (mine.length < NEED ? ` · you have ${mine.length} shin${mine.length === 1 ? 'y' : 'ies'}` : '');
    $('rad-warn').checked = warnOn();
    $('rad-auto').disabled = chosen.size >= NEED;
    grid();
    const legends = [...chosen].filter(isLegend);
    const warn = confirming && legends.length;
    $('rad-warning').classList.toggle('hidden', !warn);
    if (warn) {
      $('rad-warning').innerHTML = `<b>Careful:</b> you're about to sacrifice ${legends.length === 1 ? 'a shiny legendary' : legends.length + ' shiny legendaries'}:
        <b>${legends.map(d => esc(G.DEX_BY[d].name)).join(', ')}</b>. Their shiny forms will be gone for good.
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn small" id="rad-yes" type="button">Yes, sacrifice them</button>
        <button class="btn small ghost" id="rad-no" type="button">Cancel</button></div>`;
      $('rad-yes').onclick = roll;
      $('rad-no').onclick = () => { confirming = false; render(); };
    }
    const ready = chosen.size === NEED && all.length > 0;
    $('rad-go').disabled = !ready || !!warn;
    $('rad-go').innerHTML = `${icon(14)} Sacrifice ${NEED} shinies`;
  }

  function grid() {
    const q = ($('rad-q').value || '').trim().toLowerCase();
    const list = shinies().filter(d => !q || chosen.has(d) || G.DEX_BY[d].name.toLowerCase().includes(q) || String(d) === q.replace(/^#/, ''))
      .sort((a, b) => (chosen.has(b) - chosen.has(a)) || order(a, b));
    const box = $('rad-grid');
    box.innerHTML = list.length ? '' : `<p class="sub">${shinies().length ? 'No shiny matches that.' : 'You have no shiny Pokémon yet.'}</p>`;
    for (const d of list) {
      const p = G.DEX_BY[d], el = document.createElement('div');
      el.className = 'cell rad-cell' + (chosen.has(d) ? ' on' : '');
      el.dataset.dex = d;
      el.innerHTML = `<span class="no">${String(d).padStart(3, '0')}</span>` +
        (p.leg ? '<span class="rad-leg">LEGEND</span>' : d === save().partner ? `<span class="badge-r" title="Partner">${G.Icons.html('crown', 14)}</span>` : '');
      el.appendChild(G.UI.spriteCanvas(d, 92, 80, { scale: 2, shiny: true }));
      el.insertAdjacentHTML('beforeend', `<b>${esc(p.name)}</b>${G.UI.stars(p.rarity, 9)}`);
      el.onclick = () => {
        if (rolling) return;
        if (chosen.has(d)) chosen.delete(d);
        else if (chosen.size >= NEED) { G.UI.toast(`You've already chosen ${NEED}. Take one out first.`); return; }
        else chosen.add(d);
        confirming = false;
        G.Audio.sfx('click');
        render();
      };
      box.appendChild(el);
    }
  }

  function go() {
    if (chosen.size !== NEED) return;
    if (warnOn() && [...chosen].some(isLegend)) { confirming = true; render(); $('rad-warning').scrollIntoView({ block: 'nearest' }); return; }
    roll();
  }

  function roll() {
    const res = sacrifice([...chosen]);
    if (!res.ok) { G.UI.toast(res.why === 'empty' ? 'There are no radiants to summon yet.' : 'Choose 10 of your shinies.'); return; }
    chosen.clear(); confirming = false; rolling = true;
    G.UI.refreshCoins();
    render();
    reveal(res);
  }

  // The roll, the same as the gacha's 1-ticket one (#pull-fx and js/ui/slots.js, as in
  // js/ui/gacha-ui.js): the reels stop on the radiant's rarity ball (tier, the gacha's same
  // G.Icons.RARITY_BALL) and then its card comes out. Skip and Continue are the gacha's.
  async function reveal(res) {
    const fx = $('pull-fx'), out = $('pull-results'), ok = $('pull-close'), skipBtn = $('pull-skip');
    const r = tier(res.dex), gachaClose = ok.onclick;
    out.innerHTML = '';
    ok.classList.add('hidden');
    $('slot-wrap').style.display = '';
    fx.classList.remove('hidden');
    skipBtn.classList.remove('hidden');
    await G.Slots.play($('slot'), [{ dex: res.dex, rarity: r, shiny: false }]);
    G.Audio.sfx('burst', { rarity: r });
    $('slot-wrap').style.display = 'none';
    const c = document.createElement('div');
    c.className = 'pcard r' + r + ' radiant';
    c.id = 'rad-card';
    c.style.setProperty('--rc', COLOR);
    c.innerHTML = `<div class="stars">${G.UI.stars(r, 24)}</div>`;
    c.appendChild(G.UI.spriteCanvas(res.dex, 132, 120, { lively: true, scale: 2, radiant: true }));
    c.insertAdjacentHTML('beforeend', `<b id="rad-name">${icon(12)} Radiant ${esc(G.DEX_BY[res.dex].name)}</b><div class="tag">` +
      (res.dup ? `Already yours · <span class="coin"></span> +${res.coins}` : '<span class="new">NEW RADIANT!</span>') + '</div>');
    out.appendChild(c);
    G.Audio.sfx('reveal', { rarity: r });
    skipBtn.classList.add('hidden');
    ok.classList.remove('hidden');
    ok.onclick = () => {
      ok.onclick = gachaClose;
      fx.classList.add('hidden');
      rolling = false;
      render();
    };
  }

  // The main menu button, after the Gacha.
  document.addEventListener('DOMContentLoaded', () => {
    refresh();
    const gacha = document.querySelector('#scr-menu [data-go=gacha]');
    if (!gacha || $('menu-radiant')) return;
    const b = document.createElement('button');
    b.className = 'menu-item'; b.id = 'menu-radiant'; b.type = 'button'; b.dataset.sfx = 'click';
    b.innerHTML = `<span class="mi-ico">${icon(26)}</span>Radiant Ritual<small>${NEED} shinies → 1 radiant</small>`;
    b.onclick = openRitual;
    gacha.after(b);
  });

  return { NEED, DUP_COINS, WEIGHT, icon, key, has, owns, wants, set, pool, tier, chance, refresh, sacrifice, look, menu, cell, detail, open: openRitual };
})();
