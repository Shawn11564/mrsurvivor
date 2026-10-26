/* ============ worlds-toggle.js — the World 2 switch next to Play (MrSurvivor fork) ============
 * On the main menu, in the Play button's top-right corner: a small "WORLD 2" switch and an "i" (where the old Lab
 * switch was). The switch is the setting G.Settings 'worlds' (off by default) that js/fork/lab/worlds.js reads when a
 * run starts. In a group room the host's setting decides: the host tells the guests ({ k:'worlds', a:'set', on }
 * when they connect and when it changes) and a guest's switch shows it, greyed out.
 * The "i" says what a World 2 run is, on hover or focus, and on a tap (a tap elsewhere closes it).
 * Styles here: dev.html doesn't load css/brand.css. Test: fork/test-worlds.cjs.
 */
(() => {
  const $ = id => document.getElementById(id);
  const TIP = `<b>World 2</b> (preview): Eternatus comes at <b>10:00</b>. Beat it and a portal to World 2 opens:
    a new land with stronger Pokémon. Step in when you're ready, but from the moment it opens World 1 grows stronger
    every minute and a ghost horde comes for you. Necrozma waits in World 2 at 30:00.
    <span class="w2-tip-r">World 2 runs go on the <b>World 2 leaderboard</b> (Leaderboard → World 2), not the regular one.</span>
    <span class="w2-tip-r">In co-op, the host's setting decides for everyone.</span>`;
  const CSS = `
#w2-play { position: relative; grid-column: 1 / -1; }
#w2-play > .menu-item.play { width: 100%; }
.w2-q { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 5px; flex: none; }
.w2-sw { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; font-size: 11px; font-weight: 800;
  color: #d4b8ff; letter-spacing: .5px; }
.w2-sw input { position: absolute; opacity: 0; width: 0; height: 0; }
.w2-sw-t { position: relative; width: 34px; height: 18px; border-radius: 999px; background: rgba(230,240,251,.18);
  border: 1px solid rgba(176,123,255,.6); transition: background .15s; }
.w2-sw-t::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
  background: #cfd8e6; transition: transform .15s, background .15s; }
.w2-sw input:checked + .w2-sw-t { background: rgba(176,123,255,.6); }
.w2-sw input:checked + .w2-sw-t::after { transform: translateX(16px); background: #fff; }
.w2-sw input:focus-visible + .w2-sw-t { outline: 2px solid #d4b8ff; outline-offset: 2px; }
.w2-sw.off { opacity: .45; cursor: default; }
.w2-i { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid rgba(230,240,251,.5); background: transparent;
  color: #e6f0fb; font: 700 11px/16px Georgia, serif; font-style: italic; cursor: help; }
.w2-tip { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 30; max-width: 340px; margin-left: auto; padding: 9px 11px; border-radius: 10px;
  background: #18122a; border: 1px solid rgba(176,123,255,.75); box-shadow: 0 6px 18px rgba(0,0,0,.5); color: #e6f0fb;
  font-size: 12px; line-height: 1.4; font-weight: 400; text-align: left; letter-spacing: 0;
  visibility: hidden; opacity: 0; transition: opacity .12s; pointer-events: none; }
.w2-tip-r { display: block; margin-top: 5px; }
#w2-play:has(.w2-i:hover, .w2-i:focus-visible) .w2-tip, #w2-play.open .w2-tip { visibility: visible; opacity: 1; }
.box:has(.w2-i:hover, .w2-i:focus-visible, #w2-play.open) { overflow: visible; z-index: 5; }`;
  const hostOn = new Map();             // host uid -> its switch (a guest's lobby)

  function build() {
    const play = document.querySelector('#scr-menu [data-go=play]');
    if (!play || $('w2-play')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const row = document.createElement('div'); row.id = 'w2-play';
    play.parentNode.insertBefore(row, play);
    row.appendChild(play);
    row.insertAdjacentHTML('beforeend', `<div class="w2-q" translate="no">
      <label class="w2-sw" id="w2-q"><input type="checkbox" id="w2-q-on"><span class="w2-sw-t"></span>WORLD 2</label>
      <button class="w2-i" type="button" aria-label="About World 2">i</button></div>
      <div class="w2-tip" role="tooltip" translate="no">${TIP}</div>`);
    const input = $('w2-q-on');
    input.onchange = () => { G.Settings.set('worlds', input.checked); G.Audio.sfx('select'); };
    // A click on the switch isn't a click on Play.
    row.querySelector('.w2-q').addEventListener('click', e => e.stopPropagation());
    row.querySelector('.w2-i').onclick = e => { e.stopPropagation(); row.classList.toggle('open'); };
    document.addEventListener('click', e => { if (!row.querySelector('.w2-q').contains(e.target)) row.classList.remove('open'); });
    sync();
  }

  /** The switch shows the setting; a guest in a room sees the host's, and can't change it. */
  function sync() {
    const input = $('w2-q-on');
    if (!input) return;
    const room = G.Social && G.Social.room, guest = !!(room && !room.isHost);
    input.checked = guest ? !!hostOn.get(room.host) : !!G.Settings.get('worlds');
    input.disabled = guest;
    $('w2-q').classList.toggle('off', guest);
    $('w2-q').title = guest ? 'In co-op, the host\'s World 2 setting decides for everyone' : 'World 2 runs: Eternatus at 10:00, then a portal to World 2';
  }

  /** The host tells its setting (to one player or to all). */
  function tell(uid) {
    const room = G.Social && G.Social.room;
    if (!room || !room.isHost) return;
    const msg = { k: 'worlds', a: 'set', on: !!G.Settings.get('worlds') };
    if (uid) G.Net.send(uid, msg); else G.Net.broadcast(msg);
  }

  build();
  G.Settings.on(k => { if (k === 'worlds') { sync(); tell(); } });
  G.Net.on((from, msg) => { if (msg && msg.k === 'worlds' && msg.a === 'set') { hostOn.set(from, !!msg.on); sync(); } });
  if (G.Net.onPeer) G.Net.onPeer((u, mode) => { if (mode === 'direct' || mode === 'relay') tell(u); });
  if (G.Social) G.Social.on(sync);
  const open = G.MenuUI.open;
  G.MenuUI.open = function () { const r = open.apply(this, arguments); sync(); return r; };
})();
