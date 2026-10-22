/* ============ resume.js — carry on with the run after a reload (Lab first, MrSurvivor fork) ============
 * In a solo Lab run, every 5 s (and when the tab closes) this browser saves (localStorage
 * ms.resume) what it takes to carry on: the time, the map seed, where you
 * are, your Pokémon (its current form), level and experience, HP, the multipliers (cards,
 * upgrades, item, prestige, Lab), the cards taken, the moves with their level and whether they have
 * evolved, how they sit in the slots, the item, the bonds, the coins picked up and the Lab state
 * (_lab*). Nothing is saved in the rift or against Arceus (the last save from before stands).
 * Back at the menu with a saved run, a prompt: "Resume" carries on (the enemies start over
 * at that time) and "End run" just forgets it: you stay on the menu and no run starts (no summary
 * and no end-of-run coins; tickets were banked when picked up, so those stay).
 * Tickets were already saved when picked up: they don't count again. The save is deleted when the run ends:
 * the moment you fall and when the summary shows (see below), so a reload after that offers nothing.
 * The clock is set with G.Game.debugTime (the time doesn't count for the ranking; Lab never counts).
 * Not in co-op: the run belongs to the host. Texts in English. Test: fork/test-resume.cjs.
 */
G.Resume = (() => {
  const KEY = 'ms.resume', EVERY = 5000;
  const PRIM = ['level', 'xp', 'xpNext', 'hp', 'maxHp', 'kills', 'bosses', 'coins', 'bonds', 'atkMul', 'spdMul', 'cdMul', 'dmgReduce',
    'regenFlat', 'magnet', 'xpMul', 'coinMul', 'critChance', 'rerolls', 'rerollBonus', 'maxMoves', 'selfRevive', 'prestige', 'passiveBuffs', 'x', 'y'];
  let seed = 1;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* nothing */ } };
  const who = () => (G.DB.guest ? 'guest' : (G.DB.uid || (G.DB.fb && G.DB.fb.uid) || 'local'));

  const reset = G.World.reset;
  G.World.reset = function (s) { seed = (s | 0) || 1; return reset.apply(this, arguments); };

  function snap() {
    const pl = G.Game.player, st = G.Game.st;
    if (!pl || G.Game.state !== 'playing' || G.Coop.active || !(G.Lab && G.Lab.active) || G.Rift.inArena || (G.Judgment && G.Judgment.active) || pl.dead) return null;
    const p = {};
    for (const k of PRIM) if (pl[k] !== undefined) p[k] = pl[k];
    for (const k of Object.keys(pl)) if (k.startsWith('_lab')) { try { p[k] = JSON.parse(JSON.stringify(pl[k])); } catch (e) { /* nothing */ } }
    // br: its branch (js/fork/lab/branches.js), rebuilt by G.Moves.instance's third argument.
    const moves = pl.moves.map(m => ({ id: m.id, lvl: m.lvl, evolved: !!m.evolved, br: m.branch || undefined }));
    return { v: 1, who: who(), at: Date.now(), dex: pl.mon.dex, shiny: !!pl.shiny, seed, time: st.time, p,
      statsTaken: Object.assign({}, pl.statsTaken), item: pl.item || null, banned: [...(pl.banned || [])],
      moves, slots: pl.slots.map(g => g.map(m => pl.moves.indexOf(m))), active: pl.active };
  }
  function save() {
    const s = snap();
    if (s) write(s);
    else if (G.Game.state === 'over' || G.Game.state === 'ui') {
      const old = read();
      if (old && G.Game.state === 'over') write(null);          // the run is over: nothing to carry on
    }
  }
  setInterval(save, EVERY);
  addEventListener('beforeunload', () => { const s = snap(); if (s) write(s); });

  // A run that ended can't be carried on, even when the page reloads before the next save (an update
  // reloads on the summary or the menu at once): it's forgotten the moment you fall (unless the Revive
  // card gets you up in that same hit; falling in the rift arena only sends you back) and when the
  // summary shows (quitting too).
  const solo = pl => pl && pl === G.Game.player && !pl.remote && !pl.uid && !G.Coop.active;
  const P = G.Player.prototype, hurt = P.hurt;
  P.hurt = function () {
    const was = this.dead, r = hurt.apply(this, arguments), pl = this;
    if (!was && pl.dead && solo(pl) && !G.Rift.inArena) queueMicrotask(() => { if (pl.dead) write(null); });
    return r;
  };
  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function () { if (solo(G.Game.player)) write(null); return showOver.apply(this, arguments); };

  /** Carry on with the saved run. */
  function resume() {
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
    pl.item = s.item && G.Items.BY[s.item] ? s.item : null;        // its effects are already in the multipliers
    pl.moves.length = 0; pl.slots.length = 0;
    const ms = s.moves.map(m => { const i = G.Moves.instance(m.id, m.lvl, m.br); if (m.evolved) G.Moves.evolve(i); return i; });
    ms.forEach(m => pl.moves.push(m));
    for (const g of s.slots) pl.slots.push(g.map(i => ms[i]).filter(Boolean));
    pl.active = Math.min(s.active | 0, Math.max(0, pl.slots.length - 1));
    pl.t1 = 0; pl.t10 = 0;                                          // already saved when picked up
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    write(null);
    G.Spawner.say('Run resumed', 2.4, true);
    return true;
  }
  /** End the saved run without going back in: it's just forgotten. */
  function end() { write(null); }

  // ---------------- the prompt in the menu ----------------
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
    box.querySelector('[data-r]').onclick = () => { box.remove(); resume(); };
    box.querySelector('[data-e]').onclick = () => { box.remove(); end(); };
  }
  const show = G.UI.show;
  G.UI.show = function (id) { const r = show.apply(this, arguments); if (id === 'scr-menu') setTimeout(offer, 300); return r; };

  return { snap, save, resume, end, offer, read, KEY };
})();
