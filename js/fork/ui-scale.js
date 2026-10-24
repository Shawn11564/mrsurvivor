/* ============ ui-scale.js — the interface sized to the screen (MrSurvivor fork) ============
 * The world already looks the same on any screen (G.Camera.resize: VIEW_W wide), but the
 * interface was in fixed pixels: at 2560×1440 the HP, the moves, the menus, the level cards
 * and their icons were tiny. Now everything is scaled by k. The largest k that still fits is the screen
 * (in CSS px) against REF_W×REF_H ("fit": ≈1.27 at 1920×1080, ≈1.69 at 2560×1440, ≈2.54 at 4K); at fit a
 * 1400×850 layout fills the whole screen, which was too big (Settings top to bottom), so by default
 * k = DEF × fit, never under 1 (screens up to 1400×850 stay as before): ≈1.08, ≈1.44, ≈2.16.
 *
 *   GUI scale  Settings > Graphics > GUI, a slider 0-100 (G.Settings 'uiScale', 50 by default, in the
 *           middle). Left of the middle k goes down to LOW × the default; right of it up to the fit, never
 *           past it, so nothing runs off the screen. On a screen up to 1400×850 the right half can't go
 *           bigger (it says so). Applied when you let go (while dragging, the box would move under you).
 *   Squeeze A box that only just doesn't fit (a row too many at this scale) is zoomed down until it does
 *           (to SQUEEZE at most) instead of growing a scroll bar for one row; boxes far too long scroll as
 *           before. On every screen G.UI.show opens, on resize and when the scale changes.
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
  const REF_W = 1400, REF_H = 850, MAX = 3, DEF = 0.85, LOW = 0.7, SQUEEZE = 0.75, TOO_LONG = 0.75;   // (SQUEEZE was 0.8 until upstream's Upgrades got a row taller, 2026-10-21)
  const pos = () => { const v = +G.Settings.get('uiScale'); return Number.isFinite(v) ? G.U.clamp(v, 0, 100) : 50; };
  // The scale for a w×h screen: [smallest, default, largest] at slider 0, 50 and 100.
  function range(w, h) {
    const fit = Math.min(w / REF_W, h / REF_H, MAX), top = Math.max(1, fit), def = Math.max(1, fit * DEF);
    return [def * LOW, def, top];
  }
  function at(w, h, v = pos()) {
    const [lo, def, top] = range(w, h);
    return v <= 50 ? lo + (def - lo) * v / 50 : def + (top - def) * (v - 50) / 50;
  }
  const k = (w, h) => at(w, h);

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

  // ---------------- squeeze ----------------

  function squeeze(b, min = SQUEEZE) {
    b.style.zoom = '';
    // A box shorter than TOO_LONG of its content scrolls as it is (squeezing would only make the scroll bar shorter).
    if (b.scrollHeight <= b.clientHeight + 1 || b.clientHeight / b.scrollHeight < TOO_LONG) return;
    for (let z = 1, i = 0; i < 12 && b.scrollHeight > b.clientHeight + 1 && z > min; i++) {
      z = Math.max(min, z * Math.max(0.9, b.clientHeight / b.scrollHeight));
      b.style.zoom = String(z);
    }
  }
  // A screen's boxes (the main menu's are one level down); data-fit="own" fit themselves (js/fork/over-fit.js).
  const BOXES = '.scr:not(.hidden) > .box:not([data-fit="own"]), .scr:not(.hidden) > * > .box:not([data-fit="own"])';
  const squeezeAll = () => document.querySelectorAll(BOXES).forEach(b => squeeze(b));
  let pending = 0;
  const later = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; squeezeAll(); setTimeout(squeezeAll, 300); }); };
  // Screens open through G.UI.show or by dropping .hidden themselves (Settings, legal, News...): watch them all.
  const watch = new MutationObserver(later);
  const watchAll = () => document.querySelectorAll('.scr').forEach(el => watch.observe(el, { attributes: true, attributeFilter: ['class'] }));
  watchAll();
  new MutationObserver(watchAll).observe(document.body, { childList: true });
  addEventListener('resize', later);

  // ---------------- Settings > Graphics > GUI ----------------

  const pct = v => Math.round(at(innerWidth, innerHeight, v) / at(innerWidth, innerHeight, 50) * 100) + '%';
  function settingsRows(section, choice) {
    const v = pos(), [, def, top] = range(innerWidth, innerHeight);
    queueMicrotask(() => {                                   // on the page by now (render() just put it there)
      const r = document.getElementById('set-uiscale'), out = document.getElementById('set-uiscale-v');
      if (!r) return;
      r.oninput = () => { out.textContent = pct(+r.value); };
      r.onchange = () => { G.Settings.set('uiScale', +r.value); G.Audio.sfx('click'); G.SettingsUI.open(); };
      document.getElementById('set-uiscale-reset').onclick = () => { G.Settings.set('uiScale', 50); G.SettingsUI.open(); };
    });
    return section('GUI')
      + `<div class="set-row"><div class="grow"><b>Icon size</b></div>${choice('hudSize', [[0.8, 'Small'], [1, 'Medium'], [1.3, 'Large']]).replace('set-chips', 'set-chips ui-inline')}</div>`
      + `<div class="set-row"><div class="grow"><b>GUI scale</b><small>How big the menus, cards and HUD are. The middle is the best size for your screen, and it never goes bigger than your window allows.${top <= def + 1e-6 ? ' Your window is too small to go bigger.' : ''}</small></div>
           <input type="range" id="set-uiscale" min="0" max="100" step="1" value="${v}" aria-label="GUI scale" style="max-width:160px">
           <b id="set-uiscale-v" style="min-width:48px;text-align:right">${pct(v)}</b>
           <button class="btn small ghost" id="set-uiscale-reset" title="Back to the middle"${v === 50 ? ' disabled' : ''}>Reset</button></div>`;
  }
  css.textContent += ' .set-chips.ui-inline { margin: 0; flex-wrap: wrap; justify-content: flex-end; }'
    // What's new opens with the top bar on screen: start under it, like Missions or the Pokédex (style.css),
    // instead of max-height: calc(100dvh - 90px), which at full length went 11 px under the bar.
    + ' @media (min-height: 521px) { #scr-news { padding-top: 66px; } #scr-news > .news-box { max-height: 100%; } }';

  G.Settings.on(key => { if (key === 'uiScale') { page(); later(); } });

  return { k, at, range, squeeze, settingsRows, REF_W, REF_H, MAX, DEF, LOW, get now() { return k(innerWidth, innerHeight); } };
})();
