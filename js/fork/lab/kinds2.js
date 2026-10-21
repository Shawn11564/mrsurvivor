/* ============ kinds2.js — cuerpo a cuerpo y aguante en el modo Lab (fork MrSurvivor) ============
 * Fase 9 de fork/LAB.md. Como kinds.js: familias nuevas en G.Combat.EXTRA y efectos nuevos para
 * cualquier familia, envolviendo funciones que el juego llama como G.X.y. Movimientos en
 * js/fork/lab/lab-moves.js (sección "fase 9"). Textos sólo en inglés.
 *
 * Familias:
 *   grab    Sísmico, Llave Giro, Cola Dragón: agarras al más cercano y lo lanzas; al volar golpea
 *           a los que se encuentra (`splash` × el daño). `perLvl`: + daño por nivel tuyo
 *   bind    Constricción, Atadura, Acoso, Cepo, Electrojaula: sujetas a `count` enemigos `dur` s
 *           (no se mueven ni atacan) y les haces `dmg` cada 0,5 s
 *   focus   Puño Certero: cargas `charge` s y, si no te dan, un puñetazo enorme; si te dan, nada.
 *           Coraza Trampa (mode 'trap'): si te dan mientras carga, explota a tu alrededor
 *   heal    Recuperación, Ovocuración, Respiro, Sol Matinal, Recogearena, Descanso, Deseo,
 *           Absorbefuerza, Auxilio: se lanzan solos desde cualquier hueco al bajar de `below`
 *           (50 %) de vida: curan `amount` × tu vida máxima. `wx`: ×1,5 con ese clima
 *           (Sol Matinal con otro clima, ×0,5). `rest`: duermes esos s (ni te mueves ni atacas).
 *           `delay`: llega luego (Deseo). `meek` (Absorbefuerza): debilita al más fuerte cercano
 *   screen  Reflejo, Pantalla de Luz, Velo Aurora: `amount` menos de daño físico, especial o los
 *           dos `dur` s, para ti y los compañeros cerca de ti. Solos desde cualquier hueco
 *   shout   Gruñido, Ojitos Tiernos, Danza Pluma, Rugido de Guerra, Malicioso, Chirrido, Llanto
 *           Falso, Eco Metálico, Cara Susto: un grito que marca a los enemigos cerca `dur` s:
 *           `meek` hacen menos daño, `weak` reciben más (de `weakCat` o de todo), `slow`. Solo
 *           desde cualquier hueco con 2 enemigos cerca. Cada jugador marca sus copias (también
 *           con el grito de un compañero): te protege a ti y a tus golpes
 *   endure  Aguante: cuando un golpe te dejaría KO, te quedas con 1 PS e intocable `dur` s
 * Efectos para cualquier familia (en el golpe):
 *   leech     curas esa parte del daño que haces (como mucho LEECH_CAP de tu vida por segundo)
 *   seed      Drenadoras: el enemigo pierde vida cada 0,5 s `seed` s y tú te curas la mitad
 *   revenge   × si te han dado hace menos de 1,5 s (Desquite, Vendetta)
 *   reversal  × (1 + reversal × la vida que te falta) (Inversión, Azote)
 *   cut       quita esa parte de la vida que le queda (Superdiente; a los jefes, CUT_BOSS de eso)
 *   power     × (1 + power × tus acumulaciones de mejoras) (Poder Reserva, Chulería)
 *   flinch    el primer golpe a cada enemigo lo aturde esos s (Sorpresa)
 * Y en los potenciadores (buff): `also` [{ stat, amount }] sube más stats a la vez (Corpulencia,
 * Paz Mental...); `drum` (Deshoje) cuesta esa parte de tu vida y llena las acumulaciones.
 * Con grab, bind, focus o ramp activos recibes un 25 % menos, como con el cuerpo a cuerpo (player.js).
 *
 * Cooperativo: lo que les pasa a los enemigos va por hit, applyStun y applySlow (el invitado ya se
 * lo manda al anfitrión). Las pantallas y los gritos de un compañero llegan como fantasma
 * (Combat.ghostCast) y valen igual en tu pantalla. La curación es sólo tuya.
 * Prueba: fork/test-lab-close.cjs. Aguante en partida: fork/survival-lab.cjs.
 */
G.LabKinds2 = (() => {
  const C = G.Combat, X = C.EXTRA, K = G.LabKinds;
  const col = m => G.U.TYPE_COLOR[m.type];
  const now = () => performance.now();
  const boss = e => e.boss || e.judge;
  const PASSIVE = new Set(['heal', 'screen', 'shout', 'endure']);
  const CLOSE = new Set(['ramp', 'grab', 'bind', 'focus']);
  const LEECH_CAP = 0.05, CUT_BOSS = 0.08, REVENGE_MS = 1500;
  const FOCUS_HIT = 0.35, FOCUS_MIN = 0.3, FOCUS_BRACE = 0.7;      // Puño Certero: por golpe, mínimo, daño recibido cargando
  const MARK = { meek: '#6fa8ff', weak: '#d36bff' };

  // ---------------- mejoras y evoluciones ----------------
  Object.assign(K.LADDERS, {
    grab: [
      { t: '+40% damage', m: { dmg: 1.4 } }, { t: 'Throws 30% further', m: { knock: 1.3 } },
      { t: '-25% recharge', m: { cd: 0.75 } }, { t: '+50% damage and +25% reach', m: { dmg: 1.5, radius: 1.25 } }],
    bind: [
      { t: 'Holds one more at a time', m: { count: 1 } }, { t: '+40% damage', m: { dmg: 1.4 } },
      { t: 'Holds them 30% longer', m: { dur: 1.3 } }, { t: 'One more at a time and +40% damage', m: { count: 1, dmg: 1.4 } }],
    focus: [
      { t: '+40% damage', m: { dmg: 1.4 } }, { t: 'Charges 25% faster', m: { charge: 0.75 } },
      { t: '+25% area', m: { radius: 1.25 } }, { t: '-20% recharge and +40% damage', m: { cd: 0.8, dmg: 1.4 } }],
    heal: [
      { t: '+25% healing', m: { amount: 1.25 } }, { t: '-20% recharge', m: { cd: 0.8 } },
      { t: '+25% healing', m: { amount: 1.25 } }, { t: '-20% recharge and +20% healing', m: { cd: 0.8, amount: 1.2 } }],
    screen: [
      { t: '+30% duration', m: { dur: 1.3 } }, { t: '-20% recharge', m: { cd: 0.8 } },
      { t: '+30% area', m: { radius: 1.3 } }, { t: '+30% duration and -15% recharge', m: { dur: 1.3, cd: 0.85 } }],
    shout: [
      { t: '+25% stronger', m: { amount: 1.25 } }, { t: '+25% area', m: { radius: 1.25 } },
      { t: 'Lasts 40% longer', m: { dur: 1.4 } }, { t: '-30% recharge and +20% area', m: { cd: 0.7, radius: 1.2 } }],
    endure: [
      { t: '-20% recharge', m: { cd: 0.8 } }, { t: 'Untouchable 40% longer', m: { dur: 1.4 } },
      { t: '-20% recharge', m: { cd: 0.8 } }, { t: 'Also heals 25% of your HP', m: { amount: 0.25 } }]
  });
  // Al evolucionar: multiplica (como LabKinds.EVO, pero aquí también amount; ninguna suma).
  const EVO = {
    grab:   { t: '×1.8 damage and the thrown enemy hits twice as hard', m: { dmg: 1.8, splash: 2 } },
    bind:   { t: '×1.8 damage and holds them longer', m: { dmg: 1.8, dur: 1.3 } },
    focus:  { t: '×1.8 damage and a bigger area', m: { dmg: 1.8, radius: 1.2 } },
    heal:   { t: '×1.4 healing and -20% recharge', m: { amount: 1.4, cd: 0.8 } },
    screen: { t: '×1.3 duration and a stronger screen', m: { dur: 1.3, amount: 1.2 } },
    shout:  { t: '×1.3 stronger and a bigger area', m: { amount: 1.3, radius: 1.3 } },
    endure: { t: 'Half the recharge', m: { cd: 0.5 } }
  };
  // Un movimiento puede traer su propia evolución (evoMod, js/fork/lab/lab-moves.js): manda sobre la de su familia.
  const evoOf = m => m.evoMod || (m.def && m.def.evoMod) || EVO[m.kind];
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
    for (const k in ev.m) m[k] = (m[k] != null ? m[k] : 1) * ev.m[k];
    m.baseName = m.name; m.name = e[0]; m.evolved = true;
    return true;
  };

  Object.assign(G.Icons.KIND_GLYPH, {
    grab:   ['#...#', '##.##', '.###.', '..#..', '.###.'],
    bind:   ['.###.', '#...#', '.###.', '#...#', '.###.'],
    focus:  ['..#..', '.###.', '#####', '.###.', '..#..'],
    heal:   ['.....', '..#..', '.###.', '..#..', '.....'],
    screen: ['#####', '#...#', '#...#', '#...#', '#####'],
    shout:  ['#....', '#.#..', '#.#.#', '#.#..', '#....'],
    endure: ['.###.', '#...#', '#.#.#', '#...#', '.###.']
  });

  // ---------------- lo que queda en el mapa ----------------
  let thrown = [], binds = [], screens = [], wishes = [];
  const marked = new Set(), seeded = new Set();

  /** El enemigo vivo más cercano a (x, y) en r (antes tu blanco, si está), que cumpla ok. */
  function nearest(pl, r, ok = () => true) {
    if (pl.target && !pl.target.dead && pl.target.hurt && ok(pl.target) && G.U.dist(pl.x, pl.y, pl.target.x, pl.target.y) <= r + pl.target.r) return pl.target;
    let best = null, bd = Infinity;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, r + 30)) {
      const d = G.U.dist(pl.x, pl.y, e.x, e.y) - e.r;
      if (!e.dead && d <= r && d < bd && ok(e)) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------- grab ----------------
  X.grab = {
    target: true, reach: m => m.radius + 24,
    run(pl, m, ghost) {
      const t = nearest(pl, m.radius + 24);
      if (!t) return;
      const a = Math.atan2(t.y - pl.y, t.x - pl.x), ca = Math.cos(a), sa = Math.sin(a), c = col(m), v = G.VFX.forMove(m);
      pl.aim = a;
      G.FX.slash(t.x, t.y - G.LIFT * 0.5, a, 30, 2.4, c, v);
      G.FX.ring(t.x, t.y, 4, 34, c, 0.25, 3);
      if (ghost) return;
      const dmg = (m.dmg + (m.perLvl || 0) * pl.level) * pl.atkFor(m);
      const big = boss(t);
      C.hit(pl, t, dmg, c, ca, sa, big ? 0 : m.knock || 900, m);
      // Aturdido al caer (enemy.js no mueve a un aturdido, ni con el empujón).
      if (!big && !t.dead) {
        thrown.push({ e: t, owner: pl, m, t: 0, dur: 0.5, ca, sa, dmg: dmg * (m.splash || 0.6), hits: new Set([t.id]) });
      }
      pl.invuln = Math.max(pl.invuln || 0, 0.35);
      G.Camera.kick(0.16);
    }
  };
  function tickThrown(f, dt) {
    const e = f.e;
    if (e.dead) return true;
    if (f.t >= f.dur) { e.applyStun(f.m.stun || 0.6); G.FX.burst(e.x, e.y - 4, col(f.m), 10, 120); return true; }
    if (Math.random() < dt * 30) G.FX.px(e.x, e.y - 4, col(f.m), { vy: -20, life: 0.3 });
    for (const o of G.EnemyMgr.queryCircle(e.x, e.y, e.r + 40)) {
      if (o.dead || f.hits.has(o.id) || G.U.dist(e.x, e.y, o.x, o.y) > e.r + o.r + 16) continue;
      f.hits.add(o.id);
      C.hit(f.owner, o, f.dmg, col(f.m), f.ca, f.sa, 220, f.m);
      G.FX.burst(o.x, o.y - o.bodyH * 0.5, col(f.m), 8, 140);
    }
    return false;
  }

  // ---------------- bind ----------------
  X.bind = {
    target: true, reach: m => m.radius + 24,
    run(pl, m, ghost) {
      const mine = binds.filter(b => b.owner === pl && b.m.id === m.id);
      let free = Math.max(1, m.count | 0 || 1) - mine.length;
      const held = new Set(mine.map(b => b.e));
      const c = col(m);
      for (; free > 0; free--) {
        const e = nearest(pl, m.radius + 24, o => !held.has(o));
        if (!e) break;
        held.add(e);
        const dur = m.dur || 3;
        binds.push({ e, owner: pl, ghost, m, t: 0, life: dur, tick: 0, dmg: ghost ? 0 : m.dmg * pl.atkFor(m) });
        if (!ghost) e.applyStun(dur * (boss(e) ? 0.35 : 1));
        G.FX.ring(e.x, e.y, 4, e.r * 2, c, 0.3, 3);
      }
    }
  };
  function tickBind(b, dt) {
    if (b.e.dead || b.t >= b.life || b.owner.dead) return true;
    if (!b.ghost && (b.tick -= dt) <= 0) {
      b.tick = 0.5;
      C.hit(b.owner, b.e, b.dmg, col(b.m), 0, 0, 0, b.m);
    }
    return false;
  }

  // ---------------- focus ----------------
  X.focus = {
    target: true, reach: m => m.mode === 'trap' ? 140 : m.radius + 20,
    run(pl, m, ghost) {
      pl._labFocus = { t: 0, dur: m.charge || 0.8, m, hurt: false, ghost };
      G.FX.ring(pl.x, pl.y, pl.r * 3, pl.r, col(m), 0.3, 3);
    }
  };
  function focusEnd(pl, f) {
    const m = f.m, c = col(m);
    if (f.ghost || pl.dead) return;
    if (m.mode === 'trap') {
      if (!f.fired) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, 'No trigger', '#a3abb8');
      return;
    }
    // Cada golpe que te dan mientras cargas le quita FOCUS_HIT (un enjambre te pega siempre: perderlo
    // entero lo dejaba en nada, fork/survival-lab.cjs), hasta FOCUS_MIN.
    const k = Math.max(FOCUS_MIN, 1 - FOCUS_HIT * (f.hurt || 0));
    if (k < 1) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, k <= FOCUS_MIN ? 'Lost focus' : 'Shaken', '#a3abb8');
    const half = Math.min(m.arc || 2.4, 6.2832) / 2, dmg = m.dmg * pl.atkFor(m) * k;
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, m.radius, m.arc || 2.4, c, G.VFX.forMove(m));
    G.FX.burst(pl.x + Math.cos(pl.aim) * m.radius * 0.6, pl.y + Math.sin(pl.aim) * m.radius * 0.6, c, 18, 220);
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
      if (e.dead || !C.inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
      C.hit(pl, e, dmg, c, e.x - pl.x, e.y - pl.y, m.knock || 200, m);
      if (m.stun && !e.dead) e.applyStun(m.stun * (boss(e) ? 0.35 : 1));
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, dmg, c);
    G.Camera.kick(0.3);
  }
  function shellTrap(pl, f) {
    const m = f.m, c = col(m), r = m.radius || 110, dmg = m.dmg * pl.atkFor(m);
    f.fired = true; f.t = f.dur;
    G.FX.ring(pl.x, pl.y, pl.r, r, c, 0.45, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, c, 26, 260);
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, r)) if (!e.dead) C.hit(pl, e, dmg, c, e.x - pl.x, e.y - pl.y, m.knock || 250, m);
    for (const p of G.World.propsInCircle(pl.x, pl.y, r)) G.World.damageProp(p, dmg, c);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, 'Shell Trap!', c, true);
    G.Camera.kick(0.3);
  }

  // ---------------- heal ----------------
  const wx = () => { const c = G.Weather.current; return c ? c.kind : null; };
  function healK(m) {
    const w = wx();
    if (!m.wx || !w) return 1;
    return w === m.wx ? 1.5 : m.wx === 'sun' ? 0.5 : 1;
  }
  X.heal = {
    target: true, reach: m => 0,                      // nunca desde Combat.tickMove: lo lanza C.tick (abajo)
    run(pl, m, ghost) {
      G.FX.ring(pl.x, pl.y, pl.r * 3, pl.r, '#5fe08a', 0.4, 3);
      // Deseo: estrellas al pedirlo; los corazones, cuando cura de verdad (en wishes, abajo).
      for (let i = 0; i < 5; i++) G.FX.sp(m.delay ? 'star' : 'heart', m.delay ? 'fairy' : 'grass', pl.x + G.U.rand(-12, 12), pl.y - G.U.rand(0, pl.bodyH), { vy: -60, life: 0.7 });
      if (ghost) return;
      let amt = pl.maxHp * (m.amount || 0.25) * healK(m);
      if (m.meek) {
        let best = null;
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 220)) if (!e.dead && (!best || e.dmg > best.dmg)) best = e;
        if (best) { mark(best, { meek: m.meek, amount: 1, dur: 6 }); G.FX.ring(best.x, best.y, 4, best.r * 2, MARK.meek, 0.4, 3); }
      }
      if (m.delay) { wishes.push({ pl, t: m.delay, amt }); return; }
      pl.heal(amt);
      if (m.rest) { pl._labRest = m.rest; G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, 'Zzz', '#d8e8ff'); }
    }
  };
  X.endure = { target: true, reach: m => 0, run() {} };     // no se lanza: espera en P.hurt

  // ---------------- screen ----------------
  X.screen = {
    target: true, reach: m => 0,
    run(pl, m, ghost) {
      for (const s of screens) if (s.owner === pl && s.id === m.id) s.gone = true;
      const dur = (m.dur || 7) * (m.wx && wx() === m.wx ? 1.6 : 1);
      screens.push({ owner: pl, ghost, id: m.id, m, t: 0, life: dur, r: m.radius || 150, cat: m.screen || null, k: Math.min(0.6, m.amount || 0.4) });
      G.FX.ring(pl.x, pl.y, 8, m.radius || 150, col(m), 0.5, 4);
    }
  };
  /** Cuánto menos recibe `pl` de un golpe de categoría `cat` (sus pantallas y las de compañeros cerca). */
  function screenK(pl, cat) {
    let k = 0;
    for (const s of screens) {
      if (s.gone || (s.cat && cat && s.cat !== cat)) continue;
      if (G.U.dist2(s.owner.x, s.owner.y, pl.x, pl.y) <= s.r * s.r) k = Math.max(k, s.k);
    }
    return k;
  }

  // ---------------- shout ----------------
  X.shout = {
    target: true, reach: m => 0,
    run(pl, m, ghost) {
      const r = m.radius || 120, c = col(m);
      G.FX.ring(pl.x, pl.y - pl.bodyH * 0.4, 6, r, c, 0.35, 3);
      // Notas para los gritos; las caras y los gestos traen su dibujo (look).
      const v = m.look ? G.VFX.forMove(m) : { proj: 'note', pal: 'normal' };
      for (let i = 0; i < 4; i++) G.FX.sp(v.proj, v.pal, pl.x + G.U.rand(-10, 10), pl.y - pl.bodyH, { vy: -50, vx: G.U.rand(-40, 40), life: 0.5 });
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, r)) {
        if (e.dead) continue;
        mark(e, m);
        // "Más fuerte" (amount, sus mejoras) también frena más (Cara Susto), hasta 0,8.
        if (!ghost && m.slow) e.applySlow(Math.min(0.8, m.slow * (m.amount || 1)), m.dur || 6);
      }
    }
  };
  /** Marca a un enemigo (en esta pantalla): meek = hace menos daño, weak = recibe más. */
  function mark(e, m) {
    const s = m.amount || 1, dur = m.dur || 6;
    if (m.meek) {
      const k = Math.min(0.7, m.meek * s * (boss(e) ? 0.5 : 1)), o = e._meek;
      if (!o) { e._meek = { k, t: dur }; e.dmg *= 1 - k; }
      else {
        o.t = Math.max(o.t, dur);
        if (k > o.k) { e.dmg *= (1 - k) / (1 - o.k); o.k = k; }
      }
    }
    if (m.weak) {
      const k = Math.min(1, m.weak * s), o = e._weak;
      if (!o || k >= o.k) e._weak = { k, cat: m.weakCat || null, t: dur };
      else o.t = Math.max(o.t, dur);
    }
    if (m.meek || m.weak) marked.add(e);
  }
  function tickMarks(dt) {
    for (const e of marked) {
      if (e._meek && (e._meek.t -= dt) <= 0) { e.dmg /= 1 - e._meek.k; e._meek = null; }
      if (e._weak && (e._weak.t -= dt) <= 0) e._weak = null;
      if (e.dead || (!e._meek && !e._weak)) marked.delete(e);
    }
  }

  // ---------------- los golpes: efectos para cualquier familia ----------------
  // G.RunStats.tag(e, m) lo llama Combat en cada golpe tuyo justo antes de e.hurt (hit y
  // proyectiles): aquí se apunta, y en Enemy.hurt se cambia el daño.
  let pend = null;
  const tag = G.RunStats.tag;
  G.RunStats.tag = function (e, m) {
    tag.apply(this, arguments);
    pend = { e, m };
  };
  const stacks = pl => Object.values(pl.buffs).reduce((a, b) => a + (b.n || 0), 0);
  /** El daño de un golpe de `m` a `e` con los efectos de esta fase. */
  function boost(pl, e, m, amount) {
    let k = 1;
    if (m.revenge && now() - (pl._labHurtAt || -1e9) < REVENGE_MS) k *= m.revenge;
    if (m.reversal) k *= 1 + m.reversal * (1 - pl.hp / pl.maxHp);
    if (m.power) k *= 1 + m.power * stacks(pl);
    const w = e._weak;
    if (w && (!w.cat || w.cat === m.cat)) k *= 1 + w.k;
    let out = amount * k;
    if (m.cut) out = Math.max(out, e.hp * m.cut * (boss(e) ? CUT_BOSS : 1));
    return out;
  }
  const E = G.Enemy.prototype;
  const ehurt = E.hurt;
  E.hurt = function (amount, color, dx, dy, knock, eff) {
    const p = pend, pl = G.Game.player;
    pend = null;
    if (!p || p.e !== this || !p.m || this.dead || !pl) return ehurt.apply(this, arguments);
    const m = p.m, hp0 = this.hp;
    const out = boost(pl, this, m, amount);
    if (m.flinch) {
      const seen = m._flinched || (m._flinched = new Set());
      if (!seen.has(this.id)) { seen.add(this.id); if (seen.size > 600) seen.clear(); this.applyStun(m.flinch * (boss(this) ? 0.3 : 1)); }
    }
    if (m.seed) {
      this._seed = { t: m.seed, tick: 0.5, dmg: m.dmg * pl.atkFor(m) * 0.8, m };
      seeded.add(this);
    }
    const r = ehurt.call(this, out, color, dx, dy, knock, eff);
    // El resumen y el daño hecho (Combat ya apuntó `amount`): sólo lo que se ha añadido aquí.
    const extra = out - amount;
    if (extra) { m.dealt = (m.dealt || 0) + extra; pl.dmgDealt += extra; if (extra > 0) pl.onDealt(extra); }
    if (m.leech) addLeech(pl, (this.remote ? out : Math.min(out, Math.max(0, hp0))) * m.leech);
    return r;
  };
  function addLeech(pl, v) { pl._leech = Math.min(pl.maxHp * 0.2, (pl._leech || 0) + v); }
  function tickLeech(pl, dt) {
    if (!(pl._leech > 0) || pl.dead) return;
    const h = Math.min(pl._leech, pl.maxHp * LEECH_CAP * dt, pl.maxHp - pl.hp);
    pl._leech = h > 0 ? pl._leech - h : 0;
    pl.hp += h;
    pl._leechShown = (pl._leechShown || 0) + h;
    if (pl._leechShown >= 1 && now() - (pl._leechAt || 0) > 600) {
      pl._leechAt = now();
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, '+' + Math.round(pl._leechShown), '#5fe08a');
      pl._leechShown = 0;
    }
  }
  function tickSeeds(dt) {
    const pl = G.Game.player;
    for (const e of seeded) {
      const s = e._seed;
      if (e.dead || !s || (s.t -= dt) <= 0) { if (e._seed) e._seed = null; seeded.delete(e); continue; }
      if ((s.tick -= dt) > 0) continue;
      s.tick = 0.5;
      const hp0 = e.hp;
      e.hurt(s.dmg, '#7bd14a', 0, 0, 0);
      s.m.dealt = (s.m.dealt || 0) + s.dmg;
      if (pl) { pl.dmgDealt += s.dmg; addLeech(pl, Math.min(s.dmg, Math.max(0, hp0)) * 0.5); }
      G.FX.sp('leaf', 'grass', e.x, e.y - e.bodyH, { vy: -40, life: 0.4 });
    }
  }

  // ---------------- tu Pokémon ----------------
  const P = G.Player.prototype;
  const phurt = P.hurt;
  P.hurt = function (amount, type = null, pure = false, cat = null) {
    if (this.remote || this.invuln > 0 || this.dead || this.god) return phurt.apply(this, arguments);
    if (!pure) {
      const k = screens.length ? screenK(this, cat) : 0;
      if (k) amount *= 1 - k;
      const g = this.activeGroup();
      if (!g.some(m => m.kind === 'melee') && g.some(m => CLOSE.has(m.kind))) amount *= 0.75;
    }
    const f = this._labFocus;
    if (f && !f.ghost && f.t < f.dur) {
      if (f.m.mode === 'trap') { if (!f.fired) shellTrap(this, f); }
      else { f.hurt = (f.hurt || 0) + 1; if (!pure) amount *= FOCUS_BRACE; }
    }
    const hp0 = this.hp;
    const en = this.moves.find(m => m.kind === 'endure' && !(m._pt > 0));
    let r;
    if (en) {
      const BUF = 1e7;
      this.hp += BUF;
      try { r = phurt.call(this, amount, type, pure, cat); } finally {
        const d = hp0 + BUF - this.hp;
        if (d > 0 && hp0 - d < 1) {
          this.hp = 1;
          en._pt = Math.max(1, en.cd * this.cdMul);
          this.invuln = Math.max(this.invuln, en.dur || 1.5);
          if (en.amount) this.heal(this.maxHp * en.amount);
          G.FX.dmgText(this.x, this.y - this.bodyH - 16, 'Endured!', '#ffd23f', true);
          G.FX.ring(this.x, this.y, 6, 70, '#ffd23f', 0.5, 4);
        } else this.hp = hp0 - Math.max(0, d);
      }
    } else r = phurt.call(this, amount, type, pure, cat);
    if (this.hp < hp0) this._labHurtAt = now();
    return r;
  };
  // Potenciadores de varias stats y Deshoje.
  const pcast = P.cast;
  const KIND_AS = { grab: 'melee', bind: 'melee', focus: 'buff', heal: 'buff', screen: 'buff', shout: 'nova', endure: 'buff' };
  P.cast = function (m) {
    const as = m && KIND_AS[m.kind];
    const r = pcast.call(this, as ? { kind: as, cd: m.cd, type: m.type, anim: m.anim } : m);
    if (m && m.kind === 'buff' && m.def && !this.remote && (m.also || m.drum)) {
      const s = m.def.amount ? m.amount / m.def.amount : 1, all = [{ stat: m.stat, amount: m.amount / s }].concat(m.also || []);
      if (m.drum && !(this.buffs[m.stat].n > 0) && this.hp > this.maxHp * 0.5) {
        this.hp -= this.maxHp * m.drum;
        G.FX.dmgText(this.x, this.y - this.bodyH - 4, '-' + Math.round(this.maxHp * m.drum), '#ffae5c');
        for (const a of all) for (let i = 1; i < (m.stacks | 0); i++) this.addBuff(a.stat, a.amount * s, m.dur, m.stacks | 0);
      }
      for (const a of m.also || []) this.addBuff(a.stat, a.amount * s, m.dur, m.stacks | 0);
    }
    return r;
  };
  // Descanso: dormido, ni te mueves (frozen se pone en cada fotograma en game.js, antes de update).
  const pupdate = P.update;
  P.update = function (dt) {
    if (this._labRest > 0) { this._labRest -= dt; this.frozen = true; }
    return pupdate.apply(this, arguments);
  };
  const pdraw = P.draw;
  P.draw = function (ctx) {
    pdraw.apply(this, arguments);
    if (this._labRest > 0 && !this.dead) {
      const t = now() / 1000, y0 = this.y - this.bodyH - 8;
      ctx.save();
      ctx.font = '700 9px Pixelify,"Segoe UI",sans-serif'; ctx.fillStyle = '#d8e8ff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
      const k = (t * 0.8) % 1;
      ctx.globalAlpha = 1 - k; ctx.strokeText('Z', this.x + 4 + k * 8, y0 - k * 12); ctx.fillText('Z', this.x + 4 + k * 8, y0 - k * 12);
      ctx.restore();
    }
  };

  // ---------------- cada fotograma ----------------
  /** ¿Toca lanzar ya este de apoyo? */
  function wants(pl, m) {
    if (m.kind === 'heal') return pl.hp <= pl.maxHp * (m.below || 0.5);
    if (m.kind === 'screen') return G.EnemyMgr.queryCircle(pl.x, pl.y, 260).some(e => !e.dead);
    if (m.kind === 'shout') {
      let n = 0;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, (m.radius || 120) * 0.9)) if (!e.dead && (++n >= 2 || boss(e))) return true;
    }
    return false;
  }
  const ctick = C.tick;
  C.tick = function (dt, pl) {
    if (pl && pl._labRest > 0) return;                  // dormido (Descanso): no ataca
    ctick.apply(this, arguments);
    if (!pl || pl.dead) return;
    for (const grp of pl.slots) for (const m of grp) {
      if (!PASSIVE.has(m.kind)) continue;
      m._pt = (m._pt || 0) - dt;
      if (m._pt > 0 || m.kind === 'endure') continue;
      if (!wants(pl, m)) { m._pt = 0.2; continue; }
      m._pt = Math.max(0.05, m.cd * pl.cdMul);
      if (grp === pl.activeGroup()) pl.cast(m);
      if (G.Coop.active) G.Coop.cast(pl, m);
      m.castAt = now();
      C.run(pl, m);
    }
  };

  function tickPlayer(p, dt) {
    const f = p._labFocus;
    if (f && (f.t += dt) >= f.dur) { delete p._labFocus; focusEnd(p, f); }
  }
  const update = C.updateFields;
  C.updateFields = function (dt) {
    update.apply(this, arguments);
    const pl = G.Game.player;
    if (pl) { tickPlayer(pl, dt); tickLeech(pl, dt); }
    if (G.Coop.active) for (const p of G.Coop.puppets()) tickPlayer(p, dt);
    for (const f of thrown) f.t += dt;
    thrown = thrown.filter(f => !tickThrown(f, dt));
    for (const b of binds) b.t += dt;
    binds = binds.filter(b => !tickBind(b, dt));
    for (const s of screens) s.t += dt;
    screens = screens.filter(s => !s.gone && s.t < s.life && s.owner && !s.owner.dead);
    for (const w of wishes) if ((w.t -= dt) <= 0 && !w.pl.dead) {
      w.pl.heal(w.amt);
      for (let i = 0; i < 5; i++) G.FX.sp('heart', 'grass', w.pl.x + G.U.rand(-12, 12), w.pl.y - G.U.rand(0, w.pl.bodyH), { vy: -60, life: 0.7 });
    }
    wishes = wishes.filter(w => w.t > 0);
    tickMarks(dt);
    tickSeeds(dt);
  };
  const clear = C.clearFields;
  C.clearFields = function (owner) {
    clear.apply(this, arguments);
    const keep = f => owner && f.owner !== owner;
    thrown = thrown.filter(keep); binds = binds.filter(keep); screens = screens.filter(keep);
    wishes = owner ? wishes.filter(w => w.pl !== owner) : [];
    if (!owner) { marked.clear(); seeded.clear(); }
  };

  const ground = C.drawGroundFields;
  C.drawGroundFields = function (ctx) {
    ground.apply(this, arguments);
    const t = now() / 1000;
    ctx.save();
    for (const b of binds) {
      const e = b.e, c = col(b.m);
      if (!G.Camera.sees(e.x, e.y, 60)) continue;
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath(); ctx.ellipse(e.x, e.y - e.bodyH * (0.25 + i * 0.3), e.r * 1.3, e.r * 0.45, 0, t * 3 + i, t * 3 + i + 4.4); ctx.stroke();
      }
    }
    for (const e of marked) {
      if (e.dead || !G.Camera.sees(e.x, e.y, 40)) continue;
      const c = e._weak ? MARK.weak : MARK.meek;
      ctx.globalAlpha = 0.55; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.3, e.r * 0.5, 0, 0, 6.2832); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const s of screens) {
      const p = s.owner, a = Math.min(1, (s.life - s.t) * 2, s.t * 4);
      ctx.globalAlpha = 0.18 * a; ctx.strokeStyle = col(s.m); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, s.r, s.r * 0.62, 0, 0, 6.2832); ctx.stroke();
    }
    for (const p of [G.Game.player].concat(G.Coop.active ? G.Coop.puppets() : [])) {
      const f = p && p._labFocus;
      if (!f) continue;
      const k = G.U.clamp(f.t / f.dur, 0, 1), c = col(f.m);
      ctx.globalAlpha = 0.7; ctx.strokeStyle = f.hurt ? '#a3abb8' : c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2, p.r * 0.8, 0, -1.5708, -1.5708 + k * 6.2832); ctx.stroke();
    }
    ctx.restore();
  };
  // Pantallas: un brillo sobre quien está dentro.
  const pdraw2 = P.draw;
  P.draw = function (ctx) {
    pdraw2.apply(this, arguments);
    if (!screens.length || this.dead) return;
    for (const s of screens) {
      if (G.U.dist2(s.owner.x, s.owner.y, this.x, this.y) > s.r * s.r) continue;
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(now() / 120) * 0.04;
      ctx.fillStyle = s.cat === 'special' ? '#ffd76a' : s.cat === 'physical' ? '#ff9fd6' : '#a8e6ff';
      ctx.beginPath(); ctx.ellipse(this.x, this.y - this.bodyH * 0.45, this.r * 1.7, this.bodyH * 0.7, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
      break;
    }
  };

  return { PASSIVE, CLOSE, EVO, mark, screenK, boost, LEECH_CAP, CUT_BOSS,
           counts: () => ({ thrown: thrown.length, binds: binds.length, screens: screens.length, marked: marked.size, seeded: seeded.size }) };
})();
