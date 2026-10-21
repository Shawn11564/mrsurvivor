/* ============ buff-evos.js — evolution of the stat-boosting moves (MrSurvivor fork) ============
 * Moves that raise stats (Danza Espada, Maquinación...) evolve on reaching
 * max level, with no condition (G.Moves.EVO and EVO_MODS.buff in js/data/moves.js): from
 * then on they cast on their own from any slot (m.passive, see Combat.tick) and stack
 * one more time. Only the texts are here: the evolved names (real moves
 * that raise stats) and what it gains. Test: fork/test-gameplay.cjs.
 */
(() => {
  const EFFECT = 'Se lanza solo desde cualquier hueco (ya no hace falta cambiar a él) y +1 acumulación';
  // Columns: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const NAMES = [
    ['Tambor', 'Belly Drum', 'Cognobidon', 'Panciamburo', 'Belly Drum', '腹鼓', '腹鼓'],
    ['Danza Aleteo', 'Quiver Dance', 'Papillodanse', 'Eledanza', 'Quiver Dance', '蝶舞', '蝶舞'],
    ['Pulimento', 'Rock Polish', 'Poliroche', 'Lucidatura', 'Rock Polish', '岩石打磨', '岩石打磨'],
    ['Defensa Férrea', 'Iron Defense', 'Mur de Fer', 'Ferroscudo', 'Iron Defense', '铁壁', '鐵壁'],
    ['Arraigo', 'Ingrain', 'Racines', 'Radicamento', 'Ingrain', '扎根', '紮根'],
    ['Corpulencia', 'Bulk Up', 'Gonflette', 'Granfisico', 'Bulk Up', '健美', '健美']
  ];
  const TEXT = [
    [EFFECT, 'Casts on its own from any slot (no more switching to it) and +1 max stack',
     'Se lance seul depuis n’importe quel emplacement (plus besoin de passer dessus) et +1 cumul',
     'Si attiva da solo da qualsiasi slot (non serve più passare a lui) e +1 accumulo',
     'É usado sozinho de qualquer espaço (não precisa mais trocar para ele) e +1 acúmulo',
     '从任意栏位自动施放（不必再切换过去），叠加上限+1',
     '從任意欄位自動施放（不必再切換過去），疊加上限+1']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => {
    const names = Object.fromEntries(NAMES.map(r => [r[0], r[i + 1]]));
    G.I18n.add(names, l);
    G.I18n.add(names, l, 'move');          // G.T(name, 'move'): cards and HUD
    G.I18n.add(Object.fromEntries(TEXT.map(r => [r[0], r[i + 1]])), l);
  });
})();
