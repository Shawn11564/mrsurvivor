/* ============ asset-overrides.js — arte cambiado desde el Asset Admin (fork MrSurvivor) ============
 * fork/asset-admin.cjs publica dos listas (sin rehacer app.min.js) que el juego lee al cargar:
 *   - js/fork/asset-rev.json { 'assets/pokemon/150/Idle.png': 'a1b2c3d4e5' }: archivos que se han
 *     cambiado con el mismo nombre. sw.js guarda las imágenes de assets/ para siempre (no cambiaban
 *     nunca), así que cada imagen de la lista se pide con ?v=<huella>: para la caché es otra URL y
 *     llega la nueva. Se hace en el setter de HTMLImageElement.src (todas las hojas se cargan con
 *     new Image() + src); las que se pidieron antes de que llegara la lista se vuelven a pedir.
 *   - js/fork/icon-overrides.json { 'lb-y': { file, v, w, h } }: un PNG en lugar de un icono
 *     dibujado con código (G.Icons). Ocupa lo mismo que el original (su tamaño de siempre, ×1, ×2...)
 *     y se dibuja desde el PNG, que puede ser más fino (×4): se suaviza al reducirlo; o, con own,
 *     del tamaño del PNG (un dibujo más grande que el de código, sin perder píxeles). Envuelve
 *     G.Icons.canvas/draw/html/url, y los <img> que ya estaban pintados se cambian al cargar.
 * Las dos listas se comprueban antes de usarlas: rutas de assets/ con .png y huellas hexadecimales
 * (los iconos, sólo de assets/icons/code/). Sin red o sin las listas, todo como siempre.
 * Prueba: fork/test-asset-overrides.cjs.
 */
G.AssetOverrides = (() => {
  // La raíz del juego: lo que va antes de js/ en la URL de este script (o de app.min.js).
  const own = document.currentScript || document.querySelector('script[src*="app.min.js"], script[src*="asset-overrides.js"]');
  const src = own ? own.src : location.href;
  const ROOT = src.includes('/js/') ? src.slice(0, src.lastIndexOf('/js/') + 1) : new URL('./', location.href).href;
  const HEX = /^[0-9a-f]{6,40}$/;
  const ASSET = /^assets\/[A-Za-z0-9_\/.-]+\.png$/, CODE = /^assets\/icons\/code\/[A-Za-z0-9._-]+\.png$/;

  // ---------------- archivos cambiados: ?v= ----------------
  let rev = null;                                   // ruta -> huella (null: aún no ha llegado)
  const pending = [];                               // [WeakRef(img), ruta] pedidas antes de la lista
  const P = HTMLImageElement.prototype, D = Object.getOwnPropertyDescriptor(P, 'src');
  /** { url, rel } si u es una imagen de assets/ de este juego. */
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

  // ---------------- iconos de código cambiados por un PNG ----------------
  const I = G.Icons, oCanvas = I.canvas, oDraw = I.draw, oHtml = I.html, oUrl = I.url;
  const icons = {};                                 // nombre -> { img, url, w, h, ready }
  const cvs = new Map();
  // El tamaño base: el del dibujo de código, o el del PNG si trae el suyo (own: un 18×18 en vez de 13×13,
  // que se ve 1:1, o ×2 donde el icono va al doble; el resto del juego mide con G.Icons.canvas).
  const native = n => { const o = icons[n]; return o && o.own ? { width: o.w, height: o.h } : oCanvas.call(I, n); };
  // El ancho en pantalla para `size`: el múltiplo nítido del de código (×1, ×2...), y con own ese mismo
  // múltiplo del PNG (un 18×18 se ve a 18 donde el de código va a 13, a 36 donde va a 26). Con own, por
  // debajo de la mitad del de código, ½ o ¼ del PNG (las flechas del Lab, a 9: js/fork/lab/badges.js).
  const mult = (n, size) => {
    const k = size / oCanvas.call(I, n).width;
    return k < 0.75 && icons[n] && icons[n].own ? 2 ** Math.max(-2, Math.round(Math.log2(k))) : Math.max(1, Math.round(k));
  };
  const shown = (n, size) => { const o = icons[n]; return (o && o.own ? o.w : oCanvas.call(I, n).width) * mult(n, size); };
  const ready = n => icons[n] && icons[n].ready ? icons[n] : null;
  const CSS = { coin: '--ico-coin', cursor: '--ico-cursor' };   // los de ui/icons.js installCss

  /** Los <img> ya pintados con el dibujo de código pasan al PNG (y las variables de CSS). */
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
  // Mismo sitio y tamaño que ui/icons.js draw(); suavizado sólo si el PNG es más grande que lo que ocupa.
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

  // ---------------- las listas ----------------
  const get = f => fetch(ROOT + 'js/fork/' + f + '?t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));
  // No antes de que hayan corrido todos los scripts (DOMContentLoaded): los iconos que se añaden
  // después (badge-art.js) se pedirían antes de existir y ui/icons.js se quedaría para siempre con
  // su sustituto (una estrella). Los scripts defer corren con readyState ya 'interactive', así que
  // sólo 'complete' quiere decir que ya pasó; si no, lo primero de DOMContentLoaded y load.
  const scripts = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => {
    addEventListener('DOMContentLoaded', r, { once: true }); addEventListener('load', r, { once: true });
  });
  const loaded = Promise.all([get('asset-rev.json'), get('icon-overrides.json'), scripts]).then(([r, i]) => {
    const clean = {};
    for (const [p, v] of Object.entries(r || {})) if (ASSET.test(p) && !p.includes('..') && HEX.test(v)) clean[p] = v;
    rev = clean;
    for (const [ref, rel] of pending.splice(0)) {
      const img = ref.deref(), cur = img && D.get.call(img), r2 = cur && relOf(cur);
      if (rev[rel] && r2 && r2.rel === rel) img.src = cur;          // otra vez, ya con ?v=
    }
    loadIcons(i);
  });

  return { loaded, rev: () => rev, icons: () => Object.keys(icons), ROOT };
})();
