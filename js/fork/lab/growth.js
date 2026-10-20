/* ============ growth.js — que los Pokémon flojos también valgan, en el modo Lab (fork MrSurvivor) ============
 * Fase 6 de fork/LAB.md. En una partida Lab:
 *   - EVOLUCIONAR en la partida: al llegar a su nivel (el de los juegos, G.LabData.evo, pasado a
 *     niveles de partida: levelFor) sale una carta dorada "Evolve into X" (una por evolución, como
 *     mucho dos) y otra de Piedra Eterna: no evolucionar y quedarse con un extra de defensa y vida
 *     (como el Mineral Evolutivo). La evolución trae sus stats, su aspecto, sus movimientos (su
 *     lista del Lab) y su habilidad; los iniciales ganan su definitivo (fase 5, sig.final).
 *   - OBJETOS de los juegos para los flojos (ITEMS): Mineral Evolutivo (si aún puede evolucionar),
 *     Bola Luminosa (Pikachu), Hueso Grueso (Cubone y Marowak), Puerro (Farfetch'd), Polvo Metálico
 *     y Polvo Veloz (Ditto)... Salen en cofres y jefes (G.Items.roll), 1 de cada 3 veces si es tuyo.
 *   - EXPERIENCIA para los flojos: hasta +60 % según sus stats base (underdog).
 *   - CARAMELOS: con el ajuste Lab encendido, cada repetido del gacha da un caramelo de su línea
 *     evolutiva (save.lab.candy[dex]); en una partida Lab, cada uno +3 % de vida y daño (hasta 10).
 *
 * Cooperativo: { k:'labevo', u, dex } al anfitrión, que lo reparte (como js/fork/mega.js): todos
 * ven a tu Pokémon evolucionado. Textos sólo en inglés (fork/LAB.md). Prueba: fork/test-lab.cjs.
 */
G.LabGrowth = (() => {
  const D = G.LabData;
  const esc = s => G.Lab.esc(s);
  const UNDERDOG_REF = 480, UNDERDOG_K = 1.1, UNDERDOG_MAX = 0.6;
  const CANDY_K = 0.03, CANDY_MAX = 10;
  const ITEM_P = 1 / 3;
  const STAY = { def: 0.15, hp: 0.15 };    // Piedra Eterna: -15 % de daño recibido y +15 % de vida

  // ---------------- evolución ----------------
  const parent = {};
  for (const d in D.evo) for (const x of D.evo[d].split(',')) parent[x.split(':')[0]] = +d;
  const stageOf = d => parent[d] ? 1 + stageOf(parent[d]) : 0;
  /** A qué evoluciona: [[dex, nivel de partida]] (sólo las que tienen sprite). */
  function targets(dex) {
    return (D.evo[dex] || '').split(',').filter(Boolean).map(x => x.split(':').map(Number))
      .filter(([to]) => G.DEX_BY[to] && G.SPRITE_META[to]).map(([to, lv]) => [to, levelFor(dex, lv)]);
  }
  /** Nivel de partida al que evoluciona: el de los juegos × 0,45 (5–26); sin nivel (piedra, amistad...), 10 o 18. */
  function levelFor(dex, lv) { return lv ? G.U.clamp(Math.round(lv * 0.45), 5, 26) : stageOf(dex) ? 18 : 10; }
  const canEvolve = dex => targets(dex).length > 0;

  /** Cartas de evolución para esta mano (o nada). */
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
    // Lo que depende de qué Pokémon es se quita y se vuelve a poner.
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
    G.Admin.repaint(p);                                 // su sprite (y escala), como la megaevolución
    underdog(p, under0);
    // Su habilidad, si es otra (Charmander y Charizard: Mar Llamas las dos).
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

  /** Puppet de un compañero que ha evolucionado (sólo se ve). */
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

  // La carta de evolución va la primera; la de Piedra Eterna, detrás.
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!G.Lab.active || !pl || pl !== G.Game.player) return hand;
    const c = cards(pl);
    if (!c.length) return hand;
    return c.concat(hand.filter(x => !c.some(y => y.key === x.key))).slice(0, Math.max(hand.length, c.length));
  };

  // ---------------- experiencia de los flojos ----------------
  /** + de experiencia según sus stats base (Caterpie +60 %, Charmander +39 %, Charizard nada). */
  const underdogK = mon => G.U.clamp((UNDERDOG_REF - (mon.bst || UNDERDOG_REF)) / UNDERDOG_REF * UNDERDOG_K, 0, UNDERDOG_MAX);
  function underdog(p, was = 0) {
    const k = underdogK(p.mon);
    p.xpMul *= (1 + k) / (1 + was);
    p._labUnder = k;
  }

  // ---------------- caramelos ----------------
  const byFam = {};
  for (const d in D.fam) (byFam[D.fam[d]] = byFam[D.fam[d]] || []).push(+d);
  const line = d => byFam[D.fam[d]] || [d];
  function candies(dex) {
    const c = (G.DB.save && G.DB.save.lab && G.DB.save.lab.candy) || {};
    return Math.min(CANDY_MAX, line(dex).reduce((s, d) => s + (c[d] | 0), 0));
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

  // ---------------- objetos ----------------
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
        if (it.dex && !it.dex.includes(p.dex)) return;          // en otro Pokémon no hace nada
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
  /** Los objetos de los juegos que le van a este Pokémon. */
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

  // ---------------- al empezar una partida Lab ----------------
  function start(pl) {
    pl._labStay = false;
    underdog(pl, 0);
    const n = candies(pl.dex);
    if (n) { pl.atkMul *= 1 + CANDY_K * n; pl.addMaxHp(Math.round(pl.maxHp * CANDY_K * n)); }
    pl._labCandy = n;
  }

  G.Lab.pauseLine(pl => {
    const out = [];
    const t = targets(pl.dex);
    if (pl._labStay) out.push('Everstone: not evolving this run.');
    else if (t.length) out.push('Evolves at level ' + Math.min(...t.map(x => x[1])) + ' into ' + t.map(x => esc(G.DEX_BY[x[0]].name)).join(' / ') + '.');
    if (pl._labUnder > 0) out.push('Underdog: +' + Math.round(pl._labUnder * 100) + '% XP.');
    if (pl._labCandy) out.push('Candies: ' + pl._labCandy + ' (+' + Math.round(pl._labCandy * CANDY_K * 100) + '% HP and damage).');
    return out.join(' ');
  });

  return { targets, levelFor, canEvolve, evolveTo, cards, candies, underdogK, ITEMS, itemsFor, start, STAY, CANDY_K };
})();
