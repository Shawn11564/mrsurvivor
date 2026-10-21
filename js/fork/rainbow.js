/* ============ rainbow.js — el ticket arcoíris ×25 (fork MrSurvivor) ============
 * Un ticket que paga 25 tiradas de una vez con al menos una Legendaria (la última, si no ha salido
 * ninguna: js/systems/gacha.js). Va en save.tickets.t25, en la libreta de monedas y tickets como
 * los demás (CUR de js/core/db.js), así no se pierde ni se duplica al fusionar dos copias.
 * Se consigue:
 *   - al vencer a un legendario de una grieta, 1 de cada 10 veces (el ×10 sale 1 de cada 2);
 *   - al aguantar 30:00 en una run (una vez por run);
 *   - con 4 logros grandes, una vez: 500 Pokémon, todos, 20 shinies y 20 minutos aguantados.
 *     Se pagan al guardar (G.DB.commit) si el logro está y no se había pagado (save.r25), también
 *     a quien ya lo tenía; save.r25 se une al fusionar (G.forkMerge).
 * En el gacha: el botón "Arcoíris ×25" bajo los demás, cuántos tienes y una línea en las notas
 * (gancho: G.PityBar.draw, que el gacha llama cada vez que se pinta). Prueba: fork/test-rainbow.cjs.
 */
G.Rainbow = (() => {
  const $ = id => document.getElementById(id);
  const RIFT = 1 / 10, TIME = 1800;
  const ACH = { own500: 1, ownAll: 2, shiny20: 1, time20: 1 };

  // El icono: el ticket ×10 con sus franjas de colores.
  G.Icons.UI.ticket25 = { pal: { r: '#ff5f6d', o: '#ff9a3d', y: '#ffd23f', g: '#5fe08a', b: '#4fb4ff', v: '#c47bff', w: '#ffffff', d: '#7a4fb0' }, rows: [
    '............', '............', 'kkkkkkkkkkkk', 'kwroyygbbvvk', 'krroyygbbvvk', '.krooyggbvk.',
    '.krooyygbvk.', 'krrooyggbbvk', 'kddddddddddk', 'kkkkkkkkkkkk', '............', '............'] };

  const save = () => G.DB.save;
  const have = () => ((save() && save().tickets && save().tickets.t25) | 0);

  function give(n, why) {
    const s = save();
    if (!s || !(n > 0)) return;
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    s.tickets.t25 = (s.tickets.t25 | 0) + n;
    G.DB.commit();
    const pl = G.Game.player;
    if (pl && G.Game.state !== 'ui') {
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, G.T('¡Ticket arcoíris ×25!'), '#ffd23f', true);
      G.FX.ring(pl.x, pl.y, 8, 70, '#ff9ed8', 0.6, 5);
    }
    G.Audio.sfx('legend');
    G.UI.toast(G.T('¡Ticket arcoíris ×25!') + ' ' + G.T(why), 3800);
    if (G.UI.refreshCoins) G.UI.refreshCoins();
  }

  // ---------------- de dónde salen ----------------
  const event = G.Progress.event;
  G.Progress.event = function (kind) {
    const r = event.apply(this, arguments);
    if (kind === 'rift' && Math.random() < RIFT) give(1, 'Premio del legendario de la grieta.');
    return r;
  };
  setInterval(() => {
    const pl = G.Game.player, st = G.Game.st;
    if (G.Game.state === 'playing' && pl && !pl.dead && st && st.time >= TIME && !pl._rainbow30) {
      pl._rainbow30 = true;
      give(1, 'Has aguantado 30 minutos.');
    }
  }, 1000);
  for (const a of G.AchDefs.LIST) if (ACH[a.id]) a.reward = Object.assign({}, a.reward, { t25: ACH[a.id] });
  const commit = G.DB.commit;
  G.DB.commit = function () {
    const s = save();
    if (s && s.ach) {
      s.r25 = s.r25 || {};
      for (const id in ACH) if (s.ach[id] && !s.r25[id]) {
        s.r25[id] = Date.now();
        s.tickets = s.tickets || { t1: 0, t10: 0 };
        s.tickets.t25 = (s.tickets.t25 | 0) + ACH[id];
        setTimeout(() => G.UI.toast(G.T('¡Ticket arcoíris ×25!') + ' ' + G.T('Premio de un logro.'), 3800), 0);
      }
    }
    return commit.apply(this, arguments);
  };
  const merge = G.forkMerge;
  G.forkMerge = function (r, a, b) {
    if (merge) merge.apply(this, arguments);
    r.r25 = Object.assign({}, (a && a.r25) || {}, (b && b.r25) || {}, r.r25 || {});
  };
  const rewardText = G.Progress.rewardText;
  G.Progress.rewardText = function (r) {
    const t = rewardText.apply(this, arguments);
    return r && r.t25 ? G.Icons.html('ticket25', 12) + ' ' + r.t25 + ' ×25' + (t ? ' · ' + t : '') : t;
  };

  // ---------------- en el gacha ----------------
  function paint() {
    const row = $('pull-10b') && $('pull-10b').parentElement;
    if (!row) return;
    let btn = $('pull-25');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'pull-25';
      btn.type = 'button';
      btn.className = $('pull-10b').className;
      btn.style.cssText = 'width:100%;margin-top:8px;background:linear-gradient(90deg,#ff5f6d,#ffd23f,#5fe08a,#4fb4ff,#c47bff);color:#16182b;font-weight:bold';
      btn.onclick = () => G.GachaUI.pull(25, 't25');
      row.insertAdjacentElement('afterend', btn);
      const hint = document.createElement('small');
      hint.id = 'pull-25-hint';
      hint.style.cssText = 'display:block;text-align:center;opacity:.8;margin-top:2px';
      hint.textContent = '25 tiradas, una Legendaria segura';
      btn.insertAdjacentElement('afterend', hint);
    }
    btn.innerHTML = `${G.T('Arcoíris ×25')} · ${G.Icons.html('ticket25', 18)} 1`;
    btn.disabled = have() < 1;
    const line = $('gacha-tickets');
    if (line && !line.querySelector('.t25')) line.insertAdjacentHTML('beforeend', ` <span class="t25">· ${G.Icons.html('ticket25', 18)} <b>${have()}</b> ${G.T('tickets arcoíris ×25')}</span>`);
    const note = $('gacha-rates') && $('gacha-rates').querySelector('.note');
    if (note && !note.querySelector('.n25')) note.insertAdjacentHTML('beforeend', `<br><span class="n25">· ${G.T('La tirada ×25 arcoíris, con un ticket arcoíris, trae al menos una Legendaria.')}</span>`);
  }
  if (G.PityBar) {
    const draw = G.PityBar.draw;
    // El gacha llama a draw en medio de su refresh, antes de escribir los tickets y las notas: después.
    G.PityBar.draw = function () { const r = draw.apply(this, arguments); Promise.resolve().then(paint); return r; };
  }

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Arcoíris ×25', 'Rainbow ×25', 'Arc-en-ciel ×25', 'Arcobaleno ×25', 'Arco-íris ×25', '彩虹 ×25', '彩虹 ×25'],
    ['25 tiradas, una Legendaria segura', '25 pulls, a Legendary guaranteed', '25 tirages, un Légendaire garanti', '25 lanci, un Leggendario garantito', '25 giros, um Lendário garantido', '25 抽，必得一只传说', '25 抽，必得一隻傳說'],
    ['tickets arcoíris ×25', '×25 rainbow tickets', 'tickets arc-en-ciel ×25', 'ticket arcobaleno ×25', 'tickets arco-íris ×25', '张彩虹 ×25 抽奖券', '張彩虹 ×25 抽獎券'],
    ['La tirada ×25 arcoíris, con un ticket arcoíris, trae al menos una Legendaria.', 'A ×25 rainbow pull, paid with a rainbow ticket, guarantees at least one Legendary.',
     'Un tirage arc-en-ciel ×25, payé avec un ticket arc-en-ciel, garantit au moins un Légendaire.', 'Un lancio arcobaleno ×25, pagato con un ticket arcobaleno, garantisce almeno un Leggendario.',
     'Um giro arco-íris ×25, pago com um ticket arco-íris, garante pelo menos um Lendário.', '彩虹 ×25 抽（用一张彩虹抽奖券）至少必得一只传说。', '彩虹 ×25 抽（用一張彩虹抽獎券）至少必得一隻傳說。'],
    ['¡Ticket arcoíris ×25!', 'Rainbow ticket ×25!', 'Ticket arc-en-ciel ×25 !', 'Ticket arcobaleno ×25!', 'Ticket arco-íris ×25!', '彩虹 ×25 抽奖券！', '彩虹 ×25 抽獎券！'],
    ['Premio del legendario de la grieta.', 'A reward from the rift legendary.', 'Une récompense du légendaire de la faille.', 'Un premio del leggendario della crepa.', 'Uma recompensa do lendário da fenda.', '裂缝传说的奖励。', '裂縫傳說的獎勵。'],
    ['Has aguantado 30 minutos.', 'You lasted 30 minutes.', 'Vous avez tenu 30 minutes.', 'Hai resistito 30 minuti.', 'Você aguentou 30 minutos.', '你坚持了 30 分钟。', '你堅持了 30 分鐘。'],
    ['Premio de un logro.', 'An achievement reward.', 'Une récompense de succès.', 'Un premio per un obiettivo.', 'Uma recompensa de conquista.', '成就奖励。', '成就獎勵。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { give, have, ACH, RIFT, TIME };
})();
