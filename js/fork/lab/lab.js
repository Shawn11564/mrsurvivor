/* ============ lab.js — Lab mode: moves and abilities being tested (MrSurvivor fork) ============
 * Plan, decisions and status: fork/LAB.md. Tests: fork/test-lab.cjs and fork/test-lab-coop.cjs (group).
 *
 * Setting: Settings → Experimental (G.Settings 'lab', per device; this file adds the tab
 * and settingsRow draws its content from js/ui/settings-ui.js). Each run decides when it starts (begin):
 *   - solo: your setting
 *   - group: the HOST's, sent in its 'start' message (lab, labV); the guests' setting
 *     doesn't count. If its labV isn't yours, a notice to reload.
 * G.Lab.active: a Lab run is under way (with a Pokémon). Outside a run it's false, so
 * the menus (starting move, veto, collection) always see the normal game and nothing from the Lab
 * is ever stored in the saved run.
 *
 * In a Lab run:
 *   - G.Moves.poolFor(mon) gives its Lab list (poolFor, below): what it learns in the games.
 *   - its ability (js/fork/lab/abilities.js)
 *   - it goes on the Lab leaderboard, never the regular one (the Lab boards in js/net/ranking.js:
 *     submitSolo / submitGroup get lab: true, below), and doesn't count for achievements or records: the
 *     G.Progress notices are muted and save.stats goes back to how it was at the end. Missions,
 *     coins, tickets and shinies do count (missions() below). Test: fork/test-lab-missions.cjs.
 *   - "LAB" on the HUD, its ability and its list in the pause menu, and a note on the final summary.
 * Co-op lobby: the host sends { k:'lab', on, v } to each player on connecting and when
 * the setting changes (only over the direct connection between players), and the lobby shows it.
 *
 * Everything hooks in from here (wrapping functions the game calls as G.X.y); upstream's
 * files only have one line, in settings-ui.js.
 */
G.Lab = (() => {
  const D = G.LabData;
  const $ = id => document.getElementById(id);
  let run = false;                      // is the current run a Lab run? (begin)
  let stats0 = null;                    // save.stats at the start (restoreStats)
  let info = null;                      // its ability: G.LabAbilities.of
  const hostLab = new Map();            // host uid -> { on, v } (group lobby)
  const active = () => run && !!(G.Game && G.Game.player);

  // ---------------- moves that only exist in the Lab ----------------
  // Upgrades: those of its new family (js/fork/lab/kinds.js) or those of a game move of the same family.
  const BALLS = ['projectile', 'homing', 'bounce'];
  for (const d of G.LabMoves) {
    const like = G.Moves.ALL.find(m => m.kind === d.kind);
    const ups = d.ups || G.LabKinds.LADDERS[d.kind] || (like && like.ups);
    if (!ups) { console.warn('[Lab] no move of kind ' + d.kind + ' to copy upgrades from: ' + d.id); continue; }
    const m = Object.assign({}, d, { lab: true, ups, maxLvl: ups.length + 1 });
    delete m.evo;
    if (BALLS.includes(m.kind)) { if (m.count == null) m.count = 1; if (m.spread == null) m.spread = 0.12; }
    G.Moves.BY_ID[m.id] = m;
    // Signatures evolve just by reaching max level ("Blast Burn ★"), like the boosters:
    // without evolving, they fell far behind late in the run (fork/balance-lab.cjs).
    if (d.evo) G.Moves.EVO[m.id] = d.evo;
    else if (d.sig) G.Moves.EVO[m.id] = [d.name + ' ★', null];
    // Phase 8: promote = it moves to the normal game (cards, starting move, veto). Signatures, only to their line (poolFor).
    if (d.promote && !d.sig) { G.Moves.ALL.push(m); (G.Moves.POOL[m.type] = G.Moves.POOL[m.type] || []).push(m.id); }
  }
  // Its own look (look) wins over its type's.
  const forMove = G.VFX.forMove;
  G.VFX.forMove = m => m && m.look ? Object.assign(forMove(m), m.look) : forMove(m);

  // Version of the Lab content: if the host's isn't yours, you wouldn't both see the same thing.
  const VERSION = (() => {
    const s = JSON.stringify([G.LabMoves, D.MOVES, Object.keys(G.LabAbilities.DEF)]);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  })();

  // ---------------- signature moves (phase 5) ----------------
  // SIG[dex]: its own (lab-moves.js sig). The evolution chain comes from G.LabData.fam/evo.
  const SIG = {};
  (() => {
    const byFam = {};
    for (const d in D.fam) (byFam[D.fam[d]] = byFam[D.fam[d]] || []).push(+d);
    const line = d => byFam[D.fam[d]] || [d];
    for (const m of G.LabMoves) {
      if (!m.sig || !G.Moves.BY_ID[m.id]) continue;
      const who = m.sig.dex || (m.sig.line ? line(m.sig.line) : (m.sig.final || []).flatMap(r => line(r).filter(d => !D.evo[d])));
      for (const d of who) (SIG[d] = SIG[d] || []).push(m.id);
    }
  })();
  const isSig = id => !!(G.Moves.BY_ID[id] && G.Moves.BY_ID[id].sig);

  // ---------------- each species' move list (phase 2) ----------------
  const MIN_OWN = 4, MIN_TOTAL = 6, MAX_COVER = 2;
  // Support: they don't count as coverage (they don't hit, or not as another type).
  const SUPPORT = new Set(['buff', 'guard', 'weather', 'terrain', 'metronome', 'transform', 'heal', 'screen', 'shout', 'endure', 'ally']);
  const HOW = ['lv', 'egg', 'tutor', 'tm'];
  const SCORE = { lv: 3, egg: 2, tutor: 2, tm: 1 };
  const learnCache = {}, poolCache = {};

  /** → { id: 'lv' | 'egg' | 'tutor' | 'tm' } with what it learns in the games (G.LabData.learn). */
  function learnOf(dex) {
    if (learnCache[dex]) return learnCache[dex];
    const out = {};
    (D.learn[dex] || '').split('|').forEach((g, i) => {
      for (const x of g.split(',')) {
        const id = x && D.MOVES[parseInt(x, 36)];
        if (id && G.Moves.BY_ID[id]) out[id] = HOW[i];
      }
    });
    return (learnCache[dex] = out);
  }

  /** Fixed randomness per species (each Pokémon always gets the same list). */
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Moves of one type: the game's and the Lab's (without signatures, which belong to each line, nor the
   *  co-op support moves, which only come on support.js's co-op cards). */
  function ofType(t) {
    return (G.Moves.POOL[t] || []).concat(G.LabMoves.filter(m => m.type === t && !m.sig && !m.coop && G.Moves.BY_ID[m.id]).map(m => m.id));
  }
  const labOnly = id => !!G.Moves.BY_ID[id].lab;

  /**
   * What it can learn in a Lab run:
   *   - the Normal-type moves it learns in the games
   *   - the moves of its own types that it learns; if fewer than MIN_OWN, topped up with others of its types
   *   - up to MAX_COVER moves of other types it learns (coverage), each of a different type: first those
   *     learned by level, then egg or tutor, then TM; and first those on its stronger side
   *   - if still fewer than MIN_TOTAL, more of its types and then Normal type
   *   - and its signature moves (SIG), always
   * Normal-type moves that only exist in the Lab (Protect, Double-Edge...) count only if it
   * learns them by level, egg or tutor: almost everyone learns them by TM.
   * Fixed per species (rng(dex)): Charmander always learns the same.
   * Scored on the species itself (G.DEX_BY), never on a copy with its nature applied (G.Mons.monFor):
   * the nature shifts which side fits, and the first copy asked for used to fix the list for the
   * whole session, so the picker and the run could disagree (fork/test-lab-pools.cjs).
   */
  function labPool(mon) {
    if (poolCache[mon.dex]) return poolCache[mon.dex].slice();
    mon = G.DEX_BY[mon.dex] || mon;
    const L = learnOf(mon.dex), r = rng(mon.dex);
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const ownAll = [...new Set(mon.types.flatMap(ofType))];
    const out = new Set(ofType('normal').filter(id => L[id] && !(labOnly(id) && L[id] === 'tm')));
    const own = ownAll.filter(id => L[id]);
    own.forEach(id => out.add(id));
    for (const id of shuffle(ownAll.filter(id => !L[id]))) { if (own.length >= MIN_OWN) break; own.push(id); out.add(id); }
    const cover = Object.keys(L)
      .map(id => G.Moves.BY_ID[id])
      .filter(m => m.type !== 'normal' && !mon.types.includes(m.type) && !SUPPORT.has(m.kind) && !m.sig)
      .map(m => [m, SCORE[L[m.id]] + (G.Stats.fit(mon, m.cat) >= 0.95 ? 2 : 0) + r() * 0.5])
      .sort((a, b) => b[1] - a[1]);
    const types = new Set();
    for (const [m] of cover) {
      if (types.size >= MAX_COVER) break;
      if (types.has(m.type)) continue;
      types.add(m.type); out.add(m.id);
    }
    for (const id of shuffle(ownAll.filter(id => !out.has(id))).concat(shuffle(ofType('normal').filter(id => !out.has(id) && !labOnly(id))))) {
      if (out.size >= MIN_TOTAL) break;
      out.add(id);
    }
    for (const id of SIG[mon.dex] || []) out.add(id);
    poolCache[mon.dex] = [...out];
    return poolCache[mon.dex].slice();
  }

  /**
   * The Lab list plus the TMs it was taught at Kecleon's (G.Mons.taught), like upstream's poolFor does for
   * normal runs (plan D4: they never showed in Lab runs). In a run, after a Lab evolution, the TMs taught
   * to the Pokémon it started as count too. `natural`: without the TMs.
   */
  let startDex = 0;                     // the species the current Lab run started as
  function labList(mon, natural) {
    const ids = labPool(mon);
    if (natural || !G.Mons || !mon || !mon.dex) return ids;
    const from = active() && startDex && startDex !== mon.dex ? [mon.dex, startDex] : [mon.dex];
    for (const d of from) for (const id of G.Mons.taught(d)) if (!ids.includes(id)) ids.push(id);
    return ids;
  }
  const poolFor = G.Moves.poolFor;
  // `natural` (no TMs) goes through: G.Mons.natural asks for it ("does it know this without a TM?").
  // Outside a Lab run, a Lab move taught by a Lab TM (js/fork/lab/lab-tms.js) stays out: Lab TMs are Lab-only (plan G5).
  G.Moves.poolFor = (mon, natural) => active() ? labList(mon, natural)
    : poolFor(mon, natural).filter(id => !G.Moves.BY_ID[id].lab || G.Moves.BY_ID[id].promote).concat((SIG[mon.dex] || []).filter(id => G.Moves.BY_ID[id].promote));   // signatures already promoted (phase 8)

  // Level-up cards: a signature shows up gold ("Signature") and, if you can learn it and it isn't in the
  // hand, in 1 hand out of 3 it takes the place of the last new-move card.
  const SIG_IN = 1 / 3;
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!active() || !pl || pl !== G.Game.player) return hand;
    const want = pl.slots.length < pl.maxMoves ? (SIG[pl.mon.dex] || []).filter(id => !pl.hasMove(id) && !(pl.banned && pl.banned.has(id))) : [];
    if (want.length && !hand.some(c => c.key && isSig(c.key.slice(4))) && Math.random() < SIG_IN) {
      const last = hand.map(c => c.type).lastIndexOf('new'), id = G.U.pick(want), d = G.Moves.BY_ID[id];
      hand[last >= 0 ? last : hand.length - 1] = { w: 10, type: 'new', key: 'new:' + id, icon: 'move:' + id, color: G.U.TYPE_COLOR[d.type],
        tag: G.U.TYPE_NAME[d.type] + (d.cat ? ' · ' + G.Stats.NAME[d.cat] : ''), title: G.T(d.name, 'move'), desc: d.desc, apply: p => p.addMove(id) };
    }
    for (const c of hand) {
      if (c.type !== 'new' || !isSig(c.key.slice(4))) continue;
      c.type = 'evo';                                   // gold (run-ui.js) and the chip with its text
      const d = G.Moves.BY_ID[c.key.slice(4)];
      c.tag = 'Signature · ' + G.T(G.U.TYPE_NAME[d.type]) + (d.cat ? ' · ' + G.T(G.Stats.NAME[d.cat]) : '');
      c.color = '#ffd23f'; c.own = false;
    }
    return hand;
  };

  // ---------------- start and end ----------------

  /** At the start of any run: is it Lab? (in a group, the host says so in cfg). */
  function begin(coop) {
    run = coop ? !!coop.lab : !!G.Settings.get('lab');
    info = null; stats0 = null;
    if (coop && coop.lab && coop.labV !== VERSION && coop.host !== G.Net.uid) {
      G.UI.toast('Lab mode: your game is a different version from the host\'s. Reload the page so you both see the same moves.', 6000);
    }
  }

  // game.js loads after the fork: G.Game exists once all the scripts have loaded
  // (defer), before DOMContentLoaded.
  document.addEventListener('DOMContentLoaded', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function (coop = null) {
      begin(coop);
      startDex = 0;
      const r = startRun.apply(this, arguments);
      const pl = G.Game.player;
      startDex = pl ? pl.dex : 0;
      if (run && pl) {
        const sv = G.DB.save;
        stats0 = sv && sv.stats ? JSON.parse(JSON.stringify(sv.stats)) : null;
        info = G.LabAbilities.describe(pl.abilId, pl.mon);   // set by pl.setAbility (abilities.js), not attached twice
        G.LabAnims.preload(pl);                         // its signatures' animations (phase 5)
        G.LabGrowth.start(pl);                          // XP for the weak ones, and candies (phase 6)
        G.LabShiny.start(pl);                           // the shiny's colours and extras (phase 7)
        G.Spawner.say('LAB · ' + (info ? 'Ability: ' + info.name : 'experimental moves'), 3.4, true);
      }
      badge();
      return r;
    };
  });

  /** End of a Lab run: records and stats back to how they were. */
  function restoreStats() {
    const s = G.DB.save && G.DB.save.stats;
    if (!s || !stats0) return;
    for (const k of Object.keys(s)) if (!(k in stats0)) delete s[k];
    Object.assign(s, stats0);
    stats0 = null;
  }
  // Achievements, stats and collections: muted in a Lab run. 'runEnd' arrives right after
  // endRun (game.js) records the stats: that's where they're put back. Missions do count:
  // progress.js advances them inside event() with everything else, so here they're advanced
  // on their own (same rules as its advance()).
  for (const k of ['event', 'kill', 'checkAch']) {
    const f = G.Progress[k];
    G.Progress[k] = function (a, d) {                 // event(kind, data) · kill(enemy) · checkAch()
      if (!active()) return f.apply(this, arguments);
      if (k === 'event') { if (a === 'runEnd') restoreStats(); missions(a, d || {}); }
      // As progress.js kill(): Arceus's legendaries in the Judgment aren't bosses.
      else if (k === 'kill' && a) missions('kill', { types: a.types || [], boss: !!a.boss && !(G.Judgment && G.Judgment.active) });
    };
  }
  function missions(kind, d) {
    const s = G.DB.save;
    if (!s) return;
    G.Progress.ensure(s);
    for (const m of [...s.missions.daily, ...s.missions.weekly]) {
      if (m.claimed || G.Progress.done(m)) continue;
      const def = G.MissionDefs.BY[m.id];
      if (!def || def.ev !== kind || (def.match && !def.match(d, m.param))) continue;
      const v = def.value ? def.value(d) : 1;
      m.prog = def.mode === 'max' ? Math.max(m.prog, v) : m.prog + v;
      if (G.Progress.done(m) && !m.told) { m.told = true; told(m); }
    }
  }
  /** The same popup as progress.js notify() (not exported), for a mission finished in a Lab run. */
  function told(m) {
    let el = document.getElementById('ach-pop');
    if (!el) { el = document.createElement('div'); el.id = 'ach-pop'; el.className = 'box ach-pop'; document.body.appendChild(el); }
    el.innerHTML = `${G.Icons.html('medal2', 24)}<div><b>${esc('Misión completada: ' + G.Progress.text(m))}</b><small>${esc('Recoge el premio en Misiones')}</small></div>`;
    el.classList.remove('hidden');
    G.Audio.sfx('confirm');
    clearTimeout(told.t);
    told.t = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  // A Lab run's time goes on the Lab boards (js/net/ranking.js), the regular ones never see it.
  // game.js calls these at the end of the run, before the next begin(), so `run` is still this run's.
  // (The anti-cheat clean() still applies; a resumed run is tainted by debugTime and doesn't go on.)
  for (const k of ['submitSolo', 'submitGroup']) {
    const f = G.Ranking[k];
    G.Ranking[k] = function (r) { return f.call(this, Object.assign({}, r, { lab: run })); };
  }

  // ---------------- co-op ----------------
  const broadcast = G.Net.broadcast;
  G.Net.broadcast = function (msg) {
    // The host's 'start' (social-ui.js LobbyUI.start) carries its setting; it's the same
    // object G.Flow.startCoop then receives, so the host sees it too.
    if (msg && msg.k === 'start' && msg.lab == null) { msg.lab = !!G.Settings.get('lab'); msg.labV = VERSION; }
    return broadcast.apply(this, arguments);
  };
  /** The host tells its setting (to one player or to all). */
  function tell(uid) {
    const room = G.Social.room;
    if (!room || !room.isHost) return;
    const msg = { k: 'lab', on: !!G.Settings.get('lab'), v: VERSION };
    if (uid) G.Net.send(uid, msg); else broadcast.call(G.Net, msg);
  }
  G.Net.on((from, msg) => { if (msg && msg.k === 'lab') { hostLab.set(from, msg); lobby(); } });
  G.Net.onPeer((u, mode) => { if (mode === 'direct' || mode === 'relay') tell(u); });
  G.Settings.on(k => { if (k === 'lab') { tell(); lobby(); } });
  G.Social.on(what => { if (what === 'room') lobby(); });

  // ---------------- what you see ----------------
  const NOTE = 'Lab run: experimental moves and abilities. It goes on the Lab leaderboard, and won\'t count for the regular leaderboard, achievements or records.';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** In a group room: will the run be Lab? (the host's setting; a guest's comes in its 'lab' message) */
  function roomLab() {
    const room = G.Social.room;
    if (!room) return false;
    if (room.isHost) return !!G.Settings.get('lab');
    const h = hostLab.get(room.host);
    return !!(h && h.on);
  }
  /** The group lobby: will it be Lab? */
  function lobby() {
    const el = $('lab-lobby'), room = G.Social.room;
    if (!el) return;
    const on = roomLab(), h = room && !room.isHost && hostLab.get(room.host), other = !!(on && h && h.v !== VERSION);
    el.classList.toggle('hidden', !on);
    el.innerHTML = '<span class="lab-badge">LAB</span> ' + esc(other
      ? 'The host has a different version of Lab mode. Reload the page so you both see the same moves.'
      : (room && room.isHost ? 'Your setting: this run will be a Lab run for everyone. ' : 'The host turned on Lab mode for this run. ') + 'It goes on the Lab leaderboard, not the regular one, and won\'t count for achievements or records.');
  }

  /** The Settings → Experimental tab (settings-ui.js draws it with its own pieces). */
  function settingsRow(toggle, section) {
    return section('Experimental')
      + toggle('lab', 'Lab mode', 'Try moves and abilities that are still being tested: each Pokémon gets the moves it learns in the games and one of its abilities. '
        + 'Lab runs give coins, tickets and shinies and count for missions as usual. Their times go on the Lab leaderboard (Leaderboards → LAB), not the regular one, and they don\'t count for achievements or records. In co-op, the host\'s setting decides.');
  }

  /** Pause: its ability and what it can learn here. */
  function pauseBlock() {
    const pl = G.Game.player;
    if (!pl) return '';
    const own = labPool(pl.mon);
    const icons = G.Moves.poolFor(pl.mon).map(id => {
      const d = G.Moves.BY_ID[id];
      return `<span class="${d.sig ? 'lab-sig' : ''}" data-move="${id}" title="${esc(G.T(d.name, 'move') + (d.sig ? ' (signature)' : !own.includes(id) ? ' (TM)' : ''))}">${G.Icons.html('move:' + id, 18)}</span>`;
    }).join('');
    // More lines from the other Lab files (evolution, candies, shiny...).
    const more = pauseExtra.map(f => f(pl)).filter(Boolean).map(t => `<div class="lab-more"><small>${t}</small></div>`).join('');
    return `<div class="lab-pause"><div><span class="lab-badge">LAB</span> ${info
        ? `Ability: <b>${esc(info.name)}</b> <small>${esc(info.desc)}</small>` : ''}</div>
      <div class="lab-pool"><small>${esc(pl.mon.name)} can learn here:</small> ${icons}</div>${more}</div>`;
  }
  const pauseExtra = [];

  const showPause = G.RunUI.showPause;
  G.RunUI.showPause = function () {
    const r = showPause.apply(this, arguments);
    if (active()) $('pause-sum').insertAdjacentHTML('afterbegin', pauseBlock());
    return r;
  };
  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function (r) {
    const lab = active();
    if (lab && r) r.record = false;
    const out = showOver.apply(this, arguments);
    if (lab) $('over-stats').insertAdjacentHTML('beforeend', `<div class="lab-over"><span class="lab-badge">LAB</span> ${esc(NOTE)}</div>`);
    return out;
  };

  // "LAB" in the run (and its ability).
  const hud = document.createElement('div');
  hud.id = 'lab-hud';
  hud.className = 'lab-badge lab-hud hidden';
  document.body.appendChild(hud);
  function badge() {
    const on = active() && G.Game.state !== 'over';
    hud.classList.toggle('hidden', !on);
    if (on) hud.textContent = 'LAB' + (info ? ' · ' + info.name : '');
  }
  setInterval(badge, 400);
  // The Experimental tab in Settings, before Account.
  const acc = document.querySelector('#set-tabs [data-t="acc"]');
  if (acc) {
    const b = document.createElement('button');
    b.className = 'gen-tab';
    b.dataset.t = 'lab';
    b.textContent = 'Experimental';
    b.onclick = () => G.SettingsUI.open('lab');
    acc.before(b);
  }
  // The lobby notice, under its note.
  const ln = $('lobby-note');
  if (ln) ln.insertAdjacentHTML('afterend', '<p id="lab-lobby" class="note lab-note hidden"></p>');

  return {
    VERSION, begin, learnOf, settingsRow, SIG, esc,
    poolFor: labList,
    /** Another line for the Lab block in the pause menu: f(pl) → HTML or ''. */
    pauseLine(f) { pauseExtra.push(f); },
    /** The ability the HUD and the pause menu show (it can change on evolving). */
    setAbility(a) { info = a; badge(); },
    get active() { return active(); },
    /** In a group room: will the run be Lab? (js/fork/lab/underdog.js shows its ladder in the lobby then) */
    get roomLab() { return roomLab(); },
    get ability() { return info; }
  };
})();
