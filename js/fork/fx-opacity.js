/* ============ fx-opacity.js — transparencia de los efectos de los movimientos (fork MrSurvivor) ============
 * Ajustes → Gráficos, para todos: "Tus efectos" (100 % por defecto) y "Efectos de tus compañeros"
 * (60 %). Los de los enemigos y el mapa no cambian.
 * De quién es cada cosa:
 *   - proyectiles y campos (G.Projectiles.all, G.Combat.fields, G.LabKinds.fields): su `owner`;
 *   - partículas, golpes, anillos y rayos de G.FX (no saben de quién son): se marcan al nacer según
 *     quién está lanzando: G.Combat.tick con tu Pokémon → tuyos; G.Combat.ghostCast / ghostOrbit (los
 *     compañeros) → suyos. Las listas las da G.FX.lists (un getter del fork en js/entities/fx.js).
 * Al dibujar, cada grupo va en su propia pasada (las listas se dejan sólo con ese grupo y luego se
 * reponen, en el mismo orden) y en ella todo globalAlpha que se ponga sale multiplicado (una propiedad
 * propia sobre ese ctx, que se quita al acabar). Los números de daño, en la pasada de "lo demás".
 * Prueba: fork/test-fx-opacity.cjs.
 */
G.FxOpacity = (() => {
  const A = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
  const num = (v, d) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
  const K = () => ({ me: num(G.Settings.get('fxMine'), 1), mate: num(G.Settings.get('fxMates'), 0.6) });

  /** fn con todo globalAlpha de ctx multiplicado por k. */
  function withAlpha(ctx, k, fn) {
    if (!(k < 0.999)) return fn();
    const prev = A.get.call(ctx);
    Object.defineProperty(ctx, 'globalAlpha', { configurable: true, get() { return A.get.call(this) / k; }, set(v) { A.set.call(this, v * k); } });
    A.set.call(ctx, prev * k);
    try { return fn(); } finally { delete ctx.globalAlpha; A.set.call(ctx, prev); }
  }
  /** Dibuja con draw() una pasada por grupo: arrays se quedan sólo con lo de ese grupo (y se reponen). */
  function byGroup(ctx, arrays, groupOf, draw, only = null) {
    const k = K();
    if (k.me >= 0.999 && k.mate >= 0.999) return draw();
    const orig = arrays.map(a => a.slice());
    try {
      for (const g of ['other', 'me', 'mate']) {
        arrays.forEach((a, i) => { a.length = 0; for (const x of orig[i]) if ((only && only[i] === false && g !== 'other') ? false : groupOf(x) === g) a.push(x); });
        if (arrays.every(a => !a.length) && g !== 'other') continue;
        withAlpha(ctx, g === 'other' ? 1 : k[g], draw);
      }
    } finally { arrays.forEach((a, i) => { a.length = 0; for (const x of orig[i]) a.push(x); }); }
  }

  const ownerGroup = o => { const pl = G.Game.player; return !o ? 'other' : o === pl ? 'me' : 'mate'; };

  // ---------------- partículas de G.FX: se marcan al nacer ----------------
  function tagNew(tag, fn, self, args) {
    const L = G.FX.lists, before = {};
    if (!L) return fn.apply(self, args);
    for (const k in L) before[k] = L[k].length;
    try { return fn.apply(self, args); }
    finally { const L2 = G.FX.lists; for (const k in L2) { const a = L2[k]; for (let i = before[k] || 0; i < a.length; i++) if (a[i] && a[i].tg === undefined) a[i].tg = tag; } }
  }
  const C = G.Combat;
  for (const [name, tagOf] of [['tick', (dt, pl) => (pl === G.Game.player ? 'me' : 'mate')], ['ghostCast', () => 'mate'], ['ghostOrbit', () => 'mate']]) {
    const f = C[name];
    C[name] = function () { return tagNew(tagOf.apply(null, arguments), f, this, arguments); };
  }
  const fxDraw = G.FX.draw;
  G.FX.draw = function (ctx) {
    const L = G.FX.lists;
    if (!L) return fxDraw.apply(this, arguments);
    const names = ['beams', 'slashes', 'rings', 'parts', 'sprites', 'texts'];
    // Los números de daño (texts) sólo en la pasada de "lo demás".
    return byGroup(ctx, names.map(n => L[n]), x => x.tg || 'other', () => fxDraw.call(this, ctx), names.map(n => n !== 'texts'));
  };

  // ---------------- proyectiles y campos: su owner ----------------
  const pDraw = G.Projectiles.draw;
  G.Projectiles.draw = function (ctx) {
    return byGroup(ctx, [G.Projectiles.all()], p => (p.friendly ? ownerGroup(p.owner) : 'other'), () => pDraw.call(this, ctx));
  };
  const fieldLists = () => [C.fields, G.LabKinds && G.LabKinds.fields && G.LabKinds.fields()].filter(Array.isArray);
  for (const name of ['drawGroundFields', 'drawAirFields']) {
    const f = C[name];
    C[name] = function (ctx) { return byGroup(ctx, fieldLists(), x => ownerGroup(x.owner), () => f.call(this, ctx)); };
  }

  // ---------------- Ajustes → Gráficos ----------------
  function slider(key, label, desc, def) {
    const v = Math.round(num(G.Settings.get(key), def) * 100);
    queueMicrotask(() => {
      const r = document.getElementById('set-' + key), out = document.getElementById('set-' + key + '-v');
      if (!r) return;
      r.oninput = () => { G.Settings.set(key, r.value / 100); out.textContent = r.value + '%'; };
      r.onchange = () => G.Audio.sfx('click');
    });
    return `<div class="set-row"><div class="grow"><b>${G.T(label)}</b><small>${G.T(desc)}</small></div>
      <input type="range" id="set-${key}" min="10" max="100" step="5" value="${v}" aria-label="${G.T(label)}" style="max-width:160px"><b id="set-${key}-v" style="min-width:42px;text-align:right">${v}%</b></div>`;
  }
  if (G.RadiantGlow) {
    const row = G.RadiantGlow.settingsRow;
    G.RadiantGlow.settingsRow = function (section) {
      return row.apply(this, arguments)
        + slider('fxMine', 'Tus efectos', 'Lo transparentes que se ven tus ataques (proyectiles, golpes, rayos...).', 1)
        + slider('fxMates', 'Efectos de tus compañeros', 'Lo transparentes que se ven los ataques de tus compañeros en cooperativo.', 0.6);
    };
  }

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Tus efectos', 'Your move effects', 'Vos effets', 'I tuoi effetti', 'Seus efeitos', '你的招式特效', '你的招式特效'],
    ['Lo transparentes que se ven tus ataques (proyectiles, golpes, rayos...).', 'How see-through your attacks look (projectiles, hits, beams...).',
     'La transparence de vos attaques (projectiles, coups, rayons...).', 'Quanto sono trasparenti i tuoi attacchi (proiettili, colpi, raggi...).',
     'O quão transparentes ficam seus ataques (projéteis, golpes, raios...).', '你的攻击（弹幕、打击、光束……）的透明度。', '你的攻擊（彈幕、打擊、光束……）的透明度。'],
    ['Efectos de tus compañeros', 'Teammates\' move effects', 'Effets de vos coéquipiers', 'Effetti dei compagni', 'Efeitos dos companheiros', '队友的招式特效', '隊友的招式特效'],
    ['Lo transparentes que se ven los ataques de tus compañeros en cooperativo.', 'How see-through your teammates\' attacks look in co-op.',
     'La transparence des attaques de vos coéquipiers en coopération.', 'Quanto sono trasparenti gli attacchi dei compagni in cooperativa.',
     'O quão transparentes ficam os ataques dos companheiros no cooperativo.', '合作模式中队友攻击的透明度。', '合作模式中隊友攻擊的透明度。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { K, withAlpha };
})();
