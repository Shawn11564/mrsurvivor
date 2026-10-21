/* ============ admin.js — menú de administrador (fork MrSurvivor) ============
 * Sólo para las cuentas de ADMINS (uid de Firebase). Botón "ADMIN" abajo a la
 * izquierda o la tecla º / ` (Backquote). En inglés: sólo lo usa el dueño.
 *
 *   Bromas        a un compañero, a todos o a ti: convertirlo en otro Pokémon,
 *                 enano o gigante, controles al revés, hielo, a cámara lenta,
 *                 a toda velocidad, borracho, pantalla del revés o en espejo,
 *                 traerlo a tu lado o mandarlo lejos, enemigos o un jefe encima,
 *                 avisos falsos (shiny, legendario, fin de partida) y mensajes.
 *   Toda la partida  enemigos congelados, discoteca (tono que gira, focos, confeti
 *                 y todos bailan), apagón, terremoto, invasión (todos los enemigos
 *                 con la cara de un Pokémon), chasquido de Thanos y piñata.
 *   Tú            modo dios, subir de nivel, curarte, soltar objetos del suelo,
 *                 la carta muy rara en la próxima subida (js/fork/rare-cards.js).
 *   Partida       monedas, tickets y Pokémon (normales o shiny) en tu cuenta.
 *
 * Lo que dura (forma, tamaño, controles, pantalla y toda la partida) va por el tiempo
 * elegido o, con "Until I turn it off" (secs 0), hasta que lo quites: el botón se
 * enciende mientras está puesto en el objetivo y pulsarlo encendido lo quita (off).
 *
 * Red (cooperativo, estrella como net.js): { k:'adm', a, x, by } va al anfitrión,
 * que comprueba que viene de un admin y lo hace él (enemigos, objetos, nivel) o
 * lo reenvía a todos; cada uno se lo aplica a sí mismo y, si se ve (forma,
 * tamaño), al muñeco del objetivo. Un invitado sólo hace caso a lo que le llega
 * del anfitrión con `by` de un admin.
 * La partida en la que el admin se ayuda (dios, nivel, objetos, enemigos) no
 * sube al ranking (G.Game.taint, en el anfitrión). Las bromas que sólo molestan, sí.
 * Ganchos: Player.update (steer) y Player.hurt (god) en js/entities/player.js;
 * beforeDraw y drawScreen en el render de js/game.js.
 * Prueba: fork/test-admin.cjs.
 */
G.Admin = (() => {
  // Cuentas de admin (Firebase Authentication > Users > User UID).
  const ADMINS = ['TMD8t0i6jic7a1sg824ZP55TqOG3'];
  const me = () => G.DB.fb && G.DB.fb.uid;
  const isAdmin = (u = me()) => !!u && ADMINS.includes(u);

  // ---------------- efectos sobre un jugador ----------------

  // Forma y tamaño: un Animator nuevo con otro Pokémon u otra escala (sólo se
  // ve; los golpes y la velocidad siguen siendo los suyos). Se quita solo.
  // (También lo usa la megaevolución, js/fork/mega.js: p.megaKey es el sprite de su mega;
  // y el radiante, js/fork/radiant.js: con p.radiant, su hoja radiante.)
  function paint(p) {
    if (!p || !p.anim) return;
    const L = p.admLook || {}, now = performance.now(), base = G.Radiant ? G.Radiant.look(p, p.megaKey || p.dex) : p.megaKey || p.dex;
    const dex = L.dexT > now ? L.dex : base;
    const k = L.kT > now ? L.k : 1;
    const sc = G.Sprites.playerScale(dex) * k;
    const a = new G.Sprites.Animator(dex, sc, dex === base && p.shiny);
    a.dir = p.anim.dir;
    if (p.dead) a.play('Faint', { hold: true });
    p.anim = a;
    p.scale = G.Sprites.playerScale(p.dex) * k;
    p.bodyH = G.Sprites.bodyHeight(dex, sc);
  }
  function look(p, patch, end) {
    if (!p) return;
    p.admLook = Object.assign(p.admLook || {}, patch);
    if (patch.dex) G.Sprites.preload([patch.dex]);
    paint(p);
    if (end > 0 && end < Infinity) setTimeout(() => paint(p), end - performance.now() + 50);
  }
  /** Hasta cuándo (performance.now): off = ya no; secs 0 = hasta que el admin lo quite. */
  const until = x => x.off ? 0 : x.secs ? performance.now() + x.secs * 1000 : Infinity;

  // Controles y pantalla (sólo los tuyos): hasta cuándo dura cada uno (performance.now).
  const ctl = { rev: 0, ice: 0, slow: 0, fast: 0, drunk: 0, flip: 0, mirror: 0 };
  let iv = [0, 0];
  /** Player.update: el vector de movimiento, con las bromas que tengas encima. */
  function steer(v, dt) {
    const now = performance.now();
    let [x, y] = v;
    if (now < ctl.rev) { x = -x; y = -y; }
    if (now < ctl.drunk) {
      const a = Math.sin(now / 380) * 1.1 + Math.sin(now / 150) * 0.35;
      [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    }
    if (now < ctl.slow) { x *= 0.3; y *= 0.3; }
    if (now < ctl.fast) { x *= 2.2; y *= 2.2; }
    if (now < ctl.ice) {
      iv = [G.U.damp(iv[0], x, 1.3, dt), G.U.damp(iv[1], y, 1.3, dt)];
      // Sin teclas, se acaba parando (si no, "caminaría" para siempre). Arrancando, no:
      // el primer paso es tan pequeño que se quedaría quieto.
      if (!x && !y && Math.hypot(iv[0], iv[1]) < 0.03) iv = [0, 0];
      return iv.slice();
    }
    iv = [x, y];
    return iv;
  }

  // ---------------- avisos falsos ----------------

  let fxEl = null, fxT = 0;
  function overlay(html, cls, ms, then) {
    if (!fxEl) {
      fxEl = document.createElement('div');
      fxEl.id = 'adm-fx';
      fxEl.setAttribute('translate', 'no');
      document.body.appendChild(fxEl);
    }
    clearTimeout(fxT);
    fxEl.className = cls;
    fxEl.innerHTML = html;
    fxEl.style.display = 'flex';
    fxT = setTimeout(() => { fxEl.style.display = 'none'; if (then) then(); }, ms);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jk = () => overlay('<b>jk 😜</b>', 'jk', 1600);

  function fake(x) {
    const mon = G.DEX_BY[x.dex];
    if (x.kind === 'shiny') {
      const m = mon || G.U.pick(G.DEX);
      G.Spawner.say('¡Un ' + m.name + ' shiny anda cerca!', 3.4, true);
      G.Audio.sfx('shiny');
      setTimeout(jk, 4200);
    } else if (x.kind === 'legend') {
      const m = mon || G.U.pick(G.DEX.filter(p => p.leg));
      G.Audio.sfx('legend');
      overlay('<i>★★★★★</i><b>LEGENDARY!</b><span>' + esc(m.name) + ' joined your team!</span>', 'legend', 3200, jk);
    } else if (x.kind === 'over') {
      G.Audio.sfx('gameover');
      overlay('<b>GAME OVER</b><span>Your run has ended.</span>', 'over', 2600, jk);
    } else if (x.kind === 'text') {
      overlay('<b>' + esc(x.text) + '</b>', 'text', 4500);
    }
  }

  /** Lo que le pasa a un jugador. local: eres tú (si no, es el muñeco de otro). */
  const TROLLS = {
    morph(p, local, x) { const end = until(x); look(p, x.off ? { dexT: 0 } : { dex: x.dex, dexT: end }, end); },
    size(p, local, x) { const end = until(x); look(p, x.off ? { kT: 0 } : { k: x.k, kT: end }, end); },
    fake(p, local, x) { if (local) fake(x); },
    tp(p, local, x) { if (local) teleport(p, x); }
  };
  // Controles y pantalla: sólo cuentan el tiempo.
  for (const k of ['rev', 'ice', 'slow', 'fast', 'drunk', 'flip', 'mirror']) {
    TROLLS[k] = (p, local, x) => { if (local) ctl[k] = until(x); };
  }
  const SEEN = new Set(['morph', 'size']);     // también en el muñeco, para que lo vean los demás

  /** Un punto libre cerca de (x, y) a una distancia entre d0 y d1. */
  function freeNear(x, y, d0, d1) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(d0, d1);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.9;
      if (G.World.isFree(px, py, 14)) return [px, py];
    }
    return [x, y];
  }
  /** Al lado del admin ('me', con su posición en px/py) o lejos de donde estás ('yeet'). */
  function teleport(p, x) {
    if (p.dead) return;
    const [nx, ny] = x.mode === 'me' ? freeNear(x.px, x.py, 30, 60) : freeNear(p.x, p.y, 650, 1000);
    G.FX.ring(p.x, p.y, 6, 70, '#c47bff', 0.5, 4);
    p.x = nx; p.y = ny;
    G.FX.ring(p.x, p.y, 6, 70, '#c47bff', 0.5, 4);
    G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#e2c2ff', 24, 180);
    G.Audio.sfx('select');
  }

  // ---------------- toda la partida (todos, también el admin) ----------------

  // Hasta cuándo dura cada uno (performance.now) y de quién es la invasión.
  const world = { freeze: 0, disco: 0, dark: 0, quake: 0, skin: 0, skinDex: 129 };
  const WORLD = ['freeze', 'disco', 'dark', 'quake', 'skin'];
  const WORLD_SAY = { freeze: 'Everything froze!', disco: 'DISCO TIME!', dark: 'Lights out…', quake: 'EARTHQUAKE!' };
  function worldFx(x) {
    world[x.fx] = until(x);
    if (x.off) return;
    if (x.fx === 'skin') {
      world.skinDex = x.dex || 129;
      G.Sprites.preload([world.skinDex]);
      G.Spawner.say(G.DEX_BY[world.skinDex].name + ' invasion!', 2.6, true);
    } else G.Spawner.say(WORLD_SAY[x.fx], 2.6, true);
    G.Audio.sfx(x.fx === 'disco' ? 'legend' : x.fx === 'quake' ? 'boss' : 'select');
  }

  const cv = () => document.getElementById('game');
  const inRun = () => !!G.Game.player && G.Game.state !== 'ui' && G.Game.state !== 'over';
  const COLORS = ['#ff5f6d', '#ffd23f', '#5fe08a', '#4fb4ff', '#c47bff', '#ff8ad8'];

  /*
   * Cada 0,1 s: lo que dura mantiene su efecto (también en los enemigos que van
   * saliendo) y lo que se acaba se deshace. Fuera de una partida se quita todo
   * (el menú usa el mismo lienzo).
   */
  function tick() {
    const now = performance.now(), run = inRun();
    if (!run) { for (const k in ctl) ctl[k] = 0; for (const k of WORLD) world[k] = 0; lit = {}; }
    const all = run ? G.EnemyMgr.all() : [];
    // Congelados: los de verdad (anfitrión o solitario) aturdidos; las copias de un invitado,
    // también, cada vuelta (no pegan al tocarlas, combat.js; coop.js no se lo pisa: admFrozen), y al acabar se les quita.
    const frozen = now < world.freeze;
    for (const e of all) {
      if (frozen) { if (e.remote) { e.stunT = 0.3; e.admFrozen = true; } else e.applyStun(0.3); }
      else if (e.admFrozen) { e.stunT = 0; e.admFrozen = false; }
    }
    // Invasión: todos los enemigos se ven como otro Pokémon (sólo se ve).
    const skin = now < world.skin ? world.skinDex : 0;
    for (const e of all) {
      if (skin && e.admSkin !== skin) {
        if (!e.admOrig) e.admOrig = { anim: e.anim, bodyH: e.bodyH };
        const a = new G.Sprites.Animator(skin, e.scale);
        a.dir = e.anim.dir;
        e.anim = a; e.bodyH = G.Sprites.bodyHeight(skin, e.scale); e.admSkin = skin;
      } else if (!skin && e.admOrig) {
        e.anim = e.admOrig.anim; e.bodyH = e.admOrig.bodyH; e.admOrig = null; e.admSkin = 0;
      }
    }
    // Terremoto: la sacudida se mantiene retumbando (con "menos sacudidas", a un cuarto, como kick).
    if (now < world.quake) {
      const level = (0.6 + 0.35 * Math.abs(Math.sin(now / 180))) * (G.Settings.get('calm') ? 0.25 : 1);
      G.Camera.shake = Math.max(G.Camera.shake, level);
    }
    if (now < world.disco) {
      for (const p of G.Game.everyone()) {
        G.FX.burst(p.x + G.U.rand(-120, 120), p.y - G.U.rand(20, 140), G.U.pick(COLORS), 5, 150);
      }
    }
    // Pantalla del revés / en espejo, y la bola de discoteca (tono que va girando).
    const el = cv();
    if (el) {
      const tf = [now < ctl.flip ? 'rotate(180deg)' : '', now < ctl.mirror ? 'scaleX(-1)' : ''].join(' ').trim();
      if (el.style.transform !== tf) el.style.transform = tf;
      if (!(now < world.disco) && el.style.filter) el.style.filter = '';
    }
  }

  /** game.js render, antes de dibujar el mundo: en la discoteca todos bailan (giran). */
  function beforeDraw() {
    const now = performance.now();
    if (!(now < world.disco) || !inRun()) return;
    const beat = Math.floor(now / 140);
    G.EnemyMgr.all().forEach((e, i) => { e.anim.dir = (beat + i) % 8; });
    G.Game.everyone().forEach((p, i) => { p.anim.dir = (beat + i * 3) % 8; });
    const el = cv();
    if (el) el.style.filter = `hue-rotate(${Math.round(now / 6) % 360}deg) saturate(1.5)`;
  }

  /** game.js render, sobre el mundo y bajo el HUD: focos, escarcha y apagón. */
  function drawScreen(ctx, w, h) {
    const now = performance.now(), pl = G.Game.player;
    if (!pl) return;
    if (now < world.disco) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const calm = G.Settings.get('calm');
      for (let i = 0; i < 4; i++) {
        const a = now / 900 + i * 1.571;
        const x = w / 2 + Math.cos(a) * w * 0.3, y = h / 2 + Math.sin(a * 1.3) * h * 0.3, r = Math.min(w, h) * 0.32;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, COLORS[(i + Math.floor(now / 600)) % COLORS.length] + (calm ? '22' : '44'));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }
    if (now < world.freeze) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(170,225,255,0)');
      g.addColorStop(1, 'rgba(170,225,255,.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (now < world.dark) {
      // Sólo se ve un poco alrededor de tu Pokémon.
      const k = G.Camera.scale;
      const x = (pl.x - G.Camera.left()) * k, y = (pl.y - G.LIFT * 0.5 - G.Camera.top()) * k;
      const g = ctx.createRadialGradient(x, y, 55 * k, x, y, 140 * k);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.97)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------------- lo que hace quien manda (anfitrión, o tú en solitario) ----------------

  function playerOf(u) {
    if (u === me()) return G.Game.player;
    const m = G.Coop.active && G.Coop.mate(u);
    return m && m.connected ? m.pl : null;
  }
  /** Jugadores a los que va: '*' = todos menos el admin. */
  function targets(to, by) {
    if (to !== '*') return [playerOf(to)].filter(Boolean);
    return G.Game.everyone().filter(p => p !== playerOf(by));
  }

  /** Definición de enemigo para cualquier Pokémon, con los números del momento. */
  function defFor(dex, t, boss) {
    const name = G.DEX_BY[dex].name;
    if (boss) {
      const s = G.Enemies.BOSS_SLOTS.filter(r => t >= r.at).pop() || G.Enemies.BOSS_SLOTS[0];
      return { dex, name, behavior: 'chase', hp: Math.round(s.hp * 1.35), spd: 60, dmg: Math.round(s.dmg * 1.2), xp: s.xp,
               shotDmg: Math.round(s.dmg * 0.55), shotCd: 1.1, range: 260 };
    }
    const tier = G.Enemies.TIERS.filter(r => t >= r.from).pop() || G.Enemies.TIERS[0];
    return { dex, name, behavior: 'chase', hp: tier.hp, spd: tier.spd, dmg: tier.dmg, xp: tier.xp };
  }

  /** Enemigos alrededor de p (a la vista, no fuera como los normales). Sin dex: los de la run. */
  function spawnNear(p, dex, boss, n) {
    const t = G.Game.st.time, k = G.Coop.scaleHp(G.Game.everyone().length);
    for (let i = 0; i < n; i++) {
      const def = dex ? defFor(dex, t, boss) : G.U.pick(boss ? G.Enemies.BOSSES : G.Enemies.bagAt(t));
      let x = p.x, y = p.y;
      for (let j = 0; j < 8; j++) {
        const a = Math.random() * 6.2832, d = G.U.rand(130, 230);
        x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d * 0.9;
        if (boss || G.World.isFree(x, y, 14)) break;
      }
      const sc = boss ? G.Enemies.bossScale(t) : G.Enemies.scale(t);
      const e = new G.Enemy(def, x, y, Object.assign({}, sc, { hp: sc.hp * k * (boss ? 1 : 4) }), boss);
      if (!boss) { e.dmg *= 2.4; e.xp = Math.round(e.xp * 5.6); }
      G.Sprites.preload([def.dex]);
      G.EnemyMgr.add(e);
      if (boss) { G.Spawner.say('¡' + e.name + ' salvaje apareció!', 3.2); G.Audio.sfx('boss'); G.Camera.kick(1.1); }
    }
  }

  const HOST = {
    spawn(x, by) { for (const p of targets(x.to, by)) spawnNear(p, x.dex, x.boss, x.n); G.Game.taint(); },
    drop(x, by) {
      for (const p of targets(x.to, by)) {
        const a = Math.random() * 6.2832;
        G.Pickups.drop(x.kind, p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 40, x.v);
      }
      G.Game.taint();
    },
    lvl() { G.Game.debugLevelUp(); },
    taint() { G.Game.taint(); },
    /** La mitad de los enemigos (no los de la Sentencia de Arceus) se desvanece. */
    snap() {
      const live = G.U.pickN(G.EnemyMgr.all().filter(e => !e.dead && !e.remote && !e.judge), Math.ceil(G.EnemyMgr.count / 2));
      for (const e of live) { G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#b8a080', 14, 120); e.shield = 0; e.hurt(e.hp * 10 + 1e7, '#b8a080', 0, 0, 0); }
      G.Spawner.say('*snap*', 2.4);
      G.Game.taint();
    },
    /** Lluvia de monedas, experiencia y alguna curación alrededor de todos. */
    pinata() {
      for (const p of G.Game.everyone()) {
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * 6.2832, d = G.U.rand(60, 150);
          const kind = i % 12 === 0 ? 'heal' : i % 2 ? 'coin' : 'xp';
          G.Pickups.drop(kind, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.9, kind === 'coin' ? 5 : kind === 'xp' ? 8 : 0);
        }
      }
      G.Spawner.say('PIÑATA!', 2.4);
      G.Game.taint();
    }
  };

  // ---------------- red ----------------

  const VALID = {
    morph: x => x.off || (G.DEX_BY[x.dex] && G.SPRITE_META[x.dex]),
    size: x => x.off || (x.k >= 0.3 && x.k <= 3),
    rev: () => true, ice: () => true, slow: () => true, fast: () => true, drunk: () => true, flip: () => true, mirror: () => true,
    tp: x => x.mode === 'yeet' || (x.mode === 'me' && Number.isFinite(x.px) && Number.isFinite(x.py)),
    world: x => WORLD.includes(x.fx) && (!x.dex || G.SPRITE_META[x.dex]),
    snap: () => true, pinata: () => true,
    fake: x => ['shiny', 'legend', 'over', 'text'].includes(x.kind) && (x.kind !== 'text' || typeof x.text === 'string'),
    spawn: x => (!x.dex || G.DEX_BY[x.dex]) && x.n >= 1 && x.n <= 30,
    drop: x => !!G.Pickups.KIND[x.kind],
    lvl: () => true, taint: () => true
  };
  /** Limpia lo que llega por la red (un mensaje viejo o raro no rompe nada). */
  function valid(msg) {
    const x = msg && msg.x;
    if (!x || typeof x !== 'object' || !VALID[msg.a]) return false;
    x.off = x.off === true;
    x.secs = x.secs === 0 ? 0 : G.U.clamp(+x.secs || 20, 1, 120);
    if (typeof x.text === 'string') x.text = x.text.slice(0, 120);
    return !!VALID[msg.a](x);
  }

  function send(a, x) {
    const msg = { k: 'adm', a, x };
    if (!G.Coop.active || G.Coop.isHost) handle(me(), msg);
    else G.Net.toHost(msg);
  }

  /** Quien manda: lo hace él o lo reparte. */
  function handle(from, msg) {
    if (!isAdmin(from) || !valid(msg) || !G.Game.player) return;
    msg.by = from;
    if (HOST[msg.a]) { HOST[msg.a](msg.x, from); return; }
    if (msg.a === 'world' && msg.x.fx === 'freeze' && !msg.x.off) G.Game.taint();     // enemigos que no pegan: ayuda
    if (G.Coop.active) for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
    apply(msg);
  }

  /** Cada uno: a ti y, si se ve, al muñeco del objetivo. Lo de toda la partida, a todos. */
  function apply(msg) {
    const x = msg.x, f = TROLLS[msg.a], pl = G.Game.player;
    if (msg.a === 'world' && pl) { worldFx(x); return; }
    if (!f || !pl) return;
    const hit = u => (x.to === '*' ? u !== msg.by : x.to === u);
    if (hit(me())) f(pl, true, x);
    if (SEEN.has(msg.a) && G.Coop.active) for (const m of G.Coop.mates) if (hit(m.uid)) f(m.pl, false, x);
  }

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'adm' || !G.Coop.active) return;
    if (G.Coop.isHost) handle(from, msg);
    else if (from === G.Net.hostUid && isAdmin(msg.by) && valid(msg)) apply(msg);
  });

  // ---------------- panel ----------------

  const CSS = `
#adm-btn{position:fixed;left:8px;bottom:8px;z-index:9000;padding:4px 10px;font:700 12px Pixelify,"Segoe UI",sans-serif;
  background:#3a1530;color:#ff8ad8;border:2px solid #ff8ad8;border-radius:6px;cursor:pointer;opacity:.75}
#adm-btn:hover{opacity:1}
#adm{position:fixed;right:8px;top:8px;bottom:8px;width:330px;max-width:calc(100vw - 16px);z-index:9001;overflow:auto;
  background:rgba(12,17,27,.96);border:2px solid #ff8ad8;border-radius:10px;padding:10px 12px;color:#e6f0fb;cursor:auto;
  font:14px Pixelify,"Segoe UI",sans-serif}
#adm h2{margin:0 0 6px;font-size:18px;color:#ff8ad8;display:flex;justify-content:space-between;align-items:center}
#adm h3{margin:12px 0 4px;font-size:14px;color:#ffd23f;border-top:1px solid rgba(255,255,255,.15);padding-top:8px}
#adm .row{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:4px 0}
#adm button{padding:4px 8px;font:inherit;font-size:13px;background:#1d2c46;color:#e6f0fb;border:1px solid #79b8ff;border-radius:5px;cursor:pointer}
#adm button:hover{filter:brightness(1.3)}
#adm button.on{background:#5a1f4a;border-color:#ff8ad8;color:#ff8ad8}
#adm input,#adm select{font:inherit;font-size:13px;background:#0c111b;color:#e6f0fb;border:1px solid #4a5a75;border-radius:5px;padding:3px 5px}
#adm input[type=number]{width:62px}
#adm .sub{color:#9db0c9;font-size:12px}
#adm .off{opacity:.4;pointer-events:none}
#adm-fx{position:fixed;inset:0;z-index:8999;display:none;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;font-family:Pixelify,"Segoe UI",sans-serif;text-align:center;text-shadow:3px 3px 0 #000}
#adm-fx b{font-size:56px}#adm-fx i{font-style:normal;font-size:40px;color:#ffd23f}#adm-fx span{font-size:22px;margin-top:6px;color:#fff}
#adm-fx.legend{background:radial-gradient(circle,rgba(255,210,63,.45),rgba(60,20,90,.85))}#adm-fx.legend b{color:#ffd23f}
#adm-fx.over{background:rgba(40,0,10,.82)}#adm-fx.over b{color:#ff5f6d}
#adm-fx.text b{font-size:40px;color:#ffcb3d;max-width:90vw;overflow-wrap:break-word}
#adm-fx.jk b{font-size:64px;color:#ff8ad8}`;

  const HTML = `
<h2>Admin <button data-do="close">✕</button></h2>
<datalist id="adm-dex"></datalist>
<div class="row"><span class="sub">Pokémon</span><input id="adm-mon" list="adm-dex" placeholder="name or # (blank = random)" style="flex:1"></div>
<div id="adm-run">
  <div class="row"><span class="sub">Target</span><select id="adm-to" style="flex:1"></select></div>
  <div class="row"><span class="sub">For</span><select id="adm-secs"><option value="0" selected>Until I turn it off</option><option value="10">10 s</option>
    <option value="20">20 s</option><option value="30">30 s</option><option value="60">60 s</option></select><span class="sub">lit = on, click to stop</span></div>
  <h3>Body swap</h3>
  <div class="row"><button data-do="morph">Turn into Pokémon</button><button data-do="karp">Magikarp</button><button data-do="tiny">Tiny</button><button data-do="giant">Giant</button></div>
  <h3>Control chaos</h3>
  <div class="row"><button data-do="rev">Reverse controls</button><button data-do="ice">Ice skates</button><button data-do="slow">Slow-mo</button>
    <button data-do="fast">Zoomies</button><button data-do="drunk">Drunk</button></div>
  <h3>Screen and place</h3>
  <div class="row"><button data-do="flip">Upside down</button><button data-do="mirror">Mirror</button><button data-do="tpme">Bring to me</button><button data-do="yeet">Yeet</button></div>
  <h3>Whole run (everyone)</h3>
  <div class="row"><button data-do="freeze">Freeze all Pokémon</button><button data-do="disco">Disco</button><button data-do="dark">Lights out</button>
    <button data-do="quake">Earthquake</button><button data-do="skin">Invasion (Pokémon above)</button><button data-do="snap">Thanos snap</button><button data-do="pinata">Piñata</button></div>
  <h3>Spawn on target</h3>
  <div class="row"><input id="adm-n" type="number" min="1" max="30" value="8"><button data-do="horde">Spawn wild</button><button data-do="boss">Spawn boss</button></div>
  <h3>Fake popups</h3>
  <div class="row"><button data-do="fshiny">Shiny nearby</button><button data-do="flegend">Legendary</button><button data-do="fover">Game over</button></div>
  <div class="row"><input id="adm-text" maxlength="120" placeholder="Big message on their screen" style="flex:1"><button data-do="ftext">Send</button></div>
  <h3>Me (not ranked)</h3>
  <div class="row"><button data-do="god" id="adm-god">God mode</button><button data-do="lvl">Level up</button><button data-do="heal">Heal / revive</button>
    <button data-do="rare">Rare card next</button></div>
  <div class="row"><select id="adm-drop" style="flex:1"></select><button data-do="drop">Drop at target</button></div>
</div>
<p class="sub" id="adm-norun">Start a run for trolls and powers (co-op for your friends).</p>
<h3>My save</h3>
<div class="row"><input id="adm-amt" type="number" min="1" value="1000"><button data-do="coins">+ coins</button><button data-do="t1">+ tickets</button><button data-do="t10">+ ×10 tickets</button></div>
<div class="row"><button data-do="own">Unlock Pokémon</button><button data-do="ownshiny">Unlock shiny</button></div>
<div class="row"><button data-do="ownall">Unlock all</button><button data-do="shinyall">All shinies</button></div>
<h3>Tools</h3>
<div class="row"><a href="/radiant-kit/" target="_blank" rel="noopener" style="color:#79b8ff">Radiant sprite kit</a><span class="sub">default sheets to recolour, named for the radiant form</span></div>`;

  let btn = null, panel = null, polls = 0;

  // Botones de lo que dura, según lo que has mandado (al momento: a un invitado lo suyo le
  // vuelve por el anfitrión). Cada grupo, uno a la vez por objetivo (Magikarp o Pokémon;
  // enano o gigante); los de toda la partida, uno para todos.
  const GROUP = { morph: 'morph', karp: 'morph', tiny: 'size', giant: 'size',
                  rev: 'rev', ice: 'ice', slow: 'slow', fast: 'fast', drunk: 'drunk', flip: 'flip', mirror: 'mirror' };
  let lit = {};                                 // 'grupo|objetivo' (o el de toda la partida) -> { b: botón, end }
  const lasting = b => !!GROUP[b] || WORLD.includes(b);
  const litKey = (b, to) => WORLD.includes(b) ? b : GROUP[b] + '|' + to;
  function isLit(b, to) {
    const l = lit[litKey(b, to)];
    return !!l && l.b === b && performance.now() < l.end;
  }

  function build() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    btn = document.createElement('button');
    btn.id = 'adm-btn'; btn.textContent = 'ADMIN'; btn.setAttribute('translate', 'no');
    btn.onclick = toggle;
    document.body.appendChild(btn);
    panel = document.createElement('div');
    panel.id = 'adm'; panel.setAttribute('translate', 'no');
    panel.innerHTML = HTML;
    panel.style.display = 'none';
    document.body.appendChild(panel);
    // Lo que se escribe aquí no mueve a tu Pokémon ni pausa (input.js escucha en window).
    // Esc o la tecla del menú (fuera de un campo de texto) lo cierran.
    panel.addEventListener('keyup', e => e.stopPropagation());
    panel.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.code === 'Backquote' && !typing(e))) { e.preventDefault(); toggle(); }
    });
    panel.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (b) act(b.dataset.do); });
    panel.addEventListener('change', render);    // otro objetivo: sus botones encendidos
    const dl = panel.querySelector('#adm-dex');
    dl.innerHTML = G.DEX.filter(p => G.SPRITE_META[p.dex]).map(p => `<option value="${esc(p.name)} #${p.dex}">`).join('');
    const kinds = [['heal', 'Heal'], ['magnet', 'Magnet'], ['bomb', 'Bomb'], ['xpBig', 'Big XP', 60], ['coin', 'Coins ×25', 25],
                   ['ticket', 'Ticket'], ['ticket10', 'Ticket ×10'], ['item', 'Item: Mega Stone', 'megastone']]
      .concat(G.Items.LIST.map(i => ['item', 'Item: ' + i.name, i.id]));
    panel.querySelector('#adm-drop').innerHTML = kinds.map((k, i) => `<option value="${i}">${esc(k[1])}</option>`).join('');
    panel.dropKinds = kinds;
  }

  function toggle() {
    if (!panel || !isAdmin()) return;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) render();
  }

  /** Lista de objetivos y lo que se puede usar ahora. */
  function render() {
    if (!panel || panel.style.display === 'none') return;
    const run = !!G.Game.player && G.Game.state !== 'ui' && G.Game.state !== 'over';
    panel.querySelector('#adm-run').style.display = run ? '' : 'none';
    panel.querySelector('#adm-norun').style.display = run ? 'none' : '';
    if (!run) return;
    const sel = panel.querySelector('#adm-to'), was = sel.value;
    const opts = [];
    const mates = G.Coop.active ? G.Coop.mates.filter(m => m.connected) : [];
    if (mates.length > 1) opts.push(['*', 'Everyone else']);
    for (const m of mates) opts.push([m.uid, m.name]);
    opts.push([me(), 'Me']);
    // Sólo si cambia (si no, se cerraría la lista mientras eliges).
    const key = JSON.stringify(opts);
    if (sel.dataset.key !== key) {
      sel.dataset.key = key;
      sel.innerHTML = opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');
      if (opts.some(o => o[0] === was)) sel.value = was;
    }
    panel.querySelector('#adm-god').classList.toggle('on', !!G.Game.player.god);
    for (const b of panel.querySelectorAll('[data-do]')) {
      const d = b.dataset.do;
      if (lasting(d)) b.classList.toggle('on', isLit(d, sel.value));
    }
  }

  /** "Pikachu #25", "25", "pikachu" -> 25; vacío -> 0; desconocido -> null. */
  function dexOf(s) {
    s = String(s || '').trim();
    if (!s) return 0;
    const n = +(s.match(/#?(\d+)$/) || [])[1];
    if (n && G.DEX_BY[n]) return n;
    const p = G.DEX.find(q => q.name.toLowerCase() === s.toLowerCase());
    return p ? p.dex : null;
  }

  function act(what) {
    const $ = id => panel.querySelector('#adm-' + id);
    const to = $('to').value, secs = +$('secs').value;
    const dex = dexOf($('mon').value);
    if (dex === null) { G.UI.toast('Unknown Pokémon'); return; }
    const save = G.DB.save, amt = Math.max(1, Math.floor(+$('amt').value || 0));
    const saved = msg => { G.DB.commit(); G.UI.refreshCoins(); G.UI.toast(msg); };
    // Encendido: se quita. Si no, se pone (secs 0 = hasta que lo quites).
    const off = lasting(what) && isLit(what, to);
    if (lasting(what)) lit[litKey(what, to)] = off ? null : { b: what, end: secs ? performance.now() + secs * 1000 : Infinity };
    switch (what) {
      case 'close': toggle(); return;
      case 'morph': case 'karp': send('morph', { to, secs, off, dex: what === 'karp' ? 129 : dex || G.U.pick(G.DEX.filter(p => G.SPRITE_META[p.dex])).dex }); break;
      case 'tiny': send('size', { to, secs, off, k: 0.4 }); break;
      case 'giant': send('size', { to, secs, off, k: 2.6 }); break;
      case 'rev': case 'ice': case 'slow': case 'fast': case 'drunk': case 'flip': case 'mirror': send(what, { to, secs, off }); break;
      case 'tpme': { const pl = G.Game.player; send('tp', { to, mode: 'me', px: Math.round(pl.x), py: Math.round(pl.y) }); break; }
      case 'yeet': send('tp', { to, mode: 'yeet' }); break;
      case 'freeze': case 'disco': case 'dark': case 'quake': send('world', { fx: what, secs, off }); break;
      case 'skin': send('world', { fx: 'skin', secs, off, dex: dex || 129 }); break;
      case 'snap': case 'pinata': send(what, {}); break;
      case 'rare': G.RareCards.forceNext(); G.UI.toast('Your next level-up has the rare card'); break;
      case 'horde': case 'boss': send('spawn', { to, dex, boss: what === 'boss', n: what === 'boss' ? 1 : G.U.clamp(+$('n').value || 8, 1, 30) }); break;
      case 'fshiny': send('fake', { to, kind: 'shiny', dex }); break;
      case 'flegend': send('fake', { to, kind: 'legend', dex }); break;
      case 'fover': send('fake', { to, kind: 'over' }); break;
      case 'ftext': { const t = $('text').value.trim(); if (t) send('fake', { to, kind: 'text', text: t }); break; }
      case 'god': {
        const pl = G.Game.player;
        pl.god = !pl.god;
        if (pl.god) send('taint', {});
        G.UI.toast('God mode ' + (pl.god ? 'on' : 'off'));
        break;
      }
      case 'lvl': send('lvl', {}); break;
      case 'heal': {
        const pl = G.Game.player;
        if (pl.dead && G.Coop.active) pl.revive(1); else pl.heal(pl.maxHp);
        send('taint', {});
        break;
      }
      case 'drop': { const k = panel.dropKinds[+$('drop').value]; send('drop', { to, kind: k[0], v: k[2] || 0 }); break; }
      case 'coins': save.coins += amt; saved('+' + amt + ' coins'); break;
      case 't1': save.tickets.t1 += amt; saved('+' + amt + ' tickets'); break;
      case 't10': save.tickets.t10 += amt; saved('+' + amt + ' ×10 tickets'); break;
      case 'own': case 'ownshiny': {
        if (!dex) { G.UI.toast('Pick a Pokémon first'); return; }
        if (what === 'own') G.DB.grant(dex, 'gacha'); else G.DB.grantShiny(dex, 'gacha');
        saved('Unlocked ' + G.DEX_BY[dex].name + (what === 'ownshiny' ? ' (shiny)' : ''));
        break;
      }
      case 'ownall': case 'shinyall': {
        const shiny = what === 'shinyall';
        if (!confirm(shiny ? 'Unlock every shiny on this account?' : 'Unlock every Pokémon on this account?')) return;
        let n = 0;
        for (const p of G.DEX) {
          if (!G.SPRITE_META[p.dex] || (shiny && !G.Sprites.hasShiny(p.dex))) continue;
          if (shiny) { if (G.DB.grantShiny(p.dex, 'gacha')) n++; continue; }
          if (!G.DB.owns(p.dex)) { G.DB.grant(p.dex, 'gacha'); n++; }
        }
        saved('Unlocked ' + n + (shiny ? ' shinies' : ' Pokémon'));
        break;
      }
    }
    render();
  }

  const typing = e => /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName);

  function init() {
    build();
    addEventListener('keydown', e => {
      if (e.code !== 'Backquote' || !isAdmin() || typing(e)) return;
      e.preventDefault();
      toggle();
    });
    // El botón sale en cuanto la sesión es de un admin (la sesión llega tarde).
    setInterval(() => {
      const on = isAdmin();
      btn.style.display = on ? '' : 'none';
      if (!on && panel.style.display !== 'none') panel.style.display = 'none';
      if (++polls % 2 === 0) render();
    }, 500);
    btn.style.display = 'none';
    setInterval(tick, 100);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();

  return { steer, beforeDraw, drawScreen, isAdmin, ADMINS, repaint: paint,
    /** Para pruebas: hasta cuándo dura cada efecto aquí (Infinity = hasta que se quite). */
    ends: () => Object.assign({}, ctl, world) };
})();
