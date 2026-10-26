/* ============ synergy.js — synergy cards (MrSurvivor fork) ============
 * Plan B4 (20 Minutes Till Dawn's synergies), fork/LAB.md "Phase 11: builds". In a run, a
 * red-bordered "Synergy" level-up card only exists once you own its prerequisites (two moves of the
 * right kinds); taking it adds a rule for the rest of the run (pl._labSyn, kept by resume.js):
 *   Frost Fire   an Ice move + a Fire move        your Ice hits also burn
 *   Overload     a paralysing Electric move (Thunder Wave, Zap Cannon, Thunder Cage) + an Electric attack
 *                                                 your Electric hits on a stunned enemy explode around it (50 %)
 *   Steam Burst  a Water move + a Fire move       Water hits on a burning enemy deal 50 % more
 *   Wildfire     a Grass move + a Fire move       Grass hits on a burning enemy spread the burn to 2 enemies near it
 *   Toxic Drain  a Poison move + a Grass move     Grass hits on a poisoned enemy heal you 15 % of the damage
 *   Shatter      an Ice move + a Rock, Steel or Fighting physical move
 *                                                 physical hits on a slowed enemy deal 35 % more
 *   Quicksand    a Ground move + a Water move     Ground hits on a slowed enemy stop it for 0.5 s (once per 3 s)
 *   Nightmare    a Ghost move + a sleep move      Ghost hits on a sleeping or confused enemy deal 60 % more
 * A hand holds at most one, in 1 of 2 hands while one is there for you, in a stat card's place (else a
 * new-move card's). Each one is taken once per run.
 * Hooks: G.LabHits (after each of your hits), G.LevelUp.offer, G.RunUI.showLevelUp / reroll (the red
 * border, like js/fork/card-rarity.js paints its rarities). Co-op: each player's own; extra damage,
 * burns and stuns go through Combat.hit / applyBurn / applyStun, which a guest forwards to the host,
 * and a guest's copies read the host's status bits (e.net.st). Test: fork/test-builds.cjs --only synergy.
 */
G.LabSynergy = (() => {
  const RED = '#ff4d5e', P_IN = 0.5;
  const dmgMove = m => !!m.cat;
  const ofType = t => pl => pl.moves.some(m => dmgMove(m) && m.type === t);
  const PARA = new Set(['thunder-wave', 'zap-cannon', 'thunder-cage', 'nuzzle']);
  // Status of an enemy, also on a guest's copy (the host sends bits: 1 burned, 2 poisoned, 8 slowed, 16 stunned).
  const st = (e, bit) => !!(e.net && e.net.st & bit);
  const burning = e => e.burn > 0 || st(e, 1);
  const poisoned = e => e.poison > 0 || st(e, 2);
  const slowed = e => e.slow > 0 || e.slowT > 0 || st(e, 8);
  const stunned = e => e.stunT > 0 || st(e, 16);
  const asleep = e => e.labSleep > 0 || e.labConf > 0 || e.labSleepNet > 0 || e.labConfNet > 0;
  const extra = (pl, e, m, k) => G.Combat.hit(pl, e, m.dmg * pl.atkFor(m) * k, G.U.TYPE_COLOR[m.type], 0, 0, 0, m);
  // (A Set: EnemyMgr.queryCircle can list an enemy twice when two grid cells' hash keys collide.)
  const near = (e, r, n) => [...new Set(G.EnemyMgr.queryCircle(e.x, e.y, r))].filter(o => o !== e && !o.dead).slice(0, n);
  const once = (e, key, ms) => { const t = performance.now(); if ((e[key] || 0) > t) return false; e[key] = t + ms; return true; };

  const SYN = [
    { id: 'frost-fire', ic: 'ice', n: 'Frost Fire', from: 'an Ice move + a Fire move', t: 'Your Ice hits also burn.',
      need: pl => ofType('ice')(pl) && ofType('fire')(pl),
      hit: (pl, e, m) => { if (m.type === 'ice') e.applyBurn(1); } },
    { id: 'overload', ic: 'electric', n: 'Overload', from: 'Thunder Wave (or another paralysing Electric move) + an Electric attack',
      t: 'Your Electric hits on a stunned enemy explode around it for 50% of the damage.',
      need: pl => pl.moves.some(m => PARA.has(m.id)) && pl.moves.some(m => dmgMove(m) && m.type === 'electric' && !PARA.has(m.id)),
      hit: (pl, e, m) => {
        if (m.type !== 'electric' || !stunned(e) || !once(e, '_labOverAt', 600)) return;
        G.FX.ring(e.x, e.y, 6, 70, G.U.TYPE_COLOR.electric, 0.35, 4);
        for (const o of near(e, 70, 8)) extra(pl, o, m, 0.5);
      } },
    { id: 'steam', ic: 'water', n: 'Steam Burst', from: 'a Water move + a Fire move', t: 'Water hits on a burning enemy deal 50% more damage.',
      need: pl => ofType('water')(pl) && ofType('fire')(pl),
      hit: (pl, e, m) => { if (m.type === 'water' && burning(e) && !e.dead) extra(pl, e, m, 0.5); } },
    { id: 'wildfire', ic: 'grass', n: 'Wildfire', from: 'a Grass move + a Fire move', t: 'Grass hits on a burning enemy spread the burn to 2 enemies near it.',
      need: pl => ofType('grass')(pl) && ofType('fire')(pl),
      hit: (pl, e, m) => { if (m.type === 'grass' && burning(e)) for (const o of near(e, 80, 2)) o.applyBurn(1); } },
    { id: 'toxic-drain', ic: 'grass', n: 'Toxic Drain', from: 'a Poison move + a Grass move', t: 'Grass hits on a poisoned enemy heal you for 15% of the damage.',
      need: pl => ofType('poison')(pl) && ofType('grass')(pl),
      hit: (pl, e, m, dmg) => { if (m.type === 'grass' && poisoned(e)) pl.heal(Math.min(dmg * 0.15, pl.maxHp * 0.01)); } },
    { id: 'shatter', ic: 'ice', n: 'Shatter', from: 'an Ice move + a Rock, Steel or Fighting physical move', t: 'Your physical hits on a slowed enemy deal 35% more damage.',
      need: pl => ofType('ice')(pl) && pl.moves.some(m => m.cat === 'physical' && ['rock', 'steel', 'fighting'].includes(m.type)),
      hit: (pl, e, m) => { if (m.cat === 'physical' && slowed(e) && !e.dead) extra(pl, e, m, 0.35); } },
    { id: 'quicksand', ic: 'ground', n: 'Quicksand', from: 'a Ground move + a Water move', t: 'Ground hits on a slowed enemy stop it for 0.5 s (once every 3 s).',
      need: pl => ofType('ground')(pl) && ofType('water')(pl),
      hit: (pl, e, m) => { if (m.type === 'ground' && slowed(e) && once(e, '_labSandAt', 3000)) e.applyStun(0.5); } },
    { id: 'nightmare', ic: 'ghost', n: 'Nightmare', from: 'a Ghost move + a sleep move (Hypnosis, Sing, Spore...)', t: 'Ghost hits on a sleeping or confused enemy deal 60% more damage.',
      need: pl => ofType('ghost')(pl) && pl.moves.some(m => m.kind === 'sleep'),
      hit: (pl, e, m) => { if (m.type === 'ghost' && asleep(e) && !e.dead) extra(pl, e, m, 0.6); } }
  ];
  const BY = Object.fromEntries(SYN.map(s => [s.id, s]));
  const lab = () => !!(G.Lab && G.Lab.active);
  const esc = s => G.Lab.esc(s);
  const taken = pl => (pl._labSyn = Array.isArray(pl._labSyn) ? pl._labSyn : []);
  const open = pl => SYN.filter(s => !taken(pl).includes(s.id) && s.need(pl));

  function take(pl, id) {
    if (!BY[id] || taken(pl).includes(id)) return false;
    taken(pl).push(id);
    G.FX.ring(pl.x, pl.y, 8, 130, RED, 0.8, 6);
    G.Spawner.say('Synergy: ' + BY[id].n, 2.6, true);
    return true;
  }
  function card(pl, s) {
    const icon = pl.moves.find(m => dmgMove(m) && m.type === s.ic) || pl.moves[0];
    return { w: 0, type: 'syn', syn: true, key: 'syn:' + s.id, icon: icon ? 'move:' + icon.id : 'up', color: RED, tag: 'Synergy',
      title: esc(s.n), desc: esc(s.t) + ` <span class="fit-good">From ${esc(s.from)}.</span>`, apply: p => take(p, s.id) };
  }

  G.LabHits.on((pl, e, m, dmg) => {
    const got = pl._labSyn;
    if (!got || !got.length) return;
    for (const id of got) if (BY[id]) BY[id].hit(pl, e, m, dmg);
  });

  // ---------------- the cards ----------------
  const keep = c => !c || c.type === 'evo' || c.rare || c.syn || c.branch || (c.key && /^(grow|rare|syn)/.test(c.key));
  let last = null;
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!lab() || !pl || pl !== G.Game.player || !Array.isArray(hand)) return hand;
    last = hand;
    const can = open(pl);
    if (!can.length || hand.some(c => c && c.syn) || !(Math.random() < P_IN)) return hand;
    const c = card(pl, can[Math.floor(Math.random() * can.length)]);
    let j = -1;
    for (const t of ['stat', 'new']) { j = hand.map((x, k) => (x && x.type === t && !keep(x) && x.color !== '#ffd23f' ? k : -1)).filter(k => k >= 0).pop(); if (j >= 0) break; }
    if (j >= 0) hand[j] = c; else hand.push(c);
    return hand;
  };
  function paint(list) {
    const els = document.querySelectorAll('#cards .card');
    (list || []).forEach((c, i) => {
      const el = els[i];
      if (!el || !c || !c.syn) return;
      el.classList.add('syn');
      el.style.boxShadow = `0 0 0 2px ${RED}, 0 0 16px ${RED}88`;
      el.style.borderColor = RED;
      const chip = el.querySelector('.tag-chip');
      if (chip) { chip.style.background = RED; chip.style.color = '#fff'; }
    });
  }
  const show = G.RunUI.showLevelUp;
  G.RunUI.showLevelUp = function (level, list) { const r = show.apply(this, arguments); paint(list); return r; };
  const reroll = G.RunUI.reroll;
  G.RunUI.reroll = function () { const r = reroll.apply(this, arguments); paint(last); return r; };

  G.Lab.pauseLine(pl => {
    const got = taken(pl).filter(id => BY[id]);
    return got.length ? 'Synergies: ' + got.map(id => `<b>${esc(BY[id].n)}</b> (${esc(BY[id].t)})`).join(' ') : '';
  });
  G.I18n.add(Object.fromEntries(SYN.map(s => [s.n, s.n]).concat([['Synergy', 'Synergy']])), 'en');

  return { SYN, BY, open, take, taken, P_IN };
})();
