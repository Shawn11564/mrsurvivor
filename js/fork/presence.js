/* ============ presence.js — live status for the Player Manager, and admin edits arriving (MrSurvivor fork) ============
 * Every signed-in player listens to ONE Firestore document, adm/live (1 read per page load,
 * 1 more each time the admin changes it), which only the admin writes:
 *
 *   watch   until when (ms) players report their status. The Player Manager raises it while
 *           it's open. Then each player writes apres/{uid} = { at, n: name, st: status } when
 *           their status changes (at most every 4 s) and every 45 s. Nobody writes anything while
 *           the admin isn't looking: "online" costs nothing the rest of the time (upstream dropped
 *           its always-on presence because it was a quarter of all Firestore writes).
 *   pokes   { uid: ms }: the admin edited your cloud save. Outside a run, the game brings it in
 *           (G.DB.pull, 1 read) and says what changed; a reset reloads the page once it's safe.
 *           In a run nothing happens until you're back in the menus.
 *   cmd     { uid: { k: 'host'|'close', at } }: the admin wants to join your solo run. The game
 *           opens a room (closed to everyone else) so the admin can come in, and closes it again
 *           if they couldn't connect (js/fork/drop-in.js).
 *
 * Status (st): s 'login'|'menu'|'lobby'|'run', scr (the screen's name), the room (rm id, rh host?,
 * ro open?, rn players, rp names), the run (mode solo|host|guest, t secs, lv, dex, sh, rad, lab,
 * ps playing|paused|levelup|choice|held|over|dead), hid (tab hidden), mob (touch), ver (build).
 * Rules: firestore.rules (adm, apres). Test: fork/test-player-manager.cjs.
 */
G.Presence = (() => {
  const BEAT = 45000, MIN_GAP = 4000, FRESH = 120000;
  let fb = null, uid = null, unsub = null, live = {}, first = true;
  let lastWrite = 0, lastKey = '', writing = false;
  let lastPoke = 0, needPull = false, pulling = false, reloadWanted = false;
  const handled = new Set();
  const now = () => (G.Social && G.Social.now ? G.Social.now() : Date.now());

  // ---------------- what you're doing ----------------

  const SCREENS = {
    'scr-login': 'Login', 'scr-test': 'Personality test', 'scr-result': 'Test result', 'scr-starters': 'Choosing a starter',
    'scr-menu': 'Main menu', 'scr-news': "What's new", 'scr-recover': 'Account recovery', 'scr-savenote': 'Save note',
    'scr-support': 'Support', 'scr-settings': 'Settings', 'scr-legal': 'Legal', 'scr-nick': 'Choosing a nickname',
    'scr-friends': 'Friends', 'scr-lobby': 'Co-op lobby', 'scr-rank': 'Leaderboards', 'scr-mod': 'Moderation',
    'scr-goals': 'Missions & achievements', 'scr-profile': 'Profile', 'scr-dex': 'Collection', 'scr-upgrades': 'Upgrades',
    'scr-gacha': 'Gacha', 'scr-radiant': 'Radiant Ritual', 'scr-import': 'Import a save', 'scr-party': 'Party stats',
    'scr-levelup': 'Level-up cards', 'scr-bond': 'Bond', 'scr-item': 'Item choice', 'scr-pause': 'Paused', 'scr-over': 'Run summary'
  };
  const shown = el => !el.classList.contains('hidden') && el.getClientRects().length > 0;
  /** The screen on top: the last open one that isn't the main menu (which stays under the others). */
  function screen() {
    const open = [...document.querySelectorAll('section.scr, .scr[id^="scr-"]')].filter(el => el.id && shown(el));
    const top = open.filter(el => el.id !== 'scr-menu').pop() || open.pop();
    if (!top) return '';
    if (SCREENS[top.id]) return SCREENS[top.id];
    const h = top.querySelector('h1, h2, h3');
    return ((h && h.textContent) || top.id.replace(/^scr-/, '')).trim().slice(0, 40);
  }

  function status() {
    const st = {}, g = G.Game, room = G.Social && G.Social.room;
    if (!G.DB.loggedIn) st.s = 'login';
    else if (g.state !== 'ui' && g.player) {
      const pl = g.player;
      st.s = 'run';
      st.mode = G.Coop.active ? (G.Coop.isHost ? 'host' : 'guest') : 'solo';
      st.t = Math.floor(g.st.time);
      st.lv = pl.level | 0;
      st.dex = pl.dex | 0;
      if (pl.shiny) st.sh = true;
      if (pl.radiant) st.rad = true;
      if (G.Lab && G.Lab.active) st.lab = true;
      st.ps = pl.dead && g.state === 'playing' ? 'dead' : g.state;
    } else st.s = room ? 'lobby' : 'menu';
    st.scr = screen();
    if (room) {
      st.rm = room.id; st.rh = !!room.isHost; st.ro = !!room.open; st.rn = room.members.length;
      st.rp = room.members.map(m => m.name).join(', ').slice(0, 80);
    }
    if (document.hidden) st.hid = true;
    if (matchMedia('(pointer: coarse)').matches) st.mob = true;
    if (G.Updater && G.Updater.version) st.ver = G.Updater.version.slice(0, 10);
    return st;
  }

  // ---------------- writing it (only while watched) ----------------

  const watched = () => +live.watch > now();
  function report(force) {
    if (!fb || !uid || writing || !watched()) return;
    const st = status(), key = JSON.stringify(st), since = Date.now() - lastWrite;
    if (since < MIN_GAP || (!force && key === lastKey && since < BEAT)) return;
    writing = true; lastWrite = Date.now(); lastKey = key;
    const name = (G.Social.me && G.Social.me.name) || G.DB.user || '?';
    fb.fs.collection('apres').doc(uid).set({ at: firebase.firestore.FieldValue.serverTimestamp(), n: String(name).slice(0, 24), st })
      .catch(e => { lastKey = ''; console.warn('[Presence]', e.code || e.message); })
      .finally(() => { writing = false; });
  }

  // ---------------- admin edits arriving ----------------

  function snap() {
    const s = G.DB.save || {}, P = G.PlayerEdits;
    return { sum: P.summary(s), owned: new Set(Object.keys(s.owned || {})), shiny: new Set(Object.keys(s.shiny || {})),
      radiant: new Set(Object.keys(s.radiant || {})), resets: Object.keys(s.admW || {}).length };
  }
  /** What the admin changed, in words. */
  function told(a, b) {
    const out = [], P = G.PlayerEdits;
    const map = { c: 'coins', t1: 't1', t10: 't10', t25: 't25', gm: 'gems' };
    for (const k in map) {
      const d = b.sum[map[k]] - a.sum[map[k]];
      if (d) out.push((d > 0 ? '+' : '−') + Math.abs(d).toLocaleString() + ' ' + P.CUR[k].name.toLowerCase());
    }
    const added = (c, tag) => [...b[c]].filter(d => !a[c].has(d)).map(d => ((G.DEX_BY[d] || {}).name || '#' + d) + tag);
    const lost = (c, tag) => [...a[c]].filter(d => !b[c].has(d)).map(d => ((G.DEX_BY[d] || {}).name || '#' + d) + tag);
    const gained = [...added('owned', ''), ...added('shiny', ' (shiny)'), ...added('radiant', ' (radiant)')];
    const gone = [...lost('owned', ''), ...lost('shiny', ' (shiny)'), ...lost('radiant', ' (radiant)')];
    const list = l => l.slice(0, 4).join(', ') + (l.length > 4 ? ' and ' + (l.length - 4) + ' more' : '');
    if (gained.length) out.push(list(gained));
    if (gone.length) out.push('removed: ' + list(gone));
    return out.join(' · ');
  }

  async function bringIn() {
    if (pulling || G.Game.state !== 'ui' || !G.DB.online) return;
    const a = snap(), p = G.DB.pull();
    if (!p) return;                       // a save going up: next time round
    pulling = true; needPull = false;
    try { await p; } catch (e) { needPull = true; } finally { pulling = false; }
    const b = snap();
    if (b.resets > a.resets) {
      reloadWanted = true;
      G.UI.toast('An admin reset your profile. Reloading…', 4000);
      return;
    }
    const what = told(a, b);
    if (what) { G.UI.toast('From the admin: ' + what, 5200); G.Audio.sfx('shiny'); }
    G.UI.refreshCoins();
    if (G.UI.isOpen('scr-menu') && screen() === 'Main menu') G.MenuUI.open();
  }

  const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  async function reloadSoon() {
    if (G.Game.state !== 'ui' || typing() || (G.GuestSave && !G.GuestSave.safe())) return;
    reloadWanted = false;
    const dirty = G.DB.syncState && G.DB.syncState !== 'ok' && G.DB.syncState !== 'local';
    if (dirty) { try { await Promise.race([G.DB.flush(), new Promise(r => setTimeout(r, 6000))]); } catch (e) { /* stays in this browser */ } }
    location.reload();
  }

  function command(c) {
    if (!c || typeof c !== 'object' || !(+c.at > now() - FRESH) || handled.has(c.at)) return;
    handled.add(c.at);
    if (c.k === 'host' && G.DropIn) G.DropIn.openForAdmin();
    if (c.k === 'close' && G.DropIn) G.DropIn.closeForAdmin();
  }

  function onLive(doc) {
    live = (doc && doc.exists && doc.data()) || {};
    const poke = +((live.pokes || {})[uid]) || 0;
    // On the first read only a recent poke counts (the save was just read from the cloud on load).
    if (poke && poke !== lastPoke && (!first || poke > now() - FRESH)) needPull = true;
    lastPoke = poke;
    command((live.cmd || {})[uid]);
    first = false;
    if (watched()) report(true);
  }

  // ---------------- start and stop ----------------

  function start() {
    fb = G.DB.fb; uid = fb.uid;
    first = true; live = {}; lastKey = ''; lastPoke = 0;
    unsub = fb.fs.collection('adm').doc('live').onSnapshot(onLive, e => console.warn('[Presence] adm/live:', e.code || e.message));
  }
  function stop() {
    if (unsub) unsub();
    unsub = null; fb = null; uid = null; live = {}; needPull = false;
  }

  function loop() {
    const on = G.DB.online && G.Social && G.Social.me;
    if (on && (!unsub || uid !== G.DB.fb.uid)) { if (unsub) stop(); start(); }
    else if (!on && unsub) stop();
    if (!unsub) return;
    if (needPull) bringIn();
    if (reloadWanted) reloadSoon();
    report(false);
  }
  setInterval(loop, 1500);
  document.addEventListener('visibilitychange', () => { if (unsub) report(true); });

  return { status, screen, report,
    /** For tests and the manager: is the admin watching right now? */ get watched() { return watched(); } };
})();
