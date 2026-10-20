/* ============ cloud-backup.js — la nube se guarda sola (MrSurvivor) ============
 * Upstream (20-10-2026) sólo sube la partida a la nube con el botón Guardar, antes de una
 * actualización y al cerrar sesión. Todo queda en el navegador mientras, pero si el navegador
 * borra los datos del sitio (Safari de iPhone lo hace tras 7 días sin entrar, borrar datos,
 * una ventana privada) antes de pulsar Guardar, ese progreso se perdía. Aquí, además:
 *   - EVERY después del primer cambio sin subir, se sube solo
 *   - al ocultar o cerrar la pestaña (cambiar de app en el móvil), si hay algo sin subir
 * Cada subida junta lo de la nube (pushNow en js/core/db.js), así que dos aparatos no se
 * pisan. Gasto: 1 lectura + 1 escritura por subida, nunca dos en menos de 65 s (MIN_GAP),
 * y nada si no ha cambiado nada. Lo comprueba fork/test-cloud-backup.cjs.
 */
(() => {
  const EVERY = 10 * 60 * 1000;
  let timer = 0;
  const cloud = () => G.DB.mode === 'cloud' && !G.DB.guest;

  function backup() {
    clearTimeout(timer); timer = 0;
    if (cloud() && G.DB.syncState === 'pending') G.DB.flush();
  }

  G.DB.onSync(state => {
    if (state === 'pending' && !timer && cloud()) timer = setTimeout(backup, EVERY);
    else if (state === 'ok') { clearTimeout(timer); timer = 0; }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backup(); });
  addEventListener('pagehide', backup);
  G.CloudBackup = { EVERY, backup };
})();
