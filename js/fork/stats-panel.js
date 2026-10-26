/* ============ stats-panel.js — your stats under your HP (MrSurvivor fork) ============
 * Settings → Graphics, for everyone: "Panel de estadísticas" (Stats panel, off by default). In a run, under the
 * HP bar: damage, speed, max HP, defense, cooldown, regeneration and crits as they
 * stand right now (upgrades, cards, items and boosters included), and the upgrade cards taken
 * (Potencia 3 · Carrera 2...). It's drawn in the G.HUD.belowHp slot (js/ui/hud.js), after whatever
 * was already there (the evolution bar, js/fork/lab/evo-hud.js), and the interface scale (ui-scale.js) enlarges it with the
 * rest. Test: fork/test-stats-panel.cjs.
 */
G.StatsPanel = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = (ctx, ...a) => G.I18n.rawCanvas(ctx, 'fillText', ...a);
  const on = () => !!G.Settings.get('statsPanel');
  const fx = v => (Math.round(v * 100) / 100).toFixed(2);
  const pct = v => Math.round(v * 100) + '%';

  /** [label, value] for what pl has now. */
  function rows(pl) {
    const spd = pl.spdMul * (1 + pl.buffs.spd.n * pl.buffs.spd.amount);
    return [
      ['Daño', '×' + fx(pl.atk / (pl.baseAtk || 1))],
      ['Vel.', '×' + fx(spd)],
      ['Vida', String(Math.round(pl.maxHp))],
      ['Def.', pct(pl.reduction)],
      ['Recarga', '-' + pct(1 - pl.cdMul)],
      ['Regen.', (Math.round(pl.regen * 10) / 10) + '/s'],
      ['Crít.', pct(pl.critChance || 0)]
    ];
  }
  function cards(pl) {
    const t = pl.statsTaken || {};
    return (G.LevelUp.STATS || []).filter(s => t[s.id] > 0).map(s => [s.title, Math.round(t[s.id] * 100) / 100]);
  }

  function draw(ctx, pl, px, y) {
    const W = 216, LH = 12;
    const parts = rows(pl).map(([l, v]) => G.T(l) + ' ' + v);
    const cs = cards(pl).map(([l, n]) => G.T(l) + ' ' + n);
    ctx.save();
    ctx.font = F(700, 9);
    // In lines that fit in W.
    const lines = [];
    const pack = (items, lead) => {
      let cur = lead || '';
      for (const it of items) {
        const next = cur ? cur + (cur === lead ? ' ' : ' · ') + it : it;
        if (ctx.measureText(next).width > W - 10 && cur) { lines.push(cur); cur = it; } else cur = next;
      }
      if (cur) lines.push(cur);
    };
    pack(parts);
    const statLines = lines.length;
    if (cs.length) pack(cs, G.T('Cartas') + ':');
    const h = lines.length * LH + 6;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(px, y, W, h);
    ctx.textAlign = 'left';
    lines.forEach((l, i) => { ctx.fillStyle = i < statLines ? '#eaf2ff' : '#ffcb3d'; raw(ctx, l, px + 5, y + 11 + i * LH); });
    ctx.restore();
    return h + 4;
  }

  const prev = G.HUD.belowHp;
  G.HUD.belowHp = (ctx, pl, px, y) => {
    const h = prev ? prev(ctx, pl, px, y) || 0 : 0;
    if (!on() || !pl || pl.remote) return h;
    try { return h + draw(ctx, pl, px, y + h); } catch (e) { return h; }   // never break the HUD
  };

  if (G.RadiantGlow) {
    const row = G.RadiantGlow.settingsRow;
    G.RadiantGlow.settingsRow = function () {
      const v = on();
      return row.apply(this, arguments) + `<div class="set-row"><div class="grow"><b>${G.T('Panel de estadísticas')}</b><small>${G.T('En la partida, bajo tu vida: tu daño, velocidad, vida, defensa, recarga, regeneración, críticos y las cartas de mejora que llevas.')}</small></div>
        <button class="btn small switch ${v ? 'gold' : ''}" data-k="statsPanel">${v ? 'Sí' : 'No'}</button></div>`;
    };
  }

  // Columns: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    ['Panel de estadísticas', 'Stats panel', 'Panneau de statistiques', 'Pannello statistiche', 'Painel de estatísticas', '属性面板', '屬性面板'],
    ['En la partida, bajo tu vida: tu daño, velocidad, vida, defensa, recarga, regeneración, críticos y las cartas de mejora que llevas.',
     'In a run, under your HP: your damage, speed, HP, defense, cooldown, regeneration, crits and the upgrade cards you have.',
     'En partie, sous vos PV : dégâts, vitesse, PV, défense, recharge, régénération, critiques et les cartes d\'amélioration prises.',
     'In partita, sotto i PS: danno, velocità, PS, difesa, ricarica, rigenerazione, critici e le carte potenziamento prese.',
     'Na partida, abaixo da sua vida: dano, velocidade, vida, defesa, recarga, regeneração, críticos e as cartas de melhoria que você pegou.',
     '对局中显示在生命值下方：伤害、速度、生命、防御、冷却、回复、暴击和已拿的强化卡。', '對局中顯示在生命值下方：傷害、速度、生命、防禦、冷卻、回復、暴擊和已拿的強化卡。'],
    ['Daño', 'Dmg', 'Dégâts', 'Danno', 'Dano', '伤害', '傷害'],
    ['Vel.', 'Spd', 'Vit.', 'Vel.', 'Vel.', '速度', '速度'],
    ['Vida', 'HP', 'PV', 'PS', 'Vida', '生命', '生命'],
    ['Def.', 'Def', 'Déf.', 'Dif.', 'Def.', '防御', '防禦'],
    ['Recarga', 'Cooldown', 'Recharge', 'Ricarica', 'Recarga', '冷却', '冷卻'],
    ['Regen.', 'Regen', 'Régén.', 'Rigen.', 'Regen.', '回复', '回復'],
    ['Crít.', 'Crit', 'Crit.', 'Crit.', 'Crít.', '暴击', '暴擊'],
    ['Cartas', 'Cards', 'Cartes', 'Carte', 'Cartas', '卡牌', '卡牌']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { rows, cards, draw };
})();
