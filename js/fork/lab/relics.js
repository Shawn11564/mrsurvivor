/* ============ relics.js — relics: a lasting reward for the run (Lab first, MrSurvivor fork) ============
 * Beating a map site's guardian (js/fork/lab/sites.js) or a late raid gives each player a RELIC PICK: their next
 * level-up hand is three relics instead of cards (a reroll draws three others), each a bonus for the rest of the
 * run, and they stack. One of the three comes from the pool of what was beaten (temple: staying alive, dungeon:
 * treasure and training, wormhole: offence), the other two from the rest:
 *   Titan's Heart  +25 % max HP, and heals you fully          Ancient Might  +12 % damage with every move
 *   Wind Rune      −8 % cooldown on every move                Stone Ward     +15 % damage reduction (toughness in Lab)
 *   Life Seed      +0.5 % of your max HP (as now) regenerated a second
 *   Keen Eye       +6 % critical-hit chance                   Fortune Stone  +25 % coins and +15 % XP
 *   Swift Feather  +10 % speed                                Training Scroll every move +1 level (if it has one left)
 *   Phoenix Ash    get up once when knocked out (solo, while you have none: js/fork/lab/revive-card.js does it)
 * They change the player's own numbers (atkMul, cdMul, maxHp...), so a resumed run (js/fork/lab/resume.js) keeps them;
 * pl._labRelics counts what you took (the pause menu lists it), pl._labRelicPick holds the picks still to make.
 * Per player: in co-op every computer gives its own Pokémon the pick, and the level-up that opens it is the
 * team's (G.Coop.levelStart), so everyone picks at once. Hook: G.LevelUp.offer (outermost: a relic hand doesn't go
 * through the other files' card wrappers), G.RunUI.showLevelUp (its look), G.Lab.pauseLine.
 * Test: fork/test-sites.cjs (with the sites).
 */
G.LabRelics = (() => {
  const GOLD = '#e8b04a';
  const solo = () => !G.Coop.active;
  const DEF = {
    titan: { n: "Titan's Heart", icon: 'heart', t: '+25% max HP, and heals you fully.', apply: p => { p.addMaxHp(Math.round(p.maxHp * 0.25)); p.hp = p.maxHp; } },
    might: { n: 'Ancient Might', icon: 'fist', t: '+12% damage with every move.', apply: p => { p.atkMul *= 1.12; } },
    haste: { n: 'Wind Rune', icon: 'clock', t: '-8% cooldown on every move.', apply: p => { p.cdMul *= 0.92; } },
    ward: { n: 'Stone Ward', icon: 'shield', t: '+15% toughness.', apply: p => { p.dmgReduce += 0.15; } },
    bloom: { n: 'Life Seed', icon: 'sprout', t: 'Regenerate 0.5% of your max HP (as it is now) every second.', apply: p => { p.regenFlat += Math.max(0.5, p.maxHp * 0.005); } },
    keen: { n: 'Keen Eye', icon: 'star', t: '+6% critical-hit chance.', apply: p => { p.critChance = (p.critChance || 0) + 0.06; } },
    fortune: { n: 'Fortune Stone', icon: 'coin', t: '+25% coins and +15% XP.', apply: p => { p.coinMul *= 1.25; p.xpMul *= 1.15; } },
    swift: { n: 'Swift Feather', icon: 'boot', t: '+10% movement speed.', apply: p => { p.spdMul *= 1.1; } },
    training: { n: 'Training Scroll', icon: 'book', t: 'Every move goes up a level (if it has one left).',
      ok: p => p.moves.some(m => m.lvl < m.def.maxLvl), apply: p => { for (const m of p.moves) G.Moves.levelUp(m); } },
    phoenix: { n: 'Phoenix Ash', icon: 'shiny', t: 'Get up once when you are knocked out (solo).',
      ok: p => solo() && !(p.selfRevive > 0), apply: p => { p.selfRevive = 1; } }
  };
  const POOL = { temple: ['titan', 'ward', 'bloom', 'phoenix'], dungeon: ['fortune', 'training', 'keen'], wormhole: ['might', 'swift', 'haste'] };
  const KEYS = Object.keys(DEF);
  const lab = () => !!(G.Lab && G.Lab.active);
  const fits = (p, id) => !DEF[id].ok || DEF[id].ok(p);

  /** This player gets a relic pick (from what was beaten: temple, dungeon, wormhole, or any). */
  function grant(p, from) {
    if (!p) return;
    p._labRelicPick = (p._labRelicPick || []).concat(from || 'any');
  }

  function card(id) {
    const d = DEF[id];
    return { w: 7, type: 'relic', key: 'relic:' + id, relic: id, icon: d.icon, color: GOLD, tag: 'Relic', title: d.n, desc: d.t,
      apply: p => {
        d.apply(p);
        p._labRelics = p._labRelics || {};
        p._labRelics[id] = (p._labRelics[id] || 0) + 1;
        if (Array.isArray(p._labRelicPick) && p._labRelicPick.length) p._labRelicPick.shift();
        G.FX.ring(p.x, p.y, 8, 90, GOLD, 0.6, 5);
        G.Audio.sfx('legend');
      } };
  }
  /** Three relics: one from what was beaten, two others (no repeats). */
  function hand(p, from) {
    const own = (POOL[from] || []).filter(id => fits(p, id));
    const out = [];
    if (own.length) out.push(G.U.pick(own));
    const rest = KEYS.filter(id => !out.includes(id) && fits(p, id));
    while (out.length < 3 && rest.length) out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    return out.map(card);
  }

  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (p) {
    if (p && lab() && Array.isArray(p._labRelicPick) && p._labRelicPick.length) return hand(p, p._labRelicPick[0]);
    return offer.apply(this, arguments);
  };

  // Their look: the relic's gold border and chip.
  const show = G.RunUI.showLevelUp;
  G.RunUI.showLevelUp = function (level, list) {
    const r = show.apply(this, arguments);
    paint(list);
    return r;
  };
  const reroll = G.RunUI.reroll;
  if (reroll) G.RunUI.reroll = function () { const r = reroll.apply(this, arguments); paint(null); return r; };
  function paint(list) {
    const els = [...document.querySelectorAll('#cards .card')];
    els.forEach((el, i) => {
      if (list && (!list[i] || list[i].type !== 'relic')) return;
      if (!list && !/Relic/.test(el.textContent)) return;
      el.style.borderColor = GOLD;
      el.style.boxShadow = '0 0 14px ' + GOLD + '66';
      const chip = el.querySelector('.tag-chip');
      if (chip) { chip.style.background = GOLD; chip.style.color = '#1d1405'; }
    });
  }

  if (G.Lab && G.Lab.pauseLine) G.Lab.pauseLine(p => {
    const got = Object.entries(p._labRelics || {}).filter(([id]) => DEF[id]);
    return got.length ? '<b>Relics</b> · ' + got.map(([id, n]) => G.Lab.esc(DEF[id].n) + (n > 1 ? ' ×' + n : '')).join(' · ') : '';
  });
  // The names as they are (the dictionary's word-by-word pass would touch "Swift", "Ward"...).
  if (G.I18n && G.I18n.add) G.I18n.add(Object.fromEntries(KEYS.flatMap(id => [[DEF[id].n, DEF[id].n], [DEF[id].t, DEF[id].t]]).concat([['Relic', 'Relic']])), 'en');

  return { DEF, POOL, grant, hand, card,
    /** What this player took ({ id: n }). */
    of: p => Object.assign({}, (p && p._labRelics) || {}) };
})();
