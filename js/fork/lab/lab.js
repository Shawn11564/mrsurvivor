/* Promoted gameplay registry: all implemented Lab systems are standard gameplay.
 * Internal names and save keys remain compatible. See fork/LAB.md and fork/test-promotion.cjs.
 */
G.Lab = (() => {
  const D = G.LabData;
  const $ = id => document.getElementById(id);
  let run = false;                      // is the current run a Lab run? (begin)
  let info = null;                      // its ability: G.LabAbilities.of
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
    return 'main-' + (h >>> 0).toString(36); // Promotion differs from pre-promotion co-op clients.
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
  // `natural` (no TMs) goes through: G.Mons.natural asks for it ("does it know this without a TM?").
  // All taught moves are available in menus and runs.
  G.Moves.poolFor = labList; // Promoted: menus and runs share species pools and taught TMs.

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
    run = true; // All currently implemented Lab gameplay is standard in every run.
    info = null;
    if (coop && coop.labV !== VERSION && coop.host !== G.Net.uid) {
      G.UI.toast('Your game is a different version from the host\'s. Reload the page so you both see the same moves.', 6000);
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
        info = G.LabAbilities.describe(pl.abilId, pl.mon);   // set by pl.setAbility (abilities.js), not attached twice
        G.LabAnims.preload(pl);                         // its signatures' animations (phase 5)
        G.LabGrowth.start(pl);                          // XP for the weak ones, and candies (phase 6)
        G.LabShiny.start(pl);                           // the shiny's colours and extras (phase 7)
        if (info) G.Spawner.say('Ability: ' + info.name, 3.4, true);
      }
      badge();
      return r;
    };
  });

  // Promoted runs use normal progression, achievements and records.
  // New runs use regular boards; explicitly tagged historical queued records keep their category.
  // game.js calls these at the end of the run, before the next begin(), so `run` is still this run's.
  // (The anti-cheat clean() still applies.) A run sent later (js/fork/run-record.js: the tab closed mid-run)
  // says which it was itself: r.lab is kept.
  for (const k of ['submitSolo', 'submitGroup']) {
    const f = G.Ranking[k];
    G.Ranking[k] = function (r) { return f.call(this, Object.assign({}, r, { lab: !!(r && r.lab) })); };
  }

  // ---------------- co-op ----------------
  const broadcast = G.Net.broadcast;
  G.Net.broadcast = function (msg) {
    // The host's 'start' (social-ui.js LobbyUI.start) carries its setting; it's the same
    // object G.Flow.startCoop then receives, so the host sees it too.
    if (msg && msg.k === 'start') { msg.lab = true; msg.labV = VERSION; }
    return broadcast.apply(this, arguments);
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roomLab = () => !!G.Social.room;
  function settingsRow() { return ''; } // Compatibility with old settings routes.
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
    return `<div class="lab-pause"><div>${info
        ? `Ability: <b>${esc(info.name)}</b> <small>${esc(info.desc)}</small>` : ''}</div>
      <div class="lab-pool"><small>${esc(pl.mon.name)} can learn:</small> ${icons}</div>${more}</div>`;
  }
  const pauseExtra = [];

  const showPause = G.RunUI.showPause;
  G.RunUI.showPause = function () {
    const r = showPause.apply(this, arguments);
    if (active()) $('pause-sum').insertAdjacentHTML('afterbegin', pauseBlock());
    return r;
  };
  // "LAB" in the run (and its ability).
  const hud = document.createElement('div');
  hud.id = 'lab-hud';
  hud.className = 'lab-badge lab-hud hidden';
  document.body.appendChild(hud);
  function badge() {
    const on = active() && G.Game.state !== 'over';
    hud.classList.toggle('hidden', !on);
    if (on) hud.textContent = info ? 'Ability: ' + info.name : '';
  }
  setInterval(badge, 400);
  return {
    enabled: true, VERSION, begin, learnOf, settingsRow, SIG, esc,
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
