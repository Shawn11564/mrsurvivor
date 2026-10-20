/* ============ coop-background.js — el anfitrión sigue con la pestaña oculta (MrSurvivor) ============
 * En grupo, el anfitrión mueve la partida de todos. Con su pestaña oculta (otra pestaña, otra
 * ventana encima, minimizada) el navegador deja de llamar a requestAnimationFrame y los
 * temporizadores van a 1 por segundo: el juego se paraba y js/net/coop.js avisaba a los demás
 * ("Pausa: esperando a … (anfitrión)"). Aquí, mientras el anfitrión de una partida en grupo
 * tiene la pestaña oculta, los fotogramas los marca un Worker (sus temporizadores no se
 * frenan en segundo plano), unos 40 por segundo, así que la partida sigue para todos.
 * coop.js ya no manda el aviso de pestaña oculta (keepsRunning). Si el anfitrión se queda de
 * verdad sin red, o el móvil congela la página entera, los demás siguen parándose por el aviso
 * de "no responde" de coop.js (stalled). Lo comprueba fork/test-coop-background.cjs.
 */
(() => {
  const native = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
  const TICK_MS = 25;                // < 1/30 s: frame() limita cada paso a 1/30 s, así va a velocidad real
  const behind = () => document.hidden && G.Coop && G.Coop.active && G.Coop.isHost;
  const jobs = new Map();           // id -> { run, nid }
  let nextId = 1, worker = null;

  function ensureWorker() {
    if (worker) return;
    try {
      // Archivo aparte (js/fork/tick-worker.js): la CSP de la página no deja crear Workers blob:.
      // Junto a los scripts del juego (js/app.min.js o js/game.js), también desde en/.
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

  // Al volver a la pestaña, lo que esperaba al Worker pasa al requestAnimationFrame de siempre.
  // Al ocultarse, lo que esperaba al de siempre (que ya no llegará) pasa al Worker.
  document.addEventListener('visibilitychange', () => {
    if (behind()) ensureWorker();
    else for (const j of jobs.values()) if (!j.nid) j.nid = native(j.run);
  });

  G.CoopBackground = {
    /** ¿Puede seguir la partida con la pestaña oculta? (coop.js no avisa entonces de que se ha ido) */
    get keepsRunning() { return typeof Worker === 'function'; }
  };
})();
