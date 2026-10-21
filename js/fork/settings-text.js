/* ============ settings-text.js — texts for the fork's settings (MrSurvivor) ============
 * The "Cuenta atrás al quitar la pausa" (Countdown after pausing) row (pauseCount, js/ui/settings-ui.js; used by
 * resumeRun in js/game.js). Columns: Spanish, English, French, Italian, Portuguese (Brazil),
 * Simplified and Traditional Chinese, like js/fork/mega.js.
 */
(() => {
  const ROWS = [
    ['Cuenta atrás al quitar la pausa', 'Countdown after pausing', 'Compte à rebours après la pause', 'Conto alla rovescia dopo la pausa',
     'Contagem regressiva após a pausa', '取消暂停后倒计时', '取消暫停後倒數'],
    ['Al volver de la pausa, 3 segundos con todo quieto antes de seguir. Las demás cuentas atrás (vínculos, objetos) no cambian.',
     'When you leave the pause menu, 3 seconds with everything frozen before play goes on. The other countdowns (bonds, items) stay.',
     'En quittant la pause, 3 secondes avec tout figé avant de reprendre. Les autres comptes à rebours (liens, objets) restent.',
     'Uscendo dalla pausa, 3 secondi con tutto fermo prima di riprendere. Gli altri conti alla rovescia (legami, strumenti) restano.',
     'Ao sair da pausa, 3 segundos com tudo parado antes de continuar. As outras contagens (vínculos, itens) continuam.',
     '退出暂停时，先静止3秒再继续。其他倒计时（羁绊、道具）不变。',
     '退出暫停時，先靜止3秒再繼續。其他倒數（羈絆、道具）不變。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));
})();
