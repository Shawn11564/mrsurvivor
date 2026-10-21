/* ============ bewear.js — un secreto al sur del mapa (fork MrSurvivor) ============
 * En cada run, lejos al sur de donde empiezas (unos 3000 px hacia abajo, en el primer sitio libre),
 * espera un Bewear. Si llegas hasta él te da un abrazo y desbloquea "Corazones" en Ajustes →
 * Gráficos (save.hearts): con él encendido, todos los proyectiles que lanzas son corazones (sólo
 * el dibujo; tus compañeros los ven como siempre). Se dibuja con los de G.Events.drawables (ordenado
 * por su Y con el resto) y no estorba (no es sólido, nadie le ataca); en la arena de una grieta no
 * está. La fila de Ajustes va detrás de la del brillo de los radiantes (G.RadiantGlow.settingsRow).
 * Prueba: fork/test-bewear.cjs.
 */
G.Bewear = (() => {
  const DEX = 760, SOUTH = 3000, NEAR = 56;
  let spot = null, anim = null, last = 0, hugT = 0;
  const save = () => G.DB.save;
  const unlocked = () => !!(save() && save().hearts);

  /** Dónde está en esta run: el primer sitio libre cerca de (0, SOUTH). */
  function where() {
    if (spot) return spot;
    for (let r = 0; r < 600; r += 24) for (let a = 0; a < 6.283; a += r ? 24 / r : 7) {
      const x = Math.cos(a) * r, y = SOUTH + Math.sin(a) * r;
      if (G.World.isFree(x, y, 18)) return (spot = { x, y });
    }
    return (spot = { x: 0, y: SOUTH });
  }
  function hug(pl) {
    const s = save();
    for (let i = 0; i < 10; i++) G.FX.sp('heart', 'fairy', spot.x + G.U.rand(-26, 26), spot.y - G.U.rand(10, 50), { vy: -50, life: 0.9 });
    if (s && !s.hearts) {
      s.hearts = Date.now();
      G.Settings.set('hearts', true);
      G.DB.commit(true);
      G.Audio.sfx('legend');
      G.UI.toast(G.T('Bewear te da un abrazo enorme. Has desbloqueado Corazones (Ajustes → Gráficos).'), 6000);
    } else G.Audio.sfx('heal');
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '♥', '#ff8acb', true);
  }

  function drawable() {
    const pl = G.Game.player;
    if (!pl || G.Rift.inArena || (G.Judgment && G.Judgment.active)) return null;
    const p = where();
    if (!G.Camera.sees(p.x, p.y, 140)) return null;
    if (!anim) anim = new G.Sprites.Animator(DEX, 1);
    const now = performance.now() / 1000, dt = Math.min(0.1, now - (last || now));
    last = now;
    anim.update(dt);
    // Mira hacia ti; si estás a su lado, abrazo (el primero desbloquea; luego, corazones cada 3 s).
    anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - p.y, pl.x - p.x));
    hugT -= dt;
    if (!pl.dead && Math.hypot(pl.x - p.x, pl.y - p.y) < NEAR && hugT <= 0) { hugT = 3; anim.play('Attack'); hug(pl); }
    else anim.loop('Idle');
    return { y: p.y, draw(ctx) { G.Sprites.drawShadow(ctx, DEX, p.x, p.y); anim.draw(ctx, p.x, p.y); } };
  }
  const drawables = G.Events.drawables;
  G.Events.drawables = function () {
    const out = drawables.apply(this, arguments) || [];
    const b = drawable();
    return b ? out.concat([b]) : out;
  };
  // Cada run, su sitio (el mundo cambia).
  function wrapRun() {
    const startRun = G.Game.startRun;
    G.Game.startRun = function () { spot = null; hugT = 0; return startRun.apply(this, arguments); };
  }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);

  // ---------------- los corazones ----------------
  const spawn = G.Projectiles.spawn;
  G.Projectiles.spawn = function (o) {
    if (o && o.friendly !== false && !o.ghost && o.owner && o.owner === G.Game.player && unlocked() && G.Settings.get('hearts'))
      o = Object.assign({}, o, { vis: Object.assign({}, o.vis, { proj: 'heart', pal: 'fairy', trail: null }) });
    return spawn.call(this, o);
  };
  if (G.RadiantGlow) {
    const row = G.RadiantGlow.settingsRow;
    G.RadiantGlow.settingsRow = function (section) {
      const html = row.apply(this, arguments);
      if (!unlocked()) return html;
      const on = !!G.Settings.get('hearts');
      return html + `<div class="set-row"><div class="grow"><b>${G.T('Corazones')}</b><small>${G.T('Todo lo que lanzas sale en forma de corazón. Un regalo de Bewear.')}</small></div>
        <button class="btn small switch ${on ? 'gold' : ''}" data-k="hearts">${on ? 'Sí' : 'No'}</button></div>`;
    };
  }

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Bewear te da un abrazo enorme. Has desbloqueado Corazones (Ajustes → Gráficos).', 'Bewear gives you a huge hug. You unlocked Hearts (Settings → Graphics).',
     'Chelours vous fait un énorme câlin. Vous avez débloqué Cœurs (Réglages → Graphismes).', 'Bewear ti fa un abbraccio enorme. Hai sbloccato Cuori (Impostazioni → Grafica).',
     'Bewear te dá um abraço enorme. Você desbloqueou Corações (Configurações → Gráficos).', '穿着熊给了你一个大大的拥抱。你解锁了「爱心」（设置 → 画面）。', '穿著熊給了你一個大大的擁抱。你解鎖了「愛心」（設定 → 畫面）。'],
    ['Corazones', 'Hearts', 'Cœurs', 'Cuori', 'Corações', '爱心', '愛心'],
    ['Todo lo que lanzas sale en forma de corazón. Un regalo de Bewear.', 'Everything you fire comes out as hearts. A gift from Bewear.',
     'Tout ce que vous lancez sort en forme de cœur. Un cadeau de Chelours.', 'Tutto ciò che lanci esce a forma di cuore. Un regalo di Bewear.',
     'Tudo o que você lança sai em forma de coração. Um presente de Bewear.', '你发射的一切都会变成爱心。穿着熊的礼物。', '你發射的一切都會變成愛心。穿著熊的禮物。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { where, unlocked, DEX, SOUTH };
})();
