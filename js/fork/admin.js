/* ============ admin.js — admin menu (MrSurvivor fork) ============
 * Only for the ADMINS accounts (Firebase uid). "ADMIN" button at the bottom
 * left, or the º / ` key (Backquote). In English: only the owner uses it.
 *
 *   Trolls        on a friend, on everyone or on you: turn them into another Pokémon,
 *                 tiny or giant, reversed controls, ice, slow motion,
 *                 full speed, drunk, screen upside down or mirrored,
 *                 bring them to you or send them far away, enemies or a boss on them,
 *                 fake popups (shiny, legendary, game over) and messages.
 *   Whole run     frozen enemies, disco (spinning hue, spotlights, confetti
 *                 and everyone dances), lights out, earthquake, invasion (every enemy
 *                 with the face of one Pokémon), Thanos snap and piñata.
 *   You           god mode, level up, heal, drop items on the ground,
 *                 the very rare card on the next level-up (js/fork/rare-cards.js).
 *   Save          coins, tickets and Pokémon (normal or shiny) on your account.
 *   Players       the Player Manager (js/fork/player-manager.js): every player's save and live
 *                 status, gifts, resets, and joining their lobby or run.
 *
 * Lasting effects (shape, size, controls, screen and whole run) last the chosen
 * time or, with "Until I turn it off" (secs 0), until you remove them: the button
 * stays lit while the effect is on the target, and clicking it while lit removes it (off).
 *
 * Network (co-op, star like net.js): { k:'adm', a, x, by } goes to the host,
 * which checks it comes from an admin and does it itself (enemies, items, level) or
 * forwards it to everyone; each player applies it to themselves and, if it shows (shape,
 * size), to the target's puppet. A guest only obeys what comes
 * from the host with `by` from an admin.
 * A run where the admin helps themselves (god, level, items, enemies) does not
 * go on the leaderboard (G.Game.taint, on the host). Trolls that only annoy still do.
 * Hooks: Player.update (steer) and Player.hurt (god) in js/entities/player.js;
 * beforeDraw and drawScreen in js/game.js's render.
 * Test: fork/test-admin.cjs; names in English (items, Type: Null): fork/test-admin-names.cjs.
 */
G.Admin = (() => {
  // Admin accounts (Firebase Authentication > Users > User UID).
  const ADMINS = ['TMD8t0i6jic7a1sg824ZP55TqOG3'];
  const me = () => G.DB.fb && G.DB.fb.uid;
  const isAdmin = (u = me()) => !!u && ADMINS.includes(u);

  // ---------------- effects on a player ----------------

  // Shape and size: a new Animator with another Pokémon or another scale (looks
  // only; hits and speed stay the player's own). It wears off by itself.
  // (Mega Evolution uses it too, js/fork/mega.js: p.megaKey is its Mega's sprite;
  // and radiants, js/fork/radiant.js: with p.radiant, its radiant sheet.)
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
  /** Until when (performance.now): off = not any more; secs 0 = until the admin removes it. */
  const until = x => x.off ? 0 : x.secs ? performance.now() + x.secs * 1000 : Infinity;

  // Controls and screen (yours only): until when each one lasts (performance.now).
  const ctl = { rev: 0, ice: 0, slow: 0, fast: 0, drunk: 0, flip: 0, mirror: 0 };
  let iv = [0, 0];
  /** Player.update: the movement vector, with whatever trolls are on you. */
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
      // With no keys held it ends up stopping (otherwise it would "walk" forever). Not when starting:
      // the first step is so small it would stay still.
      if (!x && !y && Math.hypot(iv[0], iv[1]) < 0.03) iv = [0, 0];
      return iv.slice();
    }
    iv = [x, y];
    return iv;
  }

  // ---------------- fake popups ----------------

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
  // The panel is translate="no", so names from the game's data (written in Spanish: items, a few
  // Pokémon such as Código Cero = Type: Null) go through the dictionary here.
  const monName = p => G.T(p.name);
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
      overlay('<i>★★★★★</i><b>LEGENDARY!</b><span>' + esc(monName(m)) + ' joined your team!</span>', 'legend', 3200, jk);
    } else if (x.kind === 'over') {
      G.Audio.sfx('gameover');
      overlay('<b>GAME OVER</b><span>Your run has ended.</span>', 'over', 2600, jk);
    } else if (x.kind === 'text') {
      overlay('<b>' + esc(x.text) + '</b>', 'text', 4500);
    }
  }

  /** What happens to a player. local: it's you (otherwise it's someone else's puppet). */
  const TROLLS = {
    morph(p, local, x) { const end = until(x); look(p, x.off ? { dexT: 0 } : { dex: x.dex, dexT: end }, end); },
    size(p, local, x) { const end = until(x); look(p, x.off ? { kT: 0 } : { k: x.k, kT: end }, end); },
    fake(p, local, x) { if (local) fake(x); },
    tp(p, local, x) { if (local) teleport(p, x); }
  };
  // Controls and screen: they only track the time.
  for (const k of ['rev', 'ice', 'slow', 'fast', 'drunk', 'flip', 'mirror']) {
    TROLLS[k] = (p, local, x) => { if (local) ctl[k] = until(x); };
  }
  const SEEN = new Set(['morph', 'size']);     // on the puppet too, so the others see it

  /** A free spot near (x, y) at a distance between d0 and d1. */
  function freeNear(x, y, d0, d1) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(d0, d1);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.9;
      if (G.World.isFree(px, py, 14)) return [px, py];
    }
    return [x, y];
  }
  /** Next to the admin ('me', with their position in px/py) or far from where you are ('yeet'). */
  function teleport(p, x) {
    if (p.dead) return;
    const [nx, ny] = x.mode === 'me' ? freeNear(x.px, x.py, 30, 60) : freeNear(p.x, p.y, 650, 1000);
    G.FX.ring(p.x, p.y, 6, 70, '#c47bff', 0.5, 4);
    p.x = nx; p.y = ny;
    G.FX.ring(p.x, p.y, 6, 70, '#c47bff', 0.5, 4);
    G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#e2c2ff', 24, 180);
    G.Audio.sfx('select');
  }

  // ---------------- whole run (everyone, the admin too) ----------------

  // Until when each one lasts (performance.now) and whose face the invasion wears.
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
  const inRun = () => !!(G.Game && G.Game.player) && G.Game.state !== 'ui' && G.Game.state !== 'over';   // (G.Game: dev.html may still be loading js/game.js)
  const COLORS = ['#ff5f6d', '#ffd23f', '#5fe08a', '#4fb4ff', '#c47bff', '#ff8ad8'];

  /*
   * Every 0.1 s: what is still on keeps its effect (also on enemies as they
   * spawn) and what has ended is undone. Outside a run everything is removed
   * (the menu uses the same canvas).
   */
  function tick() {
    const now = performance.now(), run = inRun();
    if (!run) { for (const k in ctl) ctl[k] = 0; for (const k of WORLD) world[k] = 0; lit = {}; }
    const all = run ? G.EnemyMgr.all() : [];
    // Frozen: the real ones (host or solo) stunned; a guest's copies too,
    // every tick (they don't hurt on touch, combat.js; coop.js doesn't overwrite it: admFrozen), and it's removed when it ends.
    const frozen = now < world.freeze;
    for (const e of all) {
      if (frozen) { if (e.remote) { e.stunT = 0.3; e.admFrozen = true; } else e.applyStun(0.3); }
      else if (e.admFrozen) { e.stunT = 0; e.admFrozen = false; }
    }
    // Invasion: every enemy looks like another Pokémon (looks only).
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
    // Earthquake: the shake keeps rumbling (with "less shaking", at a quarter, like kick).
    if (now < world.quake) {
      const level = (0.6 + 0.35 * Math.abs(Math.sin(now / 180))) * (G.Settings.get('calm') ? 0.25 : 1);
      G.Camera.shake = Math.max(G.Camera.shake, level);
    }
    if (now < world.disco) {
      for (const p of G.Game.everyone()) {
        G.FX.burst(p.x + G.U.rand(-120, 120), p.y - G.U.rand(20, 140), G.U.pick(COLORS), 5, 150);
      }
    }
    // Screen upside down / mirrored, and the disco ball (hue that keeps spinning).
    const el = cv();
    if (el) {
      const tf = [now < ctl.flip ? 'rotate(180deg)' : '', now < ctl.mirror ? 'scaleX(-1)' : ''].join(' ').trim();
      if (el.style.transform !== tf) el.style.transform = tf;
      if (!(now < world.disco) && el.style.filter) el.style.filter = '';
    }
  }

  /** game.js render, before drawing the world: in the disco everyone dances (spins). */
  function beforeDraw() {
    const now = performance.now();
    if (!(now < world.disco) || !inRun()) return;
    const beat = Math.floor(now / 140);
    G.EnemyMgr.all().forEach((e, i) => { e.anim.dir = (beat + i) % 8; });
    G.Game.everyone().forEach((p, i) => { p.anim.dir = (beat + i * 3) % 8; });
    const el = cv();
    if (el) el.style.filter = `hue-rotate(${Math.round(now / 6) % 360}deg) saturate(1.5)`;
  }

  /** game.js render, over the world and under the HUD: spotlights, frost and lights out. */
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
      // Only a little around your Pokémon can be seen.
      const k = G.Camera.scale;
      const x = (pl.x - G.Camera.left()) * k, y = (pl.y - G.LIFT * 0.5 - G.Camera.top()) * k;
      const g = ctx.createRadialGradient(x, y, 55 * k, x, y, 140 * k);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.97)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------------- what the one in charge does (the host, or you in solo) ----------------

  function playerOf(u) {
    if (u === me()) return G.Game.player;
    const m = G.Coop.active && G.Coop.mate(u);
    return m && m.connected ? m.pl : null;
  }
  /** Players it goes to: '*' = everyone but the admin. */
  function targets(to, by) {
    if (to !== '*') return [playerOf(to)].filter(Boolean);
    return G.Game.everyone().filter(p => p !== playerOf(by));
  }

  /** Enemy definition for any Pokémon, with the current numbers. */
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

  /** Enemies around p (in view, not off-screen like normal ones). No dex: the run's own. */
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
    /** Half the enemies (not those of Arceus's Judgment) fade away. */
    snap() {
      const live = G.U.pickN(G.EnemyMgr.all().filter(e => !e.dead && !e.remote && !e.judge), Math.ceil(G.EnemyMgr.count / 2));
      for (const e of live) { G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#b8a080', 14, 120); e.shield = 0; e.hurt(e.hp * 10 + 1e7, '#b8a080', 0, 0, 0); }
      G.Spawner.say('*snap*', 2.4);
      G.Game.taint();
    },
    /** A shower of coins, XP and some healing around everyone. */
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

  // ---------------- network ----------------

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
  /** Cleans what comes over the network (an old or odd message breaks nothing). */
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

  /** The one in charge: does it itself or passes it out. */
  function handle(from, msg) {
    if (!isAdmin(from) || !valid(msg) || !G.Game.player) return;
    msg.by = from;
    if (HOST[msg.a]) { HOST[msg.a](msg.x, from); return; }
    if (msg.a === 'world' && msg.x.fx === 'freeze' && !msg.x.off) G.Game.taint();     // enemies that don't hit: that's help
    if (G.Coop.active) for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
    apply(msg);
  }

  /** Each player: to you and, if it shows, to the target's puppet. Whole-run effects, to everyone. */
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
#adm #adm-players{display:block;width:100%;margin:2px 0 6px;padding:7px;font-size:14px;background:#3a1530;border-color:#ff8ad8;color:#ffc4ec}
#adm-fx{position:fixed;inset:0;z-index:8999;display:none;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;font-family:Pixelify,"Segoe UI",sans-serif;text-align:center;text-shadow:3px 3px 0 #000}
#adm-fx b{font-size:56px}#adm-fx i{font-style:normal;font-size:40px;color:#ffd23f}#adm-fx span{font-size:22px;margin-top:6px;color:#fff}
#adm-fx.legend{background:radial-gradient(circle,rgba(255,210,63,.45),rgba(60,20,90,.85))}#adm-fx.legend b{color:#ffd23f}
#adm-fx.over{background:rgba(40,0,10,.82)}#adm-fx.over b{color:#ff5f6d}
#adm-fx.text b{font-size:40px;color:#ffcb3d;max-width:90vw;overflow-wrap:break-word}
#adm-fx.jk b{font-size:64px;color:#ff8ad8}`;

  const HTML = `
<h2>Admin <button data-do="close">✕</button></h2>
<button data-do="players" id="adm-players">Player Manager</button>
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

  // Buttons for lasting effects, by what you have sent (right away: a guest's own message
  // comes back through the host). Each group, one at a time per target (Magikarp or Pokémon;
  // tiny or giant); whole-run ones, one for everyone.
  const GROUP = { morph: 'morph', karp: 'morph', tiny: 'size', giant: 'size',
                  rev: 'rev', ice: 'ice', slow: 'slow', fast: 'fast', drunk: 'drunk', flip: 'flip', mirror: 'mirror' };
  let lit = {};                                 // 'group|target' (or the whole-run one) -> { b: button, end }
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
    // Typing here doesn't move your Pokémon or pause (input.js listens on window).
    // Esc or the menu key (outside a text field) closes it.
    panel.addEventListener('keyup', e => e.stopPropagation());
    panel.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.code === 'Backquote' && !typing(e))) { e.preventDefault(); toggle(); }
    });
    panel.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (b) act(b.dataset.do); });
    panel.addEventListener('change', render);    // another target: its lit buttons
    const dl = panel.querySelector('#adm-dex');
    dl.innerHTML = G.DEX.filter(p => G.SPRITE_META[p.dex]).map(p => `<option value="${esc(monName(p))} #${p.dex}">`).join('');
    const kinds = [['heal', 'Heal'], ['magnet', 'Magnet'], ['bomb', 'Bomb'], ['xpBig', 'Big XP', 60], ['coin', 'Coins ×25', 25],
                   ['ticket', 'Ticket'], ['ticket10', 'Ticket ×10'], ['item', 'Item: Mega Stone', 'megastone']]
      .concat(G.Items.LIST.map(i => ['item', 'Item: ' + G.T(i.name), i.id]));
    panel.querySelector('#adm-drop').innerHTML = kinds.map((k, i) => `<option value="${i}">${esc(k[1])}</option>`).join('');
    panel.dropKinds = kinds;
  }

  function toggle() {
    if (!panel || !isAdmin()) return;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) render();
  }

  /** Target list and what can be used now. */
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
    // Only if it changed (otherwise the list would close while you pick).
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

  /** "Pikachu #25", "25", "pikachu", "Type: Null" or "Código Cero" -> its number; empty -> 0; unknown -> null. */
  function dexOf(s) {
    s = String(s || '').trim();
    if (!s) return 0;
    const n = +(s.match(/#?(\d+)$/) || [])[1];
    if (n && G.DEX_BY[n]) return n;
    s = s.toLowerCase();
    const p = G.DEX.find(q => monName(q).toLowerCase() === s || q.name.toLowerCase() === s);
    return p ? p.dex : null;
  }

  function act(what) {
    const $ = id => panel.querySelector('#adm-' + id);
    const to = $('to').value, secs = +$('secs').value;
    const dex = dexOf($('mon').value);
    if (dex === null) { G.UI.toast('Unknown Pokémon'); return; }
    const save = G.DB.save, amt = Math.max(1, Math.floor(+$('amt').value || 0));
    const saved = msg => { G.DB.commit(); G.UI.refreshCoins(); G.UI.toast(msg); };
    // Lit: it's removed. Otherwise it's put on (secs 0 = until you remove it).
    const off = lasting(what) && isLit(what, to);
    if (lasting(what)) lit[litKey(what, to)] = off ? null : { b: what, end: secs ? performance.now() + secs * 1000 : Infinity };
    switch (what) {
      case 'close': toggle(); return;
      case 'players': G.PlayerManager.open(); return;
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
        saved('Unlocked ' + monName(G.DEX_BY[dex]) + (what === 'ownshiny' ? ' (shiny)' : ''));
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
    // The button shows as soon as the session is an admin's (the session arrives late).
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
    close() { if (panel && panel.style.display !== 'none') toggle(); },
    /** For tests: until when each effect lasts here (Infinity = until removed). */
    ends: () => Object.assign({}, ctl, world) };
})();
