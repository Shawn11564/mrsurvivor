/* ============ drop-in.js — the admin joins a player's lobby or run (MrSurvivor fork) ============
 * The Player Manager's Join button (js/fork/player-manager.js):
 *
 *   In a lobby   joins the room like an invite would (G.Social.joinRoom) and opens the lobby.
 *   In a run     co-op has no joining once the run has begun, so this adds it, for the admin only:
 *     - co-op run: the admin takes a seat in the closed room (database.rules.json lets only the
 *       admin's uid in once it's closed: G.Social.joinRoom(id, true)).
 *     - solo run:  the admin asks the player's game to open a room first (presence.js, cmd 'host');
 *       the room is closed at once, so nobody else can join it.
 *     When the host's game connects to the admin (net.js, as with anyone in the room), it turns a
 *     solo run into a group one if needed (G.Coop.begin with game.js's coopApi, keeping the
 *     player where they are), adds the admin as a teammate (G.Coop.mateMap), queues every enemy
 *     and pickup already on the map for them, and sends them a 'start' with `late` (time and where
 *     to appear). The other guests get { k: 'dropin' } and add the admin's Pokémon. The run is
 *     tainted (no leaderboard), like any run the admin helps in.
 * Hooks: G.Coop.mateMap (js/net/coop.js), G.Game.coopApi (js/game.js), joinRoom's `started`
 * (js/net/social.js). Test: fork/test-player-manager.cjs.
 */
G.DropIn = (() => {
  let seed = 1;                                  // the run's map (World.reset), for whoever joins late
  const r1 = v => Math.round(v), r2 = v => Math.round(v * 100) / 100;
  const isAdmin = u => !!(G.Admin && G.Admin.isAdmin(u));
  const inRun = () => !!G.Game.player && G.Game.state !== 'ui' && G.Game.state !== 'over';

  // ---------------- the player's side (the host) ----------------

  /** cmd 'host' (presence.js): in a solo run, open a room the admin can come into. */
  async function openForAdmin() {
    if (!inRun() || G.Coop.active || !G.Social.me) return;
    if (!G.Social.room) {
      await G.Social.createRoom();
      G.Social.setOpen(false);                   // the admin only (database.rules.json)
    }
    if (G.Presence) setTimeout(() => G.Presence.report(true), 300);
  }

  /** cmd 'close': the admin couldn't come in after all; the room opened for them goes if nobody else is in it. */
  function closeForAdmin() {
    const room = G.Social.room;
    if (room && room.isHost && !G.Coop.active && room.members.every(m => m.uid === G.Net.uid || isAdmin(m.uid))) G.Social.leaveRoom();
  }

  function puppet(info, i, x, y) {
    const mon = G.DEX_BY[info.dex] || G.DEX_BY[25];
    const p = new G.Player(mon, {}, !!info.shiny);
    p.remote = true; p.uid = info.uid; p.tag = info.name; p.tagColor = G.Coop.COLORS[i % 4]; p.revLabel = 'Quédate a su lado';
    p.x = x; p.y = y;
    p.net = { x, y, ang: Math.PI / 2, walk: 0, hp: p.maxHp, maxHp: p.maxHp, dead: 0, mv: G.baseStartOf(mon.dex), ml: 1, mag: 78, aim: Math.PI / 2, rev: 0 };
    G.Sprites.preload([mon.dex], 8000, p.shiny);
    if (info.rad === true && G.Radiant && G.Radiant.has(mon.dex)) { p.radiant = true; p.shiny = false; G.Admin.repaint(p); }
    return { uid: info.uid, name: info.name, color: G.Coop.COLORS[i % 4], pl: p, connected: true, q: [], flushT: 0.25, xpMul: 1 };
  }

  /** Host: the admin is connected and isn't in the run yet. */
  function admit(u) {
    const room = G.Social.room, pl = G.Game.player;
    const info = room.members.find(m => m.uid === u);
    if (!info || !pl) return;
    if (!G.Coop.active) {
      // Solo run → group run, with you where you were.
      const x = pl.x, y = pl.y, me = G.Net.uid;
      G.Coop.begin({ seed, host: me, members: [{ uid: me, name: G.Social.me.name, dex: pl.dex, shiny: !!pl.shiny }] }, pl, G.Game.coopApi);
      pl.x = x; pl.y = y;
      G.Social.setPlaying(true);
    }
    const map = G.Coop.mateMap, members = G.Coop.members;
    const old = members.findIndex(m => m.uid === u);
    if (old >= 0) members.splice(old, 1);
    const m = { uid: u, name: info.name, dex: info.dex, shiny: !!info.shiny };
    members.push(m);
    const i = members.length - 1;
    const ax = pl.x + 46, ay = pl.y;
    const mate = puppet(Object.assign({}, info, { uid: u }), i, ax, ay);
    map.set(u, mate);
    // What's already on the map (new ones reach everyone by themselves).
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || e.remote) continue;
      mate.q.push(['ne', e.id, e.dex, r1(e.x), r1(e.y), e.boss ? 1 : 0, e.shiny ? 1 : 0, Math.ceil(e.maxHp), r2(e.dmg), e.behavior]);
    }
    for (const o of G.Pickups.all()) mate.q.push(['pk', o.id, o.kind, r1(o.x), r1(o.y), o.value]);
    G.Net.send(u, { k: 'start', seed, host: G.Net.uid, members: members.slice(),
      lab: !!(G.Lab && G.Lab.active), labV: G.Lab && G.Lab.VERSION, late: { t: r2(G.Game.st.time), x: r1(ax), y: r1(ay) } });
    for (const o of map.values()) if (o.connected && o.uid !== u) G.Net.send(o.uid, { k: 'dropin', m, i, x: r1(ax), y: r1(ay) });
    G.Game.taint();
    G.Spawner.say(info.name + ' joined the run', 2.6);         // (the host's banner reaches everyone)
  }

  G.Net.onPeer((u, mode) => {
    if (mode !== 'direct' && mode !== 'relay') return;
    const room = G.Social.room;
    if (!room || !room.isHost || !isAdmin(u) || !inRun()) return;
    const m = G.Coop.active && G.Coop.mate(u);
    if (m && m.connected) return;
    admit(u);
  });

  // ---------------- the other guests ----------------

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'dropin' || !G.Coop.active || G.Coop.isHost || from !== G.Net.hostUid) return;
    const m = msg.m;
    if (!m || typeof m.uid !== 'string' || m.uid === G.Net.uid || !G.DEX_BY[m.dex]) return;
    const info = { uid: m.uid, name: String(m.name || '?').slice(0, 24), dex: m.dex | 0, shiny: m.shiny === true };
    const members = G.Coop.members, old = members.findIndex(x => x.uid === info.uid);
    if (old >= 0) members.splice(old, 1);
    members.push(info);
    G.Coop.mateMap.set(info.uid, puppet(info, msg.i | 0, +msg.x || 0, +msg.y || 0));
  });

  // ---------------- the admin's side ----------------

  document.addEventListener('DOMContentLoaded', () => {
    const reset = G.World.reset;
    G.World.reset = function (s) { seed = (s | 0) || 1; return reset.apply(this, arguments); };
    // A late 'start': appear next to the host, at the run's time (the host's frames bring the rest).
    const startCoop = G.Flow.startCoop;
    G.Flow.startCoop = function (cfg) {
      const r = startCoop.apply(this, arguments);
      const pl = G.Game.player, late = cfg && cfg.late;
      if (late && pl && G.Coop.active) {
        pl.x = +late.x || pl.x; pl.y = +late.y || pl.y;
        G.Camera.x = pl.x; G.Camera.y = pl.y;
        G.Game.coopApi.syncTeam(Object.assign(G.Game.coopApi.team(), { time: +late.t || 0 }));
        joining = null;
      }
      return r;
    };
  });

  let joining = null;                            // { uid, name, until }: waiting for the host's 'start'
  const wait = (pred, ms) => new Promise(res => {
    const end = Date.now() + ms;
    (function tick() { const v = pred(); if (v || Date.now() > end) res(v); else setTimeout(tick, 250); })();
  });

  /**
   * The admin joins a player. st: their status (presence.js), live: () => their latest status.
   * → { ok, error?, how?: 'lobby'|'run' }
   */
  async function join(uid, name, st, live) {
    if (!isAdmin(G.DB.fb && G.DB.fb.uid)) return { ok: false, error: 'Admins only.' };
    if (G.Game.state !== 'ui') return { ok: false, error: 'Finish your own run first.' };
    if (!st || (st.s !== 'lobby' && st.s !== 'run')) return { ok: false, error: name + ' isn\'t in a lobby or a run.' };
    if (G.Social.room && G.Social.room.id === st.rm) {
      if (st.s === 'lobby') { G.LobbyUI.open(); return { ok: true, how: 'lobby' }; }
    }
    if (st.s === 'lobby') {
      const r = await G.Social.joinRoom(st.rm);
      if (!r.ok) return r;
      G.LobbyUI.open();
      return { ok: true, how: 'lobby' };
    }
    // A run. Solo: their game opens a room for you first.
    let rm = st.rm;
    if (!rm) {
      await G.PlayerManager.command(uid, 'host');
      rm = await wait(() => { const s = live(); return s && s.s === 'run' && s.rm; }, 20000);
      if (!rm) return { ok: false, error: name + '\'s game didn\'t open a lobby (an older version, or the run just ended).' };
    }
    const r = await G.Social.joinRoom(rm, true);
    if (!r.ok) return r;
    joining = { uid, name };
    const started = await wait(() => G.Game.state !== 'ui' && G.Coop.active, 25000);
    if (!started) {
      joining = null;
      await G.Social.leaveRoom();
      if (!st.rm) G.PlayerManager.command(uid, 'close').catch(() => {});
      return { ok: false, error: 'Couldn\'t connect to ' + name + '\'s game (their network may not allow direct connections).' };
    }
    return { ok: true, how: 'run' };
  }

  return { join, openForAdmin, closeForAdmin, get joining() { return joining; }, get seed() { return seed; } };
})();
