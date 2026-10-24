/* ============ topbar-room.js — screens start below the main menu's top bar (MrSurvivor) ============
 * The top bar (coins, tickets, user, news, sound, settings: #topbar, fixed, above the screens) stays on
 * screen in every menu. Upstream gives eight screens 66 px of room above them, and only in windows taller
 * than 520 px, so a tall screen (the Kecleon Shop and the Radiant Ritual on a desktop; on a 740x360 phone
 * on its side the collection, Upgrades, Shop, gacha, ritual, goals and support screens too) ran under the bar.
 * Here, while the bar is shown, every screen but the main menu starts below the bar's real bottom edge
 * (measured: it wraps and shrinks with the window), and its box fits the room left (.box max-height:
 * 100%, also for the boxes sized on the window) and scrolls inside, so nothing goes under the bar or off
 * the bottom, scrolled or not.
 * Checked by fork/test-topbar-room.cjs.
 */
(() => {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const st = document.createElement('style');
  // A box sized on the window instead (Settings: calc(100dvh - 24px), the profile: 90vh) gets the room
  // left, as js/fork/ui-scale.js already does for News.
  st.textContent = 'body.bar-room .scr:not(#scr-menu) { padding-top: max(20px, var(--bar-room, 66px)); }'
    + ' body.bar-room .scr:not(#scr-menu) > .box { max-height: 100%; }';
  document.head.appendChild(st);

  function sync() {
    const on = !bar.classList.contains('hidden');
    document.body.classList.toggle('bar-room', on);
    if (!on) return;
    // The screens are zoomed by js/fork/ui-scale.js (k ~2 at 4K): the bar's edge, in window pixels, is
    // turned into theirs, so the room isn't scaled twice.
    const scr = document.querySelector('.scr:not(#scr-menu)'), z = (scr && parseFloat(getComputedStyle(scr).zoom)) || 1;
    document.documentElement.style.setProperty('--bar-room', Math.ceil(bar.getBoundingClientRect().bottom / z + 8) + 'px');
  }
  new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['class'] });
  if (window.ResizeObserver) new ResizeObserver(sync).observe(bar);
  addEventListener('resize', () => { sync(); requestAnimationFrame(sync); });     // also after ui-scale.js's own resize
  sync();
})();
