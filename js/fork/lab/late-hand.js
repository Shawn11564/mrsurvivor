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
 *     on, a solo endless run's level-ups take the EV card by themselves, with no menu.
 * Hooks: G.LevelUp.offer, G.RunUI.showLevelUp. Texts in English. Test: fork/test-late-hand.cjs.
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
    if (ev && auto() && !coop && !G.Coop.active && endless(pl) && typeof cb === 'function') {
      cb(ev);
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, ev.title, '#c9a4ff');
      return;
    }
    const r = show.apply(this, arguments);
    toggle(!!ev);
    return r;
  };
  function toggle(on) {
    let row = document.getElementById('lab-ev-auto');
    if (!on) { if (row) row.classList.add('hidden'); return; }
    if (!row) {
      row = document.createElement('label');
      row.id = 'lab-ev-auto';
      row.setAttribute('translate', 'no');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px;font-size:13px;color:var(--muted);cursor:pointer';
      row.innerHTML = '<input type="checkbox"><span>Auto-pick EV cards in endless (no menu)</span>';
      const cards = document.getElementById('cards');
      cards.parentNode.insertBefore(row, cards.nextSibling);
      row.querySelector('input').onchange = e => G.Settings.set('labEvAuto', e.target.checked);
    }
    row.classList.remove('hidden');
    row.querySelector('input').checked = auto();
  }

  return { COST, EXTRA, CHANCE, EV, lateCard, evCard };
})();
