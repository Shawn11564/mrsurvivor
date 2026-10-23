/* ============ gacha-text.js — texts for the fork's soft pity (MrSurvivor) ============
 * The two lines in js/ui/gacha-ui.js for the soft pity in js/systems/gacha.js (from
 * pull 180 the Legendary chance rises 2 points per pull). Columns: Spanish, English, French,
 * Italian, Portuguese (Brazil), Simplified and Traditional Chinese, like js/fork/settings-text.js.
 */
(() => {
  const ROWS = [
    ['· Desde la tirada {x} sin Legendaria, su probabilidad sube {x} puntos por tirada.',
     '· Starting at pull {x} without a Legendary, the chance of one rises by {x} percentage points per pull.',
     '· À partir du tirage {x} sans Légendaire, sa probabilité augmente de {x} points par tirage.',
     '· Dal lancio {x} senza Leggendario, la sua probabilità sale di {x} punti a lancio.',
     '· A partir do giro {x} sem Lendário, a chance sobe {x} pontos percentuais por giro.',
     '· 连续第 {x} 抽起仍未获得传说，每抽传说概率提高 {x} 个百分点。',
     '· 連續第 {x} 抽起仍未獲得傳說，每抽傳說機率提高 {x} 個百分點。'],
    ['Legendaria en la próxima tirada: {x}%', 'Legendary chance on the next pull: {x}%',
     'Chance de Légendaire au prochain tirage : {x}%', 'Probabilità di Leggendario al prossimo lancio: {x}%',
     'Chance de Lendário no próximo giro: {x}%', '下一抽传说概率：{x}%', '下一抽傳說機率：{x}%']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));
})();
