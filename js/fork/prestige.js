/* ============ prestige.js — prestigio de cada Pokémon (fork MrSurvivor) ============
 * Con todas las mejoras de un Pokémon compradas (Mejoras), puede subir de prestigio: sus mejoras
 * vuelven a 0 (sin devolver monedas) y gana, en cada run con él, +5 % de vida, daño, velocidad y
 * reducción de daño por nivel de prestigio, hasta 3. Con el 3.º empieza cada run con un objeto al
 * azar (G.Items.roll). save.prest[dex] = 0..3.
 * Fusión de dos copias (G.forkMerge): merge() de js/core/db.js se queda con el nivel mayor de cada
 * mejora, así que una copia vieja con todo comprado desharía el reinicio. Si las copias no tienen el
 * mismo prestigio de un Pokémon, sus mejoras son las de la copia con más prestigio.
 * Dónde: un panel bajo la lista de Mejoras, ★ en su casilla de la colección (G.Radiant.cell, el
 * gancho que menu.js ya llama) y en el selector de Mejoras. En la run: G.Game.startRun.
 * Prueba: fork/test-prestige.cjs.
 */
G.Prestige = (() => {
  const $ = id => document.getElementById(id);
  const MAX = 3, K = 0.05;
  const save = () => G.DB.save;
  const level = dex => { const s = save(), v = s && s.prest && s.prest[dex]; return Math.max(0, Math.min(MAX, v | 0)); };
  const maxedAll = dex => { const lv = G.DB.upgradesOf(dex) || {}; return G.Upgrades.LIST.every(u => (lv[u.id] || 0) >= u.max); };
  const can = dex => level(dex) < MAX && maxedAll(dex);

  function prestige(dex) {
    if (!can(dex)) return false;
    const s = save();
    s.prest = s.prest && typeof s.prest === 'object' ? s.prest : {};
    s.prest[dex] = level(dex) + 1;
    s.pupg = s.pupg || {};
    s.pupg[dex] = {};
    G.DB.commit(true);
    return true;
  }

  // ---------------- en la run ----------------
  // game.js se carga después de los archivos del fork: se envuelve al terminar de cargar (nadie empieza antes).
  function wrapRun() {
  const startRun = G.Game.startRun;
  G.Game.startRun = function () {
    const r = startRun.apply(this, arguments);
    const pl = G.Game.player, p = pl && level(pl.mon.dex);
    if (p) {
      pl.addMaxHp(Math.round(pl.maxHp * K * p));
      pl.atkMul *= 1 + K * p;
      pl.spdMul *= 1 + K * p;
      pl.dmgReduce = Math.min(0.7, pl.dmgReduce + K * p);
      pl.prestige = p;
      if (p >= MAX && !pl.item) {
        const it = G.Items.roll(null);
        if (it && G.Items.BY[it]) { pl.equip(it); G.Spawner.say(G.I18n.f('Prestigio máximo: llevas {x}.', G.T(G.Items.BY[it].name)), 3, true); }
      }
    }
    return r;
  };
  }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);

  // ---------------- fusión ----------------
  const merge = G.forkMerge;
  G.forkMerge = function (r, a, b) {
    if (merge) merge.apply(this, arguments);
    const pa = (a && a.prest) || {}, pb = (b && b.prest) || {};
    const dexes = new Set(Object.keys(pa).concat(Object.keys(pb)));
    if (!dexes.size) return;
    r.prest = r.prest || {};
    for (const d of dexes) {
      const x = pa[d] | 0, y = pb[d] | 0;
      r.prest[d] = Math.max(x, y);
      if (x !== y) { r.pupg = r.pupg || {}; r.pupg[d] = JSON.parse(JSON.stringify(((x > y ? a : b).pupg || {})[d] || {})); }
    }
  };

  // ---------------- pantalla de Mejoras ----------------
  let sure = false;
  const dexNow = () => { const sel = $('upg-mon'); return sel && +sel.value; };
  function stars(p) { return '★'.repeat(p) + '☆'.repeat(MAX - p); }
  function render() {
    const list = $('upg-list'), dex = dexNow();
    if (!list || !dex || !G.DEX_BY[dex]) return;
    let box = $('prestige-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'prestige-panel';
      box.className = 'panel';
      box.style.cssText = 'margin-top:10px;padding:10px 12px';
      list.insertAdjacentElement('afterend', box);
    }
    const p = level(dex), ok = can(dex);
    const state = p >= MAX ? G.T('Prestigio máximo: empieza cada run con un objeto al azar.')
      : ok ? G.T('Todo comprado: puede subir de prestigio.') : G.T('Compra todas sus mejoras para poder subir de prestigio.');
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div><b>${G.T('Prestigio')} <span class="prest-stars" style="color:#ffcb3d">${stars(p)}</span></b>
          <div class="prest-now" style="font-size:13px">${G.I18n.f('Prestigio {x}/{x}: +{x}% a vida, daño, velocidad y defensa.', p, MAX, Math.round(K * p * 100))}</div>
          <small class="prest-state" style="color:var(--muted)">${state}</small></div>
        ${p < MAX ? `<button class="btn small ${ok ? 'gold' : ''}" data-prest ${ok ? '' : 'disabled'}>${sure && ok ? G.T('Confirmar: sus mejoras vuelven a 0') : G.T('Subir de prestigio')}</button>` : ''}
      </div>
      <small style="display:block;margin-top:6px;color:var(--muted)">${G.T('Cada prestigio: +5% a vida, daño, velocidad y defensa, y sus mejoras vuelven a 0 (sin devolver monedas). Con el 3.º, un objeto al azar al empezar cada run.')}</small>`;
    const btn = box.querySelector('[data-prest]');
    if (btn) btn.onclick = () => {
      if (!sure) { sure = true; render(); return; }
      sure = false;
      if (prestige(dex)) {
        G.Audio.sfx('legend');
        G.UI.toast(G.I18n.f('¡{x} sube a prestigio {x}!', G.DEX_BY[dex].name, level(dex)), 2800);
        const sel = $('upg-mon'); if (sel) sel.dispatchEvent(new Event('change'));   // menu.js vuelve a pintar sus mejoras (a 0)
      }
      render();
    };
    labels();
  }
  /** ★ en el selector de Mejoras. */
  function labels() {
    const sel = $('upg-mon');
    if (!sel) return;
    for (const o of sel.options) {
      const p = level(+o.value);
      o.textContent = o.textContent.replace(/ · ★+$/, '') + (p ? ' · ' + '★'.repeat(p) : '');
    }
  }
  const show = G.UI.show;
  G.UI.show = function (id) {
    const r = show.apply(this, arguments);
    if (id === 'scr-upgrades') Promise.resolve().then(() => {
      sure = false;
      render();
      const sel = $('upg-mon');
      if (sel && !sel._prest) { sel._prest = true; sel.addEventListener('change', () => { sure = false; Promise.resolve().then(render); }); }
    });
    return r;
  };
  // ★ en la casilla de la colección (menu.js dexCell llama a G.Radiant.cell).
  if (G.Radiant && G.Radiant.cell) {
    const cell = G.Radiant.cell;
    G.Radiant.cell = function (el, dex) {
      const r = cell.apply(this, arguments);
      const p = level(dex);
      if (p && el && !el.querySelector('.prest-b')) el.insertAdjacentHTML('beforeend', `<span class="prest-b" title="${G.T('Prestigio')}" style="position:absolute;left:4px;top:18px;color:#ffcb3d;font-size:11px;text-shadow:0 1px 0 #000">${'★'.repeat(p)}</span>`);
      return r;
    };
  }

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Prestigio', 'Prestige', 'Prestige', 'Prestigio', 'Prestígio', '声望', '聲望'],
    ['Prestigio {x}/{x}: +{x}% a vida, daño, velocidad y defensa.', 'Prestige {x}/{x}: +{x}% HP, damage, speed and defense.', 'Prestige {x}/{x} : +{x} % PV, dégâts, vitesse et défense.',
     'Prestigio {x}/{x}: +{x}% PS, danni, velocità e difesa.', 'Prestígio {x}/{x}: +{x}% vida, dano, velocidade e defesa.', '声望 {x}/{x}：生命、伤害、速度和防御 +{x}%。', '聲望 {x}/{x}：生命、傷害、速度和防禦 +{x}%。'],
    ['Prestigio máximo: empieza cada run con un objeto al azar.', 'Max prestige: every run starts with a random held item.', 'Prestige maximum : chaque partie commence avec un objet au hasard.',
     'Prestigio massimo: ogni run inizia con uno strumento a caso.', 'Prestígio máximo: cada run começa com um item aleatório.', '声望已满：每局开始时携带一个随机道具。', '聲望已滿：每局開始時攜帶一個隨機道具。'],
    ['Todo comprado: puede subir de prestigio.', 'Everything bought: it can prestige.', 'Tout est acheté : il peut monter en prestige.', 'Tutto comprato: può salire di prestigio.', 'Tudo comprado: pode subir de prestígio.', '已全部购买：可以提升声望。', '已全部購買：可以提升聲望。'],
    ['Compra todas sus mejoras para poder subir de prestigio.', 'Buy all its upgrades to be able to prestige.', 'Achetez toutes ses améliorations pour pouvoir monter en prestige.',
     'Compra tutti i suoi potenziamenti per poter salire di prestigio.', 'Compre todas as melhorias para poder subir de prestígio.', '买齐它的所有强化后才能提升声望。', '買齊牠的所有強化後才能提升聲望。'],
    ['Subir de prestigio', 'Prestige', 'Monter en prestige', 'Sali di prestigio', 'Subir de prestígio', '提升声望', '提升聲望'],
    ['Confirmar: sus mejoras vuelven a 0', 'Confirm: its upgrades go back to 0', 'Confirmer : ses améliorations retombent à 0', 'Conferma: i potenziamenti tornano a 0', 'Confirmar: as melhorias voltam a 0', '确认：它的强化归零', '確認：牠的強化歸零'],
    ['Cada prestigio: +5% a vida, daño, velocidad y defensa, y sus mejoras vuelven a 0 (sin devolver monedas). Con el 3.º, un objeto al azar al empezar cada run.',
     'Each prestige: +5% HP, damage, speed and defense, and its upgrades go back to 0 (coins aren\'t refunded). At the 3rd, a random held item at the start of every run.',
     'Chaque prestige : +5 % PV, dégâts, vitesse et défense, et ses améliorations retombent à 0 (sans rembourser les pièces). Au 3e, un objet au hasard au début de chaque partie.',
     'Ogni prestigio: +5% PS, danni, velocità e difesa, e i potenziamenti tornano a 0 (le monete non tornano). Al 3º, uno strumento a caso all\'inizio di ogni run.',
     'Cada prestígio: +5% vida, dano, velocidade e defesa, e as melhorias voltam a 0 (sem devolver moedas). No 3º, um item aleatório no início de cada run.',
     '每次声望：生命、伤害、速度和防御 +5%，强化归零（不退还金币）。第 3 次起，每局开始时携带一个随机道具。',
     '每次聲望：生命、傷害、速度和防禦 +5%，強化歸零（不退還金幣）。第 3 次起，每局開始時攜帶一個隨機道具。'],
    ['¡{x} sube a prestigio {x}!', '{x} reaches prestige {x}!', '{x} atteint le prestige {x} !', '{x} sale al prestigio {x}!', '{x} chegou ao prestígio {x}!', '{x}提升到声望 {x}！', '{x}提升到聲望 {x}！'],
    ['Prestigio máximo: llevas {x}.', 'Max prestige: you hold {x}.', 'Prestige maximum : vous tenez {x}.', 'Prestigio massimo: tieni {x}.', 'Prestígio máximo: você segura {x}.', '声望已满：你携带了{x}。', '聲望已滿：你攜帶了{x}。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { MAX, K, level, can, prestige, maxedAll };
})();
