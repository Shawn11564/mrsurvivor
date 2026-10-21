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
 *           dev.html doesn't load brand.css. The zoom would scale viewport units (vh, dvh, vw) too,
 *           so the rules that use them are divided by --ui-vu (see unzoom below).
 * Tests: fork/test-ui-scale.cjs, fork/test-settings-fit.cjs (Settings, pause and News fit at 4K).
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
  // The zoom scales viewport units too: under zoom 2.5, 100dvh is 2.5 windows tall, so a box with
  // max-height: calc(100dvh - 24px) (Settings, pause, News) ran off the top and bottom of a 4K screen,
  // Close button and all. Every rule that uses one (vh, vw, dvh, vmin...) is rewritten once to divide it
  // by --ui-vu: what 100vh measures against the window under the zoom (k in Edge and Chrome, 1 in a
  // browser that doesn't zoom them). The sheets, the <style>s added to <head> later and the inline styles
  // in the page; not rules for #game or #scr-layout, which aren't zoomed.
  const VU = /(\d*\.)?\d+[dsl]?v(?:h|w|min|max)\b/g;
  const unzoom = st => {
    for (let i = 0; i < st.length; i++) {
      const p = st[i], v = st.getPropertyValue(p);
      if (!v || v.includes('--ui-vu') || v.includes('url(')) continue;
      const nv = v.replace(VU, m => `calc(${m} / var(--ui-vu, 1))`);
      if (nv !== v) st.setProperty(p, nv, st.getPropertyPriority(p));
    }
  };
  const walk = rules => {
    for (const r of rules) {
      if (r.selectorText && /#game\b|#scr-layout\b/.test(r.selectorText)) continue;
      if (r.style) unzoom(r.style);
      if (r.cssRules) walk(r.cssRules);
    }
  };
  const done = new WeakSet();
  const sheets = () => {
    for (const s of document.styleSheets) {
      if (done.has(s)) continue;
      let rules;
      try { rules = s.cssRules; } catch (e) { done.add(s); continue; }   // another origin's (fonts)
      done.add(s);
      walk(rules);
    }
  };
  sheets();
  document.querySelectorAll('[style*="vh"], [style*="vw"], [style*="vmin"], [style*="vmax"]').forEach(el => unzoom(el.style));
  new MutationObserver(sheets).observe(document.head, { childList: true });
  addEventListener('load', sheets);

  const page = () => {
    const root = document.documentElement.style;
    root.setProperty('--ui-k', String(k(innerWidth, innerHeight)));
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    root.setProperty('--ui-vu', String(probe.getBoundingClientRect().height / innerHeight || 1));
    probe.remove();
  };
  addEventListener('resize', page);
  page();

  return { k, REF_W, REF_H, MAX, get now() { return k(innerWidth, innerHeight); } };
})();
