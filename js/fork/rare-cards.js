/* ============ rare-cards.js — cartas de nivel muy raras (fork MrSurvivor) ============
 * Segunda naturaleza: muy de vez en cuando (RATE por cada tanda de cartas, también al
 * cambiarlas) la última carta es esta, si tienes algún movimiento que sube stats (los de
 * tipo 'buff': Danza Espada, Maquinación, Agilidad...). Desde que la eliges, esos
 * movimientos se lanzan solos desde cualquier hueco, cada uno con su recarga, como si
 * siempre estuvieran activos: ya no hay que cambiar a ellos. También los que aprendas
 * después. Una vez por partida.
 * Ganchos: G.LevelUp.offer (maybe), Combat.tick (pl.passiveBuffs), RunUI.renderCards (.card.rare).
 * Prueba: fork/test-gameplay.cjs.
 */
G.RareCards = (() => {
  const RATE = 1 / 500;
  const TITLE = 'Segunda naturaleza', TAG = 'Muy rara';
  const DESC = 'Tus movimientos que suben stats se lanzan solos desde cualquier hueco, como si siempre estuvieran activos: ya no hace falta cambiar a ellos.';
  const YOURS = 'Ahora:';
  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
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

  let force = false;          // menú de admin: la próxima tanda trae la carta seguro

  const buffs = pl => pl.moves.filter(m => m.kind === 'buff');

  function card(pl) {
    // Los tuyos, ya en tu idioma (la frase entera no está en los diccionarios).
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

  /** G.LevelUp.offer: a veces cambia la última carta por esta (si tienes con qué usarla). */
  function maybe(pl, picked) {
    if (pl.passiveBuffs || !picked.length) return;
    if (!force && (Math.random() >= RATE || !buffs(pl).length)) return;
    force = false;
    picked[picked.length - 1] = card(pl);
  }

  return { RATE, maybe, forceNext() { force = true; } };
})();
