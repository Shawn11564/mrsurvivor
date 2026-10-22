/* ============ contracts.js — per-Pokémon contracts (Lab first, MrSurvivor fork) ============
 * Maxing one Pokémon costs ~40 800 coins, earned at the same rate whoever you play, so nothing rewards a
 * different build or a different Pokémon (plan root cause 5, C1.5). A CONTRACT is a goal for one Pokémon
 * (matched on its dex: the strong side, the types) whose reward is coins for THAT Pokémon's upgrades:
 *   side20   Reach 20:00 with 3 physical (or special: its strong side) moves      1500
 *   mono15   Reach 15:00 with 3 or more moves, every one of your own type          1200
 *   rift     Win a rift fight without switching your active move                    1000
 * Lab first: they show (Missions, a "Contracts" block for your partner) and progress only with the Lab
 * on; Lab runs count for missions since 2026-10-22 (fork/LAB.md). The run's Pokémon is the one you
 * started with (a Lab evolution keeps its contracts).
 * The save: save.contracts[dex][id] = { prog, done, claimed } and save.cspent[dex] (contract coins
 * spent). The balance is what the claimed ones paid minus cspent, so it merges cleanly: G.forkMerge
 * keeps prog's max, done and claimed if either copy has them, and cspent's max.
 * Spending: Upgrades with that Pokémon selected says "Contract coins: N" and its buy buttons use them
 * first (the price above them comes from your coins); js/ui/menu.js's own buy does the purchase.
 * The defs also go into G.MissionDefs (contracts list and BY, before the first G.Progress.ensure), so
 * G.Progress.text / rewardText work on them. Hooks: G.Progress.event ('rift'), G.Player.prototype.setActive,
 * G.Game.startRun, G.forkMerge, and the Missions / Upgrades screens' DOM (#goals-body, #upg-list).
 * Texts in English. Test: fork/test-contracts.cjs.
 */
G.LabContracts = (() => {
  const $ = id => document.getElementById(id);
  const lab = () => !!(G.Lab && G.Lab.active);
  const labOn = () => G.Settings.get('lab') === true;
  const side = mon => G.Stats.sideOf(mon);
  const attacks = pl => pl.moves.filter(m => m.kind !== 'buff' && m.cat);
  const DEFS = [
    { id: 'side20', coins: 1500, match: () => true,
      text: mon => `Reach 20:00 with 3 ${side(mon)} moves`,
      check: (pl, t, mon) => t >= 1200 && attacks(pl).filter(m => m.cat === side(mon)).length >= 3 },
    { id: 'mono15', coins: 1200, match: () => true,
      text: () => 'Reach 15:00 with 3+ moves, every one of your own type',
      check: (pl, t, mon) => { const a = attacks(pl); return t >= 900 && a.length >= 3 && a.every(m => mon.types.includes(m.type)); } },
    { id: 'rift', coins: 1000, match: () => true,
      text: () => 'Win a rift fight without switching your active move' }
  ];
  const BY = Object.fromEntries(DEFS.map(d => [d.id, d]));
  // In G.MissionDefs too (its own list, never drawn for daily/weekly missions).
  G.MissionDefs.contracts = DEFS.map(d => ({ id: 'c-' + d.id, ev: 'contract', goals: [1], reward: { coins: d.coins }, text: () => d.text(G.DEX_BY[G.DB.save && G.DB.save.partner] || { types: [] }) }));
  for (const m of G.MissionDefs.contracts) G.MissionDefs.BY[m.id] = m;

  const save = () => G.DB.save;
  const of = (dex, s = save()) => { s.contracts = s.contracts || {}; return (s.contracts[dex] = s.contracts[dex] || {}); };
  const state = (dex, id) => { const c = of(dex); return (c[id] = c[id] || { prog: 0, done: false, claimed: false }); };
  /** Contract coins left for dex: what the claimed ones paid minus what was spent. */
  function balance(dex, s = save()) {
    if (!s) return 0;
    const c = (s.contracts && s.contracts[dex]) || {};
    const earned = Object.keys(c).reduce((a, id) => a + (c[id].claimed && BY[id] ? BY[id].coins : 0), 0);
    return Math.max(0, earned - ((s.cspent && s.cspent[dex]) || 0));
  }
  function list(dex) { const mon = G.DEX_BY[dex]; return mon ? DEFS.filter(d => d.match(mon)).map(d => ({ d, st: state(dex, d.id), mon })) : []; }

  function complete(dex, id) {
    const st = state(dex, id);
    if (st.done) return false;
    st.done = true; st.prog = 1;
    G.DB.commit();
    const mon = G.DEX_BY[dex];
    G.Spawner.say('Contract done: ' + BY[id].text(mon) + ' (' + mon.name + ')', 3.4, true);
    G.Audio.sfx('confirm');
    return true;
  }
  function claim(dex, id) {
    const st = state(dex, id);
    if (!st.done || st.claimed) return false;
    st.claimed = true;
    G.DB.commit(true);
    return true;
  }

  // ---------------- progress (Lab runs) ----------------
  let runDex = 0, wasIn = false, switched = false;
  function wrapRun() {
    const start = G.Game.startRun;
    G.Game.startRun = function () { const r = start.apply(this, arguments); runDex = G.Game.player ? G.Game.player.mon.dex : 0; return r; };
  }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);
  const playing = () => G.Game && G.Game.state === 'playing' && G.Game.player && lab() && runDex && save();
  setInterval(() => {
    if (!playing()) return;
    const pl = G.Game.player, t = G.Game.st.time, mon = G.DEX_BY[runDex];
    for (const d of DEFS) if (d.check && d.match(mon) && !state(runDex, d.id).done && d.check(pl, t, mon)) complete(runDex, d.id);
  }, 1000);
  // A rift fight: a switch of the active move anywhere in it spoils the contract for that fight.
  (function arena() {
    const inA = !!(G.Rift && G.Rift.inArena);
    if (inA && !wasIn) switched = false;
    wasIn = inA;
    requestAnimationFrame(arena);
  })();
  const setActive = G.Player.prototype.setActive;
  G.Player.prototype.setActive = function () {
    const was = this.active, r = setActive.apply(this, arguments);
    if (this === (G.Game && G.Game.player) && this.active !== was && G.Rift.inArena) switched = true;
    return r;
  };
  const event = G.Progress.event;
  G.Progress.event = function (kind) {
    const r = event.apply(this, arguments);
    if (kind === 'rift' && playing() && !switched && !state(runDex, 'rift').done) complete(runDex, 'rift');
    return r;
  };

  // ---------------- merging two copies of the save ----------------
  const merge = G.forkMerge;
  G.forkMerge = function (r, a, b) {
    if (merge) merge.apply(this, arguments);
    const out = {}, spent = {};
    for (const s of [a, b]) {
      for (const dex in (s && s.contracts) || {}) for (const id in s.contracts[dex]) {
        const x = s.contracts[dex][id] || {}, o = ((out[dex] = out[dex] || {})[id] = out[dex][id] || { prog: 0, done: false, claimed: false });
        o.prog = Math.max(o.prog, x.prog || 0); o.done = o.done || !!x.done; o.claimed = o.claimed || !!x.claimed;
      }
      for (const dex in (s && s.cspent) || {}) spent[dex] = Math.max(spent[dex] || 0, s.cspent[dex] || 0);
    }
    r.contracts = out; r.cspent = spent;
  };

  // ---------------- Missions: the partner's contracts ----------------
  function block() {
    const s = save(), dex = s && s.partner, mon = G.DEX_BY[dex];
    const el = document.createElement('div');
    el.id = 'lab-contracts';
    el.setAttribute('translate', 'no');
    const rows = list(dex);
    el.innerHTML = `<div class="row between goals-h"><h3><span class="ud-tag">LAB</span> Contracts · ${G.Lab.esc(mon.name)}</h3>
      <span class="sub">Coins for ${G.Lab.esc(mon.name)}'s upgrades · ${balance(dex)} left</span></div>`;
    for (const { d, st } of rows) {
      const m = document.createElement('div');
      m.className = 'mission' + (st.claimed ? ' claimed' : st.done ? ' ready' : '');
      m.dataset.contract = d.id;
      m.innerHTML = `<div class="m-txt"><b>${G.Lab.esc(d.text(mon))}</b><div class="bar"><i style="width:${st.done ? 100 : 0}%"></i></div></div>
        <div class="m-rw"><span class="coin"></span> ${d.coins}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn small' + (st.done && !st.claimed ? ' gold' : ' ghost');
      btn.textContent = st.claimed ? 'Claimed' : st.done ? 'Claim' : 'In progress';
      btn.disabled = !st.done || st.claimed;
      btn.onclick = () => { if (claim(dex, d.id)) { G.Audio.sfx('buy'); G.UI.toast(`+${d.coins} contract coins for ${mon.name}`); el.replaceWith(block()); } };
      m.appendChild(btn);
      el.appendChild(m);
    }
    return el;
  }
  function onGoals() {
    const box = $('goals-body');
    if (!box || !labOn() || !box.querySelector('.mission') || $('lab-contracts') || !save() || !G.DEX_BY[save().partner]) return;
    box.appendChild(block());
  }

  // ---------------- Upgrades: contract coins spent first ----------------
  function onUpgrades() {
    const box = $('upg-list'), sel = $('upg-mon'), s = save();
    if (!box || !sel || !s || box.querySelector('#lab-ccoins') || !box.querySelector('.upg-item')) return;
    const dex = +sel.value, left = balance(dex);
    if (!left) return;
    box.insertAdjacentHTML('afterbegin', `<div class="panel" id="lab-ccoins" translate="no" style="padding:8px 12px"><span class="ud-tag">LAB</span>
      Contract coins for ${G.Lab.esc(G.DEX_BY[dex].name)}: <span class="coin"></span> <b>${left}</b> (spent first on its upgrades)</div>`);
    const rows = box.querySelectorAll('.upg-item');
    G.Upgrades.LIST.forEach((u, i) => {
      const btn = rows[i] && rows[i].querySelector('[data-buy]');
      if (!btn) return;
      const lv = G.DB.upgradesOf(dex), now = lv[u.id] || 0;
      if (now >= u.max || (u.needs && !lv[u.needs])) return;
      const price = G.Upgrades.cost(u.id, now);
      if (s.coins + left < price) return;
      btn.disabled = false;
      const buy = btn.onclick;
      btn.onclick = function () {
        const sv = save(), use = Math.min(balance(dex), price), before = G.DB.upgradesOf(dex)[u.id] || 0;
        sv.coins += use;
        const r = buy && buy.apply(this, arguments);
        if ((G.DB.upgradesOf(dex)[u.id] || 0) > before) { sv.cspent = sv.cspent || {}; sv.cspent[dex] = (sv.cspent[dex] || 0) + use; G.DB.commit(true); G.UI.refreshCoins(); }
        else sv.coins -= use;
        return r;
      };
    });
  }
  function watch() {
    const obs = new MutationObserver(() => { onGoals(); onUpgrades(); });
    for (const id of ['goals-body', 'upg-list']) { const el = $(id); if (el) obs.observe(el, { childList: true }); }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', watch); else watch();

  return { DEFS, balance, list, claim, complete, state };
})();
