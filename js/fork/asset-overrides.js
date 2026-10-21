/* ============ asset-overrides.js — art changed from the Asset Admin (MrSurvivor fork) ============
 * fork/asset-admin.cjs publishes two lists (without rebuilding app.min.js) that the game reads on load:
 *   - js/fork/asset-rev.json { 'assets/pokemon/150/Idle.png': 'a1b2c3d4e5' }: files that were
 *     changed under the same name. sw.js caches the images in assets/ forever (they never used to
 *     change), so each image on the list is requested with ?v=<hash>: to the cache it's a new URL and
 *     the new image arrives. This is done in the HTMLImageElement.src setter (every sheet is loaded with
 *     new Image() + src); the ones requested before the list arrived are requested again.
 *   - js/fork/icon-overrides.json { 'lb-y': { file, v, w, h } }: a PNG instead of an icon
 *     drawn in code (G.Icons). It takes the same space as the original (its usual size, ×1, ×2...)
 *     and is drawn from the PNG, which can be finer (×4): it's smoothed when scaled down; or, with own,
 *     at the PNG's size (a bigger drawing than the code one, without losing pixels). Wraps
 *     G.Icons.canvas/draw/html/url, and the <img> already on the page are swapped when it loads.
 * Both lists are checked before use: assets/ paths ending in .png and hex hashes
 * (icons only from assets/icons/code/). With no network or no lists, everything works as before.
 * Test: fork/test-asset-overrides.cjs.
 */
G.AssetOverrides = (() => {
  // The game's root: what comes before js/ in the URL of this script (or of app.min.js).
  const own = document.currentScript || document.querySelector('script[src*="app.min.js"], script[src*="asset-overrides.js"]');
  const src = own ? own.src : location.href;
  const ROOT = src.includes('/js/') ? src.slice(0, src.lastIndexOf('/js/') + 1) : new URL('./', location.href).href;
  const HEX = /^[0-9a-f]{6,40}$/;
  const ASSET = /^assets\/[A-Za-z0-9_\/.-]+\.png$/, CODE = /^assets\/icons\/code\/[A-Za-z0-9._-]+\.png$/;

  // ---------------- changed files: ?v= ----------------
  let rev = null;                                   // path -> hash (null: not here yet)
  const pending = [];                               // [WeakRef(img), path] requested before the list
  const P = HTMLImageElement.prototype, D = Object.getOwnPropertyDescriptor(P, 'src');
  /** { url, rel } if u is an image from this game's assets/. */
  function relOf(u) {
    if (typeof u !== 'string' || u.indexOf('assets/') < 0 || /^(data|blob):/.test(u)) return null;
    let url;
    try { url = new URL(u, document.baseURI); } catch (e) { return null; }
    if (!url.href.startsWith(ROOT)) return null;
    return { url, rel: url.href.slice(ROOT.length).split(/[?#]/)[0] };
  }
  function withRev(u) {
    const r = rev && relOf(u), v = r && rev[r.rel];
    if (!v) return u;
    r.url.searchParams.set('v', v);
    return r.url.href;
  }
  Object.defineProperty(P, 'src', {
    configurable: true, enumerable: D.enumerable, get: D.get,
    set(u) {
      if (!rev) { const r = relOf(u); if (r && pending.length < 5000) pending.push([new WeakRef(this), r.rel]); return D.set.call(this, u); }
      return D.set.call(this, withRev(u));
    }
  });

  // ---------------- code icons replaced by a PNG ----------------
  const I = G.Icons, oCanvas = I.canvas, oDraw = I.draw, oHtml = I.html, oUrl = I.url;
  const icons = {};                                 // name -> { img, url, w, h, ready }
  const cvs = new Map();
  // The base size: the code drawing's, or the PNG's if it brings its own (own: an 18×18 instead of 13×13,
  // shown 1:1, or ×2 where the icon is doubled; the rest of the game measures with G.Icons.canvas).
  const native = n => { const o = icons[n]; return o && o.own ? { width: o.w, height: o.h } : oCanvas.call(I, n); };
  // The on-screen width for `size`: the sharp multiple of the code one (×1, ×2...), and with own that same
  // multiple of the PNG (an 18×18 shows at 18 where the code one is at 13, at 36 where it's at 26). With own,
  // below half the code one, ½ or ¼ of the PNG (the Lab arrows, at 9: js/fork/lab/badges.js).
  const mult = (n, size) => {
    const k = size / oCanvas.call(I, n).width;
    return k < 0.75 && icons[n] && icons[n].own ? 2 ** Math.max(-2, Math.round(Math.log2(k))) : Math.max(1, Math.round(k));
  };
  const shown = (n, size) => { const o = icons[n]; return (o && o.own ? o.w : oCanvas.call(I, n).width) * mult(n, size); };
  const ready = n => icons[n] && icons[n].ready ? icons[n] : null;
  const CSS = { coin: '--ico-coin', cursor: '--ico-cursor' };   // the ones from ui/icons.js installCss

  /** <img> already drawn with the code drawing switch to the PNG (and so do the CSS variables). */
  function swapDom(n, o) {
    const old = oUrl.call(I, n);
    for (const img of document.querySelectorAll('img.pix')) {
      if (img.getAttribute('src') !== old) continue;
      if (o.own) { const m = mult(n, img.width); img.width = o.w * m; img.height = o.h * m; }
      img.setAttribute('src', o.url);
      if (o.w > img.width * (devicePixelRatio || 1)) img.style.imageRendering = 'auto';
    }
    if (CSS[n]) document.documentElement.style.setProperty(CSS[n], `url("${o.url}")`);
  }
  function loadIcons(j) {
    for (const [n, e] of Object.entries(j || {})) {
      if (!e || !CODE.test(e.file) || !HEX.test(e.v) || !(e.w > 0 && e.h > 0 && e.w <= 4096 && e.h <= 4096)) continue;
      if (e.own && (e.w > 512 || e.h > 512)) continue;
      const o = { img: new Image(), url: ROOT + e.file + '?v=' + e.v, w: e.w, h: e.h, own: !!e.own, ready: false };
      o.img.onload = () => { o.ready = true; cvs.delete(n); swapDom(n, o); };
      o.img.src = o.url;
      icons[n] = o;
    }
  }

  I.canvas = function (n) {
    const o = ready(n);
    if (!o) return oCanvas.apply(this, arguments);
    let c = cvs.get(n);
    if (!c) {
      const nv = native(n);
      c = document.createElement('canvas'); c.width = nv.width; c.height = nv.height;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = o.w > nv.width;
      x.drawImage(o.img, 0, 0, nv.width, nv.height);
      cvs.set(n, c);
    }
    return c;
  };
  // Same place and size as ui/icons.js draw(); smoothing only if the PNG is bigger than the space it takes.
  I.draw = function (ctx, n, x, y, size, fit = false) {
    const o = ready(n);
    if (!o) return oDraw.apply(this, arguments);
    const nv = native(n);
    let s2 = shown(n, size);
    if (fit && !o.own && Math.abs(s2 - size) > size * 0.2) s2 = size;
    x += (size - s2) / 2; y += (size - s2) / 2;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = o.w > s2 * (Math.abs(ctx.getTransform().a) || 1) + 0.5;
    ctx.drawImage(o.img, Math.round(x), Math.round(y), s2, s2 * nv.height / nv.width);
    ctx.imageSmoothingEnabled = prev;
  };
  I.html = function (n, size = 20, cls = '') {
    const o = icons[n];
    if (!o) return oHtml.apply(this, arguments);
    const nv = native(n), w = shown(n, size), h = w * nv.height / nv.width;
    const smooth = o.w > w * (devicePixelRatio || 1) ? ' style="image-rendering:auto"' : '';
    return `<img class="pix ${cls}" src="${o.url}" width="${w}" height="${h}" alt="" draggable="false"${smooth}>`;
  };
  I.url = function (n) { return icons[n] ? icons[n].url : oUrl.apply(this, arguments); };
  // ui.js calls installCss() when the page starts (it may be after the PNG has loaded): the PNG again.
  const oInstall = I.installCss;
  I.installCss = function () {
    const r = oInstall.apply(this, arguments);
    for (const n in CSS) if (ready(n)) document.documentElement.style.setProperty(CSS[n], `url("${icons[n].url}")`);
    return r;
  };

  // ---------------- the lists ----------------
  const get = f => fetch(ROOT + 'js/fork/' + f + '?t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));
  // Not before every script has run (DOMContentLoaded): icons added
  // later (badge-art.js) would be requested before they exist, and ui/icons.js would keep
  // its placeholder (a star) forever. Defer scripts run with readyState already 'interactive', so
  // only 'complete' means it has passed; otherwise, whichever of DOMContentLoaded and load comes first.
  const scripts = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => {
    addEventListener('DOMContentLoaded', r, { once: true }); addEventListener('load', r, { once: true });
  });
  const loaded = Promise.all([get('asset-rev.json'), get('icon-overrides.json'), scripts]).then(([r, i]) => {
    const clean = {};
    for (const [p, v] of Object.entries(r || {})) if (ASSET.test(p) && !p.includes('..') && HEX.test(v)) clean[p] = v;
    rev = clean;
    for (const [ref, rel] of pending.splice(0)) {
      const img = ref.deref(), cur = img && D.get.call(img), r2 = cur && relOf(cur);
      if (rev[rel] && r2 && r2.rel === rel) img.src = cur;          // again, now with ?v=
    }
    loadIcons(i);
  });

  return { loaded, rev: () => rev, icons: () => Object.keys(icons), ROOT };
})();
