/* ============ cloud-backup.js — the cloud saves on its own (MrSurvivor) ============
 * Upstream (20-10-2026) only uploads the save to the cloud with the Save button, before an
 * update and on sign-out. Meanwhile everything stays in the browser, but if the browser
 * clears the site's data (iPhone Safari does it after 7 days away, clearing data,
 * a private window) before Save is pressed, that progress was lost. So here it also uploads:
 *   - on its own, EVERY after the first change not yet uploaded
 *   - when the tab is hidden or closed (switching apps on a phone), if anything is not uploaded
 * Each upload merges in what's in the cloud (pushNow in js/core/db.js), so two devices don't
 * overwrite each other. Cost: 1 read + 1 write per upload, never two within 65 s (MIN_GAP),
 * and nothing if nothing changed. Checked by fork/test-cloud-backup.cjs.
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
