/* ============ coop-background.js — the host keeps going with the tab hidden (MrSurvivor) ============
 * In a group, the host runs everyone's game. With their tab hidden (another tab, another
 * window on top, minimized) the browser stops calling requestAnimationFrame and
 * timers run at 1 per second: the game stopped and js/net/coop.js told the others
 * ("Pausa: esperando a … (anfitrión)", paused: waiting for the host). Here, while the host of a group
 * game has the tab hidden, frames are driven by a Worker (its timers aren't
 * slowed down in the background), about 40 per second, so the game goes on for everyone.
 * coop.js no longer sends the hidden-tab notice (keepsRunning). If the host really
 * loses the network, or the phone freezes the whole page, the others still stop through coop.js's
 * "not responding" notice (stalled). Checked by fork/test-coop-background.cjs.
 *
 * The pause menu's Continue button, in a group: there pausing doesn't stop the game (the state
 * stays 'playing') and game.js only resumed from 'paused', so it did nothing and only
 * Esc / P closed the menu. Now in a group it closes it (G.RunUI.wirePause, before G.Game.init).
 * Checked by fork/test-coop-pause.cjs.
 */
(() => {
  const native = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
  const TICK_MS = 25;                // < 1/30 s: frame() caps each step at 1/30 s, so it runs at real speed
  const behind = () => document.hidden && G.Coop && G.Coop.active && G.Coop.isHost;
  const jobs = new Map();           // id -> { run, nid }
  let nextId = 1, worker = null;

  function ensureWorker() {
    if (worker) return;
    try {
      // A separate file (js/fork/tick-worker.js): the page's CSP doesn't allow blob: Workers.
      // Next to the game scripts (js/app.min.js or js/game.js), also from en/.
      const own = document.querySelector('script[src*="app.min.js"], script[src*="js/game.js"]');
      worker = new Worker(new URL('fork/tick-worker.js', own ? own.src : location.href));
      worker.postMessage(TICK_MS);
      worker.onmessage = () => {
        if (!behind() || !jobs.size) return;
        const t = performance.now();
        for (const j of [...jobs.values()]) j.run(t);
      };
    } catch (e) { worker = null; }
  }

  window.requestAnimationFrame = function (fn) {
    const id = nextId++;
    const job = { run: t => { if (!jobs.delete(id)) return; fn(t); }, nid: 0 };
    jobs.set(id, job);
    if (behind()) ensureWorker();
    else job.nid = native(job.run);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    const j = jobs.get(id);
    if (!j) return;
    jobs.delete(id);
    if (j.nid) nativeCancel(j.nid);
  };

  // On returning to the tab, whatever was waiting on the Worker moves to the usual requestAnimationFrame.
  // On hiding, whatever was waiting on the usual one (which won't come now) moves to the Worker.
  document.addEventListener('visibilitychange', () => {
    if (behind()) ensureWorker();
    else for (const j of jobs.values()) if (!j.nid) j.nid = native(j.run);
  });

  const wirePause = G.RunUI.wirePause;
  G.RunUI.wirePause = function (onResume, onQuit) {
    return wirePause.call(this, () => {
      if (G.Coop.active && G.Game.state === 'playing' && G.UI.isOpen('scr-pause')) G.UI.hide('scr-pause');
      else onResume();
    }, onQuit);
  };

  G.CoopBackground = {
    /** Can the game keep going with the tab hidden? (if so, coop.js doesn't tell the others the host left) */
    get keepsRunning() { return typeof Worker === 'function'; }
  };
})();
