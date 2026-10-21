/* ============ resume.js — seguir la partida tras recargar (Lab primero, fork MrSurvivor) ============
 * En una partida Lab en solitario, cada 5 s (y al cerrar la pestaña) se guarda en este navegador
 * (localStorage ms.resume) lo que hace falta para seguirla: el tiempo, la semilla del mapa, dónde
 * estás, tu Pokémon (su forma de ahora), nivel y experiencia, vida, los multiplicadores (cartas,
 * mejoras, objeto, prestigio, Lab), las cartas cogidas, los movimientos con su nivel y si han
 * evolucionado, cómo están en los huecos, el objeto, los vínculos, las monedas recogidas y lo del Lab
 * (_lab*). En la grieta o ante Arceus no se guarda (vale la última de antes).
 * Al volver al menú con una guardada, un aviso: "Resume" la sigue (los enemigos empiezan de nuevo
 * a esa hora) y "End run" la sigue y la termina en el acto, con los premios de siempre (endRun).
 * Los tickets ya se guardaron al cogerlos: no vuelven a contar. Se borra al acabar la partida.
 * El reloj se pone con G.Game.debugTime (la marca no cuenta para el ranking; el Lab nunca cuenta).
 * En grupo no se puede: la partida es del anfitrión. Textos en inglés. Prueba: fork/test-resume.cjs.
 */
G.Resume = (() => {
  const KEY = 'ms.resume', EVERY = 5000;
  const PRIM = ['level', 'xp', 'xpNext', 'hp', 'maxHp', 'kills', 'bosses', 'coins', 'bonds', 'atkMul', 'spdMul', 'cdMul', 'dmgReduce',
    'regenFlat', 'magnet', 'xpMul', 'coinMul', 'critChance', 'rerolls', 'rerollBonus', 'maxMoves', 'selfRevive', 'prestige', 'passiveBuffs', 'x', 'y'];
  let seed = 1;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* nada */ } };
  const who = () => (G.DB.guest ? 'guest' : (G.DB.uid || (G.DB.fb && G.DB.fb.uid) || 'local'));

  const reset = G.World.reset;
  G.World.reset = function (s) { seed = (s | 0) || 1; return reset.apply(this, arguments); };

  function snap() {
    const pl = G.Game.player, st = G.Game.st;
    if (!pl || G.Game.state !== 'playing' || G.Coop.active || !(G.Lab && G.Lab.active) || G.Rift.inArena || (G.Judgment && G.Judgment.active) || pl.dead) return null;
    const p = {};
    for (const k of PRIM) if (pl[k] !== undefined) p[k] = pl[k];
    for (const k of Object.keys(pl)) if (k.startsWith('_lab')) { try { p[k] = JSON.parse(JSON.stringify(pl[k])); } catch (e) { /* nada */ } }
    const moves = pl.moves.map(m => ({ id: m.id, lvl: m.lvl, evolved: !!m.evolved }));
    return { v: 1, who: who(), at: Date.now(), dex: pl.mon.dex, shiny: !!pl.shiny, seed, time: st.time, p,
      statsTaken: Object.assign({}, pl.statsTaken), item: pl.item || null, banned: [...(pl.banned || [])],
      moves, slots: pl.slots.map(g => g.map(m => pl.moves.indexOf(m))), active: pl.active };
  }
  function save() {
    const s = snap();
    if (s) write(s);
    else if (G.Game.state === 'over' || G.Game.state === 'ui') {
      const old = read();
      if (old && G.Game.state === 'over') write(null);          // la partida se acabó: nada que seguir
    }
  }
  setInterval(save, EVERY);
  addEventListener('beforeunload', () => { const s = snap(); if (s) write(s); });

  /** Seguir la guardada (end: y terminarla en el acto). */
  function resume(end = false) {
    const s = read();
    if (!s || s.who !== who() || !G.DEX_BY[s.dex]) { write(null); return false; }
    G.Settings.set('lab', true);
    G.UI.hideAll();
    G.Game.startRun(null, { dex: s.dex, shiny: s.shiny });
    const pl = G.Game.player;
    G.World.reset(s.seed);
    G.Game.debugTime(s.time);
    Object.assign(pl, s.p);
    pl.statsTaken = Object.assign({}, s.statsTaken);
    pl.banned = new Set(s.banned || []);
    pl.item = s.item && G.Items.BY[s.item] ? s.item : null;        // sus efectos ya van en los multiplicadores
    pl.moves.length = 0; pl.slots.length = 0;
    const ms = s.moves.map(m => { const i = G.Moves.instance(m.id, m.lvl); if (m.evolved) G.Moves.evolve(i); return i; });
    ms.forEach(m => pl.moves.push(m));
    for (const g of s.slots) pl.slots.push(g.map(i => ms[i]).filter(Boolean));
    pl.active = Math.min(s.active | 0, Math.max(0, pl.slots.length - 1));
    pl.t1 = 0; pl.t10 = 0;                                          // ya guardados al cogerlos
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    write(null);
    if (end) G.Game.quit();
    else G.Spawner.say('Run resumed', 2.4, true);
    return true;
  }

  // ---------------- el aviso en el menú ----------------
  function offer() {
    const s = read();
    if (!s || s.who !== who() || G.Game.state !== 'ui' || document.getElementById('resume-box')) return;
    const mon = G.DEX_BY[s.dex];
    if (!mon) { write(null); return; }
    const box = document.createElement('div');
    box.id = 'resume-box';
    box.className = 'panel';
    box.setAttribute('translate', 'no');
    box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;padding:16px 18px;min-width:280px;text-align:center';
    box.innerHTML = `<b>Unfinished Lab run</b><div style="margin:6px 0 12px;color:var(--muted)">${G.Lab.esc(mon.name)} · ${G.U.mmss(s.time)} · level ${s.p.level}</div>
      <div style="display:flex;gap:8px;justify-content:center"><button class="btn gold" data-r>Resume</button><button class="btn" data-e>End run</button></div>`;
    document.body.appendChild(box);
    box.querySelector('[data-r]').onclick = () => { box.remove(); resume(false); };
    box.querySelector('[data-e]').onclick = () => { box.remove(); resume(true); };
  }
  const show = G.UI.show;
  G.UI.show = function (id) { const r = show.apply(this, arguments); if (id === 'scr-menu') setTimeout(offer, 300); return r; };

  return { snap, save, resume, offer, read, KEY };
})();
