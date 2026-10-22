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
 *    persist   B3.2  mines that stay `persist` s and hurt each enemy that steps on them (the 14 px
 *                    step of combat.js's mines), again each HZ_REHIT s it stays (Spikes, Toxic
 *                    Spikes); `web`: they slow what's in them instead of bursting (String Shot,
 *                    Sticky Web). `rocks`: each meteor that lands leaves a pointed stone for
 *                    `rocks` s (Stealth Rock). Hazards are the owner's; a teammate's are drawn only.
 *    venoshock B3.3  against a poisoned enemy: × (1 + venoshock × its poison stacks), and the
 *                    poison is used up (Venoshock, Acid Spray's evolution)
 *    salts     B3.3  × salts against a stunned or sleeping enemy, and it snaps out of it (Smelling
 *                    Salts, Wake-Up Slap). (Hex's × on any status is upstream's.) On a co-op guest's
 *                    copy the state comes from the host: no stacks (counted as 2) and no waking.
 *    drum      B3.4  Belly Drum (Swords Dance's evolution): kinds2.js's `drum` (Fillet Away) at half
 *                    your HP. `frail` (Shell Smash): you take that much more while its boost lasts.
 *                    `curse` (Curse): every 10 s it casts above 40% HP it costs that share of your HP
 *                    and curses the nearest boss (or the toughest enemy near): it loses HP for 10 s.
 *    decoy     B3.5  a fake target: enemies within `decoyR` of it chase it instead of the players
 *                    (Follow Me and Rage Powder, shouts, leave one where you stand for `dur` s; Rage
 *                    Powder's `powder` slows what's in it; Substitute's doll is one while it stands).
 *                    Host-authoritative: the enemies' AI runs on the host, which also sees a guest's
 *                    shout or doll as a ghost cast; every screen draws it. Bosses ignore decoys.
 *    taunt     B3.6  (Taunt, a shout) for `dur` s the enemies that shoot from afar charge you
 *                    instead and don't shoot (bosses ignore it). `attract` (Attract): for `dur` s
 *                    they're slowed (the shout's `slow`) and can't hit you by contact (bosses half).
 *                    Every screen marks its own copies (a teammate's shout comes as a ghost); the
 *                    AI part runs where the AI does (the host).
 *    endeavor  B3.12 (Flail's evolution Endeavor) a hit brings the enemy down to at least your share
 *                    of HP left; a boss loses at most ENDEAVOR_BOSS of what it has.
 *    tailwind        (Whirlwind's evolution Tailwind) each cast: +tailwind speed for TAIL_T s, for you
 *                    and the teammates near you (they get it from your ghost cast).
 *    revenge         kinds2.js's ×2 after a hit you took (Hail's evolution Avalanche): shown here.
 *    B1 fields (the moves that had none): haste (+speed per cast), weakHit / meekHit (kinds2.js's
 *                    weak / meek marks on what it hits, 4 s), crit (+crit chance), para (stun chance),
 *                    omni (chance of +Attack and +Sp. Atk), levelDmg (+ your level x it), close (x
 *                    up to 1 + close point-blank), labKnock (knockback for kinds that pass none),
 *                    gust (clears enemy shots around you), magnitude (random x per cast); and the
 *                    fields that already existed (slow, burn, knock, flinch, revenge, conf, leech).
 *    combo     B3.7  ×2 damage and ×1.4 radius when the partner move (`combo`: its id) was cast in
 *                    the last COMBO_MS by anyone (you, or a teammate's ghost cast): Fusion Flare and
 *                    Fusion Bolt. `pledge`: a Pledge cast within COMBO_MS of a different one makes a
 *                    field where its line lands (Grass + Fire a sea of fire, Grass + Water a swamp,
 *                    Fire + Water a rainbow that heals). Per-cast boosts go through `_castK` (×
 *                    in Player.atkFor), cleared after the cast's frame.
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
    // ---- B1: the normal game's moves that had no field of their own (one each, Lab only) ----
    // The five spins and four shoves first: they were interchangeable.
    'rapid-spin': { add: { haste: 0.2, hasteT: 1.5 },
      upsAt: { 4: { t: '-25% recharge, +30% damage, and the speed burst lasts 3 s', m: { cd: 0.75, dmg: 1.3, hasteT: 3 } } },
      note: 'Lab: each spin also gives you +20% speed for 1.5 s.' },
    'rolling-kick': { add: { flinch: 0.5 },
      note: 'Lab: the first kick on each enemy stuns it for 0.5 s.' },
    'outrage': { add: { revenge: 1.5 },
      note: 'Lab: ×1.5 damage if an enemy hit you in the last 1.5 s.' },
    'gyro-ball': { add: { slow: 0.35 },
      note: 'Lab: the heavy steel spin slows what it hits.' },
    'night-slash': { add: { weakHit: 0.2, weakCat: 'physical' },
      note: 'Lab: what it cuts takes 20% more from physical moves for 4 s.' },
    'extrasensory': { add: { flinch: 0.6 },
      note: 'Lab: the first wave on each enemy stuns it for 0.6 s.' },
    'vacuum-wave': { add: { close: 1 },
      note: 'Lab: the closer the enemy, the harder it hits: up to ×2 point-blank.' },
    'disarming-voice': { add: { meekHit: 0.25 },
      note: 'Lab: the enemies it hits deal 25% less damage for 4 s.' },
    // The others.
    'hydro-pump': { add: { labKnock: 180 }, note: 'Lab: the blast pushes the enemies back along the beam.' },
    'razor-leaf': { add: { crit: 0.25 }, note: 'Lab: +25% chance of a critical hit.' },
    'leaf-storm': { add: { slow: 0.25 }, note: 'Lab: the petals slow what they hit.' },
    'giga-drain': { add: { meekHit: 0.15 }, note: 'Lab: the roots sap their strength: the enemies they hit deal 15% less for 4 s.' },
    'discharge': { add: { para: 0.08 }, note: 'Lab: each shock has an 8% chance to paralyze (stun) the enemy for 0.5 s.' },
    'bug-buzz': { add: { weakHit: 0.15, weakCat: 'special' }, note: 'Lab: the buzz rattles them: 15% more damage from special moves for 4 s.' },
    'dragon-rage': { add: { burn: 1 }, note: 'Lab: the draconic flames burn.' },
    'fairy-wind': { add: { knock: 80 }, note: 'Lab: the breeze blows the enemies back.' },
    'dazzling-gleam': { add: { labKnock: 70 }, note: 'Lab: the flash pushes nearby enemies back a little.' },
    'flash-cannon': { add: { meekHit: 0.2 }, note: 'Lab: the glare blinds them: the enemies it hits deal 20% less for 4 s.' },
    'night-shade': { add: { levelDmg: 0.5 }, note: 'Lab: each hit also deals half your level in damage.' },
    'psycho-cut': { add: { conf: 0.8 }, note: 'Lab: the blades confuse what they cut for 0.8 s.' },
    'hyper-beam': { add: { labKnock: 220 }, note: 'Lab: the beam blasts the enemies back.' },
    'solar-beam': { add: { leech: 0.15 }, note: 'Lab: you heal 15% of the damage it deals (up to 5% of your HP a second).' },
    'whirlpool': { add: { slow: 0.35 }, note: 'Lab: the current slows the enemies it holds.' },
    'sand-tomb': { add: { meekHit: 0.2 }, note: 'Lab: sand in their eyes: the enemies it hits deal 20% less for 4 s.' },
    'ominous-wind': { add: { omni: 0.1 }, note: 'Lab: each hit has a 10% chance to raise your Attack and Sp. Atk for 5 s.' },
    'ancient-power': { add: { omni: 0.1 }, note: 'Lab: each hit has a 10% chance to raise your Attack and Sp. Atk for 5 s.' },
    'magnitude': { add: { magnitude: 1 }, note: 'Lab: each quake has a random magnitude, from ×0.5 to ×1.8 damage.' },
    // B3.1: Psychic marks; Psybeam's evolution, Future Sight, marks everything its beam touches.
    'psychic': { add: { mark: 0.35 },
      note: 'Lab: marks the enemies it hits. Your next hit on a marked enemy with another move sets off the stored damage around it.' },
    'psybeam': { add: { conf: 1 }, note: 'Lab: the beam confuses what it hits for 1 s.',
      evo: { t: '×1.6 damage and a wider beam. Future Sight: it marks every enemy it hits, and your next hit on one with another move sets off the stored damage around it.',
             m: { dmg: 1.6, width: 1.3 }, set: { mark: 1 } },
      evoNote: 'Future Sight: marks every enemy it hits. Your next hit on a marked enemy with another move sets off the stored damage around it.' },
    // B3.2: hazards that stay.
    'spikes': { add: { persist: 60 },
      note: 'Lab: the spikes stay for 60 s instead of bursting: every enemy that steps on them is hurt, again each second it stays on them.' },
    'toxic-spikes': { add: { persist: 60 },
      note: 'Lab: the spikes stay for 60 s instead of bursting: every enemy that steps on them is hurt and poisoned, again each second it stays on them.' },
    'string-shot': { add: { persist: 60, web: 1 },
      note: 'Lab: the webs stay for 60 s instead of bursting: every enemy in a web is slowed, and hurt when it first walks in.',
      evo: { t: '×1.5 damage, +1 web, bigger webs that slow more. Sticky Web: they stay for 60 s.', m: { dmg: 1.5, radius: 1.3 }, add: { count: 1 }, set: { slow: 0.75 } },
      evoNote: 'Sticky Web: the webs stay for 60 s: every enemy in one is slowed a lot, and hurt when it first walks in.' },
    'rock-slide': {
      evo: { t: '×1.5 damage and +1 rock. Stealth Rock: each rock that lands stays for 75 s as a pointed stone that hurts the enemies that walk into it.',
             m: { dmg: 1.5, radius: 1.15 }, add: { count: 1 }, set: { rocks: 75 } },
      evoNote: 'Stealth Rock: each rock that lands stays for 75 s as a pointed stone that hurts every enemy that walks into it.' },
    // B3.3: converters.
    'acid-spray': {
      evo: { t: '×1.6 damage, +2 bounces and +1 shot. Venoshock: against a poisoned enemy it uses the poison up for ×(1 + 0.5 per poison stack).',
             m: { dmg: 1.6, size: 1.2, spread: 1.3 }, add: { bounce: 2, count: 1 }, set: { venoshock: 0.5 } },
      evoNote: 'Venoshock: against a poisoned enemy it uses the poison up for ×(1 + 0.5 per poison stack), then poisons it again.' },
    // B3.4: trade-offs.
    'swords-dance': {
      evo: { t: 'Casts on its own from any slot and +1 max stack. Belly Drum: when your Attack boost has run out and you are above half HP, it costs half your HP and maxes the boost at once.',
             add: { stacks: 1 }, set: { passive: true, drum: 0.5 } },
      evoNote: 'Belly Drum: when your Attack boost has run out and you are above half HP, it costs half your HP and maxes the boost at once.' },
    // B1 honest evolutions: Avalanche hits back, Tailwind speeds you up.
    'hail': {
      evo: { t: '×1.6 damage, +2 hailstones and a bigger area. Avalanche: twice the damage if an enemy hit you in the last 1.5 s.', m: { dmg: 1.6, radius: 1.2 }, add: { count: 2 }, set: { revenge: 2 } },
      evoNote: 'Avalanche: twice the damage if an enemy hit you in the last 1.5 s.' },
    'whirlwind': { add: { gust: 1 },
      note: 'Lab: the gust also blows away the enemy shots around you.',
      evo: { t: '×1.6 damage and a wider gust that pushes harder. Tailwind: each gust also gives you +30% speed for 4 s, and the teammates near you.', m: { dmg: 1.6, radius: 1.2, knock: 1.3 }, set: { tailwind: 0.3 } },
      evoNote: 'Tailwind: each gust also gives you +30% speed for 4 s, and the teammates near you.' },
    // B3.5: Substitute's doll draws the enemies near it.
    'substitute': { add: { decoy: true, decoyR: 180 },
      note: 'Lab: enemies near the doll go for it instead of you while it stands (bosses do not fall for it).' }
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
  for (const d of G.LabMoves) if (d.labEvo) keep(d.labEvo.t, d.labEvoNote);

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
    // B3.3: converters change the damage before it lands.
    const k = convert(this, m);
    if (k !== 1) { amount *= k; credit(pl, m, amount - amount / k); }
    if (m.endeavor) { const x = endeavor(this, pl, amount, m); if (x > 0) { amount += x; credit(pl, m, x); } }
    // B1 fields.
    let add = 0;
    if (m.close) { const d = G.U.dist(pl.x, pl.y, this.x, this.y), k2 = m.close * Math.max(0, 1 - d / Math.max(1, (m.radius || 90) + this.r)); add += amount * k2; }
    if (m.levelDmg) add += m.levelDmg * pl.level;
    if (m.crit && eff !== 'crit' && Math.random() < m.crit) { add += amount * 0.5; eff = 'crit'; }
    if (add > 0) { amount += add; credit(pl, m, add); }
    if (m.labKnock && !knock) knock = m.labKnock;
    if (m.revenge && now() - (pl._labHurtAt || -1e9) < 1500 && now() - revAt > 400) {
      revAt = now(); G.FX.dmgText(this.x, this.y - this.bodyH - 18, G.T(m.name, 'move') + ' ×' + m.revenge, col(m), true);
    }
    const r = ehurt.call(this, amount, color, dx, dy, knock, eff);
    // B3.1: another move's hit sets the mark off; a marking move stamps (again).
    if (mk && mk.by !== m.id) detonate(this);
    if (m.mark && !this.dead) stamp(this, pl, m, amount);
    if (!this.dead) afterHit(this, pl, m);
    return r;
  };

  // ---------------- B1 honest evolutions: Endeavor, Tailwind ----------------
  const ENDEAVOR_BOSS = 0.08, TAIL_T = 4, TAIL_R = 160;
  let revAt = 0;
  /** Endeavor: what a hit of `amount` must add so e ends at most at your share of HP. kinds2.js's
   *  hit effects (Flail's reversal...) multiply what comes after this, so the extra is divided by them. */
  function endeavor(e, pl, amount, m) {
    const k2 = m && G.LabKinds2.boost ? Math.max(1e-6, G.LabKinds2.boost(pl, e, m, 1)) : 1;
    const left = e.hp - amount * k2, floor = e.maxHp * (pl.hp / pl.maxHp);
    if (left <= floor) return 0;
    const x = left - floor;
    return (boss(e) ? Math.min(x, e.hp * ENDEAVOR_BOSS) : x) / k2;
  }
  /** +k speed for s seconds (Tailwind; Rapid Spin). */
  function haste(pl, k, s) {
    const h = pl._labHaste;
    if (h && h.t > 0 && h.k > k) { h.t = Math.max(h.t, s); return; }
    pl._labHaste = { k, t: s };
  }
  const spdD = Object.getOwnPropertyDescriptor(G.Player.prototype, 'spd');
  Object.defineProperty(G.Player.prototype, 'spd', { configurable: true, get() {
    const s = spdD.get.call(this), h = this._labHaste;
    return h && h.t > 0 ? s * (1 + h.k) : s;
  } });

  // ---------------- B1 fields: after a hit ----------------
  const OMNI_AT = { k: 0.1, s: 5 };
  function afterHit(e, pl, m) {
    if (m.para && Math.random() < m.para) e.applyStun(0.5 * (boss(e) ? 0.35 : 1));
    if (m.meekHit) G.LabKinds2.mark(e, { meek: m.meekHit, dur: 4 });
    if (m.weakHit) G.LabKinds2.mark(e, { weak: m.weakHit, weakCat: m.weakCat || null, dur: 4 });
    if (m.omni && Math.random() < m.omni) {
      for (const st of ['patk', 'satk']) pl.addBuff(st, OMNI_AT.k, OMNI_AT.s, 1);
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, 'Power up!', '#ffd23f');
      for (let i = 0; i < 3; i++) G.FX.sp('arrow', 'normal', pl.x + G.U.rand(-10, 10), pl.y - G.U.rand(0, pl.bodyH), { vy: -70, life: 0.6 });
    }
  }
  const MAGNITUDE = [[4, 0.5], [5, 0.7], [6, 0.9], [7, 1.1], [8, 1.3], [9, 1.5], [10, 1.8]];

  // ---------------- B3.3 status converters ----------------
  const st = (e, bit) => !!(e.net && e.net.st & bit);
  let convAt = 0;
  /** × for a converter's hit on e (and its side effect: poison used up, woken up). */
  function convert(e, m) {
    let k = 1, say = null;
    if (m.venoshock) {
      const n = e.remote ? (st(e, 2) ? 2 : 0) : e.poison || 0;
      if (n > 0) {
        k *= 1 + m.venoshock * n; say = 'Venoshock ×' + k.toFixed(1);
        if (!e.remote) { e.poison = 0; e.poisonT = 0; }
        G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#b55cff', 12, 150);
      }
    }
    if (m.salts) {
      const asleep = e.labSleep > 0 || e.labSleepNet > 0, stunned = e.stunT > 0 || st(e, 16);
      if (asleep || stunned) {
        k *= m.salts; say = (asleep ? 'Wake up! ×' : 'Snap out! ×') + m.salts;
        if (!e.remote) { e.labSleep = 0; e.stunT = 0; }
        G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#ffe14d', 10, 140);
      }
    }
    if (say && now() - convAt > 250) { convAt = now(); G.FX.dmgText(e.x, e.y - e.bodyH - 18, say, '#ffe14d', true); }
    return k;
  }

  // ---------------- B3.4 trade-off boosters (Belly Drum is kinds2.js's `drum`) ----------------
  const CURSE_T = 10, CURSE_BOSS = 0.004, CURSE_MOB = 0.05;        // s; share of max HP per 0.5 s tick
  const cursed = new Set();
  /** Curse's start: pay `m.curse` of your HP, curse the nearest boss or the toughest enemy near. */
  function curse(pl, m) {
    if (pl._labCurseT > 0 || pl.hp <= pl.maxHp * 0.4) return null;
    let t = null, bd = Infinity;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 600)) {
      const d = G.U.dist(pl.x, pl.y, e.x, e.y);
      if (boss(e) && d < bd) { bd = d; t = e; }
    }
    if (!t) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 300)) if (!t || e.maxHp > t.maxHp) t = e;
    if (!t) return null;
    const cost = pl.maxHp * m.curse;
    pl.hp = Math.max(1, pl.hp - cost);
    pl._labCurseT = CURSE_T;
    t._labCurse = { t: CURSE_T, tick: 0.5, owner: pl, m };
    cursed.add(t);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 4, '-' + Math.round(cost), '#ffae5c');
    G.FX.dmgText(t.x, t.y - t.bodyH - 16, 'Cursed!', '#b48cff', true);
    G.FX.ring(t.x, t.y, 4, t.r * 2.5, '#b48cff', 0.5, 4);
    return t;
  }
  function tickCurses(dt) {
    for (const e of cursed) {
      const c = e._labCurse;
      if (e.dead || !c || (c.t -= dt) <= 0) { if (c) e._labCurse = null; cursed.delete(e); continue; }
      if ((c.tick -= dt) > 0) continue;
      c.tick = 0.5;
      if (!c.owner || c.owner.dead) continue;
      const d = Math.max(4, e.maxHp * (boss(e) ? CURSE_BOSS : CURSE_MOB));
      busy = true;
      try { G.RunStats.tag(e, c.m); e.hurt(d, '#b48cff', 0, 0, 0); } finally { busy = false; }
      credit(c.owner, c.m, d);
    }
  }
  const P = G.Player.prototype;
  const pcast = P.cast;
  P.cast = function (m) {
    const r = pcast.apply(this, arguments);
    if (!m || !lab()) return r;
    if (m.frail) this._labFrail = { t: m.dur || 6, k: m.frail };
    if (m.curse && !this.remote) curse(this, m);
    onCast(this, m);
    return r;
  };
  // A per-cast × on the move's damage (combos, Magnitude...): Combat reads atkFor while it casts.
  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.apply(this, arguments);
    return m && m._castK ? k * m._castK : k;
  };
  /** For this cast only (until the frame's work is done): × damage k, × radius kr. */
  function boostCast(m, k, kr = 1) {
    const r0 = m.radius;
    m._castK = (m._castK || 1) * k;
    if (kr !== 1 && r0) m.radius = r0 * kr;
    queueMicrotask(() => { m._castK = 0; if (kr !== 1 && r0) m.radius = r0; });
  }
  const phurt = P.hurt;
  P.hurt = function (amount, type, pure, cat) {
    const f = this._labFrail;
    if (f && f.t > 0 && !this.remote && !pure) amount *= 1 + f.k;
    return phurt.call(this, amount, type, pure, cat);
  };
  function tickPlayer(p, dt) {
    const h = p._labHaste;
    if (h && (h.t -= dt) <= 0) p._labHaste = null;
    else if (h && Math.random() < dt * 14) G.FX.px(p.x - Math.cos(p.aim) * 10 + G.U.rand(-8, 8), p.y - G.U.rand(2, p.bodyH), '#e6f7ff', { vx: -Math.cos(p.aim) * 90, vy: -Math.sin(p.aim) * 60, life: 0.3 });
    if (p._labFrail && (p._labFrail.t -= dt) <= 0) p._labFrail = null;
    if (p._labCurseT > 0) p._labCurseT -= dt;
  }

  // ---------------- B3.5 decoys ----------------
  const authority = () => !G.Coop.active || G.Coop.isHost;
  let decoys = [];
  /** A decoy at (x, y) for `life` s: enemies within r chase it. */
  function decoy(owner, ghost, m, x, y, life, r) {
    const d = { owner, ghost, m, x, y, t: 0, life, r: r || m.decoyR || 200, powder: m.powder || 0, tick: 0 };
    for (const o of decoys) if (o.owner === owner && o.m.id === m.id && !o.field) o.gone = true;
    decoys.push(d);
    G.FX.ring(x, y, 6, d.r * 0.5, col(m), 0.5, 3);
    if (!ghost) G.FX.dmgText(x, y - 40, G.T(m.name, 'move') + '!', col(m), true);
    return d;
  }
  /** The decoy enemy e goes for (the nearest within its reach), or null. */
  function decoyFor(e) {
    if (!decoys.length || boss(e) || e.legend || e.behavior === 'thief') return null;
    let best = null, bd = Infinity;
    for (const d of decoys) {
      if (d.gone) continue;
      const dd = G.U.dist2(e.x, e.y, d.x, d.y);
      if (dd <= d.r * d.r && dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  /** Substitute's dolls (Combat's turret fields with `decoy`) are decoys while they stand. */
  function dollDecoys() {
    const live = new Set();
    for (const f of C.fields) {
      if (f.kind !== 'turret' || !f.m || !f.m.decoy || f.gone) continue;
      live.add(f);
      let d = decoys.find(o => o.field === f);
      if (!d) { d = decoy(f.owner, f.ghost, f.m, f.x, f.y, 1e9, f.m.decoyR); d.field = f; }
      d.x = f.x; d.y = f.y;
    }
    for (const d of decoys) if (d.field && !live.has(d.field)) d.gone = true;
  }
  function tickDecoys(dt) {
    dollDecoys();
    for (const d of decoys) {
      d.t += dt;
      if (d.powder && authority() && (d.tick -= dt) <= 0) {
        d.tick = 0.4;
        for (const e of G.EnemyMgr.queryCircle(d.x, d.y, d.r * 0.4)) if (!e.remote) e.applySlow(d.powder, 0.6);
      }
    }
    if (decoys.length) decoys = decoys.filter(d => !d.gone && d.t < d.life && d.owner);
  }
  // Follow Me, Rage Powder: shouts (kinds2.js) that also leave a decoy where their user stands.
  // Taunt, Attract: shouts whose cry also taunts or charms the enemies it reaches (B3.6).
  const shout = C.EXTRA.shout.run;
  C.EXTRA.shout.run = function (pl, m, ghost) {
    const r = shout.apply(this, arguments);
    if (!lab()) return r;
    if (m.decoy) decoy(pl, ghost, m, pl.x, pl.y, m.dur || 4, m.decoyR);
    if (m.taunt || m.attract) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius || 120)) {
      if (m.taunt && !boss(e)) taunt(e, m.dur || 5);
      if (m.attract) attract(e, (m.dur || 3) * (boss(e) ? 0.5 : 1));
    }
    return r;
  };
  // The enemies' AI (on the host, or solo): a decoy in reach is the target instead of the player;
  // a taunted shooter chases instead of keeping its distance and shooting.
  const eupdate = E.update;
  E.update = function (dt, pl) {
    const d = pl && !this.dead && !(this.labConf > 0) && authority() && decoyFor(this);
    const tnt = this._labTaunt > 0 && !boss(this) && this.keepsDistance();
    const b = this.behavior;
    if (tnt) this.behavior = 'chase';
    try {
      if (!d) return eupdate.apply(this, arguments);
      return eupdate.call(this, dt, { x: d.x, y: d.y, r: 10, level: pl.level, dead: false });
    } finally { if (tnt) this.behavior = b; }
  };

  // ---------------- B3.6 taunt and attract ----------------
  const charmed = new Set();
  function taunt(e, dur) { e._labTaunt = Math.max(e._labTaunt || 0, dur); charmed.add(e); }
  function attract(e, dur) { e._labAttract = Math.max(e._labAttract || 0, dur); e.touchCd = Math.max(e.touchCd, 0.2); charmed.add(e); }
  function tickCharmed(dt) {
    for (const e of charmed) {
      if (e._labTaunt > 0) e._labTaunt -= dt;
      if (e._labAttract > 0) { e._labAttract -= dt; e.touchCd = Math.max(e.touchCd, 0.2); }     // no contact hits (on every screen)
      if (e.dead || !(e._labTaunt > 0) && !(e._labAttract > 0)) { e._labTaunt = e._labAttract = 0; charmed.delete(e); }
    }
  }
  function drawCharmed(ctx, t) {
    for (const e of charmed) {
      if (e.dead || !G.Camera.sees(e.x, e.y, 60)) continue;
      const y = e.y - e.bodyH - 14 + Math.sin(t * 5 + e.id) * 1.5;
      if (e._labAttract > 0) G.VFX.draw(ctx, 'heart', 'fairy', e.x, y, { scale: 0.7 });
      else if (e._labTaunt > 0) {
        ctx.globalAlpha = 0.95; ctx.font = '800 12px Pixelify,"Segoe UI",sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3; ctx.fillStyle = '#ff5050';
        ctx.strokeText('!!', e.x, y); ctx.fillText('!!', e.x, y);
      }
    }
  }
  function drawDecoys(ctx, t) {
    for (const d of decoys) {
      if (!G.Camera.sees(d.x, d.y, d.r)) continue;
      const c = col(d.m), k = (t * 1.5) % 1, a = d.field ? 1 : Math.min(1, (d.life - d.t) * 2, d.t * 6);
      ctx.globalAlpha = 0.5 * (1 - k) * a; ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.5 * k + 8, (d.r * 0.5 * k + 8) * 0.6, 0, 0, 6.2832); ctx.stroke();
      if (d.field) continue;
      // A beacon: a light column and a "!" over it.
      ctx.globalAlpha = 0.35 * a; ctx.fillStyle = c;
      ctx.fillRect(d.x - 3, d.y - 46, 6, 46);
      ctx.globalAlpha = 0.9 * a; ctx.font = '800 14px Pixelify,"Segoe UI",sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; ctx.strokeText('!', d.x, d.y - 50); ctx.fillText('!', d.x, d.y - 50);
      if (d.powder) {
        ctx.globalAlpha = 0.18 * a;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.4, d.r * 0.24, 0, 0, 6.2832); ctx.fill();
      }
    }
  }

  // ---------------- B3.7 combos ----------------
  const COMBO_MS = 2000, PLEDGE_R = 90, PLEDGE_T = 6;
  const recent = {};                      // move id -> { at, pl } (anyone's casts, ghosts too)
  let pledges = [];
  const PLEDGE = {
    'fire+grass':  { kind: 'fire', name: 'Sea of fire', color: '#ff7a2a' },
    'grass+water': { kind: 'swamp', name: 'Swamp', color: '#4f7a3a' },
    'fire+water':  { kind: 'rainbow', name: 'Rainbow', color: '#ffd23f' }
  };
  function onCast(pl, m) {
    const t = now();
    if (m.haste && !pl.remote) haste(pl, m.haste, m.hasteT || 1.5);
    if (m.gust && !pl.remote) {
      const ps = G.Projectiles.all(), r2 = (m.radius || 96) ** 2;
      let n = 0;
      for (let i = ps.length - 1; i >= 0; i--) if (!ps[i].friendly && G.U.dist2(ps[i].x, ps[i].y, pl.x, pl.y) <= r2) { G.FX.burst(ps[i].x, ps[i].y, '#e6f7ff', 4, 60); ps.splice(i, 1); n++; }
      if (n) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, 'Blown away', '#e6f7ff');
    }
    if (m.magnitude) {
      const [n, k] = G.U.pick(MAGNITUDE);
      boostCast(m, k);
      if (!pl.remote) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, 'Magnitude ' + n + '!', col(m), n >= 9);
    }
    if (m.tailwind) {
      const me = G.Game.player;
      if (!pl.remote) haste(pl, m.tailwind, TAIL_T);
      else if (me && !me.dead && G.U.dist(me.x, me.y, pl.x, pl.y) <= TAIL_R) haste(me, m.tailwind, TAIL_T);
      G.FX.ring(pl.x, pl.y, 10, TAIL_R, '#c8f0ff', 0.4, 2);
    }
    if (m.combo) {
      const p = recent[m.combo];
      if (p && t - p.at < COMBO_MS) {
        boostCast(m, 2, 1.4);
        G.FX.ring(pl.x, pl.y, 8, 70, col(m), 0.4, 4);
        if (!pl.remote) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, 'Fusion ×2!', col(m), true);
      }
    }
    if (m.pledge) {
      for (const k in recent) {
        const p = recent[k], d = G.Moves.BY_ID[k];
        if (!d || !d.pledge || d.pledge === m.pledge || t - p.at >= COMBO_MS) continue;
        const kind = [d.pledge, m.pledge].sort().join('+'), reach = (m.count | 0 || 5) * 34 * 0.6;
        pledge(PLEDGE[kind], pl, pl.remote, m, pl.x + Math.cos(pl.aim) * reach, pl.y + Math.sin(pl.aim) * reach);
        delete recent[k];                                   // one field per pair
        break;
      }
    }
    recent[m.id] = { at: t, pl };
  }
  function pledge(def, owner, ghost, m, x, y) {
    if (!def) return null;
    const f = { def, owner, ghost, m, x, y, r: PLEDGE_R, t: 0, life: PLEDGE_T, tick: 0, dmg: ghost ? 0 : m.dmg * 0.3 * owner.atkFor(m) };
    pledges.push(f);
    G.FX.ring(x, y, 6, f.r, def.color, 0.5, 5);
    G.FX.dmgText(x, y - 30, def.name + '!', def.color, true);
    return f;
  }
  function tickPledges(dt) {
    const me = G.Game.player;
    for (const f of pledges) {
      f.t += dt;
      const inside = (x, y) => ((x - f.x) / f.r) ** 2 + ((y - f.y) / (f.r * 0.62)) ** 2 <= 1;
      if (f.def.kind === 'rainbow') { if (me && !me.dead && inside(me.x, me.y)) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.015 * dt); continue; }
      if (f.ghost || !f.owner || f.owner.dead || (f.tick -= dt) > 0) continue;
      f.tick = 0.5;
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
        if (!inside(e.x, e.y)) continue;
        if (f.def.kind === 'fire') { C.hit(f.owner, e, f.dmg, f.def.color, 0, 0, 0, f.m); if (!e.dead) e.applyBurn(1); }
        else e.applySlow(0.5, 0.7);
      }
    }
    if (pledges.length) pledges = pledges.filter(f => f.t < f.life);
  }
  function drawPledges(ctx) {
    for (const f of pledges) {
      if (!G.Camera.sees(f.x, f.y, f.r)) continue;
      const a = Math.min(1, (f.life - f.t) * 1.5, f.t * 5);
      if (f.def.kind === 'rainbow') {
        ['#ff5a5a', '#ffb43d', '#ffe14d', '#5fe08a', '#4fa8ff', '#b48cff'].forEach((c, i) => {
          ctx.globalAlpha = 0.22 * a; ctx.strokeStyle = c; ctx.lineWidth = 4;
          const rr = f.r * (1 - i * 0.12);
          ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.62, 0, 0, 6.2832); ctx.stroke();
        });
        continue;
      }
      ctx.globalAlpha = 0.25 * a; ctx.fillStyle = f.def.color;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = f.def.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.stroke();
      if (Math.random() < 0.3) G.FX.px(f.x + G.U.rand(-f.r, f.r) * 0.7, f.y + G.U.rand(-f.r, f.r) * 0.4, f.def.color, { vy: f.def.kind === 'fire' ? -40 : -10, life: 0.5 });
    }
  }

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

  // ---------------- B3.2 persistent hazard fields ----------------
  // Combat's mines burst on the first step (combat.js updateFields: an enemy within 14 px) and
  // last 7-8 s. A move with `persist` hands each new mine over to here before it can burst.
  const HZ_STEP = 14, HZ_REHIT = 1000, HZ_MAX = { spike: 10, web: 6, rock: 14 };
  let hz = [];
  /** A hazard of `kind` ('spike' | 'web' | 'rock') at (x, y) for the owner's move m. */
  function hazard(kind, owner, ghost, m, x, y, dmg, life) {
    const h = { kind, owner, ghost, m, x, y, dmg, t: 0, life: life || m.persist || m.rocks || 60, col: col(m), last: new Map(), flash: 0,
                area: kind === 'web' ? (m.radius || 56) * 0.6 : kind === 'rock' ? 24 : Math.max(20, (m.radius || 60) * 0.45), tick: 0 };
    hz.push(h);
    const mine = hz.filter(o => o.owner === owner && o.kind === kind && o.m.id === m.id && !o.gone);
    for (const o of mine.slice(0, Math.max(0, mine.length - HZ_MAX[kind]))) o.gone = true;
    return h;
  }
  /** Mines with `persist` and landing meteors with `rocks` (in Combat's fields) become hazards. */
  function takeOver(dt) {
    const fs = C.fields;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i], m = f.m;
      if (!m) continue;
      if (f.kind === 'mine' && m.persist) {
        fs.splice(i, 1);
        hazard(m.web ? 'web' : 'spike', f.owner, f.ghost, m, f.x, f.y, f.dmg);
        G.FX.ring(f.x, f.y, 4, 22, f.col, 0.25, 2);
      } else if (f.kind === 'meteor' && m.rocks && !f._rock && f.t + dt >= f.fall) {
        f._rock = true;
        hazard('rock', f.owner, f.ghost, m, f.x, f.y, f.dmg * 0.6, m.rocks);
      }
    }
  }
  function tickHz(h, dt) {
    if (h.flash > 0) h.flash -= dt;
    if (h.ghost || !h.owner || h.owner.dead) return;
    const tnow = now();
    if (h.kind === 'web') {
      if ((h.tick -= dt) > 0) return;
      h.tick = 0.25;
      for (const e of G.EnemyMgr.queryCircle(h.x, h.y, h.area)) {
        e.applySlow(Math.min(0.85, h.m.slow || 0.6), 0.6);
        const last = h.last.get(e.id);
        if (last == null || tnow - last > HZ_REHIT * 2.5) { h.last.set(e.id, tnow); C.hit(h.owner, e, h.dmg * 0.5, h.col, 0, 0, 0, h.m); h.flash = 0.2; }
      }
      return;
    }
    // Spikes and stones: a step on one (within 14 px of it) hurts what's around it.
    if (!G.EnemyMgr.queryCircle(h.x, h.y, HZ_STEP).length) return;
    for (const e of G.EnemyMgr.queryCircle(h.x, h.y, h.area)) {
      const last = h.last.get(e.id);
      if (last != null && tnow - last < HZ_REHIT) continue;
      h.last.set(e.id, tnow);
      C.hit(h.owner, e, h.dmg, h.col, e.x - h.x, e.y - h.y, h.kind === 'rock' ? 60 : 0, h.m);
      h.flash = 0.15;
    }
    if (h.last.size > 200) for (const [k, t] of h.last) if (tnow - t > HZ_REHIT * 3) h.last.delete(k);
  }
  function drawHz(ctx, h) {
    ctx.globalAlpha = Math.max(0, Math.min(1, (h.life - h.t) / 3, h.t * 5));
    if (h.kind === 'web') {
      ctx.strokeStyle = h.flash > 0 ? '#ffffff' : 'rgba(235,235,250,.8)'; ctx.lineWidth = 1;
      for (const k of [1, 0.62, 0.3]) { ctx.beginPath(); ctx.ellipse(h.x, h.y, h.area * k, h.area * k * 0.6, 0, 0, 6.2832); ctx.stroke(); }
      for (let i = 0; i < 6; i++) { const q = i / 6 * 6.2832; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(q) * h.area, h.y + Math.sin(q) * h.area * 0.6); ctx.stroke(); }
      return;
    }
    // Spikes: three small points; Stealth Rock: two big pointed stones.
    const big = h.kind === 'rock', n = big ? 2 : 3, sz = big ? 9 : 5;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(h.x, h.y + 1, sz * 1.6, sz * 0.6, 0, 0, 6.2832); ctx.fill();
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * sz * 0.9, hgt = sz * (big ? 1.7 - i * 0.4 : i === 1 ? 1.3 : 1);
      ctx.fillStyle = h.flash > 0 ? '#ffffff' : h.col; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(h.x + ox - sz * 0.5, h.y); ctx.lineTo(h.x + ox, h.y - hgt); ctx.lineTo(h.x + ox + sz * 0.5, h.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  // ---------------- every frame ----------------
  const update = C.updateFields;
  C.updateFields = function (dt) {
    if (lab()) takeOver(dt);
    update.apply(this, arguments);
    tickMarks(dt);
    tickCurses(dt);
    tickDecoys(dt);
    tickCharmed(dt);
    tickPledges(dt);
    const pl = G.Game.player;
    if (pl) tickPlayer(pl, dt);
    if (G.Coop.active) for (const p of G.Coop.puppets()) tickPlayer(p, dt);
    for (const h of hz) { h.t += dt; if (!h.gone && h.t < h.life) tickHz(h, dt); }
    if (hz.length) hz = hz.filter(h => !h.gone && h.t < h.life && h.owner);
  };
  const ground = C.drawGroundFields;
  C.drawGroundFields = function (ctx) {
    ground.apply(this, arguments);
    ctx.save();
    for (const h of hz) if (G.Camera.sees(h.x, h.y, 60)) drawHz(ctx, h);
    if (decoys.length) drawDecoys(ctx, now() / 1000);
    if (pledges.length) drawPledges(ctx);
    // Shell Smash: a cracked red ring under whoever is frail.
    for (const p of [G.Game.player].concat(G.Coop.active ? G.Coop.puppets() : [])) {
      if (!p || p.dead || !p._labFrail) continue;
      const a = (now() / 1000) * 2;
      ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.7, p.r * 0.7, 0, a + i * 1.57, a + i * 1.57 + 1.1); ctx.stroke(); }
    }
    ctx.restore();
  };
  const clear = C.clearFields;
  C.clearFields = function (owner) {
    clear.apply(this, arguments);
    hz = owner ? hz.filter(h => h.owner !== owner) : [];
    decoys = owner ? decoys.filter(d => d.owner !== owner) : [];
    pledges = owner ? pledges.filter(f => f.owner !== owner) : [];
    if (!owner) for (const k in recent) delete recent[k];
    if (!owner) {
      for (const e of marked) e._labMark = null; marked.clear();
      for (const e of cursed) e._labCurse = null; cursed.clear();
      for (const e of charmed) e._labTaunt = e._labAttract = 0; charmed.clear();
    }
    else for (const e of marked) if (e._labMark && e._labMark.owner === owner) { e._labMark = null; marked.delete(e); }
  };
  const air = C.drawAirFields;
  C.drawAirFields = function (ctx) {
    air.apply(this, arguments);
    if (!marked.size && !cursed.size && !charmed.size) return;
    const t = now() / 1000;
    ctx.save();
    drawCharmed(ctx, t);
    ctx.globalAlpha = 1;
    // Cursed: purple wisps rising off it.
    for (const e of cursed) {
      if (e.dead || !G.Camera.sees(e.x, e.y, 60)) continue;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.9 + i / 3) % 1;
        ctx.globalAlpha = 0.8 * (1 - k); ctx.fillStyle = '#b48cff';
        ctx.beginPath(); ctx.arc(e.x + Math.sin(t * 3 + i * 2) * e.r * 0.6, e.y - e.bodyH * (0.6 + k * 0.8), 2.5 * (1 - k) + 1, 0, 6.2832); ctx.fill();
      }
    }
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
    /** B3.2: a hazard ('spike' | 'web' | 'rock') of pl's move m at (x, y): dmg per step, life s. */
    hazard: (kind, pl, m, x, y, dmg, life) => hazard(kind, pl, false, m, x, y, dmg, life),
    hazards: () => hz,
    /** B3.3: the × a hit of m on e would get from its converters (and their side effects). */
    convert,
    /** B3.4: Curse's start for pl (cost and target); → the cursed enemy or null. */
    curse,
    /** B3.5: a decoy of pl's move m at (x, y) for life s (enemies within r chase it). */
    decoy: (pl, m, x, y, life, r) => decoy(pl, false, m, x, y, life, r),
    decoys: () => decoys, decoyFor,
    /** B3.6: taunt (shooters charge you, s) and attract (no contact hits, s) on enemy e. */
    taunt, attract,
    /** B3.7: × damage k and × radius kr on m for its current cast only; the Pledge fields. */
    boostCast, pledges: () => pledges, COMBO_MS,
    /** B1: Endeavor's extra for a hit; +k speed for s seconds. */
    endeavor, haste,
    MARK_R, HZ_STEP,
    counts: () => ({ marked: marked.size, hazards: hz.length })
  };
})();
