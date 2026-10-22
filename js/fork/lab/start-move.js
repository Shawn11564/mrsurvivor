/* ============ start-move.js — the starting move in Lab runs (MrSurvivor fork) ============
 * Upgrades → Starting move keeps two picks per Pokémon: save.pstart (upstream's, for normal runs)
 * and save.pstartLab (for Lab runs). With the Lab setting on (in the menus) or in a Lab run, the
 * picker lists the Lab list (G.Lab.poolFor: Pyro Ball for Scorbunny...) and writes the Lab pick.
 * A Lab run starts with its Lab pick, else the normal pick if the Lab list has it, else the default.
 * (Before, a Lab run checked the normal pick against the Lab list and silently dropped it, and the
 * picker never showed the Lab moves.)
 * Hooks: G.startChoices / G.startMoveOf (js/data/starters.js), a one-line hook in startPicker
 * (js/ui/menu.js), G.forkMerge (the newer copy's picks win, like pstart). Test: fork/test-start-move.cjs.
 *
 * The second starting move (Upgrades → Second starting move, with Repertorio) works the same way since
 * 2026-10-22 (plan D5): save.pstartLab2 next to upstream's pstart2 ('' = random, so the normal pick
 * doesn't come back), G.startMove2Of wrapped, a one-line hook in start2Picker. Before, the picker
 * listed the Lab list with Lab on and wrote upstream's pstart2, so a Lab-only pick was silently
 * dropped in normal runs (random instead), and a normal pick not in the Lab list in Lab runs.
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

  // ---- the second starting move (with Repertorio) ----
  const moveOf2 = G.startMove2Of;
  const bought2 = dex => { const s = G.DB.save, u = s && s.pupg && s.pupg[dex]; return !!(u && u.start2 && u.moves); };
  /** A Lab run's second move: its Lab pick ('' = random), else the normal pick if the Lab list has it, else random (null). */
  function labMove2Of(dex) {
    const s = G.DB.save;
    if (!bought2(dex)) return null;
    const ok = labChoices(dex).filter(id => id !== labMoveOf(dex)), lab = s.pstartLab2 && s.pstartLab2[dex];
    if (lab != null && (lab === '' || ok.includes(lab))) return lab || null;
    const n = s.pstart2 && s.pstart2[dex];
    return n && ok.includes(n) ? n : null;
  }
  G.startMove2Of = dex => on() ? labMove2Of(dex) : moveOf2(dex);

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

  /** The second-move picker with the Lab on (menu.js start2Picker hands over to this). */
  function picker2(dex, redraw, banList) {
    const s = G.DB.save, cur = labMove2Of(dex), first = labMoveOf(dex), normal = choices(dex);
    const name = id => G.T(G.Moves.BY_ID[id].name, 'move');
    const ids = labChoices(dex).filter(id => id !== first).sort((a, b) => name(a).localeCompare(name(b)));
    const el = document.createElement('div');
    el.className = 'panel ban-picker';
    el.innerHTML = `<p class="sub" style="margin:0 0 8px">Choose the second attack it starts <b>Lab runs</b> with (Lab mode is on; turn it off in Settings to choose for normal runs). You can change it any time, for free.</p>
      <div class="ban-moves"><button class="chip ${!cur ? 'on' : ''}" data-id="">Random</button>${ids.map(id => `<button class="chip ${id === cur ? 'on' : ''}" data-id="${id}">${G.Icons.html('move:' + id, 16)} ${name(id)}` +
        (!normal.includes(id) ? ' <small class="lab-only">LAB</small>' : '') + '</button>').join('')}</div>`;
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        s.pstartLab2 = s.pstartLab2 || {};
        s.pstartLab2[dex] = id;                        // '' (random) too: otherwise the normal pick would come back
        const l = banList(), i = id ? l.indexOf(id) : -1;   // the starting moves can't be banned
        if (i >= 0) l.splice(i, 1);
        G.DB.commit();
        G.Audio.sfx('select');
        G.UI.toast(id ? G.DEX_BY[dex].name + ' will also start Lab runs with ' + name(id) : 'Lab runs: the second attack will be random');
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
    r.pstartLab2 = Object.assign({}, older.pstartLab2 || {}, newer.pstartLab2 || {});
  };

  return { on, picker, picker2, choices: labChoices, moveOf: labMoveOf, moveOf2: labMove2Of };
})();
