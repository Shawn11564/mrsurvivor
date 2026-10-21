/* ============ gacha-text.js — textos del pity blando del fork (MrSurvivor) ============
 * Las dos líneas de js/ui/gacha-ui.js para el pity blando de js/systems/gacha.js (desde la
 * tirada 180 la Legendaria sube 2 puntos por tirada). Columnas: español, inglés, francés,
 * italiano, portugués (Brasil), chino simplificado y tradicional, como js/fork/settings-text.js.
 */
(() => {
  const ROWS = [
    ['· Desde la tirada {x} sin Legendaria, su probabilidad sube {x} puntos por tirada.',
     '· From pull {x} without a Legendary, its chance rises by {x} percentage points per pull.',
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
