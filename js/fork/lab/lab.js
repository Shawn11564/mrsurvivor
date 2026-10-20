/* ============ lab.js — modo Lab: movimientos y habilidades en pruebas (fork MrSurvivor) ============
 * Plan, decisiones y estado: fork/LAB.md. Pruebas: fork/test-lab.cjs y fork/test-lab-coop.cjs (grupo).
 *
 * Ajuste: Ajustes → Gráficos → Experimental (G.Settings 'lab', de este dispositivo; la fila
 * la pinta settingsRow desde js/ui/settings-ui.js). Cada partida decide al empezar (begin):
 *   - solo: tu ajuste
 *   - grupo: el del ANFITRIÓN, que va en su mensaje 'start' (lab, labV); el de los invitados
 *     no cuenta. Si su labV no es el tuyo, aviso de recargar.
 * G.Lab.active: hay una partida Lab en marcha (con Pokémon). Fuera de partida es false, así que
 * los menús (movimiento inicial, veto, colección) ven siempre lo normal y lo del Lab no se
 * guarda nunca en la partida guardada.
 *
 * En una partida Lab:
 *   - G.Moves.poolFor(mon) da su lista del Lab (poolFor, abajo): lo que aprende en los juegos.
 *   - su habilidad (js/fork/lab/abilities.js)
 *   - no sube al ranking (G.Game.taint) y no cuenta para misiones, logros ni récords: los
 *     avisos de G.Progress se callan y save.stats vuelve a como estaba al acabar. Monedas,
 *     tickets y shinies, sí.
 *   - "LAB" en el HUD, su habilidad y su lista en la pausa, y aviso en el resumen final.
 * Sala de cooperativo: el anfitrión manda { k:'lab', on, v } a cada uno al conectar y al
 * cambiar el ajuste (sólo por la conexión directa entre jugadores), y la sala lo enseña.
 *
 * Todo se engancha desde aquí (envolviendo funciones que el juego llama como G.X.y); en los
 * archivos de upstream sólo hay una línea, en settings-ui.js.
 */
G.Lab = (() => {
  const D = G.LabData;
  const $ = id => document.getElementById(id);
  let run = false;                      // ¿la partida en curso es Lab? (begin)
  let stats0 = null;                    // save.stats al empezar (restoreStats)
  let info = null;                      // su habilidad: G.LabAbilities.of
  const hostLab = new Map();            // uid del anfitrión -> { on, v } (sala de grupo)
  const active = () => run && !!(G.Game && G.Game.player);

  // ---------------- movimientos que sólo existen en el Lab ----------------
  // Mejoras: las de su familia nueva (js/fork/lab/kinds.js) o las de un movimiento del juego de la misma.
  const BALLS = ['projectile', 'homing', 'bounce'];
  for (const d of G.LabMoves) {
    const like = G.Moves.ALL.find(m => m.kind === d.kind);
    const ups = G.LabKinds.LADDERS[d.kind] || (like && like.ups);
    if (!ups) { console.warn('[Lab] no move of kind ' + d.kind + ' to copy upgrades from: ' + d.id); continue; }
    const m = Object.assign({}, d, { lab: true, ups, maxLvl: ups.length + 1 });
    delete m.evo;
    if (BALLS.includes(m.kind)) { if (m.count == null) m.count = 1; if (m.spread == null) m.spread = 0.12; }
    G.Moves.BY_ID[m.id] = m;
    // Las firmas evolucionan sólo con llegar al nivel máximo ("Blast Burn ★"), como los potenciadores:
    // sin evolución, al final de la partida se quedaban muy por detrás (fork/balance-lab.cjs).
    if (d.evo) G.Moves.EVO[m.id] = d.evo;
    else if (d.sig) G.Moves.EVO[m.id] = [d.name + ' ★', null];
    // Fase 8: promote = pasa al juego normal (cartas, movimiento inicial, veto). Las firmas, sólo a su línea (poolFor).
    if (d.promote && !d.sig) { G.Moves.ALL.push(m); (G.Moves.POOL[m.type] = G.Moves.POOL[m.type] || []).push(m.id); }
  }
  // Su aspecto (look) manda sobre el de su tipo.
  const forMove = G.VFX.forMove;
  G.VFX.forMove = m => m && m.look ? Object.assign(forMove(m), m.look) : forMove(m);

  // Versión del contenido del Lab: si la del anfitrión no es la tuya, no veríais lo mismo.
  const VERSION = (() => {
    const s = JSON.stringify([G.LabMoves, D.MOVES, Object.keys(G.LabAbilities.DEF)]);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  })();

  // ---------------- movimientos de firma (fase 5) ----------------
  // SIG[dex]: los suyos (lab-moves.js sig). La cadena evolutiva sale de G.LabData.fam/evo.
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

  // ---------------- lista de movimientos de cada especie (fase 2) ----------------
  const MIN_OWN = 4, MIN_TOTAL = 6, MAX_COVER = 2;
  // De apoyo: no cuentan como cobertura (no pegan, o no a lo de otro tipo).
  const SUPPORT = new Set(['buff', 'guard', 'weather', 'terrain', 'metronome', 'transform']);
  const HOW = ['lv', 'egg', 'tutor', 'tm'];
  const SCORE = { lv: 3, egg: 2, tutor: 2, tm: 1 };
  const learnCache = {}, poolCache = {};

  /** → { id: 'lv' | 'egg' | 'tutor' | 'tm' } con lo que aprende en los juegos (G.LabData.learn). */
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

  /** Azar fijo por especie (cada Pokémon tiene siempre la misma lista). */
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Movimientos de un tipo: los del juego y los del Lab (sin las firmas, que son de cada línea). */
  function ofType(t) {
    return (G.Moves.POOL[t] || []).concat(G.LabMoves.filter(m => m.type === t && !m.sig && G.Moves.BY_ID[m.id]).map(m => m.id));
  }
  const labOnly = id => !!G.Moves.BY_ID[id].lab;

  /**
   * Lo que puede aprender en una partida Lab:
   *   - los de tipo Normal que aprende en los juegos
   *   - los de sus tipos que aprende; si son menos de MIN_OWN, se completan con otros de sus tipos
   *   - hasta MAX_COVER de otros tipos que aprende (cobertura), de tipos distintos: antes los que
   *     aprende por nivel, luego huevo o tutor, luego MT; y antes los de su lado bueno
   *   - si aún son menos de MIN_TOTAL, más de sus tipos y luego de tipo Normal
   *   - y sus movimientos de firma (SIG), siempre
   * Los de tipo Normal que sólo existen en el Lab (Protección, Doble Filo...) cuentan sólo si los
   * aprende por nivel, huevo o tutor: por MT los aprende casi todo el mundo.
   * Fijo por especie (rng(dex)): Charmander aprende siempre lo mismo.
   */
  function labPool(mon) {
    if (poolCache[mon.dex]) return poolCache[mon.dex].slice();
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

  const poolFor = G.Moves.poolFor;
  G.Moves.poolFor = mon => active() ? labPool(mon)
    : poolFor(mon).concat((SIG[mon.dex] || []).filter(id => G.Moves.BY_ID[id].promote));   // firmas ya promovidas (fase 8)

  // Cartas de nivel: una firma sale dorada ("Signature") y, si puedes aprenderla y no está en la
  // mano, en 1 de cada 3 manos ocupa el sitio de la última carta de movimiento nuevo.
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
      c.type = 'evo';                                   // dorada (run-ui.js) y el chip con su texto
      const d = G.Moves.BY_ID[c.key.slice(4)];
      c.tag = 'Signature · ' + G.T(G.U.TYPE_NAME[d.type]) + (d.cat ? ' · ' + G.T(G.Stats.NAME[d.cat]) : '');
      c.color = '#ffd23f'; c.own = false;
    }
    return hand;
  };

  // ---------------- empezar y acabar ----------------

  /** Al empezar cualquier partida: ¿es Lab? (en grupo, lo dice el anfitrión en cfg). */
  function begin(coop) {
    run = coop ? !!coop.lab : !!G.Settings.get('lab');
    info = null; stats0 = null;
    if (coop && coop.lab && coop.labV !== VERSION && coop.host !== G.Net.uid) {
      G.UI.toast('Lab mode: your game is a different version from the host\'s. Reload the page so you both see the same moves.', 6000);
    }
  }

  // game.js se carga después que el fork: G.Game existe al acabar de cargar todos los scripts
  // (defer), antes de DOMContentLoaded.
  document.addEventListener('DOMContentLoaded', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function (coop = null) {
      begin(coop);
      const r = startRun.apply(this, arguments);
      const pl = G.Game.player;
      if (run && pl) {
        G.Game.taint();                                 // no sube al ranking
        const sv = G.DB.save;
        stats0 = sv && sv.stats ? JSON.parse(JSON.stringify(sv.stats)) : null;
        info = G.LabAbilities.attach(pl);
        G.LabAnims.preload(pl);                         // animaciones de sus firmas (fase 5)
        G.LabGrowth.start(pl);                          // experiencia de los flojos y caramelos (fase 6)
        G.LabShiny.start(pl);                           // colores y extras del shiny (fase 7)
        G.Spawner.say('LAB · ' + (info ? 'Ability: ' + info.name : 'experimental moves'), 3.4, true);
      }
      badge();
      return r;
    };
  });

  /** Fin de una partida Lab: los récords y estadísticas, como estaban. */
  function restoreStats() {
    const s = G.DB.save && G.DB.save.stats;
    if (!s || !stats0) return;
    for (const k of Object.keys(s)) if (!(k in stats0)) delete s[k];
    Object.assign(s, stats0);
    stats0 = null;
  }
  // Misiones y logros: callados en una partida Lab. 'runEnd' llega justo después de que
  // endRun (game.js) apunte las estadísticas: ahí se devuelven.
  for (const k of ['event', 'kill', 'checkAch']) {
    const f = G.Progress[k];
    G.Progress[k] = function (kind) {
      if (!active()) return f.apply(this, arguments);
      if (k === 'event' && kind === 'runEnd') restoreStats();
    };
  }

  // ---------------- cooperativo ----------------
  const broadcast = G.Net.broadcast;
  G.Net.broadcast = function (msg) {
    // El 'start' del anfitrión (social-ui.js LobbyUI.start) lleva su ajuste; es el mismo
    // objeto que luego recibe G.Flow.startCoop, así que el anfitrión también lo ve.
    if (msg && msg.k === 'start' && msg.lab == null) { msg.lab = !!G.Settings.get('lab'); msg.labV = VERSION; }
    return broadcast.apply(this, arguments);
  };
  /** El anfitrión cuenta su ajuste (a uno o a todos). */
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

  // ---------------- lo que se ve ----------------
  const NOTE = 'Lab run: experimental moves and abilities. It won\'t count for leaderboards, missions, achievements or records.';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** La sala de grupo: ¿será Lab? */
  function lobby() {
    const el = $('lab-lobby'), room = G.Social.room;
    if (!el) return;
    let on = false, other = false;
    if (room && room.isHost) on = !!G.Settings.get('lab');
    else if (room) { const h = hostLab.get(room.host); on = !!(h && h.on); other = on && h.v !== VERSION; }
    el.classList.toggle('hidden', !on);
    el.innerHTML = '<span class="lab-badge">LAB</span> ' + esc(other
      ? 'The host has a different version of Lab mode. Reload the page so you both see the same moves.'
      : (room && room.isHost ? 'Your setting: this run will be a Lab run for everyone. ' : 'The host turned on Lab mode for this run. ') + 'It won\'t count for leaderboards, missions, achievements or records.');
  }

  /** La fila de Ajustes → Gráficos (la pinta settings-ui.js con sus propias piezas). */
  function settingsRow(toggle, section) {
    return section('Experimental')
      + toggle('lab', 'Lab mode', 'Try moves and abilities that are still being tested: each Pokémon gets the moves it learns in the games and one of its abilities. '
        + 'Lab runs give coins, tickets and shinies as usual, but don\'t count for leaderboards, missions, achievements or records. In co-op, the host\'s setting decides.');
  }

  /** Pausa: su habilidad y lo que puede aprender aquí. */
  function pauseBlock() {
    const pl = G.Game.player;
    if (!pl) return '';
    const icons = G.Moves.poolFor(pl.mon).map(id => {
      const d = G.Moves.BY_ID[id];
      return `<span class="${d.sig ? 'lab-sig' : ''}" title="${esc(G.T(d.name, 'move') + (d.sig ? ' (signature)' : ''))}">${G.Icons.html('move:' + id, 18)}</span>`;
    }).join('');
    // Más líneas de los otros archivos del Lab (evolución, caramelos, shiny...).
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

  // "LAB" en la partida (y su habilidad).
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
  // El aviso de la sala, debajo de su nota.
  const ln = $('lobby-note');
  if (ln) ln.insertAdjacentHTML('afterend', '<p id="lab-lobby" class="note lab-note hidden"></p>');

  return {
    VERSION, begin, learnOf, settingsRow, SIG, esc,
    poolFor: labPool,
    /** Otra línea para el bloque del Lab en la pausa: f(pl) → HTML o ''. */
    pauseLine(f) { pauseExtra.push(f); },
    /** La habilidad que enseñan el HUD y la pausa (al evolucionar puede cambiar). */
    setAbility(a) { info = a; badge(); },
    get active() { return active(); },
    get ability() { return info; }
  };
})();
