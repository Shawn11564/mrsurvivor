/* ============ death-cause.js — qué te ha debilitado (fork MrSurvivor) ============
 * Player.hurt no sabe quién pega. Aquí se apunta, golpe a golpe, de dónde viene, con ganchos
 * que van justo antes del golpe en el mismo paso:
 *   contacto      Enemy.strike (Combat lo llama antes de pl.hurt)
 *   disparo       Enemy.shoot marca sus proyectiles (Projectiles.spawn); el que te toca sigue en
 *                 G.Projectiles.all() cuando llega el golpe
 *   ataque en área  Enemy.hazard marca la zona (también en la que el anfitrión manda a los
 *                 invitados, 'hz'); la que acaba de estallar y te pilla (G.Hazards.all)
 *   trampa        G.Interact.trapEffect
 *   Juicio de Arceus  G.Judgment activo y golpe puro
 *   lo que se diga  G.DeathCause.by(s, fn): el golpe que da fn viene de s (el Eternabeam de
 *                 js/fork/lab/eternatus.js)
 * pl.deathLog guarda los últimos golpes { name, dex, how, dmg, boss }. Al caer sale un aviso
 * ("Te ha debilitado X (contacto)") y la pantalla final lleva "Lo que te debilitó" con los
 * últimos golpes (G.RunUI.showOver). En grupo, cada uno los suyos.
 * Prueba: fork/test-death-cause.cjs.
 */
(() => {
  const KEEP = 5;
  let actor = null;                    // el enemigo que está golpeando ahora mismo (contacto)
  let trap = false;
  let forced = null;                   // G.DeathCause.by

  const E = G.Enemy.prototype;
  const strike = E.strike;
  E.strike = function (pl) {
    actor = this;                      // lo lee el pl.hurt que viene justo después (y lo borra)
    return strike.apply(this, arguments);
  };
  let shooter = null;
  const shoot = E.shoot;
  E.shoot = function () { shooter = this; try { return shoot.apply(this, arguments); } finally { shooter = null; } };
  const spawn = G.Projectiles.spawn;
  G.Projectiles.spawn = function (o) {
    const p = spawn.apply(this, arguments);
    if (p && o && !o.friendly && shooter) p.shooter = who(shooter);
    return p;
  };
  const hazard = E.hazard;
  let hzSrc = null;
  E.hazard = function (o) {
    hzSrc = who(this);
    try { return hazard.call(this, Object.assign({ src: hzSrc }, o)); } finally { hzSrc = null; }
  };
  // El anfitrión manda cada zona a los invitados ('hz', js/systems/hazards.js add) con sus campos: también quién.
  const broadcast = G.Coop.broadcast;
  G.Coop.broadcast = function (msg) {
    if (hzSrc && Array.isArray(msg) && msg[0] === 'hz' && msg[1]) msg[1].src = hzSrc;
    return broadcast.apply(this, arguments);
  };
  const trapEffect = G.Interact.trapEffect;
  G.Interact.trapEffect = function () { trap = true; try { return trapEffect.apply(this, arguments); } finally { trap = false; } };

  function who(e) { return { name: e.name, dex: e.dex || (e.def && e.def.dex), boss: !!e.boss }; }

  /** De dónde viene el golpe que está entrando en pl. */
  function source(pl, pure) {
    if (forced) return Object.assign({}, forced);
    if (actor && !actor.dead && G.U.dist2(actor.x, actor.y, pl.x, pl.y) < (actor.r + pl.r + 30) ** 2) return Object.assign(who(actor), { how: 'touch' });
    if (trap) return { name: null, how: 'trap' };
    const shot = G.Projectiles.all().find(p => !p.friendly && G.U.dist2(p.x, p.y, pl.x, pl.y) < (p.r + pl.r) ** 2);
    if (shot) return Object.assign({ name: null }, shot.shooter || {}, { how: 'shot' });
    if (G.Judgment && G.Judgment.active && pure) return { name: null, how: 'judgment' };
    const hz = G.Hazards.all.find(h => h.hit && h.t - h.delay < 0.1 && G.Hazards.inside(h, pl.x, pl.y, pl.r));
    if (hz) return Object.assign({ name: null }, hz.src || {}, { how: 'area' });
    return null;
  }

  const P = G.Player.prototype, hurt = P.hurt;
  P.hurt = function (amount, type, pure) {
    if (this.remote) return hurt.apply(this, arguments);
    const hp0 = this.hp;
    const res = hurt.apply(this, arguments);
    const lost = hp0 - this.hp, s = lost > 0 ? source(this, pure) : null;
    actor = null;
    if (lost > 0) {
      if (s) {
        this.deathLog = (this.deathLog || []).concat([Object.assign(s, { dmg: Math.round(lost), type: type || null })]).slice(-KEEP);
        if (this.hp <= 0 && hp0 > 0) { this.killedBy = s; announce(s); }   // el golpe que lo deja a 0
      }
    }
    return res;
  };

  // ---------------- textos ----------------
  // (beam y raid: el Lab, sólo en inglés.)
  const HOW = { touch: 'contacto', shot: 'disparo', area: 'ataque en área', trap: 'trampa', judgment: 'Juicio de Arceus',
                beam: 'Eternabeam', raid: 'time ran out' };
  const name = s => s.how === 'trap' ? G.T('Una trampa') : s.how === 'judgment' ? G.T('Arceus') : s.name ? G.T(s.name) : G.T('Un enemigo');
  function announce(s) {
    G.UI.toast(G.I18n.f('Te ha debilitado {x} ({x}).', name(s), G.T(HOW[s.how])), 4200);
  }

  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function (r) {
    const res = showOver.apply(this, arguments);
    const pl = G.Game.player, k = pl && pl.killedBy, log = (pl && pl.deathLog) || [];
    const box = document.getElementById('over-stats');
    if (r && r.dead && k && box) {
      const el = document.createElement('div');
      el.className = 'death-cause';
      el.style.gridColumn = '1/-1';
      el.innerHTML = `<span>${G.T('Lo que te debilitó')}</span>
        <b class="dc-who"></b>
        <div class="dc-log" style="font-size:12px;color:var(--muted)">${G.T('Últimos golpes')}: ${log.slice().reverse().map(h =>
          `${name(h)} · ${G.T(HOW[h.how])} · −${h.dmg}`).join('  ·  ')}</div>`;
      const b = el.querySelector('.dc-who');
      if (k.dex && G.SPRITE_META[k.dex]) b.appendChild(G.UI.spriteCanvas(k.dex, 48, 40, { scale: 1, lively: true }));
      b.insertAdjacentText('beforeend', ` ${name(k)} (${G.T(HOW[k.how])})${k.boss ? ' · ' + G.T('Jefe') : ''}`);
      box.insertBefore(el, box.firstChild);
    }
    return res;
  };

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Te ha debilitado {x} ({x}).', 'Knocked out by {x} ({x}).', 'Mis K.O. par {x} ({x}).', 'Messo KO da {x} ({x}).', 'Nocauteado por {x} ({x}).', '被{x}击倒（{x}）。', '被{x}擊倒（{x}）。'],
    ['Lo que te debilitó', 'What knocked you out', 'Ce qui vous a mis K.O.', 'Cosa ti ha messo KO', 'O que te nocauteou', '击倒你的是', '擊倒你的是'],
    ['Últimos golpes', 'Last hits', 'Derniers coups', 'Ultimi colpi', 'Últimos golpes', '最后的攻击', '最後的攻擊'],
    ['contacto', 'contact', 'contact', 'contatto', 'contato', '接触', '接觸'],
    ['disparo', 'shot', 'tir', 'colpo', 'disparo', '射击', '射擊'],
    ['ataque en área', 'area attack', 'attaque de zone', 'attacco ad area', 'ataque em área', '范围攻击', '範圍攻擊'],
    ['trampa', 'trap', 'piège', 'trappola', 'armadilha', '陷阱', '陷阱'],
    ['Juicio de Arceus', 'Arceus’s Judgment', 'Jugement d’Arceus', 'Giudizio di Arceus', 'Julgamento de Arceus', '阿尔宙斯的审判', '阿爾宙斯的審判'],
    ['Una trampa', 'A trap', 'Un piège', 'Una trappola', 'Uma armadilha', '陷阱', '陷阱'],
    ['Un enemigo', 'An enemy', 'Un ennemi', 'Un nemico', 'Um inimigo', '敌人', '敵人'],
    ['Jefe', 'Boss', 'Boss', 'Boss', 'Chefe', '首领', '首領']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  G.DeathCause = { by(s, fn) { forced = s; try { return fn(); } finally { forced = null; } } };
})();
