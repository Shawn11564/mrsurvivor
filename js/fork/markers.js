/* ============ markers.js — marcadores de lo que está fuera de la vista (fork MrSurvivor) ============
 * Las flechas hacia shinies, duendes del tesoro, la grieta, el Pokémon perdido y los compañeros
 * (js/ui/hud.js, js/systems/events.js) iban pegadas al borde de la pantalla: en monitores grandes
 * quedaban lejísimos de donde miras. Ahora:
 *   - van en una elipse alrededor de tu Pokémon (como mucho RX × RY px de él), en la dirección
 *     exacta de lo que señalan (pegadas al borde, la esquina deformaba el ángulo)
 *   - con un disco oscuro y un aro de su color detrás, para que se vean sin molestar
 *   - cuando aparece algo nuevo fuera de la vista (un shiny, un duende, la grieta, un compañero
 *     que cae...), todas se juntan un momento en un círculo pegado a tu Pokémon (FOCUS) y
 *     vuelven a su sitio
 *   - lo mismo mientras mantienes F (o Y en el mando), o al pulsarla si en Ajustes → Controles
 *     eliges "Pulsar para cambiar" (markerKey: 'hold' | 'toggle')
 *   - en grupo, un aviso en pantalla cuando un compañero cae
 *
 *   at(key, sx, sy, w, h) → { x, y, a, k, hot } dónde dibujar el marcador (k: escala), o null si
 *                           lo que señala (sx, sy, en px de pantalla) ya se ve. key: qué es
 *                           (un marcador nuevo dispara el FOCUS)
 *   halo(ctx, col, m)     el disco de fondo (con el contexto ya en el sitio del marcador)
 * Prueba: fork/test-gameplay.cjs (solitario) y fork/test-coop.cjs (el aviso de un compañero caído).
 */
G.Markers = (() => {
  const RX = 440, RY = 300;                // como mucho, a esta distancia de tu Pokémon (px de pantalla)
  const NEAR_RX = 108, NEAR_RY = 88;       // juntas: alrededor de tu Pokémon
  const TOP = 92, BOTTOM = 104, SIDE = 48; // lo que ocupan el HUD de arriba, los ataques de abajo y el margen
  const IN = 0.25, HOLD = 1.8, OUT = 0.7;  // el FOCUS: entra, se queda y vuelve (s)
  const QUIET = 2500;                      // al empezar la partida, lo que ya había no cuenta como nuevo (ms)
  const NOTE_S = 3.6;

  const T = {
    key: 'Acercar marcadores', keyDesc: 'Con F (o Y en el mando) los marcadores de lo que no ves se juntan alrededor de tu Pokémon.',
    hold: 'Mantener pulsada', toggle: 'Pulsar para cambiar',
    down: '¡{x} ha caído!', downSub: 'Sigue su flecha y quédate a su lado para levantarle'
  };
  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    [T.key, 'Bring markers close', 'Rapprocher les repères', 'Avvicina gli indicatori', 'Aproximar marcadores', '拉近标记', '拉近標記'],
    [T.keyDesc, 'With F (or Y on a controller) the markers for what you can\'t see gather around your Pokémon.',
     'Avec F (ou Y à la manette), les repères de ce que tu ne vois pas se regroupent autour de ton Pokémon.',
     'Con F (o Y sul controller) gli indicatori di ciò che non vedi si raccolgono attorno al tuo Pokémon.',
     'Com F (ou Y no controle) os marcadores do que você não vê se juntam ao redor do seu Pokémon.',
     '按F（手柄按Y）时，看不到的东西的标记会聚到你的宝可梦周围。', '按F（手把按Y）時，看不到的東西的標記會聚到你的寶可夢周圍。'],
    [T.hold, 'Hold', 'Maintenir', 'Tieni premuto', 'Segurar', '按住', '按住'],
    [T.toggle, 'Press to switch', 'Appuyer pour basculer', 'Premi per alternare', 'Pressionar para alternar', '按一下切换', '按一下切換'],
    [T.down, '{x} is down!', '{x} est K.O. !', '{x} è a terra!', '{x} caiu!', '{x}倒下了！', '{x}倒下了！'],
    [T.downSub, 'Follow their arrow and stay next to them to revive them', 'Suis sa flèche et reste à côté pour le relever',
     'Segui la sua freccia e restagli accanto per rianimarlo', 'Siga a seta e fique ao lado para reanimar',
     '跟着箭头走，待在旁边就能让它起来', '跟著箭頭走，待在旁邊就能讓它起來']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  let focusAt = -1e9, manualK = 0, toggled = false, padPrev = false, lastT = 0, runPl = null, runAt = 0;
  const seen = new Map();                  // key -> última vez que se pidió (performance.now)
  const wasDown = new Map(), notes = [];
  const ease = x => x * x * (3 - 2 * x);

  /** Lo juntas que están ahora (0 = en su elipse, 1 = alrededor de tu Pokémon). */
  function focusK(now) {
    const t = (now - focusAt) / 1000;
    const auto = t < 0 ? 0 : t < IN ? ease(t / IN) : t < IN + HOLD ? 1 : t < IN + HOLD + OUT ? 1 - ease((t - IN - HOLD) / OUT) : 0;
    return Math.max(auto, manualK);
  }
  function focus() { focusAt = performance.now(); }

  /** Dónde está tu Pokémon en la pantalla. */
  function center(w, h) {
    const pl = G.Game.player, cam = G.Camera;
    if (!pl) return [w / 2, h / 2];
    return [(pl.x - cam.left()) * cam.scale, (pl.y - pl.bodyH * 0.5 - cam.top()) * cam.scale];
  }

  function at(key, sx, sy, w, h) {
    const now = performance.now();
    const off = !(sx > 0 && sx < w && sy > 0 && sy < h);
    if (!seen.has(key) && off && now - runAt > QUIET) focus();
    seen.set(key, now);
    if (!off) return null;
    const [cx, cy] = center(w, h), a = Math.atan2(sy - cy, sx - cx), ca = Math.cos(a), sa = Math.sin(a);
    const k = focusK(now);
    const rx0 = Math.max(60, Math.min(RX, cx - SIDE, w - cx - SIDE)), ry0 = Math.max(50, Math.min(RY, cy - TOP, h - cy - BOTTOM));
    const rx = rx0 + (Math.min(NEAR_RX, rx0) - rx0) * k, ry = ry0 + (Math.min(NEAR_RY, ry0) - ry0) * k;
    const r = 1 / Math.sqrt((ca / rx) ** 2 + (sa / ry) ** 2);
    // Algo más grandes en pantallas grandes (con 1080 px de alto, ×1,2) y al juntarse.
    const big = G.U.clamp(h / 900, 1, 1.25);
    return { x: cx + ca * r, y: cy + sa * r, a, k: big * (1 + 0.2 * k), hot: k };
  }

  /** Disco oscuro con un aro de su color detrás del marcador (ya trasladado y escalado). */
  function halo(ctx, col, m) {
    const t = performance.now() / 1000, beat = 0.5 + Math.sin(t * 3.2) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.12 + beat * 0.08 + (m ? m.hot * 0.12 : 0);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 27 + beat * 3, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#0b1220';
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2.5; ctx.strokeStyle = col;
    ctx.stroke();
    ctx.restore();
  }

  // ---------------- cada fotograma (antes de dibujar el HUD) ----------------
  function padY() {
    if (G.Settings.get('gamepad') === false || !navigator.getGamepads) return false;
    for (const p of navigator.getGamepads()) if (p && p.connected && p.buttons[3]) return !!p.buttons[3].pressed;
    return false;
  }
  function frame(pl) {
    const now = performance.now(), dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    if (pl !== runPl) {                    // otra partida: lo de antes no cuenta
      runPl = pl; runAt = now; seen.clear(); wasDown.clear(); notes.length = 0; toggled = false; focusAt = -1e9;
    }
    // La tecla: F o Y en el mando, mantenida o para cambiar (Ajustes → Controles).
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    const pad = padY(), padHit = pad && !padPrev;
    padPrev = pad;
    let want;
    if (G.Settings.get('markerKey') === 'toggle') {
      if (!typing && (G.Input.tap('keyf') || padHit)) toggled = !toggled;
      want = toggled;
    } else want = !typing && (G.Input.held('keyf') || pad);
    if (G.Game.state !== 'playing') want = want && G.Game.state !== 'ui';
    manualK = G.U.clamp(manualK + (want ? dt / IN : -dt / OUT), 0, 1);
    for (const [k, t] of seen) if (now - t > 1500) seen.delete(k);
    // Compañeros que caen: aviso en pantalla (y sus marcadores se juntan).
    if (G.Coop.active) {
      for (const m of G.Coop.mates) {
        if (!m.connected) continue;
        const d = !!m.pl.dead;
        if (d && !wasDown.get(m.uid) && now - runAt > 500) { notes.push({ name: m.name, color: m.color, at: now }); focus(); G.Audio.sfx('hurt'); }
        wasDown.set(m.uid, d);
      }
    }
    while (notes.length && now - notes[0].at > NOTE_S * 1000) notes.shift();
  }

  /** El aviso de un compañero caído (encima del resto del HUD). */
  function drawNotes(ctx, w, h) {
    const now = performance.now();
    notes.forEach((n, i) => {
      const t = (now - n.at) / 1000, a = Math.min(1, t * 5, (NOTE_S - t) * 2), pop = 1 + Math.max(0, 0.2 - t) * 1.5;
      const y = h * 0.22 + i * 58;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y); ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      const t1 = G.I18n.f(T.down, n.name), t2 = G.T(T.downSub);
      ctx.font = '800 20px Pixelify,"Segoe UI",system-ui,sans-serif';
      const w1 = ctx.measureText(t1).width;
      ctx.font = '700 11px Pixelify,"Segoe UI",system-ui,sans-serif';
      const bw = Math.min(w - 24, Math.max(w1, ctx.measureText(t2).width) + 36);
      G.HUD.roundRect(ctx, -bw / 2, -26, bw, 52, 10);
      ctx.fillStyle = 'rgba(48,8,14,.9)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ff5f6d'; ctx.stroke();
      ctx.font = '800 20px Pixelify,"Segoe UI",system-ui,sans-serif';
      ctx.fillStyle = '#ffd0d5';
      G.I18n.rawCanvas(ctx, 'fillText', t1, 0, -2);
      ctx.font = '700 11px Pixelify,"Segoe UI",system-ui,sans-serif';
      ctx.fillStyle = '#ffb0b8';
      G.I18n.rawCanvas(ctx, 'fillText', t2, 0, 16);
      ctx.restore();
    });
  }

  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    frame(pl);
    const r = draw.apply(this, arguments);
    drawNotes(ctx, w, h);
    return r;
  };

  /** La fila de Ajustes → Controles (la pinta settings-ui.js con sus piezas). */
  function settingsRow(choice) {
    return `<div class="set-row"><div class="grow"><b>${T.key}</b> <kbd>F</kbd><small>${T.keyDesc}</small></div></div>`
      + choice('markerKey', [['hold', T.hold], ['toggle', T.toggle]]);
  }

  return { at, halo, focus, settingsRow, RX, RY, NEAR_RX, NEAR_RY,
    /** Para pruebas: lo juntas que están ahora (0..1) y los avisos en pantalla. */
    get focusK() { return focusK(performance.now()); }, get notes() { return notes.map(n => n.name); } };
})();
