/* ============ abilities.js — habilidades del modo Lab (fork MrSurvivor) ============
 * Fase 3 de fork/LAB.md. En una partida Lab tu Pokémon tiene UNA de sus habilidades de los
 * juegos (G.LabData.abil, por orden de slot): la primera que esté hecha aquí. Si ninguna lo
 * está, lleva la primera, sin efecto ("No effect in this game yet").
 *
 * Cada habilidad es una entrada de DEF con lo que necesite:
 *   out(pl, m)               × al daño de tus ataques (Player.atkFor)
 *   in(pl, amount, type, cat)  × al daño que recibes; 0 = no te hace nada (Player.hurt)
 *   after(pl, type, cat)     te acaban de golpear (y te ha dolido)
 *   contact(pl, e)           un enemigo te golpea cuerpo a cuerpo (Enemy.strike)
 *   spd(pl)                  × a tu velocidad (Player.spd)
 *   tick(pl, dt)             cada fotograma (Player.update)
 *   start(pl)                al empezar la partida
 *   learn(pl, m)             al aprender un movimiento (Player.addMove; y los que ya tenías)
 *   sw(pl)                   al cambiar de movimiento activo (Player.setActive)
 *   buff(pl)                 × a la potencia de tus potenciadores (Player.addBuff)
 * Los ganchos se ponen una vez, al cargar, y sólo hacen algo con pl.labAbility (lo pone
 * attach() en tu Pokémon al empezar una partida Lab; nunca en los de tus compañeros).
 *
 * Cooperativo: todo es de tu Pokémon. Lo que hace a los enemigos al tocarte (Elec. Estática,
 * Piel Tosca...) usa applyStun/applyPoison/hurt, que en un invitado ya se mandan al anfitrión.
 * Textos sólo en inglés (fork/LAB.md). Prueba: fork/test-lab.cjs.
 */
G.LabAbilities = (() => {
  const D = G.LabData;
  const W = kind => { const c = G.Weather.current; return !!(c && c.kind === kind); };
  const low = pl => pl.hp <= pl.maxHp / 3;
  const pinch = type => (pl, m) => m.type === type && low(pl) ? 1.5 : 1;
  const own = (pl, m) => pl.mon.types.includes(m.type);
  const power = m => D.POWER[D.MOVES.indexOf(m.id)] || 0;
  const CONTACT = new Set(['melee', 'dash', 'spin']);
  const SHEER = ['burn', 'poison', 'slow'];
  const boss = e => e.boss || e.judge;

  /** Texto flotante sobre tu Pokémon (como mucho uno cada 0,7 s por clave). */
  function note(pl, text, color = '#e8e2ff', key = text) {
    const now = performance.now(), t = pl._labNote || (pl._labNote = {});
    if (now - (t[key] || 0) < 700) return;
    t[key] = now;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, text, color);
  }
  /** Absorbe un tipo: no te hace daño y te da algo (como mucho una vez por segundo). */
  const absorb = (type, gain, label) => (pl, amount, t) => {
    if (t !== type) return 1;
    const now = performance.now();
    if (now - (pl._labAbsorb || 0) > 1000) { pl._labAbsorb = now; gain(pl, amount); }
    note(pl, label, G.U.TYPE_COLOR[type]);
    return 0;
  };
  const heal = k => (pl, amount) => pl.heal(amount * k);
  const buff = (stat, amount) => pl => pl.addBuff(stat, amount, 7, 5);
  /** Al tocarte: con probabilidad p le pasa `fx` al enemigo. */
  const touch = (p, fx) => (pl, e) => { if (!e.dead && Math.random() < p) fx(e, pl); };
  const stun = dur => e => e.applyStun(dur * (boss(e) ? 0.35 : 1));
  const thorns = (pl, e) => { if (!e.dead) e.hurt(11 + pl.level * 3, '#9aa6b5', e.x - pl.x, e.y - pl.y, 40); };
  // Leer los KO para Autoestima / Ultraimpulso: pl.kills sube en EnemyMgr (en grupo, los del equipo).
  const onKill = gain => (pl) => {
    if (pl._labKills == null) pl._labKills = pl.kills;
    if (pl.kills > pl._labKills) { pl._labKills = pl.kills; gain(pl); }
  };
  const WX_HEAL = 0.006;                       // vida por segundo con su clima (1/16 por turno en los juegos)

  const DEF = {
    // ---- más daño con lo suyo cuando vas mal (1/3 de vida o menos) ----
    overgrow: { out: pinch('grass'), desc: 'Grass moves deal 50% more damage while your HP is at 1/3 or less.' },
    blaze:    { out: pinch('fire'), desc: 'Fire moves deal 50% more damage while your HP is at 1/3 or less.' },
    torrent:  { out: pinch('water'), desc: 'Water moves deal 50% more damage while your HP is at 1/3 or less.' },
    swarm:    { out: pinch('bug'), desc: 'Bug moves deal 50% more damage while your HP is at 1/3 or less.' },

    // ---- clima (js/systems/weather.js) ----
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

    // ---- daño que recibes ----
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
    sturdy: { desc: 'A hit that would knock you out from half HP or more leaves you at 1 HP (once a minute).' },   // en hurt

    // ---- absorber un tipo ----
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

    // ---- al recibir un golpe ----
    rattled:      { after: (pl, t) => { if (t === 'bug' || t === 'ghost' || t === 'dark') buff('spd', 0.10)(pl); }, desc: 'Being hit by a Bug, Ghost or Dark attack raises your Speed.' },
    justified:    { after: (pl, t) => { if (t === 'dark') buff('patk', 0.13)(pl); }, desc: 'Being hit by a Dark attack raises your Attack.' },
    'weak-armor': { after: (pl, t, cat) => { if (cat === 'physical') buff('spd', 0.10)(pl); }, desc: 'Being hit by a physical attack raises your Speed.' },

    // ---- al tocarte (cuerpo a cuerpo) ----
    static:         { contact: touch(0.3, stun(1)), desc: 'Enemies that touch you may be paralyzed (stopped for 1 s).' },
    'poison-point': { contact: touch(0.3, e => e.applyPoison(2)), desc: 'Enemies that touch you may be poisoned.' },
    'flame-body':   { contact: touch(0.3, e => e.applyBurn(2)), desc: 'Enemies that touch you may be burned.' },
    'cute-charm':   { contact: touch(0.3, stun(1.2)), desc: 'Enemies that touch you may fall in love and stop attacking for a moment.' },
    'effect-spore': { contact: touch(0.3, e => [stun(1), x => x.applyPoison(2), x => x.applySlow(0.5, 2)][Math.floor(Math.random() * 3)](e)),
                      desc: 'Enemies that touch you may be paralyzed, poisoned or slowed.' },
    'rough-skin':   { contact: thorns, desc: 'Enemies that touch you take damage.' },
    'iron-barbs':   { contact: thorns, desc: 'Enemies that touch you take damage.' },
    pressure:       { contact: (pl, e) => { e.touchCd += 0.25; }, desc: 'Enemies touching you attack about 30% less often.' },

    // ---- tus ataques ----
    technician:      { out: (pl, m) => !m.evolved && power(m) > 0 && power(m) <= 60 ? 1.5 : 1, desc: 'Moves that are weak in the games (60 power or less) deal 50% more damage.' },
    'iron-fist':     { out: (pl, m) => /Puño|puño/.test(m.name) ? 1.2 : 1, desc: 'Punching moves deal 20% more damage.' },
    'strong-jaw':    { out: (pl, m) => /Mordisco|Triturar|colmillo/i.test(m.name) ? 1.5 : 1, desc: 'Biting moves deal 50% more damage.' },
    'mega-launcher': { out: (pl, m) => /Esfera Aural|Pulso/.test(m.name) ? 1.5 : 1, desc: 'Aura and pulse moves deal 50% more damage.' },
    sharpness:       { out: (pl, m) => /^(Tajo Aéreo|Tajo Umbrío|Psicocorte|Hoja Afilada|Golpe Aéreo|Tijera X|Cuchilla Solar)$/.test(m.name) ? 1.5 : 1,
                       desc: 'Slicing moves deal 50% more damage.' },
    'tough-claws':   { out: (pl, m) => CONTACT.has(m.kind) ? 1.3 : 1, desc: 'Moves that hit up close (melee, dash and spin) deal 30% more damage.' },
    'huge-power':    { out: (pl, m) => m.cat === 'physical' ? 1.6 : 1, desc: 'Physical moves deal 60% more damage (it doubles Attack in the games).' },
    'pure-power':    { out: (pl, m) => m.cat === 'physical' ? 1.6 : 1, desc: 'Physical moves deal 60% more damage (it doubles Attack in the games).' },
    adaptability:    { out: (pl, m) => m.kind !== 'buff' && own(pl, m) ? 1.25 : 1, desc: 'Moves of your own type deal 25% more damage.' },
    'sheer-force':   { out: (pl, m) => m.labSheer ? 1.3 : 1,
                       learn: (pl, m) => { if (m.kind !== 'stun' && SHEER.some(k => m[k])) { for (const k of SHEER) m[k] = 0; m.labSheer = true; } },
                       desc: 'Moves that burn, poison or slow lose that effect but deal 30% more damage.' },
    'skill-link':    { learn: (pl, m) => { if ((m.count | 0) >= 2) m.count += 1; }, desc: 'Moves that hit several times hit once more.' },
    prankster:       { learn: (pl, m) => { if (m.kind === 'buff') m.cd *= 0.7; }, desc: 'Stat-boosting moves recharge 30% faster.' },
    simple:          { buff: () => 2, desc: 'Your stat boosts are twice as strong.' },
    // recoil: Doble Filo, Envite Ígneo... (js/fork/lab/kinds.js, fase 4)
    'rock-head':     { desc: 'Recoil moves (Double-Edge, Head Smash...) don\'t hurt you.' },      // en kinds.js
    reckless:        { out: (pl, m) => m.kind === 'recoil' ? 1.2 : 1, desc: 'Recoil moves deal 20% more damage.' },

    // ---- con el tiempo ----
    'speed-boost':  { tick: (pl, dt) => { pl._labSB = (pl._labSB || 0) + dt; if (pl._labSB >= 8) { pl._labSB = 0; pl.addBuff('spd', 0.08, 9, 5); } },
                      desc: 'Your Speed keeps rising as the run goes on.' },
    moxie:          { tick: onKill(pl => pl.addBuff('patk', 0.05, 4, 5)), desc: 'Knocking out enemies keeps raising your Attack for a few seconds.' },
    'beast-boost':  { tick: onKill(pl => pl.addBuff(G.Stats.sideOf(pl.mon) === 'special' ? 'satk' : 'patk', 0.05, 4, 5)),
                      desc: 'Knocking out enemies keeps raising your best attacking stat for a few seconds.' },
    'shed-skin':    { tick: (pl, dt) => { if (pl.slowT > 0 && Math.random() < 0.3 * dt) { pl.slowT = 0; note(pl, 'Shed Skin', '#c6b08a'); } },
                      desc: 'You may shake off sticky slowdowns on your own.' },
    limber:         { tick: pl => { if (pl.slowT > 0) pl.slowT = 0; }, desc: 'Sticky traps can\'t slow you down.' },

    // ---- al cambiar de movimiento ----
    regenerator:    { sw: pl => { const now = performance.now(); if (now - (pl._labRegen || 0) > 4000) { pl._labRegen = now; pl.heal(pl.maxHp * 0.06); } },
                      desc: 'Switching your active move heals 6% of your HP (once every 4 s).' },
    'natural-cure': { sw: pl => { pl.slowT = 0; }, desc: 'Switching your active move shakes off sticky slowdowns.' },

    // ---- de la partida ----
    unburden:       { spd: pl => pl.item ? 1 : 1.25, desc: '25% faster while you hold no item.' },
    pickup:         { start: pl => { pl.coinMul *= 1.2; }, desc: '20% more coins.' },
    'super-luck':   { start: pl => { pl.critChance += 0.08; }, desc: '+8% chance of critical hits.' }
  };
  for (const id in DEF) DEF[id].name = D.abilName[id] || id;

  // ---------------- qué habilidad lleva cada uno ----------------

  /** → { id, name, desc, on } para esta especie (on = tiene efecto aquí). */
  function of(dex) {
    const list = (D.abil[dex] || '').split(' ').filter(Boolean).map(s => s.replace('*', ''));
    const id = list.find(a => DEF[a]) || list[0];
    if (!id) return null;
    return DEF[id] ? { id, name: DEF[id].name, desc: DEF[id].desc, on: true }
                   : { id, name: D.abilName[id] || id, desc: 'No effect in this game yet.', on: false };
  }

  /** Se la pone a tu Pokémon al empezar una partida Lab (G.Lab, tras crear el Player). */
  function attach(pl) {
    const a = of(pl.dex);
    pl.labAbility = a && a.on ? a.id : null;
    const d = pl.labAbility && DEF[pl.labAbility];
    if (!d) return a;
    if (d.start) d.start(pl);
    if (d.learn) for (const m of pl.moves) d.learn(pl, m);
    return a;
  }

  // ---------------- ganchos ----------------
  const P = G.Player.prototype, E = G.Enemy.prototype;
  const def = pl => pl.labAbility && DEF[pl.labAbility];

  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.call(this, m), d = def(this);
    return d && d.out && m ? k * d.out(this, m) : k;
  };

  // Robustez: estar a punto de caer con Robustez no cuenta como caída (G.RunStats.down).
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

  // Te toca un enemigo (Combat.resolve: e.touchCd, e.strike(pl), pl.hurt...).
  const strike = E.strike;
  E.strike = function (pl) {
    strike.call(this, pl);
    const d = pl && !pl.remote && !pl.dead && def(pl);
    if (d && d.contact) d.contact(pl, this);
  };

  return { DEF, of, attach };
})();
