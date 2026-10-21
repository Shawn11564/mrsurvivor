/* ============ ui-scale.js — the interface sized to the screen (MrSurvivor fork) ============
 * The world already looks the same on any screen (G.Camera.resize: VIEW_W wide), but the
 * interface was in fixed pixels: at 2560×1440 the HP, the moves, the menus, the level cards
 * and their icons were tiny. Now everything is scaled by k = the screen (in CSS px) against
 * REF_W×REF_H, never less than 1 or more than MAX: 1 up to 1400×850 (as before), ≈1.27 at 1920×1080,
 * ≈1.69 at 2560×1440, ≈2.5 at 4K.
 *
 *   HUD     (canvas: js/ui/hud.js and what the fork adds to it) is drawn with ctx.scale(k). Meanwhile,
 *           everything it reads from the screen is in its coordinates: the width and height (w/k, h/k), the
 *           iPhone margins, the mouse (G.Touch.mouseAt, G.Input.mouse), what you drag
 *           (G.Touch.drag) and the camera (G.Camera.scale / k, for the arrows to what is
 *           off screen); and the buttons it registers (G.Touch.addButton) go back to CSS px, so the click
 *           and the tap land where they're shown. Wraps G.HUD.draw outside everything (it loads after
 *           evo-hud, underdog and markers), so the fork's parts scale the same way.
 *   Pages   (HTML: menus, cards, top bar, toasts) with CSS zoom: k in --ui-k, on everything
 *           under <body> except the game canvas and the button editor (#scr-layout, which
 *           places its pieces in window px). The style is here and not in css/brand.css because
 *           dev.html doesn't load brand.css.
 * Test: fork/test-ui-scale.cjs.
 */
G.UIScale = (() => {
  const REF_W = 1400, REF_H = 850, MAX = 3;
  const k = (w, h) => G.U.clamp(Math.min(w / REF_W, h / REF_H), 1, MAX);

  // ---------------- the HUD ----------------

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

  // ---------------- the pages ----------------

  const css = document.createElement('style');
  css.textContent = 'body > :not(#game):not(#scr-layout) { zoom: var(--ui-k, 1); }';
  document.head.appendChild(css);
  const page = () => document.documentElement.style.setProperty('--ui-k', String(k(innerWidth, innerHeight)));
  addEventListener('resize', page);
  page();

  return { k, REF_W, REF_H, MAX, get now() { return k(innerWidth, innerHeight); } };
})();
