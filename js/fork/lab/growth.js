/* ============ growth.js — making weak Pokémon worth playing too, in Lab mode (MrSurvivor fork) ============
 * Phase 6 of fork/LAB.md. In a Lab run:
 *   - EVOLVING during the run: on reaching its level (the games' level, G.LabData.evo, turned into
 *     run levels: levelFor) a gold "Evolve into X" card comes up (one per evolution, at
 *     most two), plus an Everstone card: don't evolve and keep extra defence and HP instead
 *     (like Eviolite). The evolution brings its stats, its look, its moves (its
 *     Lab list) and its ability; starters get their finisher (phase 5, sig.final).
 *   - The games' ITEMS for weak Pokémon (ITEMS): Eviolite (if it can still evolve),
 *     Light Ball (Pikachu), Thick Club (Cubone and Marowak), Leek (Farfetch'd), Metal Powder
 *     and Quick Powder (Ditto)... They drop from chests and bosses (G.Items.roll), 1 time in 3 if it's yours.
 *   - EXPERIENCE for weak Pokémon: up to +60 % depending on their base stats (underdog).
 *   - CANDIES: with the Lab setting on, each gacha duplicate gives a candy for its evolution
 *     line (save.lab.candy[dex]). They're spent on the Upgrades screen (with Lab on) on the
 *     stat you choose: HP, Attack, Sp. Atk, Defense or Speed, up to 10 points per
 *     evolution line (save.lab.cpts[line]); point n of a stat costs n candies, and
 *     Reset gives them all back. In a Lab run, per point: +3 % HP, +3 % physical or
 *     special damage, +2 % damage reduction or +2 % speed (until 21-10-2026 each candy gave
 *     +3 % HP and damage, with no choice).
 *
 * Co-op: { k:'labevo', u, dex } to the host, who passes it on (like js/fork/mega.js): everyone
 * sees your Pokémon evolved. Texts in English only (fork/LAB.md). Test: fork/test-lab.cjs.
 */
G.LabGrowth = (() => {
  const D = G.LabData;
  const esc = s => G.Lab.esc(s);
  const UNDERDOG_REF = 480, UNDERDOG_K = 1.1, UNDERDOG_MAX = 0.6;
  const CANDY_K = 0.03, CANDY_MAX = 10;     // points per line
  // What each point gives in a Lab run.
  const CSTAT = {
    hp:   { name: 'HP', per: 0.03, text: k => `+${Math.round(k * 100)}% HP` },
    atk:  { name: 'Attack', per: 0.03, text: k => `+${Math.round(k * 100)}% physical damage` },
    satk: { name: 'Sp. Atk', per: 0.03, text: k => `+${Math.round(k * 100)}% special damage` },
    def:  { name: 'Defense', per: 0.02, text: k => `${Math.round(k * 100)}% less damage taken` },
    spd:  { name: 'Speed', per: 0.02, text: k => `+${Math.round(k * 100)}% speed` }
  };
  const ITEM_P = 1 / 3;
  const STAY = { def: 0.15, hp: 0.15 };    // Everstone: -15 % damage taken and +15 % HP

  // ---------------- evolution ----------------
  const parent = {};
  for (const d in D.evo) for (const x of D.evo[d].split(',')) parent[x.split(':')[0]] = +d;
  const stageOf = d => parent[d] ? 1 + stageOf(parent[d]) : 0;
  /** What it evolves into: [[dex, run level]] (only those with a sprite). */
  function targets(dex) {
    return (D.evo[dex] || '').split(',').filter(Boolean).map(x => x.split(':').map(Number))
      .filter(([to]) => G.DEX_BY[to] && G.SPRITE_META[to]).map(([to, lv]) => [to, levelFor(dex, lv)]);
  }
  /** Run level it evolves at: the games' level × 0.45 (5–26); with no level (stone, friendship...), 10 or 18. */
  function levelFor(dex, lv) { return lv ? G.U.clamp(Math.round(lv * 0.45), 5, 26) : stageOf(dex) ? 18 : 10; }
  const canEvolve = dex => targets(dex).length > 0;

  /** Evolution cards for this hand (or nothing). */
  function cards(pl) {
    if (pl._labStay || !pl.mon) return [];
    const t = targets(pl.dex).filter(([, lv]) => pl.level >= lv);
    if (!t.length) return [];
    const pickT = G.U.shuffle ? G.U.shuffle(t.slice()) : t.slice().sort(() => Math.random() - 0.5);
    const out = pickT.slice(0, 2).map(([to]) => {
      const a = pl.mon, b = G.DEX_BY[to];
      return { w: 50, type: 'evo', key: 'grow:' + to, icon: 'up', color: '#ffd23f', tag: 'EVOLUTION',
        title: 'Evolve into ' + b.name,
        desc: `HP ${a.hp} → ${b.hp}, speed ${a.spd} → ${b.spd}, damage ×${(b.atk / a.atk).toFixed(2)}. It learns ${b.name}'s moves and gets its ability.`,
        apply: p => evolveTo(p, to) };
    });
    out.push({ w: 20, type: 'stat', key: 'grow:stay', icon: 'shield', color: '#9fb1c9', tag: 'Everstone',
      title: 'Stay as ' + pl.mon.name,
      desc: `Don't evolve this run: take ${Math.round(STAY.def * 100)}% less damage and get ${Math.round(STAY.hp * 100)}% more HP instead.`,
      apply: p => stay(p) });
    return out;
  }

  function stay(p) {
    p._labStay = true;
    p.dmgReduce += STAY.def;
    p.addMaxHp(Math.round(p.maxHp * STAY.hp));
    G.Spawner.say(p.mon.name + ' stays as it is', 2.4, true);
  }

  function evolveTo(p, to) {
    const old = p.mon, mon = G.DEX_BY[to];
    if (!mon) return;
    if (p._labTf) { p.mon = p._labTf.mon0; delete p._labTf; }
    // Whatever depends on which Pokémon it is gets removed and put back.
    const item = p.item;
    if (item === 'megastone' || item === 'eviolite') p.equip(null);
    const under0 = p._labUnder || 0;
    p.mon = mon; p.dex = to;
    const dHp = mon.hp - old.hp;
    p.maxHp = Math.max(1, p.maxHp + dHp);
    p.hp = Math.min(p.maxHp, p.hp + Math.max(0, dHp) + p.maxHp * 0.25);
    p.baseSpd = mon.spd; p.baseAtk = mon.atk;
    p.shiny = p.shiny && G.Sprites.hasShiny(to);
    p.r = G.Sprites.playerRadius(to);
    G.Sprites.preload([to], 8000, p.shiny);
    G.Admin.repaint(p);                                 // its sprite (and scale), like Mega Evolution
    underdog(p, under0);
    // Its ability, if it's a different one (Charmander and Charizard: both Blaze).
    const a = G.LabAbilities.of(to);
    if (a && a.on && a.id !== p.labAbility) {
      p.labAbility = a.id;
      const d = G.LabAbilities.DEF[a.id];
      if (d.start) d.start(p);
      if (d.learn) for (const m of p.moves) d.learn(p, m);
    }
    if (a) G.Lab.setAbility(a);
    if (item === 'megastone' || item === 'eviolite') p.equip(item);
    G.LabAnims.preload(p);
    G.FX.ring(p.x, p.y, 8, 160, '#ffffff', 0.9, 6);
    G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ffffff', 60, 280);
    G.Audio.sfx('legend');
    G.Camera.kick(0.5);
    G.Spawner.say(old.name + ' evolved into ' + mon.name + '!', 3, true);
    share(to);
  }

  /** Puppet of a teammate who has evolved (looks only). */
  function lookAs(p, dex) {
    if (!G.DEX_BY[dex] || !G.SPRITE_META[dex]) return;
    p.mon = G.DEX_BY[dex]; p.dex = dex;
    p.shiny = p.shiny && G.Sprites.hasShiny(dex);
    p.r = G.Sprites.playerRadius(dex);
    G.Sprites.preload([dex], 8000, p.shiny);
    G.Admin.repaint(p);
  }
  function share(dex) {
    if (!G.Coop.active) return;
    const msg = { k: 'labevo', u: G.Net.uid, dex };
    if (G.Coop.isHost) { for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg); }
    else G.Net.toHost(msg);
  }
  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'labevo' || !G.Coop.active || typeof msg.dex !== 'number') return;
    if (G.Coop.isHost) {
      if (msg.u !== from) return;
      for (const m of G.Coop.mates) if (m.connected && m.uid !== from) G.Net.send(m.uid, msg);
    } else if (from !== G.Net.hostUid) return;
    const m = G.Coop.mate(msg.u);
    if (m && m.pl) lookAs(m.pl, msg.dex);
  });

  // The evolution card goes first; the Everstone one, after it.
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!G.Lab.active || !pl || pl !== G.Game.player) return hand;
    const c = cards(pl);
    if (!c.length) return hand;
    return c.concat(hand.filter(x => !c.some(y => y.key === x.key))).slice(0, Math.max(hand.length, c.length));
  };

  // ---------------- experience for weak Pokémon ----------------
  /** Extra experience based on its base stats (Caterpie +60 %, Charmander +39 %, Charizard none). */
  // Never for epics and legendaries (even if one has low stats, like Cosmog): they're the gacha's rare ones.
  const underdogK = mon => (mon.rarity || 1) >= 4 ? 0 : G.U.clamp((UNDERDOG_REF - (mon.bst || UNDERDOG_REF)) / UNDERDOG_REF * UNDERDOG_K, 0, UNDERDOG_MAX);
  function underdog(p, was = 0) {
    const k = underdogK(p.mon);
    p.xpMul *= (1 + k) / (1 + was);
    p._labUnder = k;
  }

  // ---------------- candies ----------------
  const byFam = {};
  for (const d in D.fam) (byFam[D.fam[d]] = byFam[D.fam[d]] || []).push(+d);
  const line = d => byFam[D.fam[d]] || [d];
  /** Candies earned by dex's whole line (what has been spent is separate: spent). */
  function candies(dex) {
    const c = (G.DB.save && G.DB.save.lab && G.DB.save.lab.candy) || {};
    return line(dex).reduce((s, d) => s + (c[d] | 0), 0);
  }
  const lineKey = dex => Math.min(...line(dex));
  function labOf(s) { return (s.lab = s.lab && typeof s.lab === 'object' ? s.lab : {}); }
  /** Points of dex's line: { hp, atk, satk, def, spd }. */
  function points(dex) {
    const s = G.DB.save, p = s && s.lab && s.lab.cpts && s.lab.cpts[lineKey(dex)];
    const out = {};
    for (const k in CSTAT) out[k] = Math.max(0, Math.min(CANDY_MAX, (p && p[k]) | 0));
    return out;
  }
  const total = p => Object.values(p).reduce((a, b) => a + b, 0);
  const costOf = (dex, k) => points(dex)[k] + 1;                    // point n costs n
  const spent = dex => Object.values(points(dex)).reduce((a, n) => a + n * (n + 1) / 2, 0);
  const left = dex => Math.max(0, candies(dex) - spent(dex));
  /** One more point in k (if there are points and candies left). */
  function spend(dex, k) {
    const p = points(dex);
    if (!CSTAT[k] || total(p) >= CANDY_MAX || left(dex) < p[k] + 1) return false;
    const lab = labOf(G.DB.save), cp = lab.cpts = lab.cpts && typeof lab.cpts === 'object' ? lab.cpts : {};
    cp[lineKey(dex)] = Object.assign(p, { [k]: p[k] + 1 });
    G.DB.commit();
    return true;
  }
  /** The line's points turn back into candies. */
  function reset(dex) {
    const lab = labOf(G.DB.save);
    if (lab.cpts) delete lab.cpts[lineKey(dex)];
    G.DB.commit();
  }
  const pull = G.Gacha.pull;
  G.Gacha.pull = function (save) {
    const res = pull.apply(this, arguments);
    if (G.Settings.get('lab') && save && Array.isArray(res)) {
      const got = res.filter(r => !r.isNew && G.DEX_BY[r.dex]);
      if (got.length) {
        const lab = save.lab = save.lab && typeof save.lab === 'object' ? save.lab : {};
        const c = lab.candy = lab.candy && typeof lab.candy === 'object' ? lab.candy : {};
        for (const r of got) c[r.dex] = Math.min(99, (c[r.dex] | 0) + 1);
        G.UI.toast('Lab: +' + got.length + ' candy (duplicates): ' + [...new Set(got.map(r => G.DEX_BY[r.dex].name))].join(', '), 3200);
      }
    }
    return res;
  };

  // ---------------- items ----------------
  const boost = (types, k) => ({ boost: m => types.includes(m.type) ? k : 1 });
  const ITEMS = {
    eviolite:      { name: 'Eviolite', desc: 'While your Pokémon can still evolve: 25% less damage taken and 20% more HP.', who: p => canEvolve(p.dex),
                     on: p => { if (!canEvolve(p.dex)) return; p._evio = Math.round(p.maxHp * 0.2); p.dmgReduce += 0.25; p.addMaxHp(p._evio); },
                     off: p => { if (p._evio == null) return; p.dmgReduce -= 0.25; p.maxHp -= p._evio; p.hp = Math.min(p.hp, p.maxHp); p._evio = null; } },
    'light-ball':  { name: 'Light Ball', desc: 'Pikachu only: 60% more damage.', dex: [25], mul: 1.6 },
    'thick-club':  { name: 'Thick Club', desc: 'Cubone and Marowak only: physical moves deal 60% more damage.', dex: [104, 105], cat: 'physical', mul: 1.6 },
    leek:          { name: 'Leek', desc: 'Farfetch\'d and Sirfetch\'d only: +25% chance of critical hits.', dex: [83, 865], crit: 0.25 },
    'lucky-punch': { name: 'Lucky Punch', desc: 'Chansey only: +25% chance of critical hits.', dex: [113], crit: 0.25 },
    'metal-powder': { name: 'Metal Powder', desc: 'Ditto only: 25% less damage taken.', dex: [132], def: 0.25 },
    'quick-powder': { name: 'Quick Powder', desc: 'Ditto only: 40% faster.', dex: [132], spd: 1.4 },
    'deep-sea-tooth': { name: 'Deep Sea Tooth', desc: 'Clamperl only: special moves deal 60% more damage.', dex: [366], cat: 'special', mul: 1.6 },
    'deep-sea-scale': { name: 'Deep Sea Scale', desc: 'Clamperl only: 25% less damage taken.', dex: [366], def: 0.25 },
    'soul-dew':    Object.assign({ name: 'Soul Dew', desc: 'Latias and Latios only: Psychic and Dragon moves deal 20% more damage.', dex: [380, 381] }, boost(['psychic', 'dragon'], 1.2)),
    'adamant-orb': Object.assign({ name: 'Adamant Orb', desc: 'Dialga only: Steel and Dragon moves deal 20% more damage.', dex: [483] }, boost(['steel', 'dragon'], 1.2)),
    'lustrous-orb': Object.assign({ name: 'Lustrous Orb', desc: 'Palkia only: Water and Dragon moves deal 20% more damage.', dex: [484] }, boost(['water', 'dragon'], 1.2)),
    'griseous-orb': Object.assign({ name: 'Griseous Orb', desc: 'Giratina only: Ghost and Dragon moves deal 20% more damage.', dex: [487] }, boost(['ghost', 'dragon'], 1.2))
  };
  const ICON = { b: '#7a5cff', c: '#b9a6ff', w: '#f2eeff', y: '#ffd23f', o: '#c08a10', g: '#5fe08a', d: '#2f9a52', s: '#c6ccd6', t: '#8a93a2', r: '#ff6b6b' };
  const ROUND = c => ['....kkkk....', '..kk' + c + c + c + c + 'kk..', '.k' + c + 'ww' + c + c + c + c + c + 'k.', '.k' + c + 'w' + c + c + c + c + c + c + 'k.',
    'k' + c.repeat(10) + 'k', 'k' + c.repeat(10) + 'k', 'k' + c.repeat(10) + 'k', 'k' + c.repeat(10) + 'k',
    '.k' + c.repeat(8) + 'k.', '.k' + c.repeat(8) + 'k.', '..kk' + c.repeat(4) + 'kk..', '....kkkk....'];
  const COLOR = { eviolite: 'b', 'light-ball': 'y', 'thick-club': 't', leek: 'g', 'lucky-punch': 'r', 'metal-powder': 's', 'quick-powder': 'y',
                  'deep-sea-tooth': 'c', 'deep-sea-scale': 'r', 'soul-dew': 'c', 'adamant-orb': 's', 'lustrous-orb': 'c', 'griseous-orb': 'o' };
  for (const id in ITEMS) {
    const it = ITEMS[id];
    G.Icons.UI[id] = { pal: ICON, rows: ROUND(COLOR[id] || 'b') };
    G.Items.BY[id] = { id, name: it.name, desc: it.desc, lab: true,
      on: it.on || (p => {
        if (it.dex && !it.dex.includes(p.dex)) return;          // does nothing on another Pokémon
        p._labItem = it;
        if (it.crit) p.critChance += it.crit;
        if (it.def) p.dmgReduce += it.def;
        if (it.spd) p.spdMul *= it.spd;
      }),
      off: it.off || (p => {
        if (p._labItem !== it) return;
        p._labItem = null;
        if (it.crit) p.critChance -= it.crit;
        if (it.def) p.dmgReduce -= it.def;
        if (it.spd) p.spdMul /= it.spd;
      }) };
  }
  const P = G.Player.prototype, atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.call(this, m), it = this._labItem;
    if (!it || !m) return k;
    if (it.mul && (!it.cat || it.cat === m.cat)) return k * it.mul;
    return it.boost ? k * it.boost(m) : k;
  };
  /** The games' items that suit this Pokémon. */
  const itemsFor = p => Object.keys(ITEMS).filter(id => ITEMS[id].who ? ITEMS[id].who(p) : ITEMS[id].dex.includes(p.dex));
  const roll = G.Items.roll;
  G.Items.roll = function (except) {
    const pl = G.Game.player;
    if (G.Lab.active && pl) {
      const opts = itemsFor(pl).filter(id => id !== except && id !== pl.item);
      if (opts.length && Math.random() < ITEM_P) return G.U.pick(opts);
    }
    return roll.apply(this, arguments);
  };

  // ---------------- on starting a Lab run ----------------
  function start(pl) {
    pl._labStay = false;
    underdog(pl, 0);
    const p = points(pl.dex);
    if (p.hp) pl.addMaxHp(Math.round(pl.maxHp * CSTAT.hp.per * p.hp));
    if (p.def) pl.dmgReduce = Math.min(0.7, pl.dmgReduce + CSTAT.def.per * p.def);
    if (p.spd) pl.spdMul *= 1 + CSTAT.spd.per * p.spd;
    pl._labCandy = total(p) ? p : null;                 // atk / satk: in atkFor (below)
  }

  G.Lab.pauseLine(pl => {
    const out = [];
    const t = targets(pl.dex);
    if (pl._labStay) out.push('Everstone: not evolving this run.');
    else if (t.length) out.push('Evolves at level ' + Math.min(...t.map(x => x[1])) + ' into ' + t.map(x => esc(G.DEX_BY[x[0]].name)).join(' / ') + '.');
    if (pl._labUnder > 0) out.push('Underdog: +' + Math.round(pl._labUnder * 100) + '% XP.');
    if (pl._labCandy) out.push('Candies: ' + Object.keys(CSTAT).filter(k => pl._labCandy[k]).map(k => CSTAT[k].text(CSTAT[k].per * pl._labCandy[k])).join(', ') + '.');
    return out.join(' ');
  });

  // Candy Attack / Sp. Atk: only for moves of that category.
  const candyAtkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = candyAtkFor.apply(this, arguments), c = this._labCandy;
    if (!c || !m) return k;
    return m.cat === 'physical' ? k * (1 + CSTAT.atk.per * c.atk) : m.cat === 'special' ? k * (1 + CSTAT.satk.per * c.satk) : k;
  };

  return { targets, levelFor, canEvolve, evolveTo, cards, candies, underdogK, ITEMS, itemsFor, start, STAY, CANDY_K,
           CANDY_MAX, CSTAT, points, costOf, spent, left, spend, reset, lineKey };
})();
