/* ============ guest-save.js — the guest save stays (MrSurvivor) ============
 * Upstream plays as a guest with a save in memory: a reload (also the one from an
 * update, js/core/updater.js) wiped it all, and creating an account started from scratch.
 * Here:
 *   - Save      every guest commit() copies the save into this browser (ms.guest),
 *               and also when the tab is hidden or closed. It never goes to the cloud.
 *   - Reload    if the page reloads while playing as a guest (ms.guest.on), it goes back to it without going
 *               through the login screen. "Jugar como invitado" (Play as guest) continues the same save.
 *   - Account   when creating an account or logging in to one (name, Google, local), the guest's progress
 *               moves to it with G.DB.adopt and the copy is deleted (only once). In a new
 *               account the guest save stays as it is (with the account's name); in
 *               one that already existed its Pokémon, shinies and achievements are added, plus the tickets and
 *               the coins earned above the starting 500 (never subtracted).
 *   - Log out   if the copy is saved, leaving the guest no longer warns that everything is lost
 *               (`kept`, hooks in js/ui/menu.js and js/ui/settings-ui.js).
 *   - Update    if this browser won't let the copy be saved, the updater doesn't reload the
 *               guest (safe(), hook in js/core/updater.js) and warns once. A mandatory
 *               version reloads anyway.
 * One-line hooks in js/core/db.js (commit, playAsGuest). Test: fork/test-guest-save.cjs.
 */
G.GuestSave = (() => {
  const K = 'ms.guest', K_ON = 'ms.guest.on';
  let kept = true;        // could the last copy be saved?
  let told = false;

  const read = () => { try { const v = localStorage.getItem(K); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const drop = () => { try { localStorage.removeItem(K); localStorage.removeItem(K_ON); } catch (e) { /* nothing */ } };
  const on = v => { try { if (v) localStorage.setItem(K_ON, '1'); else localStorage.removeItem(K_ON); } catch (e) { /* nothing */ } };
  const playing = () => { try { return !!localStorage.getItem(K_ON); } catch (e) { return false; } };
  const progress = s => !!(s && s.owned && Object.keys(s.owned).length);

  /** Copies the guest save into the browser (called by commit() in js/core/db.js). */
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

  /** The stored save for playAsGuest() (migrate brings it up to date), or null. */
  function load(migrate) {
    on(true);
    const s = read();
    if (!s) return null;
    try { return migrate(s); } catch (e) { console.warn('[Invitado] copia ilegible:', e.message); return null; }
  }

  /**
   * Moves the guest's progress to the account just opened. Coins and tickets go through the ledger
   * (save.led, js/core/db.js) with an entry of this guest's own: merging the same copy
   * twice doesn't double them.
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
    g.coins = Math.max(0, coins - START);           // = what the ledger says: nothing unaccounted for
    // New account: the guest save wins (partner, test, pity, missions...).
    // Account with a save: its own wins, and what the guest earned is added.
    g.updated = fresh ? Date.now() + 1 : 0;
    delete g.gid;
    const r = G.DB.adopt(g);
    if (!r.ok) return null;
    drop();
    if (G.DB.mode === 'cloud') G.DB.flush();
    G.UI.toast(G.T('¡Tu progreso de invitado ya está en tu cuenta!'), 4500);
    return r;
  }

  // Logging in or creating an account: the guest's progress moves to the account before going on (login.js waits).
  for (const fn of ['register', 'login', 'loginWithGoogle']) {
    const orig = G.DB[fn];
    G.DB[fn] = async function () {
      const r = await orig.apply(this, arguments);
      if (r && r.ok) { try { carry(); } catch (e) { console.warn('[Invitado] no se pudo pasar a la cuenta:', e.message); } }
      return r;
    };
  }
  // Leaving the guest: the copy stays (for the account or to come back to), but it no longer logs in by itself.
  const logout = G.DB.logout;
  G.DB.logout = function () {
    if (G.DB.guest) { store(); on(false); }
    return logout.apply(this, arguments);
  };

  // Login screen: after a reload while playing as a guest, it goes back to the guest; if not, a
  // note with what will move to the account.
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

  /** For js/core/updater.js: can the page reload without the guest losing anything? */
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
