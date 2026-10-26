/* ============ run-record.js — every run reaches the leaderboard, even if the tab closes (MrSurvivor) ============
 * A run goes on the leaderboard when it ends (js/game.js endRun: falling, Quit run, End run, a co-op end),
 * if it's clean (game.js clean(): the anti-cheat). Closing the tab or reloading mid-run never got there, and
 * a submission still on its way when the tab closed was lost. Here, for a signed-in player's run (solo, or a
 * group run from its host, who sends group runs), this browser keeps its record in localStorage (ms.runrec):
 *   - every 5 s, and when the page hides or closes: the time, level and kills so far (only while the run is
 *     clean; a run tainted since loses its record),
 *   - when the run ends and is sent (G.Ranking.submitSolo / submitGroup): that final record, until the
 *     server has it.
 * Whatever is left is sent on the next visit, once signed in (to the board the record names: lab.js
 * keeps r.lab, so a Lab mode run, js/fork/lab/worlds.js, stays on the Lab boards). A run resumed after a reload (js/fork/lab/resume.js) counts as well when it ends.
 * Loaded before js/fork/lab/lab.js, so lab.js's wrapper of the submissions sits outside this one.
 * Checked by fork/test-run-record.cjs.
 */
G.RunRecord = (() => {
  const KEY = 'ms.runrec', EVERY = 5000;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* full */ } };
  const who = () => (G.DB && G.DB.mode === 'cloud' && G.DB.fb && G.DB.fb.uid) || null;
  const inRun = () => !!G.Game.player && !['ui', 'over'].includes(G.Game.state);

  let of = null, id = null;            // the run being recorded (its player) and its id
  let sending = null;                  // the id whose record is on its way to the server
  const runId = pl => { if (pl !== of) { of = pl; id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); } return id; };

  /** This run's record so far, or null (no run, not signed in, a guest in a group, or not clean). */
  function snap() {
    const pl = G.Game.player, uid = who();
    if (!inRun() || !uid) return null;
    const group = !!pl.uid;
    if (group && !pl.coopHost) return null;              // a group run goes up from its host
    const rid = runId(pl);
    if (!G.Game.isClean || !G.Game.isClean()) return { id: rid, tainted: true };
    const r = { t: Math.floor(G.Game.st.time), lv: pl.level, kills: pl.kills, lab: !!(G.Worlds && G.Worlds.on) };   // lab: a Lab mode run
    if (group) r.members = G.RunAppearance.members();
    else Object.assign(r, G.RunAppearance.of(pl));
    return { id: rid, who: uid, at: Date.now(), group, r };
  }
  function keep() {
    const s = snap();
    if (!s) return;
    if (s.tainted) { const old = read(); if (old && old.id === s.id) write(null); return; }
    write(s);
  }

  // The run's own end: its final record stays until the server has it.
  for (const k of ['submitSolo', 'submitGroup']) {
    const f = G.Ranking[k];
    G.Ranking[k] = function (r) {
      const p = f.apply(this, arguments);
      if (sending || !of || G.Game.player !== of || G.Game.state !== 'over' || !who()) return p;
      const rec = { id, who: who(), at: Date.now(), group: k === 'submitGroup', r: Object.assign({}, r), final: true };
      write(rec);
      sending = rec.id;
      Promise.resolve(p).then(() => { const old = read(); if (old && old.id === rec.id) write(null); }, () => {})
        .finally(() => { if (sending === rec.id) sending = null; });
      return p;
    };
  }
  // The end screen of a run that wasn't sent (not clean, too short, a guest...): nothing to keep.
  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function () {
    const old = read();
    if (old && old.id === id && sending !== id) write(null);
    return showOver.apply(this, arguments);
  };

  /** A record left by a run that didn't finish here (the tab closed, or its submission was cut off): send it. */
  function flush() {
    const old = read();
    if (!old || !old.r || sending || inRun() || old.who !== who() || !G.DB.online || !G.Social.me) return;
    if (old.id === id && !old.final) return;             // (this page's own run, ended normally: its end sends it)
    sending = old.id;
    const p = old.group ? G.Ranking.submitGroup(Object.assign({}, old.r)) : G.Ranking.submitSolo(Object.assign({}, old.r));
    Promise.resolve(p).then(() => { const now = read(); if (now && now.id === old.id) write(null); }, () => {})
      .finally(() => { if (sending === old.id) sending = null; });
  }

  setInterval(() => { if (inRun()) keep(); else flush(); }, EVERY);
  addEventListener('pagehide', keep);
  addEventListener('beforeunload', keep);
  document.addEventListener('visibilitychange', () => { if (document.hidden) keep(); });
  const open = G.MenuUI.open;
  G.MenuUI.open = function () { const r = open.apply(this, arguments); setTimeout(flush, 1500); return r; };

  return { KEY, read, flush };
})();
