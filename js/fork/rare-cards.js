/* ============ rare-cards.js — very rare level-up cards (MrSurvivor fork) ============
 * Segunda naturaleza (Second Nature): very rarely (RATE per batch of cards, rerolls
 * included) the last card is this one, if you have a move that raises stats (the
 * 'buff' kind: Danza Espada, Maquinación, Agilidad...). Once you pick it, those
 * moves cast on their own from any slot, each on its own cooldown, as if they were
 * always active: no more switching to them. The ones you learn later too.
 * Once per run.
 * Hooks: G.LevelUp.offer (maybe), Combat.tick (pl.passiveBuffs), RunUI.renderCards (.card.rare).
 * Test: fork/test-gameplay.cjs.
 */
G.RareCards = (() => {
  const RATE = 1 / 500;
  const TITLE = 'Segunda naturaleza', TAG = 'Muy rara';
  const DESC = 'Tus movimientos que suben stats se lanzan solos desde cualquier hueco, como si siempre estuvieran activos: ya no hace falta cambiar a ellos.';
  const YOURS = 'Ahora:';
  // Columns: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    [TITLE, 'Second Nature', 'Seconde nature', 'Seconda natura', 'Segunda natureza', '本能', '本能'],
    [TAG, 'Very rare', 'Très rare', 'Rarissima', 'Muito rara', '极其稀有', '極其稀有'],
    [DESC, 'Your stat-boosting moves cast on their own from any slot, as if they were always active: no more switching to them.',
     'Tes capacités qui augmentent les stats se lancent seules depuis n’importe quel emplacement, comme si elles étaient toujours actives : plus besoin de passer dessus.',
     'Le tue mosse che aumentano le statistiche si attivano da sole da qualsiasi slot, come se fossero sempre attive: non serve più passare a loro.',
     'Seus golpes que aumentam atributos são usados sozinhos de qualquer espaço, como se estivessem sempre ativos: não precisa mais trocar para eles.',
     '你的提升能力的招式会从任意栏位自动施放，就像一直处于启用状态：不必再切换过去。',
     '你的提升能力的招式會從任意欄位自動施放，就像一直處於啟用狀態：不必再切換過去。'],
    [YOURS, 'Now:', 'Maintenant :', 'Ora:', 'Agora:', '现在：', '現在：']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  let force = false;          // admin menu: the next batch is sure to bring the card

  const buffs = pl => pl.moves.filter(m => m.kind === 'buff');

  function card(pl) {
    // Yours, already in your language (the whole sentence isn't in the dictionaries).
    const mine = buffs(pl).map(m => G.T(m.name, 'move'));
    return {
      w: 0, type: 'up', rare: true, key: 'rare:passive',
      icon: 'crown', color: '#c47bff', tag: TAG,
      title: TITLE, desc: DESC + (mine.length ? ' <b>' + G.I18n.t(YOURS) + ' ' + mine.join(', ') + '.</b>' : ''),
      apply: p => {
        p.passiveBuffs = true;
        G.FX.ring(p.x, p.y, 8, 140, '#c47bff', 0.9, 6);
        G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#e2c2ff', 50, 260);
        G.Audio.sfx('legend');
      }
    };
  }

  /** G.LevelUp.offer: sometimes swaps the last card for this one (if you have moves to use it with). */
  function maybe(pl, picked) {
    if (pl.passiveBuffs || !picked.length) return;
    if (!force && (Math.random() >= RATE || !buffs(pl).length)) return;
    force = false;
    picked[picked.length - 1] = card(pl);
  }

  return { RATE, maybe, forceNext() { force = true; } };
})();
