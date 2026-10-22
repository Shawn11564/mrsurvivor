/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============ */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** ¿Se puede usar lo online? Si no, explica por qué. */
  function needOnline() {
    if (G.DB.online) return true;
    G.UI.toast(G.DB.guest ? 'Crea una cuenta para jugar con amigos y salir en el ranking.'
      : 'Esto necesita la versión online del juego (con la nube).', 3200);
    return false;
  }

  // ======================= APODO =======================

  G.NickUI = (() => {
    let then = null, skipped = false;

    function init() {
      $('nick-form').onsubmit = async e => {
        e.preventDefault();
        $('nick-err').textContent = '';
        $('nick-ok').disabled = true;
        const r = await G.Social.claimNick($('nick-in').value);
        $('nick-ok').disabled = false;
        if (!r.ok) { $('nick-err').textContent = r.error; G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Tu apodo es ' + G.Social.me.name);
        const cb = then; then = null;
        if (cb) cb(); else G.MenuUI.open();
      };
      $('nick-later').onclick = () => { skipped = true; then = null; G.MenuUI.open(); };
    }

    /** @param next  qué abrir después de elegirlo */
    function open(next) {
      then = next || null;
      G.UI.show('scr-nick');
      $('nick-err').textContent = '';
      $('nick-in').value = '';
      setTimeout(() => $('nick-in').focus(), 50);
    }

    return { init, open, get skipped() { return skipped; } };
  })();

  /** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
  function withNick(fn) {
    if (!needOnline()) return;
    if (G.Social.me) { fn(); return; }
    G.Social.start().then(r => { if (r === 'ok') fn(); else G.NickUI.open(fn); });
  }

  // ======================= AMIGOS =======================

  G.FriendsUI = (() => {
    function init() {
      $('fr-add').onsubmit = async e => {
        e.preventDefault();
        const name = $('fr-name').value;
        msg('');
        const r = await G.Social.request(name);
        msg(r.ok ? r.msg : r.error, !r.ok);
        if (r.ok) $('fr-name').value = '';
      };
      $('fr-room').onclick = () => G.LobbyUI.open();
      G.Social.on(() => { if (G.UI.isOpen('scr-friends')) render(); });
    }

    function msg(t, bad) {
      $('fr-msg').textContent = t || '';
      $('fr-msg').style.color = bad ? '#ffb0b8' : '';
      if (t) G.Audio.sfx(bad ? 'error' : 'confirm');
    }

    function open() {
      withNick(() => {
        G.UI.show('scr-friends', true); msg(''); render();
        G.Social.ensureFriends().then(() => { if (G.UI.isOpen('scr-friends')) render(); });
      });
    }

    // (Sin "en línea" desde el 20-10-2026: costaba 1/4 de las escrituras de Firestore.)
    function stateText(f) {
      if (f.status === 'in') return 'Quiere ser tu amigo';
      if (f.status === 'out') return 'Solicitud enviada';
      return '';
    }

    function render() {
      const room = G.Social.room;
      $('fr-me').innerHTML = 'Tu apodo: <b class="gold" translate="no">' + esc(G.Social.me ? G.Social.me.name : '') + '</b> · dáselo a tus amigos para que te añadan.';
      $('fr-room').classList.toggle('hidden', !room);
      const list = G.Social.friends.sort((a, b) => {
        const rank = f => f.status === 'in' ? 0 : f.status === 'ok' ? 1 : 2;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
      const box = $('fr-list');
      box.innerHTML = '';
      if (!list.length) {
        box.innerHTML = '<p class="sub">Aún no tienes amigos añadidos. Escribe arriba el apodo de un amigo.</p>';
        return;
      }
      for (const f of list) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        const dot = f.status !== 'ok' ? 'pend' : 'on';
        const inRoom = room && room.members.some(m => m.uid === f.uid);
        el.innerHTML = `<i class="dot ${dot}"></i><b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(f.name)}</a></b><span class="st">${inRoom ? 'En tu sala' : stateText(f)}</span><span class="grow"></span>`;
        if (f.status === 'ok') el.querySelector('.plink').onclick = e => { e.preventDefault(); G.ProfileUI.show(f.uid); };
        else el.querySelector('.plink').onclick = e => e.preventDefault();
        const btn = (txt, cls, fn) => {
          const b = document.createElement('button');
          b.className = 'btn small ' + cls; b.textContent = txt; b.onclick = fn; el.appendChild(b); return b;
        };
        if (f.status === 'in') {
          btn('Aceptar', 'gold', async () => { const r = await G.Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
          btn('Rechazar', 'ghost', () => G.Social.remove(f.uid));
        } else if (f.status === 'out') {
          btn('Cancelar', 'ghost', () => G.Social.remove(f.uid));
        } else {
          if (!inRoom && (!room || room.isHost)) {
            btn('Invitar', 'gold', async () => {
              const r = await G.Social.invite(f.uid);
              msg(r.ok ? r.msg : r.error, !r.ok);
              if (r.ok) G.LobbyUI.open();
            });
          }
          btn('Quitar', 'ghost', () => { if (confirm('¿Quitar a ' + f.name + ' de tus amigos?')) G.Social.remove(f.uid); });
        }
        box.appendChild(el);
      }
    }

    return { init, open, render };
  })();

  // ======================= SALA =======================

  G.LobbyUI = (() => {
    let membersKey = '';
    // Listos: con todos listos, cuenta atrás y la partida empieza sola (la lanza el
    // anfitrión); el anfitrión también puede forzar el inicio con el botón de siempre.
    // The host runs the countdown and tells the guests ('lcd'), so a guest never counts to 0
    // while the host can't start (still connecting, or away from the lobby). A guest at 0 asks
    // the host to start ('lgo'): a message wakes a host whose background tab barely runs timers.
    // Checked by fork/test-lobby-start.cjs.
    const COUNTDOWN = 3;
    let cd = null;                       // { end, iv, asked } mientras dura la cuenta atrás (a guest's: the host's)

    function init() {
      $('lobby-leave').onclick = async () => {
        await G.Social.leaveRoom();
        G.Net.close();
        G.MenuUI.open();
      };
      // Ready means waiting in the lobby: going to the menu takes it back.
      $('lobby-menu').onclick = () => { G.Social.setReady(false); G.MenuUI.open(); };
      $('lobby-start').onclick = start;
      $('lobby-start').dataset.sfx = 'confirm';
      $('lobby-ready').onclick = () => {
        const room = G.Social.room, me = room && room.members.find(m => m.uid === G.Social.uid);
        if (me) G.Social.setReady(!me.ready);
      };
      // Conecta / desconecta la red al entrar o salir de una sala.
      G.Social.on(what => {
        const room = G.Social.room;
        if (room) {
          G.Net.open(room.id, room.isHost, room.host);
          // Los que están fuera (recargando) no cuentan: al volver se conecta de nuevo.
          G.Net.syncMembers(room.members.filter(m => !m.away).map(m => m.uid));
        } else if (G.Net.open_) G.Net.close();
        if (what === 'room-closed') {
          G.UI.toast('La sala se ha cerrado', 2600);
          if (G.UI.isOpen('scr-lobby')) G.MenuUI.open();
        }
        // Tras recargar la página: de vuelta en tu sala.
        if (what === 'resumed' && room && G.Game.state === 'ui' && G.UI.isOpen('scr-menu')) {
          G.UI.toast('Has vuelto a tu sala', 2200);
          open();
        }
        if (G.UI.isOpen('scr-lobby')) render();
      });
      G.Net.onPeer(() => { if (G.UI.isOpen('scr-lobby')) render(); });
      G.Net.on((from, msg) => {
        const room = G.Social.room;
        if (!msg || !room || !G.UI.isOpen('scr-lobby')) return;
        if (msg.k === 'lcd' && !room.isHost && from === room.host) {
          if (!(msg.ms >= 0)) { stopCountdown(); render(); return; }
          if (!cd) startCountdown(msg.ms); else cd.end = performance.now() + msg.ms;
          tickCountdown();
        } else if (msg.k === 'lgo' && room.isHost && cd && performance.now() >= cd.end - 1500) {
          stopCountdown(); start();
        }
      });
    }

    function open() {
      if (!G.Social.room) { G.MenuUI.open(); return; }
      G.Social.refreshMember();
      G.Social.ensureFriends().then(() => { if (G.UI.isOpen('scr-lobby')) { membersKey = ''; render(); } });
      G.UI.show('scr-lobby', true);
      membersKey = '';
      render();
    }

    function close() { G.UI.hide('scr-lobby'); stopCountdown(); }

    /** tell: the host lets the guests know it stopped. */
    function stopCountdown(tell) {
      if (!cd) return;
      clearInterval(cd.iv); cd = null;
      if (tell) G.Net.broadcast({ k: 'lcd', ms: -1 });
    }
    function startCountdown(ms) { stopCountdown(); cd = { end: performance.now() + ms, iv: setInterval(tickCountdown, 200), asked: 0 }; }
    function tickCountdown() {
      const room = G.Social.room;
      if (!room || !G.UI.isOpen('scr-lobby')) { stopCountdown(room && room.isHost); return; }
      const now = performance.now(), left = Math.max(0, Math.ceil((cd.end - now) / 1000));
      $('lobby-note').textContent = left > 0 || now - cd.end < 2000 ? G.I18n.f('Todos listos: empieza en {x}…', left) : WAIT_HOST;
      if (left > 0) return;
      if (room.isHost) { stopCountdown(); start(); }
      else if (now - cd.asked > 1000) { cd.asked = now; G.Net.toHost({ k: 'lgo' }); }
    }
    const WAIT_HOST = "Everyone's ready: waiting for the host to start…";

    function connText(m, room) {
      if (m.away) return 'Reconectando…';
      if (m.uid === room.host) return 'Anfitrión';
      if (!room.isHost) return m.uid === G.Social.uid ? 'Tú' : 'En la sala';
      const mode = G.Net.mode(m.uid);
      return mode === 'direct' ? (G.Net.viaTurn(m.uid) ? 'Conectado (por servidor)' : 'Conectado') : mode === 'relay' ? 'Conectado (por servidor)' : mode === 'failed' ? 'No se pudo conectar (reintentando…)' : 'Conectando…';
    }

    function render() {
      const room = G.Social.room;
      if (!room) return;
      const ms = room.members;
      $('lobby-sub').textContent = room.isHost
        ? 'Eres el anfitrión. Invita a tus amigos (hasta ' + G.Social.MAX_PLAYERS + ') y empezad cuando estéis.'
        : 'Estás en la sala de ' + ((ms.find(m => m.uid === room.host) || {}).name || '…') + '. El anfitrión empezará la partida.';

      // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
      const key = ms.map(m => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0) + (m.rad ? 'r' : '')).join('|');
      const box = $('lobby-members');
      if (key !== membersKey) {
        membersKey = key;
        box.innerHTML = '';
        for (let i = 0; i < G.Social.MAX_PLAYERS; i++) {
          const m = ms[i];
          const c = document.createElement('div');
          c.className = 'lob-card' + (m ? '' : ' empty');
          if (m) {
            c.style.setProperty('--pc', G.Coop.COLORS[i]);
            c.appendChild(G.UI.spriteCanvas(m.dex, 120, 96, { scale: 2, lively: true, shiny: !!m.shiny, radiant: !!m.rad }));   // fork: radiant
            c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small>${esc((G.DEX_BY[m.dex] || {}).name || '')}</small><span class="conn" data-u="${m.uid}"></span><span class="rdy" data-u="${m.uid}"></span>`);
          } else c.innerHTML = '<span>Libre</span>';
          box.appendChild(c);
        }
      }
      box.querySelectorAll('.conn').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        const t = connText(m, room);
        el.textContent = t;
        el.className = 'conn' + (t === 'Conectando…' || m.away ? ' wait' : '');
      });
      box.querySelectorAll('.rdy').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        el.textContent = m.ready ? 'Listo' : 'No listo';
        el.classList.toggle('on', !!m.ready);
        el.closest('.lob-card').classList.toggle('ready', !!m.ready);
      });
      const meM = ms.find(m => m.uid === G.Social.uid);
      $('lobby-ready').textContent = meM && meM.ready ? 'No estoy listo' : 'Estoy listo';
      $('lobby-ready').classList.toggle('gold', !(meM && meM.ready));

      // Invitar (sólo el anfitrión y si queda sitio).
      const canInvite = room.isHost && ms.length < G.Social.MAX_PLAYERS;
      $('lobby-inv-title').classList.toggle('hidden', !canInvite);
      const inv = $('lobby-invite');
      inv.classList.toggle('hidden', !canInvite);
      if (canInvite) {
        inv.innerHTML = '';
        const free = G.Social.friends.filter(f => f.status === 'ok' && !ms.some(m => m.uid === f.uid));
        if (!free.length) inv.innerHTML = '<p class="sub" style="margin:0">Aún no tienes amigos añadidos.</p>';
        for (const f of free) {
          const el = document.createElement('div');
          el.className = 'fr-row';
          el.innerHTML = `<i class="dot on"></i><b translate="no">${esc(f.name)}</b><span class="grow"></span>`;
          const b = document.createElement('button');
          b.className = 'btn small gold'; b.textContent = 'Invitar';
          b.onclick = async () => { const r = await G.Social.invite(f.uid); G.UI.toast(r.ok ? r.msg : r.error); };
          el.appendChild(b);
          inv.appendChild(el);
        }
      }

      const btn = $('lobby-start');
      btn.classList.toggle('hidden', !room.isHost);
      const connecting = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'connecting');
      const failed = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'failed');
      const away = ms.find(m => m.away);
      btn.disabled = !room.isHost || ms.length < 2 || connecting || failed || !!away;
      const nReady = ms.filter(m => m.ready).length, allReady = ms.length >= 2 && nReady === ms.length && !away;
      // Sin todos listos, el botón del anfitrión es "forzar inicio".
      btn.textContent = allReady ? 'Empezar ya' : G.I18n.f('Forzar inicio ({x}/{x} listos)', nReady, ms.length);
      $('lobby-note').textContent = away ? G.I18n.f('Esperando a que vuelva {x}…', away.name)
        : !room.isHost ? 'Cuando estéis todos listos, la partida empieza sola.'
        : ms.length < 2 ? 'Necesitas al menos un amigo en la sala.'
        : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
        : connecting ? 'Conectando con tus amigos…' : 'Cuando estéis todos listos, la partida empieza sola. Puedes forzar el inicio.';
      // Todos listos (y, el anfitrión, conectado con todos): cuenta atrás. Si alguien deja de estarlo, se para.
      if (room.isHost) {
        const go = allReady && !connecting && !failed;
        if (go && !cd) startCountdown(COUNTDOWN * 1000);
        else if (!go) stopCountdown(true);
        if (cd) { G.Net.broadcast({ k: 'lcd', ms: Math.max(0, cd.end - performance.now()) }); tickCountdown(); }
      } else if (!allReady) stopCountdown();
      else if (cd) tickCountdown();
      else $('lobby-note').textContent = WAIT_HOST;
    }

    function start() {
      const room = G.Social.room;
      if (!room || !room.isHost || room.members.length < 2) return;
      const cfg = {
        k: 'start', seed: Math.floor(Math.random() * 1e6), host: room.host,
        members: room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny }))
      };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    }

    return { init, open, close, render, get countingDown() { return !!cd; } };
  })();

  // ======================= INVITACIONES =======================

  G.InvitePop = (() => {
    let cur = null;

    function init() {
      $('inv-yes').onclick = async () => {
        if (!cur) return;
        const from = cur.from;
        hide();
        const r = await G.Social.acceptInvite(from);
        if (!r.ok) { G.UI.toast(r.error, 3000); return; }
        G.LobbyUI.open();
      };
      $('inv-no').onclick = () => { if (cur) G.Social.declineInvite(cur.from); hide(); };
      G.Social.on(what => { if (what === 'invites' || what === 'room') refresh(); });
    }

    function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

    /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
    function refresh() {
      const room = G.Social.room;
      const list = G.Social.invites.filter(i => !room || i.room !== room.id).sort((a, b) => a.at - b.at);
      if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn) { hide(); return; }
      if (cur && cur.from === list[0].from) return;
      cur = list[0];
      $('inv-text').innerHTML = `${G.Icons.html('friends', 22)} <b class="gold" translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
      $('invite-pop').classList.remove('hidden');
      G.Audio.sfx('shiny');
    }

    return { init, refresh };
  })();

  G.SocialUI = {
    init() { G.NickUI.init(); G.FriendsUI.init(); G.LobbyUI.init(); G.InvitePop.init(); },
    withNick, needOnline
  };
})();
