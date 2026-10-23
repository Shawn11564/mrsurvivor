/* ============ late-hand.js — decisions for a late hand (Lab first, MrSurvivor fork) ============
 * Late in a run the level-up hand collapses to the same few cards (plan root cause 3, C1.4). In a Lab run:
 *   - PAST THE CAP, AT A PRICE: Carrera (speed, capped at 8) and Reflejos (cooldown, capped at 10) keep
 *     coming after their cap, up to EXTRA more each, and each of those cards costs COST of your max HP.
 *     A real choice: more speed or cooldown for a smaller health bar. The card is a normal upgrade card
 *     with the cap raised (c.capMax), so js/fork/card-rarity.js (loaded after this file) rolls and paints
 *     its rarity; its apply and text keep the HP cost whatever rarity does to them.
 *   - EV CARDS IN ENDLESS: once Eternatus is beaten (pl._labEternatus, js/fork/lab/eternatus.js), every
 *     hand has one "+1 EV" card: a small permanent bonus to one stat (EV below), so hour-long runs always
 *     have something to take. Under the cards, "Auto-pick EV cards" (G.Settings 'labEvAuto', this device):
 *     on, an endless run's level-ups take the EV card by themselves, with no menu. In co-op the cards
 *     don't open either: the EV card is your pick (G.Coop.localPicked, through the game's own callback)
 *     and a small banner says which, and who you're waiting for, until everyone has picked (closeLevelUp).
 *     Ticking it with a hand open takes that hand's EV card at once. A hand without an EV card (a Lab
 *     evolution's) still opens: that one is a real choice.
 * Hooks: G.LevelUp.offer, G.RunUI.showLevelUp / setWaiting / closeLevelUp. Texts in English. Test: fork/test-late-hand.cjs.
 */
G.LabLateHand = (() => {
  const COST = 0.04, EXTRA = 4, CHANCE = 0.25, LATE = ['spd', 'cd'];
  const EV = {
    hp: { name: 'HP', text: '+2% max HP (and heals it).', apply: pl => pl.addMaxHp(Math.max(1, Math.round(pl.maxHp * 0.02))) },
    atk: { name: 'Attack', text: '+2% damage with every move.', apply: pl => { pl.atkMul *= 1.02; } },
    def: { name: 'Defense', text: '+2% damage reduction.', apply: pl => { pl.dmgReduce += 0.02; } },
    cd: { name: 'Cooldown', text: '-1.5% cooldown on every move.', apply: pl => { pl.cdMul *= 0.985; } },
    rgn: { name: 'Regeneration', text: '+0.3 HP regenerated per second.', apply: pl => { pl.regenFlat += 0.3; } }
  };
  const EV_KEYS = Object.keys(EV);
  const lab = () => !!(G.Lab && G.Lab.active);
  const endless = pl => lab() && !!(pl && pl._labEternatus);
  const auto = () => G.Settings.get('labEvAuto') === true;
  const costNote = ` <span class="fit-low">Costs ${COST * 100}% of your max HP.</span>`;

  function pay(pl) {
    pl.maxHp = Math.max(1, Math.round(pl.maxHp * (1 - COST)));
    pl.hp = Math.min(pl.hp, pl.maxHp);
  }

  /** A stat card past its cap: rarity may change its number and apply, never the HP cost. */
  function lateCard(pl, s) {
    let apply = p => { s.apply(p); p.statsTaken[s.id] = (p.statsTaken[s.id] || 0) + 1; }, desc = s.desc;
    const c = { w: 7, type: 'stat', key: 'stat:' + s.id, icon: s.icon, color: '#8fa3c4', tag: 'Mejora', title: s.title,
      late: true, capMax: s.max + EXTRA };
    Object.defineProperty(c, 'apply', { enumerable: true, get: () => p => { apply(p); pay(p); }, set: f => { apply = f; } });
    Object.defineProperty(c, 'desc', { enumerable: true, get: () => desc + costNote, set: v => { desc = v; } });
    return c;
  }

  function evCard(x) {
    const d = EV[x];
    return { w: 7, type: 'ev', key: 'ev:' + x, ev: x, icon: 'book', color: '#c9a4ff', tag: '+1 EV',
      title: 'EV: ' + d.name, desc: d.text,
      apply: p => { d.apply(p); p._labEV = p._labEV || {}; p._labEV[x] = (p._labEV[x] || 0) + 1; } };
  }

  /** Where a new card goes in a hand of 3: over a common upgrade card if there is one, else the last that isn't gold. */
  function slot(hand) {
    let i = -1;
    hand.forEach((c, j) => { if (c.type === 'stat' && c.color !== '#ffd23f' && !c.late && c.type !== 'evo') i = j; });
    if (i < 0) hand.forEach((c, j) => { if (c.type !== 'evo' && c.color !== '#ffd23f' && !c.late && c.type !== 'ev') i = j; });
    return i;
  }

  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!Array.isArray(hand) || !pl || !lab() || pl !== G.Game.player) return hand;
    for (const id of LATE) {
      const s = G.LevelUp.STATS.find(x => x.id === id), n = (pl.statsTaken && pl.statsTaken[id]) || 0;
      if (!s || !s.max || n < s.max || n >= s.max + EXTRA || hand.some(c => c.key === 'stat:' + id) || Math.random() >= CHANCE) continue;
      const i = hand.length < 3 ? hand.length : slot(hand);
      if (i >= 0) hand[i] = lateCard(pl, s);
    }
    if (endless(pl) && !hand.some(c => c.type === 'ev')) {
      const i = hand.length < 3 ? hand.length : slot(hand);
      if (i >= 0) hand[i] = evCard(EV_KEYS[Math.floor(Math.random() * EV_KEYS.length)]);
    }
    return hand;
  };

  // ---------------- the auto-pick toggle, and auto-picking ----------------
  const show = G.RunUI.showLevelUp;
  G.RunUI.showLevelUp = function (level, list, cb, coop) {
    const pl = G.Game.player, ev = Array.isArray(list) && list.find(c => c.type === 'ev');
    if (ev && auto() && endless(pl) && typeof cb === 'function') {
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, ev.title, '#c9a4ff');
      if (coop) banner(ev.title);                     // before cb: the waiting list can come back at once
      cb(ev);
      return;
    }
    const r = show.apply(this, arguments);
    toggle(!!ev);
    return r;
  };

  // Co-op: the auto-pick's banner while the others choose (the cards screen stays closed).
  let wait = null, waitTitle = '';
  function banner(title) {
    if (!wait) {
      wait = document.createElement('div');
      wait.id = 'lab-ev-wait';
      wait.className = 'box';
      wait.setAttribute('translate', 'no');
      wait.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:30;padding:10px 16px;text-align:center;font-size:14px;pointer-events:none';
      document.body.appendChild(wait);
    }
    waitTitle = title;
    wait.innerHTML = `<b style="color:#c9a4ff">Auto-picked ${esc(title)}</b><br><small>Waiting for the others to pick…</small>`;
    wait.classList.remove('hidden');
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setWaiting = G.RunUI.setWaiting;
  G.RunUI.setWaiting = function (names) {
    const r = setWaiting.apply(this, arguments);
    if (wait && !wait.classList.contains('hidden')) {
      const me = G.Social.me ? G.Social.me.name : '', others = (names || []).filter(n => n !== me);
      wait.innerHTML = `<b style="color:#c9a4ff">Auto-picked ${esc(waitTitle)}</b><br><small>${others.length ? 'Waiting for ' + others.map(esc).join(', ') + '…' : 'Waiting for the others to pick…'}</small>`;
    }
    return r;
  };
  const closeLevelUp = G.RunUI.closeLevelUp;
  G.RunUI.closeLevelUp = function () {
    if (wait) wait.classList.add('hidden');
    return closeLevelUp.apply(this, arguments);
  };
  // A run that ends while the others choose (js/fork/end-run.js's vote, a disconnect): no banner left over.
  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function () { if (wait) wait.classList.add('hidden'); return showOver.apply(this, arguments); };

  /** Ticked with a hand open: take its EV card now (after the screen's 1 s guard against stray clicks). */
  function pickOpen(tries = 0) {
    if (!auto() || !G.UI.isOpen('scr-levelup') || !endless(G.Game.player)) return;
    const els = [...document.querySelectorAll('#cards .card')], i = els.findIndex(el => /\+1 EV/.test(el.textContent));   // its tag (a reroll redraws the hand)
    if (i < 0 || document.getElementById('cards').classList.contains('done')) return;
    if (document.getElementById('cards').classList.contains('guard') && tries < 20) { setTimeout(() => pickOpen(tries + 1), 100); return; }
    G.RunUI.pick(i);
  }
  function toggle(on) {
    let row = document.getElementById('lab-ev-auto');
    if (!on) { if (row) row.classList.add('hidden'); return; }
    if (!row) {
      row = document.createElement('label');
      row.id = 'lab-ev-auto';
      row.setAttribute('translate', 'no');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px;font-size:13px;color:var(--muted);cursor:pointer';
      row.innerHTML = '<input type="checkbox"><span>Auto-pick EV cards in endless mode (skip the menu)</span>';
      const cards = document.getElementById('cards');
      cards.parentNode.insertBefore(row, cards.nextSibling);
      row.querySelector('input').onchange = e => { G.Settings.set('labEvAuto', e.target.checked); if (e.target.checked) pickOpen(); };
    }
    row.classList.remove('hidden');
    row.querySelector('input').checked = auto();
  }

  return { COST, EXTRA, CHANCE, EV, lateCard, evCard };
})();
