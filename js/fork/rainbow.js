/* ============ rainbow.js — the ×25 rainbow ticket (MrSurvivor fork) ============
 * A ticket that pays for 25 pulls at once with at least one Legendary (the last pull, if none has
 * come up: js/systems/gacha.js). It lives in save.tickets.t25, in the coin and ticket ledger like
 * the others (CUR in js/core/db.js), so it isn't lost or duplicated when two copies are merged.
 * How you get one:
 *   - by beating a rift legendary, 1 time in 50 (the ×10 comes 1 time in 2);
 *   - by lasting 30:00 in a run (once per run);
 *   - from Gholdengo, the gold treasure thief: 1 time in 20 its ×10 ticket is a rainbow one (at the kill; to
 *     the whole group in co-op, sent by the host);
 *   - from 4 big achievements, once: 500 Pokémon, all of them, 20 shinies and 20 minutes survived.
 *     They're paid on save (G.DB.commit) if the achievement is there and wasn't paid yet (save.r25),
 *     also to players who already had it; save.r25 is joined on merge (G.forkMerge).
 * In the gacha: the "Arcoíris ×25" (Rainbow ×25) button under the others, how many you have and a
 * line in the notes (hook: G.PityBar.draw, which the gacha calls on every paint). In the menu: the count in the
 * ticket pill at the top, after the ×1 and ×10. At the end of a run: the ones it gave, in the gacha tickets
 * line with the ×1 and ×10 (r.t25 in js/ui/run-ui.js showOver). Test: fork/test-rainbow.cjs.
 */
G.Rainbow = (() => {
  const $ = id => document.getElementById(id);
  const RIFT = 1 / 50, TIME = 1800;
  const ACH = { own500: 1, ownAll: 2, shiny20: 1, time20: 1 };

  // The icon: the ×10 ticket with coloured stripes.
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
      pl.t25 = (pl.t25 | 0) + n;                 // for the end of the run's tickets line
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, G.T('¡Ticket arcoíris ×25!'), '#ffd23f', true);
      G.FX.ring(pl.x, pl.y, 8, 70, '#ff9ed8', 0.6, 5);
    }
    G.Audio.sfx('legend');
    G.UI.toast(G.T('¡Ticket arcoíris ×25!') + ' ' + G.T(why), 3800);
    if (G.UI.refreshCoins) G.UI.refreshCoins();
  }

  // ---------------- where they come from ----------------
  const event = G.Progress.event;
  G.Progress.event = function (kind) {
    const r = event.apply(this, arguments);
    if (kind === 'rift' && Math.random() < RIFT) give(1, 'Premio del legendario de la grieta.');
    return r;
  };
  setInterval(() => {
    if (!G.Game) return;                           // dev.html may still be loading js/game.js
    const pl = G.Game.player, st = G.Game.st;
    if (G.Game.state === 'playing' && pl && !pl.dead && st && st.time >= TIME && !pl._rainbow30) {
      pl._rainbow30 = true;
      give(1, 'Has aguantado 30 minutos.');
    }
  }, 1000);
  // Gholdengo, the gold treasure thief (js/systems/events.js, loot 'ticket10'): 1 time in 20 its ×10 ticket is a
  // rainbow one instead. Given at the kill like the rift legendary's (no pickup), and in a group to everyone
  // (tickets are shared there): the host, which runs the enemies, tells the others ({ k:'r25' }).
  const GOLD = 1 / 20, GOLD_WHY = 'Gholdengo dropped a rainbow ticket.';
  let forceGold = false;
  const E = G.Enemy.prototype, die = E.die;
  E.die = function () {
    const rainbow = !this.dead && !this.remote && this.behavior === 'thief' && this.def && this.def.loot === 'ticket10' && (forceGold || Math.random() < GOLD);
    if (!rainbow) return die.apply(this, arguments);
    forceGold = false;
    const drop = G.Pickups.drop;
    G.Pickups.drop = function (kind) { if (kind !== 'ticket10') return drop.apply(this, arguments); };   // not the ×10 too
    try { die.apply(this, arguments); } finally { G.Pickups.drop = drop; }
    G.FX.ring(this.x, this.y, 8, 90, '#ff9ed8', 0.6, 5);
    give(1, GOLD_WHY);
    if (G.Coop.active && G.Coop.isHost) for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, { k: 'r25' });
  };
  G.Net.on((from, msg) => { if (msg && msg.k === 'r25' && G.Coop.active && !G.Coop.isHost && from === G.Net.hostUid) give(1, GOLD_WHY); });
  G.I18n.add({ [GOLD_WHY]: GOLD_WHY }, 'en');
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
        const pl = G.Game && G.Game.player;
        if (pl && G.Game.state !== 'ui') pl.t25 = (pl.t25 | 0) + ACH[id];
        setTimeout(() => G.UI.toast(G.T('¡Ticket arcoíris ×25!') + ' ' + G.T('Premio de un logro.'), 3800), 0);
      }
    }
    return commit.apply(this, arguments);
  };
  // The end of the run lists them with its other tickets.
  const showOver = G.RunUI.showOver;
  G.RunUI.showOver = function (r) {
    const pl = G.Game.player;
    if (r && pl && pl.t25) r.t25 = pl.t25;
    return showOver.apply(this, arguments);
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

  // ---------------- in the gacha ----------------
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
  // The ticket count at the top (js/ui/ui.js refreshCoins writes ×1 and ×10; it's also called from inside ui.js,
  // so the pill is watched): the rainbow ones after them.
  document.addEventListener('DOMContentLoaded', () => {
    const pill = $('tickets-pill');
    if (!pill) return;
    const add = () => { if (!pill.querySelector('.t25')) pill.insertAdjacentHTML('beforeend', ` <span class="t25">&nbsp;${G.Icons.html('ticket25', 18)} ${have()}</span>`); };
    new MutationObserver(add).observe(pill, { childList: true });
    add();
  });
  if (G.PityBar) {
    const draw = G.PityBar.draw;
    // The gacha calls draw midway through its refresh, before it writes the tickets and notes: paint after.
    G.PityBar.draw = function () { const r = draw.apply(this, arguments); Promise.resolve().then(paint); return r; };
  }

  // Columns: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    ['Arcoíris ×25', 'Rainbow ×25', 'Arc-en-ciel ×25', 'Arcobaleno ×25', 'Arco-íris ×25', '彩虹 ×25', '彩虹 ×25'],
    ['25 tiradas, una Legendaria segura', '25 pulls, a Legendary guaranteed', '25 tirages, un Légendaire garanti', '25 lanci, un Leggendario garantito', '25 giros, um Lendário garantido', '25 抽，必得一只传说', '25 抽，必得一隻傳說'],
    ['tickets arcoíris ×25', '×25 rainbow tickets', 'tickets arc-en-ciel ×25', 'ticket arcobaleno ×25', 'tickets arco-íris ×25', '张彩虹 ×25 抽奖券', '張彩虹 ×25 抽獎券'],
    ['La tirada ×25 arcoíris, con un ticket arcoíris, trae al menos una Legendaria.', 'A ×25 rainbow pull, paid with a rainbow ticket, guarantees at least one Legendary.',
     'Un tirage arc-en-ciel ×25, payé avec un ticket arc-en-ciel, garantit au moins un Légendaire.', 'Un lancio arcobaleno ×25, pagato con un ticket arcobaleno, garantisce almeno un Leggendario.',
     'Um giro arco-íris ×25, pago com um ticket arco-íris, garante pelo menos um Lendário.', '彩虹 ×25 抽（用一张彩虹抽奖券）至少必得一只传说。', '彩虹 ×25 抽（用一張彩虹抽獎券）至少必得一隻傳說。'],
    ['¡Ticket arcoíris ×25!', '×25 rainbow ticket!', 'Ticket arc-en-ciel ×25 !', 'Ticket arcobaleno ×25!', 'Ticket arco-íris ×25!', '彩虹 ×25 抽奖券！', '彩虹 ×25 抽獎券！'],
    ['Premio del legendario de la grieta.', 'A reward from the rift legendary.', 'Une récompense du légendaire de la faille.', 'Un premio del leggendario della crepa.', 'Uma recompensa do lendário da fenda.', '裂缝传说的奖励。', '裂縫傳說的獎勵。'],
    ['Has aguantado 30 minutos.', 'You lasted 30 minutes.', 'Vous avez tenu 30 minutes.', 'Hai resistito 30 minuti.', 'Você aguentou 30 minutos.', '你坚持了 30 分钟。', '你堅持了 30 分鐘。'],
    ['Premio de un logro.', 'An achievement reward.', 'Une récompense de succès.', 'Un premio per un obiettivo.', 'Uma recompensa de conquista.', '成就奖励。', '成就獎勵。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { give, have, ACH, RIFT, TIME, GOLD, forceGold() { forceGold = true; } };
})();
