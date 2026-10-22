/* ============ abilities.js — Lab mode abilities (MrSurvivor fork) ============
 * Phase 3 of fork/LAB.md. In a Lab run your Pokémon has the ability upstream picked for it
 * (G.Mons.abilityOf: rolled per account, Ability Capsules, 1 in 20 hidden). If it's one implemented
 * here, Lab's version runs instead of upstream's (setAbility, at the end); if not, upstream's runs.
 * Never both (plan D2, 2026-10-22; until then Lab gave the first of its abilities implemented here,
 * on top of upstream's).
 *
 * Each ability is a DEF entry with whatever it needs:
 *   out(pl, m)               × to your attacks' damage (Player.atkFor)
 *   in(pl, amount, type, cat)  × to the damage you take; 0 = it does nothing to you (Player.hurt)
 *   after(pl, type, cat)     you were just hit (and it hurt)
 *   contact(pl, e)           an enemy hits you in melee (Enemy.strike)
 *   spd(pl)                  × to your speed (Player.spd)
 *   tick(pl, dt)             every frame (Player.update)
 *   start(pl)                when the run starts
 *   learn(pl, m)             when you learn a move (Player.addMove; and the ones you already had)
 *   sw(pl)                   when you switch the active move (Player.setActive)
 *   buff(pl)                 × to the strength of your stat boosts (Player.addBuff)
 * The hooks are set once, on load, and only do something with pl.labAbility (set by
 * setAbility on your Pokémon in a Lab run; never on your teammates').
 *
 * Co-op: it all belongs to your Pokémon. What it does to enemies that touch you (Static,
 * Rough Skin...) uses applyStun/applyPoison/hurt, which on a guest are already sent to the host.
 * Texts in English only (fork/LAB.md). Test: fork/test-lab.cjs.
 */
G.LabAbilities = (() => {
  const D = G.LabData;
  const W = kind => { const c = G.Weather.current; return !!(c && c.kind === kind); };
  const low = pl => pl.hp <= pl.maxHp / 3;
  const pinch = type => (pl, m) => m.type === type && low(pl) ? 1.5 : 1;
  const own = (pl, m) => pl.mon.types.includes(m.type);
  const power = m => D.POWER[D.MOVES.indexOf(m.id)] || 0;
  const CONTACT = new Set(['melee', 'dash', 'spin', 'grab', 'bind']);
  const SHEER = ['burn', 'poison', 'slow'];
  const boss = e => e.boss || e.judge;

  /** Floating text over your Pokémon (at most one every 0.7 s per key). */
  function note(pl, text, color = '#e8e2ff', key = text) {
    const now = performance.now(), t = pl._labNote || (pl._labNote = {});
    if (now - (t[key] || 0) < 700) return;
    t[key] = now;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, text, color);
  }
  /** Absorbs a type: it doesn't hurt you and gives you something (at most once a second). */
  const absorb = (type, gain, label) => (pl, amount, t) => {
    if (t !== type) return 1;
    const now = performance.now();
    if (now - (pl._labAbsorb || 0) > 1000) { pl._labAbsorb = now; gain(pl, amount); }
    note(pl, label, G.U.TYPE_COLOR[type]);
    return 0;
  };
  const heal = k => (pl, amount) => pl.heal(amount * k);
  const buff = (stat, amount) => pl => pl.addBuff(stat, amount, 7, 5);
  /** When it touches you: with chance p, `fx` happens to the enemy. */
  const touch = (p, fx) => (pl, e) => { if (!e.dead && Math.random() < p) fx(e, pl); };
  const stun = dur => e => e.applyStun(dur * (boss(e) ? 0.35 : 1));
  const thorns = (pl, e) => { if (!e.dead) e.hurt(11 + pl.level * 3, '#9aa6b5', e.x - pl.x, e.y - pl.y, 40); };
  // Read the KOs for Moxie / Beast Boost: pl.kills goes up in EnemyMgr (in a group, the team's).
  const onKill = gain => (pl) => {
    if (pl._labKills == null) pl._labKills = pl.kills;
    if (pl.kills > pl._labKills) { pl._labKills = pl.kills; gain(pl); }
  };
  const WX_HEAL = 0.006;                       // HP per second in its weather (1/16 per turn in the games)

  const DEF = {
    // ---- more damage with their own type when you're in trouble (1/3 HP or less) ----
    overgrow: { out: pinch('grass'), desc: 'Grass moves deal 50% more damage while your HP is at 1/3 or less.' },
    blaze:    { out: pinch('fire'), desc: 'Fire moves deal 50% more damage while your HP is at 1/3 or less.' },
    torrent:  { out: pinch('water'), desc: 'Water moves deal 50% more damage while your HP is at 1/3 or less.' },
    swarm:    { out: pinch('bug'), desc: 'Bug moves deal 50% more damage while your HP is at 1/3 or less.' },

    // ---- weather (js/systems/weather.js) ----
    'swift-swim':  { spd: pl => W('rain') ? 1.4 : 1, desc: '40% faster in the rain.' },
    chlorophyll:   { spd: pl => W('sun') ? 1.4 : 1, desc: '40% faster in harsh sunlight.' },
    'sand-rush':   { spd: pl => W('sand') ? 1.4 : 1, desc: '40% faster in a sandstorm.' },
    'slush-rush':  { spd: pl => W('snow') ? 1.4 : 1, desc: '40% faster in snow.' },
    'rain-dish':   { tick: (pl, dt) => { if (W('rain')) pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * WX_HEAL * dt); }, desc: 'Slowly regain HP in the rain.' },
    'ice-body':    { tick: (pl, dt) => { if (W('snow')) pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * WX_HEAL * dt); }, desc: 'Slowly regain HP in snow.' },
    'sand-veil':   { in: pl => W('sand') && Math.random() < 0.2 ? (note(pl, 'Miss', '#e0bf73'), 0) : 1, desc: 'In a sandstorm, 1 in 5 hits miss you.' },
    'snow-cloak':  { in: pl => W('snow') && Math.random() < 0.2 ? (note(pl, 'Miss', '#d8f1ff'), 0) : 1, desc: 'In snow, 1 in 5 hits miss you.' },
    'solar-power': { out: (pl, m) => W('sun') && m.cat === 'special' ? 1.3 : 1,
                     tick: (pl, dt) => { if (W('sun')) pl.hp = Math.max(1, pl.hp - pl.maxHp * 0.004 * dt); },
                     desc: 'In harsh sunlight, special moves deal 30% more damage, but you slowly lose HP.' },
    'sand-force':  { out: (pl, m) => W('sand') && ['rock', 'ground', 'steel'].includes(m.type) ? 1.3 : 1,
                     desc: 'In a sandstorm, Rock, Ground and Steel moves deal 30% more damage.' },
    'dry-skin':    { in: (pl, amount, t) => t === 'water' ? absorb('water', heal(0.5), 'Dry Skin')(pl, amount, t) : t === 'fire' ? 1.25 : 1,
                     tick: (pl, dt) => {
                       if (W('rain')) pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * WX_HEAL * dt);
                       else if (W('sun')) pl.hp = Math.max(1, pl.hp - pl.maxHp * 0.004 * dt);
                     },
                     desc: 'Water hits heal you instead and rain slowly heals you, but Fire hurts 25% more and sunlight slowly drains you.' },

    // ---- damage you take ----
    intimidate:  { in: (pl, a, t, cat) => cat === 'physical' ? 0.75 : 1, desc: 'Enemies deal 25% less physical damage to you.' },
    levitate:    { in: (pl, a, t) => t === 'ground' ? (note(pl, 'Levitate', '#aa7c3c'), 0) : 1, desc: 'Ground-type attacks can\'t touch you.' },
    'thick-fat': { in: (pl, a, t) => t === 'fire' || t === 'ice' ? 0.5 : 1, desc: 'Fire and Ice attacks deal half damage to you.' },
    heatproof:   { in: (pl, a, t) => t === 'fire' ? 0.5 : 1, desc: 'Fire attacks deal half damage to you.' },
    filter:      { in: (pl, a, t) => t && G.Types.mult(t, pl.mon.types) > 1 ? 0.75 : 1, desc: 'Super-effective hits deal 25% less damage to you.' },
    'solid-rock':  { in: (pl, a, t) => t && G.Types.mult(t, pl.mon.types) > 1 ? 0.75 : 1, desc: 'Super-effective hits deal 25% less damage to you.' },
    'prism-armor': { in: (pl, a, t) => t && G.Types.mult(t, pl.mon.types) > 1 ? 0.75 : 1, desc: 'Super-effective hits deal 25% less damage to you.' },
    multiscale:  { in: pl => pl.hp >= pl.maxHp - 0.5 ? 0.5 : 1, desc: 'At full HP, you take half damage.' },
    'shadow-shield': { in: pl => pl.hp >= pl.maxHp - 0.5 ? 0.5 : 1, desc: 'At full HP, you take half damage.' },
    'magic-guard': { in: (pl, a, t) => !t ? 0 : 1, desc: 'Lava and traps can\'t hurt you (only attacks can).' },
    'wonder-guard': {
      in: (pl, a, t) => t && G.Types.mult(t, pl.mon.types) <= 1 ? (note(pl, 'Wonder Guard', '#ffe14d'), 0) : 1,
      start: pl => { pl.maxHp = Math.max(1, Math.round(pl.maxHp / 2)); pl.hp = pl.maxHp; },
      desc: 'Only super-effective attacks (and lava and traps) can hurt you, but you have half the HP.'
    },
    sturdy: { desc: 'A hit that would knock you out from half HP or more leaves you at 1 HP (once a minute).' },   // in hurt

    // ---- absorb a type ----
    'water-absorb':   { in: absorb('water', heal(0.5), 'Water Absorb'), desc: 'Water attacks heal you instead of hurting you.' },
    'volt-absorb':    { in: absorb('electric', heal(0.5), 'Volt Absorb'), desc: 'Electric attacks heal you instead of hurting you.' },
    'flash-fire':     { in: absorb('fire', pl => { pl._labFire = 8; }, 'Flash Fire'),
                        out: (pl, m) => m.type === 'fire' && pl._labFire > 0 ? 1.5 : 1,
                        tick: (pl, dt) => { if (pl._labFire > 0) pl._labFire -= dt; },
                        desc: 'Fire attacks don\'t hurt you; being hit by one powers up your Fire moves by 50% for 8 s.' },
    'lightning-rod':  { in: absorb('electric', buff('satk', 0.13), 'Lightning Rod'), desc: 'Electric attacks don\'t hurt you and raise your Special Attack instead.' },
    'storm-drain':    { in: absorb('water', buff('satk', 0.13), 'Storm Drain'), desc: 'Water attacks don\'t hurt you and raise your Special Attack instead.' },
    'motor-drive':    { in: absorb('electric', buff('spd', 0.10), 'Motor Drive'), desc: 'Electric attacks don\'t hurt you and raise your Speed instead.' },
    'sap-sipper':     { in: absorb('grass', buff('patk', 0.13), 'Sap Sipper'), desc: 'Grass attacks don\'t hurt you and raise your Attack instead.' },

    // ---- when you take a hit ----
    rattled:      { after: (pl, t) => { if (t === 'bug' || t === 'ghost' || t === 'dark') buff('spd', 0.10)(pl); }, desc: 'Being hit by a Bug, Ghost or Dark attack raises your Speed.' },
    justified:    { after: (pl, t) => { if (t === 'dark') buff('patk', 0.13)(pl); }, desc: 'Being hit by a Dark attack raises your Attack.' },
    'weak-armor': { after: (pl, t, cat) => { if (cat === 'physical') buff('spd', 0.10)(pl); }, desc: 'Being hit by a physical attack raises your Speed.' },

    // ---- when touched (melee) ----
    static:         { contact: touch(0.3, stun(1)), desc: 'Enemies that touch you may be paralyzed (stopped for 1 s).' },
    'poison-point': { contact: touch(0.3, e => e.applyPoison(2)), desc: 'Enemies that touch you may be poisoned.' },
    'flame-body':   { contact: touch(0.3, e => e.applyBurn(2)), desc: 'Enemies that touch you may be burned.' },
    'cute-charm':   { contact: touch(0.3, stun(1.2)), desc: 'Enemies that touch you may fall in love and stop attacking for a moment.' },
    'effect-spore': { contact: touch(0.3, e => [stun(1), x => x.applyPoison(2), x => x.applySlow(0.5, 2)][Math.floor(Math.random() * 3)](e)),
                      desc: 'Enemies that touch you may be paralyzed, poisoned or slowed.' },
    'rough-skin':   { contact: thorns, desc: 'Enemies that touch you take damage.' },
    'iron-barbs':   { contact: thorns, desc: 'Enemies that touch you take damage.' },
    pressure:       { contact: (pl, e) => { e.touchCd += 0.25; }, desc: 'Enemies touching you attack about 30% less often.' },

    // ---- your attacks ----
    technician:      { out: (pl, m) => !m.evolved && power(m) > 0 && power(m) <= 60 ? 1.5 : 1, desc: 'Moves that are weak in the games (60 power or less) deal 50% more damage.' },
    'iron-fist':     { out: (pl, m) => /Puño|puño|Punch/.test(m.name) ? 1.2 : 1, desc: 'Punching moves deal 20% more damage.' },
    'strong-jaw':    { out: (pl, m) => /Mordisco|Triturar|colmillo|Fang/i.test(m.name) ? 1.5 : 1, desc: 'Biting moves deal 50% more damage.' },
    'mega-launcher': { out: (pl, m) => /Esfera Aural|Pulso/.test(m.name) ? 1.5 : 1, desc: 'Aura and pulse moves deal 50% more damage.' },
    sharpness:       { out: (pl, m) => /^(Tajo Aéreo|Tajo Umbrío|Psicocorte|Hoja Afilada|Golpe Aéreo|Tijera X|Cuchilla Solar)$/.test(m.name) ? 1.5 : 1,
                       desc: 'Slicing moves deal 50% more damage.' },
    'tough-claws':   { out: (pl, m) => CONTACT.has(m.kind) ? 1.3 : 1, desc: 'Moves that hit up close (melee, dash and spin) deal 30% more damage.' },
    'huge-power':    { out: (pl, m) => m.cat === 'physical' ? 1.6 : 1, desc: 'Physical moves deal 60% more damage (it doubles Attack in the games).' },
    'pure-power':    { out: (pl, m) => m.cat === 'physical' ? 1.6 : 1, desc: 'Physical moves deal 60% more damage (it doubles Attack in the games).' },
    adaptability:    { out: (pl, m) => m.kind !== 'buff' && own(pl, m) ? 1.25 : 1, desc: 'Moves of your own type deal 25% more damage.' },
    // learn changes the move itself; unlearn puts it back when the ability goes (an evolution, off()).
    'sheer-force':   { out: (pl, m) => m.labSheer ? 1.3 : 1,
                       learn: (pl, m) => { if (m.kind !== 'stun' && !m.labSheer && SHEER.some(k => m[k])) { m.labSheer = {}; for (const k of SHEER) { m.labSheer[k] = m[k]; m[k] = 0; } } },
                       unlearn: (pl, m) => { if (m.labSheer) { for (const k of SHEER) m[k] = m.labSheer[k]; delete m.labSheer; } },
                       desc: 'Moves that burn, poison or slow lose that effect but deal 30% more damage.' },
    'skill-link':    { learn: (pl, m) => { if ((m.count | 0) >= 2 && !m.labSkill) { m.count += 1; m.labSkill = true; } },
                       unlearn: (pl, m) => { if (m.labSkill) { m.count -= 1; delete m.labSkill; } },
                       desc: 'Moves that hit several times hit once more.' },
    prankster:       { learn: (pl, m) => { if (m.kind === 'buff' && !m.labPrank) { m.cd *= 0.7; m.labPrank = true; } },
                       unlearn: (pl, m) => { if (m.labPrank) { m.cd /= 0.7; delete m.labPrank; } },
                       desc: 'Stat-boosting moves recharge 30% faster.' },
    simple:          { buff: () => 2, desc: 'Your stat boosts are twice as strong.' },
    // recoil: Double-Edge, Flare Blitz... (js/fork/lab/kinds.js, phase 4)
    'rock-head':     { desc: 'Recoil moves (Double-Edge, Head Smash...) don\'t hurt you.' },      // in kinds.js
    reckless:        { out: (pl, m) => m.kind === 'recoil' ? 1.2 : 1, desc: 'Recoil moves deal 20% more damage.' },

    // ---- over time ----
    'speed-boost':  { tick: (pl, dt) => { pl._labSB = (pl._labSB || 0) + dt; if (pl._labSB >= 8) { pl._labSB = 0; pl.addBuff('spd', 0.08, 9, 5); } },
                      desc: 'Your Speed keeps rising as the run goes on.' },
    moxie:          { tick: onKill(pl => pl.addBuff('patk', 0.05, 4, 5)), desc: 'Knocking out enemies keeps raising your Attack for a few seconds.' },
    'beast-boost':  { tick: onKill(pl => pl.addBuff(G.Stats.sideOf(pl.mon) === 'special' ? 'satk' : 'patk', 0.05, 4, 5)),
                      desc: 'Knocking out enemies keeps raising your best attacking stat for a few seconds.' },
    'shed-skin':    { tick: (pl, dt) => { if (pl.slowT > 0 && Math.random() < 0.3 * dt) { pl.slowT = 0; note(pl, 'Shed Skin', '#c6b08a'); } },
                      desc: 'You may shake off sticky slowdowns on your own.' },
    limber:         { tick: pl => { if (pl.slowT > 0) pl.slowT = 0; }, desc: 'Sticky traps can\'t slow you down.' },

    // ---- when you switch moves ----
    regenerator:    { sw: pl => { const now = performance.now(); if (now - (pl._labRegen || 0) > 4000) { pl._labRegen = now; pl.heal(pl.maxHp * 0.06); } },
                      desc: 'Switching your active move heals 6% of your HP (once every 4 s).' },
    'natural-cure': { sw: pl => { pl.slowT = 0; }, desc: 'Switching your active move shakes off sticky slowdowns.' },

    // ---- for the whole run ----
    unburden:       { spd: pl => pl.item ? 1 : 1.25, desc: '25% faster while you hold no item.' },
    pickup:         { start: pl => { pl.coinMul *= 1.2; }, desc: '20% more coins.' },
    'super-luck':   { start: pl => { pl.critChance += 0.08; }, desc: '+8% chance of critical hits.' }
  };
  for (const id in DEF) DEF[id].name = D.abilName[id] || id;

  // ---------------- which ability each one gets ----------------

  /** → { id, name, desc, on } for this species (on = it has an effect here): the first of its abilities
   *  implemented here. Only for coverage numbers now; runs use upstream's pick (setAbility below). */
  function of(dex) {
    const list = (D.abil[dex] || '').split(' ').filter(Boolean).map(s => s.replace('*', ''));
    const id = list.find(a => DEF[a]) || list[0];
    if (!id) return null;
    return DEF[id] ? { id, name: DEF[id].name, desc: DEF[id].desc, on: true }
                   : { id, name: D.abilName[id] || id, desc: 'No effect in this game yet.', on: false };
  }

  // ---------------- hooks ----------------
  const P = G.Player.prototype, E = G.Enemy.prototype;
  const def = pl => pl.labAbility && DEF[pl.labAbility];

  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.call(this, m), d = def(this);
    return d && d.out && m ? k * d.out(this, m) : k;
  };

  // Sturdy: almost going down with Sturdy doesn't count as a down (G.RunStats.down).
  let saving = false;
  const down = G.RunStats.down;
  G.RunStats.down = function () { if (!saving) return down.apply(this, arguments); };

  const hurt = P.hurt;
  P.hurt = function (amount, type = null, pure = false, cat = null) {
    const d = def(this);
    if (!d || pure || this.dead || this.invuln > 0 || this.god) return hurt.call(this, amount, type, pure, cat);
    if (d.in) {
      const k = d.in(this, amount, type, cat);
      if (!k) return;
      amount *= k;
    }
    const now = performance.now(), hp0 = this.hp;
    const sturdy = this.labAbility === 'sturdy' && hp0 >= this.maxHp * 0.5 && now - (this._labSturdy || -1e9) > 60000;
    saving = sturdy;
    try { hurt.call(this, amount, type, pure, cat); } finally { saving = false; }
    if (sturdy && this.dead) {
      this.dead = false; this.hp = 1; this.invuln = 1.2; this._labSturdy = now;
      this.anim._start('Idle', false);
      note(this, 'Sturdy!', '#c6b08a');
      G.FX.ring(this.x, this.y, 6, 70, '#c6b08a', 0.5, 4);
    }
    if (d.after && this.hp < hp0 && !this.dead) d.after(this, type, cat);
  };

  const spd = Object.getOwnPropertyDescriptor(P, 'spd');
  Object.defineProperty(P, 'spd', {
    configurable: true,
    get() {
      const s = spd.get.call(this), d = def(this);
      return d && d.spd && !(G.Judgment && G.Judgment.active) ? s * d.spd(this) : s;
    }
  });

  const update = P.update;
  P.update = function (dt) {
    update.call(this, dt);
    const d = def(this);
    if (d && d.tick && !this.dead) d.tick(this, dt);
  };

  const setActive = P.setActive;
  P.setActive = function (i) {
    const before = this.active;
    setActive.call(this, i);
    const d = def(this);
    if (d && d.sw && this.active !== before) d.sw(this);
  };

  const addMove = P.addMove;
  P.addMove = function (id) {
    const ok = addMove.call(this, id), d = def(this);
    if (ok && d && d.learn) d.learn(this, this.moves[this.moves.length - 1]);
    return ok;
  };

  const addBuff = P.addBuff;
  P.addBuff = function (stat, amount, dur, maxStacks) {
    const d = def(this);
    return addBuff.call(this, stat, d && d.buff ? amount * d.buff(this) : amount, dur, maxStacks);
  };

  // An enemy touches you (Combat.resolve: e.touchCd, e.strike(pl), pl.hurt...).
  const strike = E.strike;
  E.strike = function (pl) {
    strike.call(this, pl);
    const d = pl && !pl.remote && !pl.dead && def(pl);
    if (d && d.contact) d.contact(pl, this);
  };

  // ---------------- one ability per run (plan D2, resolver A) ----------------
  // Upstream picks the run's ability (game.js: pl.setAbility(G.Mons.abilityOf(dex).id), which honours
  // Ability Capsules and the 1-in-20 hidden roll). In a Lab run, if Lab implements that same ability,
  // Lab's version runs and upstream's doesn't (pl.abil = null: every upstream reader allows null);
  // otherwise upstream's runs and Lab adds nothing. Before, both ran: Blaze x1.5 and x1.35 (x2.0),
  // Thick Fat x0.5 and x0.6 (x0.3), two Sturdies. Test: fork/test-lab-abilities.cjs.
  // What an ability's start can change on the player (upstream's ability-fx.js and DEF above): the change is
  // kept (pl._abilFx) so off() can take it back when a Lab evolution brings another ability (plan D3).
  const ADD = ['critChance', 'regenFlat'], MUL = ['coinMul', 'magnet', 'cdMul', 'maxHp'];
  const setAbility = P.setAbility;
  P.setAbility = function (id) {
    const d = id && DEF[id], lab = !!(G.Lab && G.Lab.active) && this === G.Game.player;
    const before = {};
    for (const k of ADD.concat(MUL)) before[k] = this[k];
    this.labAbility = null;
    if (lab && this._labSlot == null) {          // the run's slot (0, 1 or 2 hidden): an evolution keeps it
      const a = G.Mons.abilityOf(this.dex);
      this._labSlot = a.id === id ? a.slot : Math.max(0, G.Mons.slots(this.dex).indexOf(id));
    }
    let r;
    if (!d || !lab) r = setAbility.apply(this, arguments);
    else {
      this.abilId = id;
      this.abil = null;
      this.labAbility = id;
      if (d.start) d.start(this);
      if (d.learn) for (const m of this.moves) d.learn(this, m);
    }
    const fx = this._abilFx = {};
    for (const k of ADD) if (this[k] !== before[k]) fx[k] = this[k] - before[k];
    for (const k of MUL) if (this[k] !== before[k] && before[k]) fx[k] = this[k] / before[k];
    return r;
  };

  /** Takes the current ability off: Lab's changes to the moves, and what its start did (both engines). */
  function off(pl) {
    const d = def(pl);
    if (d && d.unlearn) for (const m of pl.moves) d.unlearn(pl, m);
    const fx = pl._abilFx || {};
    for (const k of ADD) if (fx[k]) pl[k] -= fx[k];
    for (const k of MUL) if (fx[k] && k !== 'maxHp') pl[k] /= fx[k];
    if (fx.maxHp) { pl.maxHp = Math.max(1, Math.round(pl.maxHp / fx.maxHp)); pl.hp = Math.min(pl.hp, pl.maxHp); }
    pl._abilFx = null; pl.labAbility = null; pl.abil = null;
  }

  /**
   * A Lab evolution (js/fork/lab/growth.js): the new species' ability in the same slot as the run's
   * (Charmander's hidden Solar Power stays Solar Power; Venonat's Compound Eyes becomes Venomoth's
   * Shield Dust), resolved again like at the start. → its describe() for the HUD.
   */
  function evolve(pl) {
    const l = G.Mons.slots(pl.dex), slot = pl._labSlot | 0;
    const id = l[slot] || l[0] || '';
    if (id && id === pl.abilId) return describe(id, pl.mon);
    off(pl);
    pl.setAbility(id);
    return describe(pl.abilId, pl.mon);
  }

  /** What the HUD and the pause menu show for an ability id: { id, name, desc, lab } (lab = Lab's version runs).
   *  upstream: upstream's text even when Lab has its own (a normal run, js/fork/ability-show.js). */
  function describe(id, mon, upstream) {
    if (!id) return null;
    if (DEF[id] && !upstream) return { id, name: DEF[id].name, desc: DEF[id].desc, on: true, lab: true };
    const fx = G.AbilityFX.of(id, mon);
    return { id, name: G.Mons.abilityName(id) || D.abilName[id] || id, desc: [fx.d, fx.d2].filter(Boolean).map(t => G.T(t)).join(' '), on: true, lab: false };
  }

  // The collection card: with the Lab setting on, an "In Lab: ..." line under the ability when Lab has its
  // own version (its numbers differ from upstream's). Hook: G.VariantBonus.detail (showDetail in menu.js).
  document.addEventListener('DOMContentLoaded', () => {
    const detail = G.VariantBonus && G.VariantBonus.detail;
    if (!detail) return;
    G.VariantBonus.detail = function (dex) {
      const r = detail.apply(this, arguments);
      const box = document.querySelector('#dex-detail .mx-desc'), id = G.Mons.abilityOf(dex).id;
      if (box && G.Settings.get('lab') && DEF[id] && !box.parentNode.querySelector('.lab-abil-note'))
        box.insertAdjacentHTML('afterend', `<p class="sub mx-desc lab-abil-note"><span class="lab-badge">LAB</span> In Lab: ${G.Lab.esc(DEF[id].desc)}</p>`);
      return r;
    };
  });

  return { DEF, of, describe, evolve, off };
})();
