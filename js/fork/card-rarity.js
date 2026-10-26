/* ============ card-rarity.js — rarities for the stat upgrade cards (MrSurvivor fork) ============
 * The run's stat upgrade cards (Vigor, Potencia, Carrera... G.LevelUp.STATS) come with a rarity:
 *   Common ×1 (60 %) · Uncommon ×1.25 (25 %) · Rare ×1.5 (10 %) · Epic ×2 (4 %) · Legendary ×2 (1 %)
 * (Legendary was ×3 until 2026-10-22; the owner chose doofcraft's ×2, plan G10.)
 * The effect and its text scale by the multiplier (Epic Potencia: "+20% de daño"), the chip names the
 * rarity and the card wears its colour (the gacha's rarity colours). The caps don't change: a card
 * counts its multiplier in statsTaken (Potencia has 40), and if it doesn't fit whole it drops a rarity.
 * A card can carry its own cap (c.capMax: the past-the-cap cards, js/fork/lab/late-hand.js).
 * Cards that ask for an evolution (gold ones) and common ones stay as they were.
 * Each card's effect is repeated here (S) with the game card's number: if upstream changes
 * a card (its text is no longer the one in S), that card always comes common, so the text never lies.
 * Hooks: G.LevelUp.offer (the 3 cards), G.RunUI.showLevelUp and G.RunUI.reroll (the colour).
 * Test: fork/test-card-rarity.cjs.
 */
G.CardRarity = (() => {
  const TIERS = [{ r: 1, k: 1, w: 60 }, { r: 2, k: 1.25, w: 25 }, { r: 3, k: 1.5, w: 10 }, { r: 4, k: 2, w: 4 }, { r: 5, k: 2, w: 1 }];
  const fmt = v => String(+v.toFixed(2));
  // id: base (the game's text), t (the same with {x}), n (its number), apply(pl, k)
  const S = {
    hp:   { base: '+20 de vida máxima (y la recupera).', t: '+{x} de vida máxima (y la recupera).', n: 20, round: true, apply: (pl, k) => pl.addMaxHp(Math.round(20 * k)) },
    atk:  { base: '+10% de daño con todos los movimientos.', t: '+{x}% de daño con todos los movimientos.', n: 10, apply: (pl, k) => { pl.atkMul *= 1 + 0.10 * k; } },
    spd:  { base: '+7% de velocidad de movimiento.', t: '+{x}% de velocidad de movimiento.', n: 7, apply: (pl, k) => { pl.spdMul *= 1 + 0.07 * k; } },
    cd:   { base: '-8% de recarga en todos los movimientos.', t: '-{x}% de recarga en todos los movimientos.', n: 8, apply: (pl, k) => { pl.cdMul *= 1 - 0.08 * k; } },
    def:  { base: '+6% de reducción de daño recibido.', t: '+{x}% de reducción de daño recibido.', n: 6, apply: (pl, k) => { pl.dmgReduce = Math.min(0.7, pl.dmgReduce + 0.06 * k); } },
    rgn:  { base: '+0.9 de vida regenerada por segundo.', t: '+{x} de vida regenerada por segundo.', n: 0.9, apply: (pl, k) => { pl.regenFlat += 0.9 * k; } },
    mag:  { base: '+30% de radio de recogida de experiencia.', t: '+{x}% de radio de recogida de experiencia.', n: 30, apply: (pl, k) => { pl.magnet *= 1 + 0.30 * k; } },
    xp:   { base: '+12% de experiencia ganada.', t: '+{x}% de experiencia ganada.', n: 12, apply: (pl, k) => { pl.xpMul *= 1 + 0.12 * k; } },
    heal: { base: 'Recupera el 45% de tu vida ahora mismo.', t: 'Recupera el {x}% de tu vida ahora mismo.', n: 45, cap: 100, apply: (pl, k) => pl.heal(pl.maxHp * Math.min(1, 0.45 * k)) }
  };
  const api = { TIERS, S, roll: m => roll(m) };   // the tests swap roll
  const DEF = Object.fromEntries((G.LevelUp.STATS || []).map(s => [s.id, s]));
  const ok = id => S[id] && DEF[id] && DEF[id].desc === S[id].base;

  function roll(maxK) {
    let x = Math.random() * 100, t = TIERS[0];
    for (const c of TIERS) { if ((x -= c.w) < 0) { t = c; break; } }
    while (t.k > maxK && t.r > 1) t = TIERS[t.r - 2];       // doesn't fit whole: drop one
    return t;
  }
  function value(s, k) { let v = s.n * k; if (s.round) v = Math.round(v); if (s.cap) v = Math.min(s.cap, v); return fmt(v); }

  let last = null;
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const out = offer.apply(this, arguments);
    if (!Array.isArray(out) || !pl) return out;
    for (const c of out) {
      if (c.type !== 'stat' || !c.key || c.color === '#ffd23f') continue;   // gold ones ask for an evolution
      const id = c.key.slice(5), s = S[id], d = DEF[id];
      if (!ok(id)) continue;
      const taken = (pl.statsTaken && pl.statsTaken[id]) || 0, max = c.capMax || d.max, t = api.roll(max ? max - taken : Infinity);
      if (t.r === 1) continue;
      c.rarity = t.r; c.rk = t.k;
      c.desc = s.t.replace('{x}', value(s, t.k));
      c.tag = G.Gacha.RARITY_NAME[t.r];
      c.color = G.Gacha.RARITY_COLOR[t.r];
      c.apply = p => { s.apply(p, t.k); p.statsTaken[id] = (p.statsTaken[id] || 0) + t.k; };
    }
    last = out;
    return out;
  };

  function paint(list) {
    const els = document.querySelectorAll('#cards .card');
    (list || []).forEach((c, i) => {
      const el = els[i];
      if (!el || !(c.rarity > 1)) return;
      el.classList.add('rarity-' + c.rarity);
      el.style.boxShadow = `0 0 0 2px ${c.color}, 0 0 14px ${c.color}77`;
      const chip = el.querySelector('.tag-chip');
      if (chip) { chip.style.background = c.color; chip.style.color = '#16182b'; }
    });
  }
  const show = G.RunUI.showLevelUp;
  G.RunUI.showLevelUp = function (level, list) {
    const r = show.apply(this, arguments);
    paint(list);
    const btn = document.getElementById('lvl-reroll');     // run-ui.js points it at its internal reroll
    if (btn) btn.onclick = () => G.RunUI.reroll();
    return r;
  };
  const reroll = G.RunUI.reroll;
  G.RunUI.reroll = function () { const r = reroll.apply(this, arguments); paint(last); return r; };

  // The texts with an open number: the game's text, with its number swapped for {x} (en, fr, it, pt-BR, zh).
  const ROWS = [
    [S.hp.t, '+{x} max HP (and heals that amount).', '+{x} PV max (et les récupère).', '+{x} PS massimi (e li ripristina).', '+{x} de vida máxima (e recupera essa vida).', '最大生命值 +{x}，并恢复等量生命值。', '最大生命值 +{x}，並恢復等量生命值。'],
    [S.atk.t, '+{x}% damage with every move.', '+{x} % de dégâts avec toutes les capacités.', '+{x}% di danno con ogni mossa.', '+{x}% de dano com todos os golpes.', '所有招式伤害 +{x}%。', '所有招式傷害 +{x}%。'],
    [S.spd.t, '+{x}% movement speed.', '+{x} % de vitesse de déplacement.', '+{x}% di velocità di movimento.', '+{x}% de velocidade de movimento.', '移动速度 +{x}%。', '移動速度 +{x}%。'],
    [S.cd.t, '-{x}% cooldown on every move.', '-{x} % de recharge sur toutes les capacités.', '-{x}% di ricarica su ogni mossa.', '-{x}% de recarga em todos os golpes.', '所有招式冷却时间 -{x}%。', '所有招式冷卻時間 -{x}%。'],
    [S.def.t, '+{x}% damage reduction.', '+{x} % de réduction des dégâts subis.', '+{x}% di riduzione dei danni subiti.', '+{x}% de redução de dano recebido.', '受到的伤害减少 {x}%。', '受到的傷害減少 {x}%。'],
    [S.rgn.t, '+{x} HP regenerated per second.', '+{x} PV régénéré par seconde.', '+{x} PS rigenerati al secondo.', '+{x} de vida regenerada por segundo.', '每秒恢复 {x} 生命值。', '每秒恢復 {x} 生命值。'],
    [S.mag.t, '+{x}% experience pickup radius.', '+{x} % de rayon de ramassage de l\'expérience.', '+{x}% di raggio di raccolta esperienza.', '+{x}% de raio de coleta de experiência.', '经验拾取半径 +{x}%。', '經驗拾取半徑 +{x}%。'],
    [S.xp.t, '+{x}% experience gained.', '+{x} % d\'expérience gagnée.', '+{x}% di esperienza guadagnata.', '+{x}% de experiência ganha.', '获得的经验 +{x}%。', '獲得的經驗 +{x}%。'],
    [S.heal.t, 'Instantly restores {x}% of your HP.', 'Restaure {x} % de tes PV tout de suite.', 'Ripristina il {x}% dei tuoi PS all\'istante.', 'Recupera {x}% da sua vida agora mesmo.', '立即恢复 {x}% 生命值。', '立即恢復 {x}% 生命值。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return api;
})();
