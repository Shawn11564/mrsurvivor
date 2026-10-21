/* ============ guest-save.js — la partida de invitado se queda (MrSurvivor) ============
 * Upstream juega como invitado con una partida en memoria: una recarga (también la de una
 * actualización, js/core/updater.js) lo borraba todo, y crear una cuenta empezaba de cero.
 * Aquí:
 *   - Guardar   cada commit() del invitado copia la partida en este navegador (ms.guest),
 *               y también al ocultar o cerrar la pestaña. Nunca va a la nube.
 *   - Recargar  si se recarga jugando como invitado (ms.guest.on), se vuelve a él sin pasar
 *               por la pantalla de entrar. "Jugar como invitado" sigue la misma partida.
 *   - Cuenta    al crear una cuenta o entrar en una (nombre, Google, local), lo del invitado
 *               pasa a ella con G.DB.adopt y la copia se borra (sólo una vez). En una cuenta
 *               nueva queda la partida del invitado tal cual (con el nombre de la cuenta); en
 *               una que ya existía se suman sus Pokémon, shinies y logros, los tickets y las
 *               monedas ganadas por encima de las 500 del principio (nunca se restan).
 *   - Salir     si la copia se guarda, salir del invitado ya no avisa de que se pierde todo
 *               (`kept`, ganchos en js/ui/menu.js y js/ui/settings-ui.js).
 *   - Actualizar  si este navegador no deja guardar la copia, el updater no recarga al
 *               invitado (safe(), gancho en js/core/updater.js) y avisa una vez. Una versión
 *               obligatoria recarga igual.
 * Ganchos de una línea en js/core/db.js (commit, playAsGuest). Prueba: fork/test-guest-save.cjs.
 */
G.GuestSave = (() => {
  const K = 'ms.guest', K_ON = 'ms.guest.on';
  let kept = true;        // ¿se pudo guardar la última copia?
  let told = false;

  const read = () => { try { const v = localStorage.getItem(K); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const drop = () => { try { localStorage.removeItem(K); localStorage.removeItem(K_ON); } catch (e) { /* nada */ } };
  const on = v => { try { if (v) localStorage.setItem(K_ON, '1'); else localStorage.removeItem(K_ON); } catch (e) { /* nada */ } };
  const playing = () => { try { return !!localStorage.getItem(K_ON); } catch (e) { return false; } };
  const progress = s => !!(s && s.owned && Object.keys(s.owned).length);

  /** Copia la partida del invitado en el navegador (la llama commit() de js/core/db.js). */
  function store(s) {
    s = s || (G.DB.guest && G.DB.save);
    if (!s) return kept;
    try {
      if (!s.gid) s.gid = 'g' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(K, JSON.stringify(s));
      kept = true;
    } catch (e) { kept = false; }
    return kept;
  }

  /** La partida guardada para playAsGuest() (migrate la pone al día), o null. */
  function load(migrate) {
    on(true);
    const s = read();
    if (!s) return null;
    try { return migrate(s); } catch (e) { console.warn('[Invitado] copia ilegible:', e.message); return null; }
  }

  /**
   * Pasa lo del invitado a la cuenta recién abierta. Las monedas y tickets van por la libreta
   * (save.led, js/core/db.js) con un apunte propio de este invitado: fusionar dos veces la
   * misma copia no los duplica.
   */
  function carry() {
    const g = read();
    if (!progress(g) || G.DB.guest || !G.DB.save) return null;
    const acc = G.DB.save, START = G.DB.START_COINS;
    const fresh = !acc.partner && !(acc.stats && acc.stats.runs) && !Object.keys(acc.owned || {}).length;
    const coins = Math.max(0, Math.floor(+g.coins || 0)), t = g.tickets || {};
    g.led = { [g.gid || 'g0']: {
      c: [Math.max(0, coins - START), fresh ? Math.max(0, START - coins) : 0],
      t1: [Math.max(0, Math.floor(+t.t1 || 0)), 0], t10: [Math.max(0, Math.floor(+t.t10 || 0)), 0]
    } };
    g.coins = Math.max(0, coins - START);           // = lo que dice la libreta: nada sin explicar
    // Cuenta nueva: gana la partida del invitado (compañero, test, pity, misiones...).
    // Cuenta con partida: gana la suya, y del invitado se suma lo conseguido.
    g.updated = fresh ? Date.now() + 1 : 0;
    delete g.gid;
    const r = G.DB.adopt(g);
    if (!r.ok) return null;
    drop();
    if (G.DB.mode === 'cloud') G.DB.flush();
    G.UI.toast(G.T('¡Tu progreso de invitado ya está en tu cuenta!'), 4500);
    return r;
  }

  // Entrar o crear cuenta: lo del invitado pasa a la cuenta antes de seguir (login.js espera).
  for (const fn of ['register', 'login', 'loginWithGoogle']) {
    const orig = G.DB[fn];
    G.DB[fn] = async function () {
      const r = await orig.apply(this, arguments);
      if (r && r.ok) { try { carry(); } catch (e) { console.warn('[Invitado] no se pudo pasar a la cuenta:', e.message); } }
      return r;
    };
  }
  // Salir del invitado: la copia se queda (para la cuenta o para volver), pero ya no se entra solo.
  const logout = G.DB.logout;
  G.DB.logout = function () {
    if (G.DB.guest) { store(); on(false); }
    return logout.apply(this, arguments);
  };

  // Pantalla de entrar: tras una recarga jugando como invitado, se vuelve a él; si no, una
  // nota con lo que pasará a la cuenta.
  const open = G.LoginUI.open;
  G.LoginUI.open = function () {
    if (playing() && progress(read()) && !G.DB.loggedIn) { G.DB.playAsGuest(); G.Flow.afterLogin(); return; }
    open.apply(this, arguments);
    const mode = document.getElementById('login-mode');
    mode.textContent = mode.textContent.replace('Como invitado no se guarda.', 'Como invitado, sólo en este navegador.');
    let el = document.getElementById('guest-carry');
    if (!el) {
      el = document.createElement('p');
      el.id = 'guest-carry'; el.className = 'note gold';
      document.getElementById('login-mode').insertAdjacentElement('afterend', el);
    }
    const g = read(), n = progress(g) ? Object.keys(g.owned).length : 0;
    el.classList.toggle('hidden', !n);
    el.textContent = n ? G.I18n.f('Tu progreso de invitado ({x} Pokémon) pasará a la cuenta que crees o con la que entres.', n) : '';
  };

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && G.DB.guest) store(); });
  addEventListener('pagehide', () => { if (G.DB.guest) store(); });

  /** Para js/core/updater.js: ¿se puede recargar sin que el invitado pierda nada? */
  function safe() {
    if (!G.DB.guest || store()) return true;
    if (!told) { told = true; G.UI.toast(G.T('Hay una versión nueva, pero este navegador no guarda la partida de invitado: crea una cuenta y recarga para no perderla.'), 9000); }
    return false;
  }

  const ROWS = [
    ['Tu partida se guarda en la nube: entra desde cualquier ordenador. Como invitado, sólo en este navegador.',
     'Your game is saved in the cloud: log in from any computer. As a guest, only in this browser.',
     'Ta partie est sauvegardée dans le cloud : connecte-toi depuis n’importe quel ordinateur. En invité, seulement dans ce navigateur.',
     'La tua partita è salvata nel cloud: accedi da qualsiasi computer. Come ospite, solo in questo browser.',
     'Seu jogo fica salvo na nuvem: entre de qualquer computador. Como convidado, só neste navegador.',
     '你的进度保存在云端：可在任何电脑登录。游客模式仅保存在此浏览器。', '你的進度保存在雲端：可在任何電腦登入。訪客模式僅保存在此瀏覽器。'],
    ['¡Tu progreso de invitado ya está en tu cuenta!', 'Your guest progress is now in your account!',
     'Ta progression d’invité est maintenant sur ton compte !', 'I tuoi progressi da ospite ora sono nel tuo account!',
     'Seu progresso de convidado agora está na sua conta!', '你的游客进度已转入你的账号！', '你的訪客進度已轉入你的帳號！'],
    ['Tu progreso de invitado ({x} Pokémon) pasará a la cuenta que crees o con la que entres.',
     'Your guest progress ({x} Pokémon) will move to the account you create or log in to.',
     'Ta progression d’invité ({x} Pokémon) passera sur le compte que tu crées ou auquel tu te connectes.',
     'I tuoi progressi da ospite ({x} Pokémon) passeranno all’account che crei o a cui accedi.',
     'Seu progresso de convidado ({x} Pokémon) vai para a conta que você criar ou em que entrar.',
     '你的游客进度（{x} 只宝可梦）将转入你创建或登录的账号。', '你的訪客進度（{x} 隻寶可夢）將轉入你建立或登入的帳號。'],
    ['Hay una versión nueva, pero este navegador no guarda la partida de invitado: crea una cuenta y recarga para no perderla.',
     'There’s a new version, but this browser can’t keep your guest game: create an account, then reload, so you don’t lose it.',
     'Il y a une nouvelle version, mais ce navigateur ne garde pas ta partie d’invité : crée un compte puis recharge pour ne pas la perdre.',
     'C’è una nuova versione, ma questo browser non conserva la partita da ospite: crea un account e ricarica per non perderla.',
     'Há uma versão nova, mas este navegador não guarda o jogo de convidado: crie uma conta e recarregue para não perdê-lo.',
     '有新版本，但此浏览器无法保存游客进度：请先创建账号再刷新，以免丢失。', '有新版本，但此瀏覽器無法保存訪客進度：請先建立帳號再重新整理，以免遺失。'],
    ['Invitado: guardado sólo en este navegador', 'Guest: saved in this browser only', 'Invité : sauvegardé dans ce navigateur seulement',
     'Ospite: salvato solo in questo browser', 'Convidado: salvo só neste navegador', '游客：仅保存在此浏览器', '訪客：僅保存在此瀏覽器'],
    ['Modo invitado: guardado sólo en este navegador', 'Guest mode: saved in this browser only', 'Mode invité : sauvegardé dans ce navigateur seulement',
     'Modalità ospite: salvato solo in questo browser', 'Modo convidado: salvo só neste navegador', '游客模式：仅保存在此浏览器', '訪客模式：僅保存在此瀏覽器'],
    ['Estás jugando como {x}: tu progreso se guarda sólo en este navegador. Crea una cuenta o entra en la tuya y pasará a ella.',
     'You\'re playing as a {x}: your progress is saved in this browser only. Create an account or log in and it moves there.',
     'Tu joues en tant qu’{x} : ta progression est sauvegardée dans ce navigateur seulement. Crée un compte ou connecte-toi et elle y passera.',
     'Stai giocando come {x}: i tuoi progressi sono salvati solo in questo browser. Crea un account o accedi e passeranno lì.',
     'Você está jogando como {x}: seu progresso fica salvo só neste navegador. Crie uma conta ou entre na sua e ele vai para ela.',
     '你正在以{x}身份游玩：进度仅保存在此浏览器。创建账号或登录后会转入账号。', '你正在以{x}身分遊玩：進度僅保存在此瀏覽器。建立帳號或登入後會轉入帳號。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));
  // Settings → Account writes the guest sentence around <b>invitado</b>, and the page is translated a
  // text node at a time, so its tail needs an entry of its own (upstream's sentence has one in lang-en.js).
  // English only (CLAUDE.local.md); other languages fall back to it. fork/test-english.cjs found it.
  G.I18n.add({
    'Estás jugando como': 'You\'re playing as a',
    ': tu progreso se guarda sólo en este navegador. Crea una cuenta o entra en la tuya y pasará a ella.':
      ': your progress is saved in this browser only. Create an account or log in and it moves there.'
  }, 'en');

  return { store, load, safe, get kept() { return kept; } };
})();
