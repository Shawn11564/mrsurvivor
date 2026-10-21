/* ============ ui-scale.js — la interfaz a la medida de la pantalla (fork MrSurvivor) ============
 * El mundo ya se ve igual en cualquier pantalla (G.Camera.resize: VIEW_W de ancho), pero la
 * interfaz iba en píxeles fijos: en 2560×1440 la vida, los ataques, los menús, las cartas de nivel
 * y sus iconos se quedaban diminutos. Ahora todo va a escala k = la pantalla (en px CSS) contra
 * REF_W×REF_H, nunca menos de 1 ni más de MAX: 1 hasta 1400×850 (como antes), ≈1,27 en 1920×1080,
 * ≈1,69 en 2560×1440, ≈2,5 en 4K.
 *
 *   HUD     (lienzo: js/ui/hud.js y lo que el fork le añade) se dibuja con ctx.scale(k). Mientras,
 *           todo lo que lee de la pantalla va en sus coordenadas: el ancho y el alto (w/k, h/k), los
 *           márgenes del iPhone, el ratón (G.Touch.mouseAt, G.Input.mouse), lo que arrastras
 *           (G.Touch.drag) y la cámara (G.Camera.scale / k, para las flechas de lo que queda
 *           fuera); y los botones que registra (G.Touch.addButton) vuelven a px CSS, para que el clic
 *           y el toque caigan donde se ven. Envuelve G.HUD.draw por fuera de todo (se carga después
 *           de evo-hud, underdog y markers), así que lo del fork escala igual.
 *   Páginas (HTML: menús, cartas, barra de arriba, avisos) con CSS zoom: k en --ui-k, en todo lo
 *           que cuelga de <body> menos el lienzo del juego y el editor de botones (#scr-layout, que
 *           coloca sus piezas en px de la ventana). El estilo va aquí y no en css/brand.css porque
 *           dev.html no carga brand.css.
 * Prueba: fork/test-ui-scale.cjs.
 */
G.UIScale = (() => {
  const REF_W = 1400, REF_H = 850, MAX = 3;
  const k = (w, h) => G.U.clamp(Math.min(w / REF_W, h / REF_H), 1, MAX);

  // ---------------- el HUD ----------------

  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl, st) {
    const s = k(w, h);
    if (s === 1) return draw.apply(this, arguments);
    const T = G.Touch, cam = G.Camera, I = G.Input;
    const add = T.addButton, safe = T.safeArea, mouse = I.mouse, scale = cam.scale;
    const own = n => Object.getOwnPropertyDescriptor(T, n);
    const mouseAt = own('mouseAt'), drag = own('drag');
    T.addButton = (x, y, bw, bh, fn, pad = 6, slot = null) => add(x * s, y * s, bw * s, bh * s, fn, pad * s, slot);
    T.safeArea = () => { const a = safe(); return { top: a.top / s, right: a.right / s, bottom: a.bottom / s, left: a.left / s }; };
    I.mouse = () => { const m = mouse(); return { x: m.x / s, y: m.y / s, down: m.down }; };
    Object.defineProperty(T, 'mouseAt', { configurable: true, get: () => { const m = mouseAt.get(); return m && { x: m.x / s, y: m.y / s }; } });
    Object.defineProperty(T, 'drag', { configurable: true, get: () => {
      const d = drag.get();
      return d && Object.assign({}, d, { x: d.x / s, y: d.y / s, x0: d.x0 / s, y0: d.y0 / s });
    } });
    cam.scale = scale / s;
    ctx.save();
    ctx.scale(s, s);
    try { return draw.call(this, ctx, w / s, h / s, pl, st); }
    finally {
      ctx.restore();
      cam.scale = scale;
      T.addButton = add; T.safeArea = safe; I.mouse = mouse;
      Object.defineProperty(T, 'mouseAt', mouseAt);
      Object.defineProperty(T, 'drag', drag);
    }
  };

  // ---------------- las páginas ----------------

  const css = document.createElement('style');
  css.textContent = 'body > :not(#game):not(#scr-layout) { zoom: var(--ui-k, 1); }';
  document.head.appendChild(css);
  const page = () => document.documentElement.style.setProperty('--ui-k', String(k(innerWidth, innerHeight)));
  addEventListener('resize', page);
  page();

  return { k, REF_W, REF_H, MAX, get now() { return k(innerWidth, innerHeight); } };
})();
