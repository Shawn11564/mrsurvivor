/* ============ mech.js — move identity and new move mechanics in Lab mode (MrSurvivor fork) ============
 * Phase 10 of fork/LAB.md ("move identity"), plan fork/PLAN-2026-10-22.md B1 and B3. Lab only:
 * outside a Lab run nothing here changes a move.
 *
 * 1. Identity for the normal game's moves (ID below). In a Lab run, G.Moves.instance gives a move
 *    its Lab identity (labify): extra fields (`add`), its own upgrade steps where the kind's
 *    ladder doesn't fit it (`upsAt`: step number → { t, m }; the kind's ladder stays the default),
 *    and its own evolution (`evo`: { t, m (×), add (+), set (=) }) when the evolved name promises
 *    something the kind's evolution doesn't do. A Lab move (js/fork/lab/lab-moves.js) can bring
 *    `labEvo` the same way. What it does is said in English: `note` / `evoNote` under the type in
 *    the move's box (G.MoveText.tipNotes) and on its new-move card; `evo.t` on the evolution card.
 * 2. Mechanics, for any move that has the field (G.LabMech exposes them for other Lab files):
 *    mark      B3.1  a hit stamps the enemy with `mark` × its damage (Future Sight, Doom Desire,
 *                    Psychic); the next hit on it from ANOTHER move sets the stored damage off
 *                    around it (MARK_R px). Marks are per player (each player's copies).
 *
 * Hooks (all chained, never replaced): G.Moves.instance/evoInfo/evolve, G.MoveText.tipNotes,
 * G.LevelUp.offer, G.RunStats.tag + Enemy.hurt (like kinds2.js: Combat tags every hit of yours
 * right before the damage), Combat.updateFields/clearFields/drawAirFields/drawGroundFields.
 * Co-op: damage goes through Enemy.hurt, which a guest forwards to the host; marks live on each
 * player's own copies. Texts in English only. Test: fork/test-lab-mech.cjs.
 */
G.LabMech = (() => {
  const C = G.Combat;
  const lab = () => !!(G.Lab && G.Lab.active);
  const now = () => performance.now();
  const boss = e => e.boss || e.judge;
  const col = m => G.U.TYPE_COLOR[m.type];
  const MARK_R = 70, MARK_T = 6, MARK_CAP = 4;      // detonation radius, seconds a mark lasts, stored ≤ CAP × the hit
  const MARK_COL = '#ff6ad5';

  // ---------------- 1. identity of the normal game's moves (Lab runs) ----------------
  const ID = {
    // B3.1: Psychic marks; Psybeam's evolution, Future Sight, marks everything its beam touches.
    'psychic': { add: { mark: 0.35 },
      note: 'Lab: marks the enemies it hits. Your next hit on a marked enemy with another move sets off the stored damage around it.' },
    'psybeam': {
      evo: { t: '×1.6 damage and a wider beam. Future Sight: it marks every enemy it hits, and your next hit on one with another move sets off the stored damage around it.',
             m: { dmg: 1.6, width: 1.3 }, set: { mark: 1 } },
      evoNote: 'Future Sight: marks every enemy it hits. Your next hit on a marked enemy with another move sets off the stored damage around it.' }
  };

  const MULT = ['dmg', 'cd', 'speed', 'radius', 'dur', 'amount', 'arc', 'width', 'spread', 'life', 'size', 'rate', 'pull', 'knock', 'stun', 'charge'];
  /** A Lab evolution { m: ×, add: +, set: = } on an instance. */
  function evoApply(s, ev) {
    for (const k in ev.m || {}) s[k] = (s[k] != null ? s[k] : (k === 'count' ? 1 : MULT.includes(k) ? 1 : 0)) * ev.m[k];
    for (const k in ev.add || {}) s[k] = (s[k] || 0) + ev.add[k];
    Object.assign(s, ev.set || {});
  }

  /** Gives a fresh instance (level 1) its Lab identity: its own def copy with steps and evolution. */
  function labify(s) {
    const id = ID[s.id];
    if (!id || s.labId) return s;
    const def = Object.create(s.def);
    if (id.upsAt) def.ups = s.def.ups.map((u, i) => id.upsAt[i + 1] || u);
    if (id.evo) def.labEvo = id.evo;
    def.labNote = id.note || null;
    def.labEvoNote = id.evoNote || null;
    s.def = def;
    s.labId = true;
    Object.assign(s, id.add || {});
    return s;
  }
  const instance = G.Moves.instance;
  G.Moves.instance = function (id, lvl = 1) {
    if (!lab() || !ID[id]) return instance.apply(this, arguments);
    const s = labify(instance.call(this, id, 1));
    while (s.lvl < lvl && G.Moves.levelUp(s)) { /* its own steps */ }
    return s;
  };

  // Evolution: a move's own (labEvo) wins over its kind's (kinds.js, kinds2.js, moves.js).
  const evoOf = m => m && m.def && m.def.labEvo;
  const evoInfo = G.Moves.evoInfo;
  G.Moves.evoInfo = function (m, statsTaken) {
    const ev = evoOf(m), e = G.Moves.EVO[m.id];
    if (!ev) return evoInfo.apply(this, arguments);
    if (!e || m.evolved || m.lvl < m.def.maxLvl) return null;
    const [name, needs] = e;
    return { name, needs, needName: needs ? G.Moves.NEED_NAME[needs] : 'Nivel máximo', text: ev.t,
             ready: !needs || !!(statsTaken && statsTaken[needs]) };
  };
  const evolve = G.Moves.evolve;
  G.Moves.evolve = function (m) {
    const ev = evoOf(m), e = G.Moves.EVO[m.id];
    if (!ev) return evolve.apply(this, arguments);
    if (!e || m.evolved) return false;
    evoApply(m, ev);
    m.baseName = m.name; m.name = e[0]; m.evolved = true;
    return true;
  };

  /** What the move does in Lab, in English (or null). */
  function noteOf(m) {
    if (!m) return null;
    const d = m.def || m;
    return (m.evolved && d.labEvoNote) || d.labNote || null;
  }
  const NOTE_COL = '#7fe0d0';
  const tipNotes = G.MoveText.tipNotes;
  G.MoveText.tipNotes = function (m, pl) {
    const out = tipNotes.apply(this, arguments);
    const n = lab() && noteOf(m);
    if (n) out.push([n, NOTE_COL]);
    return out;
  };
  // New-move cards: the Lab note under the description.
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!lab() || !Array.isArray(hand)) return hand;
    for (const c of hand) {
      if (c.type !== 'new' || !c.key || typeof c.desc !== 'string') continue;
      const id = ID[c.key.slice(4)];
      if (id && id.note) c.desc += ` <span class="lab-id" style="color:${NOTE_COL}">${id.note}</span>`;
    }
    return hand;
  };
  // The texts stay as they are when the game sends them through its dictionary (its word-by-word
  // pass would change English words that are also Spanish keys).
  function keep(...texts) {
    const d = {};
    for (const t of texts) if (t) d[t] = t;
    G.I18n.add(d, 'en');
  }
  for (const k in ID) {
    const id = ID[k];
    keep(id.note, id.evoNote, id.evo && id.evo.t, ...Object.values(id.upsAt || {}).map(u => u.t));
  }
  for (const d of G.LabMoves) if (d.labEvo) keep(d.labEvo.t);

  // ---------------- 2. hits: what the mechanics do to the damage ----------------
  // Combat calls G.RunStats.tag(e, m) on each of your hits right before e.hurt (as kinds2.js).
  let pend = null, busy = false;
  const tag = G.RunStats.tag;
  G.RunStats.tag = function (e, m) {
    tag.apply(this, arguments);
    pend = busy ? null : { e, m };
  };
  /** Damage dealt outside Combat.hit, credited to the move (summary, damage dealt). */
  function credit(pl, m, d) {
    if (!(d > 0)) return;
    m.dealt = (m.dealt || 0) + d;
    pl.dmgDealt += d;
    pl.onDealt(d);
  }
  const E = G.Enemy.prototype;
  const ehurt = E.hurt;
  E.hurt = function (amount, color, dx, dy, knock, eff) {
    const p = pend, pl = G.Game.player;
    pend = null;
    if (!p || p.e !== this || !p.m || this.dead || !pl || !lab()) return ehurt.apply(this, arguments);
    const m = p.m, mk = this._labMark;
    const r = ehurt.apply(this, arguments);
    // B3.1: another move's hit sets the mark off; a marking move stamps (again).
    if (mk && mk.by !== m.id) detonate(this);
    if (m.mark && !this.dead) stamp(this, pl, m, amount);
    return r;
  };

  // ---------------- B3.1 mark + detonate ----------------
  const marked = new Set();
  function stamp(e, pl, m, amount) {
    const o = e._labMark, add = amount * m.mark;
    const cap = Math.max(add, amount) * MARK_CAP;
    if (o && o.by === m.id) { o.dmg = Math.min(cap, o.dmg + add); o.t = MARK_T; return; }
    e._labMark = { by: m.id, m, owner: pl, dmg: Math.min(cap, add), t: MARK_T, r: m.markR || MARK_R };
    marked.add(e);
  }
  /** Sets off e's mark: its stored damage to every enemy within its radius (e too). */
  function detonate(e) {
    const mk = e._labMark;
    if (!mk || busy) return 0;
    e._labMark = null; marked.delete(e);
    const pl = mk.owner, m = mk.m;
    if (!pl || pl.dead) return 0;
    let n = 0;
    busy = true;
    try {
      for (const o of G.EnemyMgr.queryCircle(e.x, e.y, mk.r)) {
        if (o.dead) continue;
        G.RunStats.tag(o, m);
        o.hurt(mk.dmg, MARK_COL, o.x - e.x, o.y - e.y, boss(o) ? 0 : 120);
        credit(pl, m, mk.dmg);
        n++;
      }
    } finally { busy = false; }
    G.FX.ring(e.x, e.y, 6, mk.r, MARK_COL, 0.45, 5);
    G.FX.burst(e.x, e.y - e.bodyH * 0.5, MARK_COL, 18, 200);
    G.FX.dmgText(e.x, e.y - e.bodyH - 16, G.T(m.name, 'move') + '!', MARK_COL, true);
    return n;
  }
  function tickMarks(dt) {
    for (const e of marked) {
      const mk = e._labMark;
      if (e.dead || !mk || (mk.t -= dt) <= 0) { if (mk) e._labMark = null; marked.delete(e); }
    }
  }

  // ---------------- every frame ----------------
  const update = C.updateFields;
  C.updateFields = function (dt) {
    update.apply(this, arguments);
    tickMarks(dt);
  };
  const clear = C.clearFields;
  C.clearFields = function (owner) {
    clear.apply(this, arguments);
    if (!owner) { for (const e of marked) e._labMark = null; marked.clear(); }
    else for (const e of marked) if (e._labMark && e._labMark.owner === owner) { e._labMark = null; marked.delete(e); }
  };
  const air = C.drawAirFields;
  C.drawAirFields = function (ctx) {
    air.apply(this, arguments);
    if (!marked.size) return;
    const t = now() / 1000;
    ctx.save();
    for (const e of marked) {
      if (e.dead || !G.Camera.sees(e.x, e.y, 60)) continue;
      // A pulsing eye over the marked enemy, a ring at its feet.
      const k = 0.75 + Math.sin(t * 6 + e.id) * 0.25, y = e.y - e.bodyH - 12;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = MARK_COL; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(e.x, y, 6 * k + 2, 3.5 * k + 1, 0, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = MARK_COL;
      ctx.beginPath(); ctx.arc(e.x, y, 1.8, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.45; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.4, e.r * 0.55, 0, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  };

  return {
    ID, labify, noteOf, keep, evoApply,
    /** B3.1: stamps e with `m.mark` × amount for pl (as a hit of m would). */
    mark: (e, pl, m, amount) => stamp(e, pl, Object.assign({ mark: 1 }, m), amount),
    detonate,
    MARK_R,
    counts: () => ({ marked: marked.size })
  };
})();
