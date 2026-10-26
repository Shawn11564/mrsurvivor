/* ============ move-dex.js — the move dex: every move and what it does (MrSurvivor fork) ============
 * The collection screen (#scr-dex) gets a Pokémon / Moves switch in its header. Moves lists every
 * move in the game (G.Moves.BY_ID: the normal ones, and with the LAB chip the Lab-only ones, tagged),
 * searchable by name, filtered by type and category (physical / special / status), sorted by type,
 * name, damage or cooldown. Picking one shows its card: how its kind works, its numbers at level 1
 * and at max level (G.Moves.instance), each upgrade on the way, its evolution and what it needs (the row in the
 * list says what it evolves into too: "→ Fire Blast")
 * (G.Moves.evoInfo), and who learns it: Pokémon of its type in normal runs (G.Moves.POOL; Normal
 * moves, everyone), the Lab learnsets (G.Lab.learnOf) and signature lines in Lab.
 * Everything is drawn here; menu.js's own dex isn't touched (its view is hidden while Moves shows).
 * Test: fork/test-move-dex.cjs.
 */
G.MoveDex = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s, ctx) => (s ? G.T(s, ctx) : '');
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** How each kind plays (js/data/moves.js and js/fork/lab/kinds*.js). */
  const KIND = {
    projectile: 'Fires projectiles at the nearest enemy.', melee: 'A strike in an arc around you.',
    beam: 'A straight beam that goes through everything in its path.', orbit: 'Orbs that circle you while it\'s your active move.',
    nova: 'A burst in every direction.', aura: 'A ring of steady damage around you.',
    buff: 'Boosts you for a while (stacks). It deals no damage.', boomerang: 'Flies out to the enemy and back, hitting both ways.',
    chain: 'Hits one enemy and jumps to the next nearest ones.', mine: 'Mines on the ground that blow up when stepped on.',
    meteor: 'Meteors fall on nearby enemies (a shadow warns first).', turret: 'Leaves a turret that fires on its own for a while.',
    dash: 'You dash at the enemy, hitting everything on the way.', trail: 'You leave puddles that hurt whatever walks on them.',
    cone: 'Many short shots in a fan (breath, spray...).', homing: 'Projectiles that chase enemies.',
    bounce: 'One projectile that bounces from enemy to enemy.', charge: 'Charges up, then fires a huge beam.',
    spin: 'You spin, hitting everything around you several times.', quake: 'A wave runs along the ground in a line of blasts.',
    vortex: 'A whirlpool pulls enemies to its centre and hurts them.', shove: 'A wave around you that hurts and pushes enemies away.',
    stun: 'A marked zone that hurts and leaves enemies stunned.',
    // Lab families (js/fork/lab/kinds.js, kinds2.js)
    leap: 'You leave the ground (nothing can hit you) and the blast lands on the target.',
    recoil: 'A very strong charge that costs you some HP.', ramp: 'Each hit that lands hits harder than the last.',
    guard: 'Protects you for a moment, or hits back at what hits you.', sleep: 'A marked zone that puts whoever it catches to sleep.',
    weather: 'Sets the weather for a while.', terrain: 'A field on the ground that helps you while you stand in it.',
    wave: 'A wide wave that moves forward and drags enemies along.', metronome: 'A random move from the whole game, every time.',
    transform: 'You turn into the nearest enemy for a while.', grab: 'You grab the nearest enemy and throw it into the others.',
    bind: 'Holds enemies in place for a while, hurting them.', focus: 'Charges a huge punch that fails if you\'re hit while charging.',
    heal: 'Heals you.', screen: 'You take less physical or special damage for a while.',
    shout: 'Weakens the enemies around you.', endure: 'A hit that would knock you out leaves you at 1 HP instead.',
    ally: 'Helps your teammates (co-op).'
  };
  const STATS = [['dmg', 'Damage', v => Math.round(v)], ['cd', 'Cooldown', v => v.toFixed(2) + ' s'], ['count', 'Count', v => Math.round(v)],
    ['pierce', 'Pierce', v => Math.round(v)], ['bounce', 'Bounces', v => Math.round(v)], ['radius', 'Range', v => Math.round(v)],
    ['dur', 'Duration', v => v.toFixed(1) + ' s'], ['stacks', 'Stacks', v => Math.round(v)], ['stun', 'Stun', v => v.toFixed(1) + ' s'],
    ['charge', 'Charge', v => v.toFixed(2) + ' s']];
  const CAT = { physical: 'Physical', special: 'Special', null: 'Status' };
  const SORTS = [['type', 'Type'], ['name', 'Name'], ['dmg', 'Damage'], ['cd', 'Cooldown']];

  let on = false, sel = null;
  const f = { q: '', type: '', cat: '', lab: null, sort: 'type' };

  // One column (a phone held upright): the card is under the list, so a tap scrolls to it.
  const stacked = () => getComputedStyle($('mdex')).gridTemplateColumns.trim().split(/\s+/).length < 2;
  const labOnly = m => !!m.lab && !G.Moves.ALL.includes(m);
  function list() {
    if (f.lab === null) f.lab = true;
    const q = fold(f.q), types = Object.keys(G.U.TYPE_NAME);
    const out = Object.values(G.Moves.BY_ID).filter(m => {
      if (labOnly(m) && !f.lab) return false;
      if (f.type && m.type !== f.type) return false;
      if (f.cat && String(m.cat || null) !== f.cat) return false;
      if (q && ![m.name, T(m.name, 'move'), m.id].some(n => fold(n).includes(q))) return false;
      return true;
    });
    const name = m => T(m.name, 'move');
    const by = { type: (a, b) => types.indexOf(a.type) - types.indexOf(b.type) || name(a).localeCompare(name(b)),
                 name: (a, b) => name(a).localeCompare(name(b)), dmg: (a, b) => (b.dmg || 0) - (a.dmg || 0) || name(a).localeCompare(name(b)),
                 cd: (a, b) => (a.cd || 0) - (b.cd || 0) || name(a).localeCompare(name(b)) }[f.sort];
    return out.sort(by);
  }

  const chip = (label, active, fn) => {
    const b = document.createElement('button');
    b.className = 'chip' + (active ? ' on' : '');
    b.innerHTML = label;
    b.onclick = () => { fn(); render(); };
    return b;
  };
  const badge = m => m.sig ? ' <span class="mdex-sig">signature</span>' : '';
  // What a move evolves into, as its card says (G.Moves.evoInfo at max level), for its row; '' if it doesn't.
  const evoOf = new Map();
  function evoName(m) {
    if (!evoOf.has(m.id)) {
      let n = '';
      try { const e = G.Moves.evoInfo(G.Moves.instance(m.id, m.maxLvl || 1), null); if (e) n = T(e.name, 'move'); } catch (err) { /* no evolution */ }
      evoOf.set(m.id, n);
    }
    return evoOf.get(m.id);
  }

  /** The list side: tools, filters and rows. */
  function render() {
    const root = $('mdex');
    if (!root) return;
    const tools = $('mdex-tools'), chips = $('mdex-chips');
    const ts = $('mdex-type');
    if (!ts.options.length) {
      ts.innerHTML = '<option value="">All types</option>' + Object.keys(G.U.TYPE_NAME).map(t => `<option value="${t}">${esc(G.T(G.U.TYPE_NAME[t]))}</option>`).join('');
      ts.onchange = () => { f.type = ts.value; render(); };
      const q = $('mdex-q');
      q.oninput = () => { clearTimeout(q.t); q.t = setTimeout(() => { f.q = q.value; render(); }, 120); };
      q.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); q.blur(); } };
    }
    ts.value = f.type;
    chips.innerHTML = '';
    for (const [k, l] of [['', 'All'], ['physical', 'Physical'], ['special', 'Special'], ['null', 'Status']]) chips.appendChild(chip(l, f.cat === k, () => { f.cat = k; }));
    const sort = $('mdex-sort');
    sort.innerHTML = '<span class="sub">Sort:</span>';
    for (const [k, l] of SORTS) sort.appendChild(chip(l, f.sort === k, () => { f.sort = k; }));

    const rows = list();
    $('mdex-count').textContent = rows.length + (rows.length === 1 ? ' move' : ' moves');
    const box = $('mdex-list');
    box.innerHTML = '';
    for (const m of rows) {
      const col = G.U.TYPE_COLOR[m.type] || '#888';
      const el = document.createElement('button');
      el.className = 'mdex-row' + (m.id === sel ? ' on' : '');
      el.dataset.move = m.id;
      el.innerHTML = `<span class="ico" style="background:${col}33">${G.Icons.html('move:' + m.id, 26)}</span>
        <span class="nm"><b>${esc(T(m.name, 'move'))}</b>${badge(m)}<small>${esc(T(m.desc))}</small>${evoName(m) ? `<small class="mdex-evo">→ ${esc(evoName(m))}</small>` : ''}</span>
        <span class="mdex-meta"><span class="tag-chip" style="background:${col}">${esc(G.T(G.U.TYPE_NAME[m.type] || m.type))}</span><small>${CAT[m.cat || null]}</small></span>
        <span class="mdex-num"><b>${m.dmg ? Math.round(m.dmg) : '–'}</b><small>${m.cd ? m.cd.toFixed(2) + ' s' : ''}</small></span>`;
      el.onclick = () => { sel = m.id; box.querySelectorAll('.mdex-row.on').forEach(r => r.classList.remove('on')); el.classList.add('on'); detail(m.id); stacked() && $('mdex-detail').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
      box.appendChild(el);
    }
    if (!rows.length) box.innerHTML = '<p class="sub">No moves match.</p>';
    if (!sel || !rows.some(m => m.id === sel)) sel = rows.length ? rows[0].id : null;
    box.querySelectorAll('.mdex-row').forEach(r => r.classList.toggle('on', r.dataset.move === sel));
    detail(sel);
  }

  // Lab learnsets, reversed (move → Pokémon), built the first time a Lab move is opened.
  let learners = null;
  function labLearners(id) {
    if (!G.Lab || !G.Lab.learnOf) return [];
    if (!learners) {
      learners = {};
      for (const p of G.DEX) for (const mid of Object.keys(G.Lab.learnOf(p.dex))) (learners[mid] = learners[mid] || []).push(p.dex);
    }
    return learners[id] || [];
  }
  const monNames = dexes => dexes.slice(0, 10).map(d => esc(G.T(G.DEX_BY[d].name))).join(', ') + (dexes.length > 10 ? ` and ${dexes.length - 10} more` : '');

  /** The card of one move. */
  function detail(id) {
    const box = $('mdex-detail'), m = id && G.Moves.BY_ID[id];
    if (!box) return;
    if (!m) { box.innerHTML = '<p class="sub">Pick a move to see what it does.</p>'; return; }
    const col = G.U.TYPE_COLOR[m.type] || '#888';
    let lo = null, hi = null;
    try { lo = G.Moves.instance(id, 1); hi = G.Moves.instance(id, m.maxLvl || 1); } catch (e) { /* a move without a ladder */ }
    const rows = STATS.filter(([k]) => lo && typeof lo[k] === 'number').map(([k, l, fmt]) =>
      `<tr><td>${l}</td><td>${fmt(lo[k])}</td><td>${hi && typeof hi[k] === 'number' ? fmt(hi[k]) : ''}</td></tr>`).join('');
    const ups = (m.ups || []).map((u, i) => `<li><b>Lv.${i + 2}</b> ${esc(T(u.t))}</li>`).join('');
    let evo = '';
    try {
      const e = hi && G.Moves.evoInfo(hi, null);
      if (e) evo = `<b>${esc(T(e.name, 'move'))}</b>: at Lv.${m.maxLvl}${e.needs ? ', once you\'ve taken the ' + esc(T(e.needName)) + ' upgrade' : ''}. ${esc(T(e.text))}`;
    } catch (err) { /* no evolution */ }
    const types = [m.type];
    const who = [];
    // The species that learn it in the games (G.Lab.learnOf); a type move also tops up the lists of others of its type.
    const l = G.Lab ? labLearners(id) : [], typeName = esc(G.T(G.U.TYPE_NAME[m.type] || m.type));
    if (l.length) who.push(`Learned by ${l.length} Pokémon: ${monNames(l)}.`);
    if (!labOnly(m) && !m.sig) who.push(m.type === 'normal' ? (l.length ? 'Other Pokémon can get it too.' : 'Any Pokémon can get it.')
      : `${l.length ? 'Other ' : ''}${typeName}-type Pokémon can get it${l.length ? ' too' : ''}.`);
    box.innerHTML = `<div class="mdex-head"><span class="ico" style="background:${col}33">${G.Icons.html('move:' + id, 40)}</span>
        <div><h3>${esc(T(m.name, 'move'))}${badge(m)}</h3>
        <div><span class="tag-chip" style="background:${col}">${types.map(t => esc(G.T(G.U.TYPE_NAME[t] || t))).join(' ')}</span> <small>${CAT[m.cat || null]} · ${esc(m.kind)}</small></div></div></div>
      <p>${esc(T(m.desc))}</p>
      <p class="sub">${esc(KIND[m.kind] || '')}</p>
      ${rows ? `<table class="mdex-stats"><tr><th></th><th>Lv.1</th><th>Lv.${m.maxLvl || 1}</th></tr>${rows}</table>` : ''}
      ${ups ? `<h4>Upgrades</h4><ul class="mdex-ups">${ups}</ul>` : ''}
      ${evo ? `<h4>Evolves</h4><p>${evo}</p>` : ''}
      ${who.length ? `<h4>Who learns it</h4><p>${who.join('<br>')}</p>` : ''}`;
  }

  /** Pokémon or Moves. */
  function show(moves) {
    on = moves;
    const scr = $('scr-dex');
    scr.classList.toggle('mdex-on', on);
    scr.querySelectorAll('.mdex-switch button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'moves') === on));
    if (on) render();
  }

  const CSS = `
.mdex-switch { display: inline-flex; gap: 4px; margin-left: 10px; vertical-align: middle; }
.mdex-switch .chip { font-size: 13px; }
#scr-dex.mdex-on #dex-gens, #scr-dex.mdex-on #dex-total, #scr-dex.mdex-on .split:not(#mdex) { display: none; }
#mdex { display: none; margin-top: 8px; }
#scr-dex.mdex-on #mdex { display: grid; }
#mdex-list { display: flex; flex-direction: column; gap: 4px; max-height: 56vh; overflow-y: auto; padding-right: 4px; }
.mdex-row { display: grid; grid-template-columns: 34px 1fr auto 52px; gap: 8px; align-items: center; text-align: left; width: 100%;
  background: rgba(0,0,0,.2); border: 2px solid rgba(244,248,255,.12); border-radius: 8px; padding: 4px 8px; color: inherit; font: inherit; cursor: pointer; }
.mdex-row:hover { border-color: rgba(244,248,255,.35); }
.mdex-row.on { border-color: var(--gold); background: rgba(255,210,63,.1); }
.mdex-row .ico, .mdex-head .ico { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; width: 32px; height: 32px; }
.mdex-row .nm { min-width: 0; display: flex; flex-direction: column; }
.mdex-row .nm small { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mdex-meta, .mdex-num { display: flex; flex-direction: column; align-items: flex-end; font-size: 12px; }
.mdex-meta small, .mdex-num small { color: var(--muted); }
.mdex-sig { font-size: 10px; color: var(--gold); margin-left: 4px; }
.mdex-row .nm small.mdex-evo { color: var(--gold); }
#mdex-detail { max-height: 62vh; overflow-y: auto; }
#mdex-detail h3 { margin: 0 0 2px; } #mdex-detail h4 { margin: 10px 0 4px; } #mdex-detail p { margin: 6px 0; }
.mdex-head { display: flex; gap: 10px; align-items: center; }
.mdex-head .ico { width: 48px; height: 48px; }
.mdex-stats { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
.mdex-stats td, .mdex-stats th { padding: 2px 4px; text-align: right; } .mdex-stats td:first-child { text-align: left; color: var(--muted); }
.mdex-ups { margin: 0; padding-left: 18px; font-size: 13px; }
@media (max-width: 640px) { .mdex-row { grid-template-columns: 30px 1fr 48px; } .mdex-meta { display: none; } }
@media (max-height: 520px) { #scr-dex.mdex-on #mdex { grid-template-columns: 1fr minmax(190px, 40%); gap: 8px; flex: 1; min-height: 0; }
  #mdex-list, #mdex-detail { max-height: none; min-height: 0; } #mdex > div:first-child { display: flex; flex-direction: column; min-height: 0; } }`;

  function install() {
    const scr = $('scr-dex');
    if (!scr || $('mdex')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const h2 = scr.querySelector('h2');
    const sw = document.createElement('span');
    sw.className = 'mdex-switch';
    sw.setAttribute('translate', 'no');
    for (const [v, l] of [['mons', 'Pokémon'], ['moves', 'Moves']]) {
      const b = document.createElement('button');
      b.className = 'chip' + (v === 'mons' ? ' on' : '');
      b.dataset.v = v; b.textContent = l;
      b.onclick = () => show(v === 'moves');
      sw.appendChild(b);
    }
    h2.after(sw);
    const wrap = document.createElement('div');
    wrap.id = 'mdex'; wrap.className = 'split';
    // Its data goes through G.T here; the page's word-by-word pass would then change English
    // words that are also Spanish keys ("normal runs" came out "Normal Runs").
    wrap.setAttribute('translate', 'no');
    wrap.innerHTML = `<div>
        <div class="dex-tools"><input id="mdex-q" type="search" placeholder="Search moves" autocomplete="off" spellcheck="false">
          <select id="mdex-type" title="Type"></select><span id="mdex-count" class="sub"></span></div>
        <div class="filters" id="mdex-chips"></div>
        <div class="filters dex-sort" id="mdex-sort"></div>
        <div id="mdex-list"></div>
      </div>
      <div class="panel" id="mdex-detail"></div>`;
    scr.querySelector('.box').appendChild(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();

  return { show, render, get on() { return on; }, f };
})();
