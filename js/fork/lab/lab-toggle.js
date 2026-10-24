/* ============ lab-toggle.js — the Lab switch next to Play (MrSurvivor fork) ============
 * On the main menu, in the Play button's top-right corner (on its row, level with "Play", over the button's
 * empty right side so it keeps its full width): a small "LAB" switch and an "i".
 *   - The switch IS the Lab mode setting (G.Settings 'lab', the same one as Settings → Experimental):
 *     flipping it changes the setting, and a change made anywhere else moves the switch (G.Settings.on).
 *     In a group room as a guest it's greyed out: the host's setting decides.
 *   - The "i" shows what Lab mode is and what it doesn't count for, on hover or focus, and on a tap
 *     (touch screens; a tap elsewhere closes it).
 * The Play button is moved into a row (#lab-play) with them; its click handler (menu.js) goes with it.
 * The row spans the menu's two columns on short screens, as the Play button did. The tip spans the row,
 * under it, and the menu box stops clipping it while it's open.
 * Styles here: dev.html doesn't load css/brand.css. English only, like the rest of Lab.
 * Test: fork/test-lab-toggle.cjs.
 */
(() => {
  const $ = id => document.getElementById(id);
  const TIP = `<b>Lab mode</b> (experimental): each Pokémon gets the moves it learns in the games, one of its
    abilities and its signature moves, and can evolve during the run; there are also items, extra XP for weak
    Pokémon, and candy.
    <span class="lab-tip-r"><b>Lab runs</b> give coins, tickets and shinies and count for missions. They go on
    the <b>Lab leaderboard</b>, but <b>don't count for the regular leaderboard, achievements or records</b>.</span>
    <span class="lab-tip-r">In co-op, the host's setting decides for everyone.</span>`;
  const CSS = `
#lab-play { position: relative; grid-column: 1 / -1; }
#lab-play > .menu-item.play { width: 100%; }
.lab-q { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 5px; flex: none; }
.lab-sw { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; font-size: 11px; font-weight: 800;
  color: #9ff0e2; letter-spacing: .5px; }
.lab-sw input { position: absolute; opacity: 0; width: 0; height: 0; }
.lab-sw-t { position: relative; width: 34px; height: 18px; border-radius: 999px; background: rgba(230,240,251,.18);
  border: 1px solid rgba(60,200,180,.55); transition: background .15s; }
.lab-sw-t::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
  background: #cfd8e6; transition: transform .15s, background .15s; }
.lab-sw input:checked + .lab-sw-t { background: rgba(60,200,180,.55); }
.lab-sw input:checked + .lab-sw-t::after { transform: translateX(16px); background: #fff; }
.lab-sw input:focus-visible + .lab-sw-t { outline: 2px solid #9ff0e2; outline-offset: 2px; }
.lab-sw.off { opacity: .45; cursor: default; }
.lab-i { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid rgba(230,240,251,.5); background: transparent;
  color: #e6f0fb; font: 700 11px/16px Georgia, serif; font-style: italic; cursor: help; }
.lab-tip { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 30; max-width: 340px; margin-left: auto; padding: 9px 11px; border-radius: 10px;
  background: #151f30; border: 1px solid rgba(60,200,180,.7); box-shadow: 0 6px 18px rgba(0,0,0,.5); color: #e6f0fb;
  font-size: 12px; line-height: 1.4; font-weight: 400; text-align: left; letter-spacing: 0;
  visibility: hidden; opacity: 0; transition: opacity .12s; pointer-events: none; }
.lab-tip-r { display: block; margin-top: 5px; }
#lab-play:has(.lab-i:hover, .lab-i:focus-visible) .lab-tip, #lab-play.open .lab-tip { visibility: visible; opacity: 1; }
.box:has(.lab-i:hover, .lab-i:focus-visible, #lab-play.open) { overflow: visible; z-index: 5; }`;

  function build() {
    const play = document.querySelector('#scr-menu [data-go=play]');
    if (!play || $('lab-play')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const row = document.createElement('div'); row.id = 'lab-play';
    play.parentNode.insertBefore(row, play);
    row.appendChild(play);
    row.insertAdjacentHTML('beforeend', `<div class="lab-q" translate="no">
      <label class="lab-sw" id="lab-q" title="Lab mode (the same switch as Settings → Experimental)">
        <input type="checkbox" id="lab-q-on"><span class="lab-sw-t"></span>LAB</label>
      <button class="lab-i" type="button" aria-label="About Lab mode">i</button></div>
      <div class="lab-tip" role="tooltip" translate="no">${TIP}</div>`);
    const input = $('lab-q-on');
    input.onchange = () => {
      G.Settings.set('lab', input.checked);
      G.Audio.sfx('select');
      if (G.LabUnderdog) G.LabUnderdog.playTag();
    };
    row.querySelector('.lab-i').onclick = e => { e.stopPropagation(); row.classList.toggle('open'); };
    document.addEventListener('click', e => { if (!row.querySelector('.lab-q').contains(e.target)) row.classList.remove('open'); });
    sync();
  }

  /** The switch shows the setting; a guest in a room can't change what the host decides. */
  function sync() {
    const input = $('lab-q-on');
    if (!input) return;
    const room = G.Social && G.Social.room, guest = !!(room && !room.isHost);
    input.checked = !!G.Settings.get('lab');
    input.disabled = guest;
    $('lab-q').classList.toggle('off', guest);
    $('lab-q').title = guest ? 'In co-op, the host\'s Lab setting decides for everyone' : 'Lab mode (the same switch as Settings → Experimental)';
  }

  build();
  G.Settings.on(k => { if (k === 'lab') { sync(); if (G.LabUnderdog) G.LabUnderdog.playTag(); } });
  if (G.Social) G.Social.on(sync);
  const open = G.MenuUI.open;
  G.MenuUI.open = function () { const r = open.apply(this, arguments); sync(); return r; };
})();
