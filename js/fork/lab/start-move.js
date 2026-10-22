/* ============ start-move.js — the starting move in Lab runs (MrSurvivor fork) ============
 * Upgrades → Starting move keeps two picks per Pokémon: save.pstart (upstream's, for normal runs)
 * and save.pstartLab (for Lab runs). With the Lab setting on (in the menus) or in a Lab run, the
 * picker lists the Lab list (G.Lab.poolFor: Pyro Ball for Scorbunny...) and writes the Lab pick.
 * A Lab run starts with its Lab pick, else the normal pick if the Lab list has it, else the default.
 * (Before, a Lab run checked the normal pick against the Lab list and silently dropped it, and the
 * picker never showed the Lab moves.)
 * Hooks: G.startChoices / G.startMoveOf (js/data/starters.js), a one-line hook in startPicker
 * (js/ui/menu.js), G.forkMerge (the newer copy's picks win, like pstart). Test: fork/test-start-move.cjs.
 */
G.LabStart = (() => {
  const choices = G.startChoices, moveOf = G.startMoveOf;
  let starting = false;                              // inside G.Game.startRun

  /** Lab picks? While a run starts or goes on: whether it's a Lab run. In the menus: the Lab setting. */
  function on() {
    const idle = !starting && ['ui', 'over'].includes(G.Game.state);
    return idle ? !!G.Settings.get('lab') : !!G.Lab.active;
  }
  const bought = dex => { const s = G.DB.save; return !!(s && s.pupg && s.pupg[dex] && s.pupg[dex].start); };

  /** What a Lab run can start with: its Lab list without boosters, and always the default. */
  function labChoices(dex) {
    const ids = G.Lab.poolFor(G.DEX_BY[dex]).filter(id => G.Moves.BY_ID[id] && G.Moves.BY_ID[id].kind !== 'buff');
    const base = G.baseStartOf(dex);
    if (!ids.includes(base)) ids.push(base);
    return ids;
  }
  function labMoveOf(dex) {
    const s = G.DB.save, ok = labChoices(dex);
    if (bought(dex)) for (const id of [s.pstartLab && s.pstartLab[dex], s.pstart && s.pstart[dex]]) if (id && ok.includes(id)) return id;
    return G.baseStartOf(dex);
  }
  G.startChoices = dex => on() ? labChoices(dex) : choices(dex);
  G.startMoveOf = dex => on() ? labMoveOf(dex) : moveOf(dex);

  document.addEventListener('DOMContentLoaded', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function () {
      starting = true;
      try { return startRun.apply(this, arguments); } finally { starting = false; }
    };
  });

  /** The picker with the Lab on (menu.js startPicker hands over to this). redraw = renderUpgrades. */
  function picker(dex, redraw, banList) {
    const s = G.DB.save, cur = G.startMoveOf(dex), base = G.baseStartOf(dex), normal = choices(dex);
    const name = id => G.T(G.Moves.BY_ID[id].name, 'move');
    const ids = labChoices(dex).sort((a, b) => name(a).localeCompare(name(b)));
    const el = document.createElement('div');
    el.className = 'panel ban-picker';
    el.innerHTML = `<p class="sub" style="margin:0 0 8px">Choose which attack it starts <b>Lab runs</b> with (Lab mode is on; turn it off in Settings to choose for normal runs). You can change it any time, for free.</p>
      <div class="ban-moves">${ids.map(id => `<button class="chip ${id === cur ? 'on' : ''}" data-id="${id}">${G.Icons.html('move:' + id, 16)} ${name(id)}` +
        (id === base ? ' <small>(default)</small>' : !normal.includes(id) ? ' <small class="lab-only">LAB</small>' : '') + '</button>').join('')}</div>`;
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        s.pstartLab = s.pstartLab || {};
        s.pstartLab[dex] = id;                         // the default too: otherwise the normal pick would come back
        const l = banList(), i = l.indexOf(id);        // the starting move can't be banned
        if (i >= 0) l.splice(i, 1);
        G.DB.commit();
        G.Audio.sfx('select');
        G.UI.toast(G.DEX_BY[dex].name + ' will start Lab runs with ' + name(id));
        redraw();
      };
    });
    return el;
  }

  const merge = G.forkMerge;
  G.forkMerge = function (r, a, b) {
    if (merge) merge.apply(this, arguments);
    const newer = (a.updated || 0) >= (b.updated || 0) ? a : b, older = newer === a ? b : a;
    r.pstartLab = Object.assign({}, older.pstartLab || {}, newer.pstartLab || {});
  };

  return { on, picker, choices: labChoices, moveOf: labMoveOf };
})();
