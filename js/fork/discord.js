/* ============ discord.js — the Discord server: top bar, main menu and a one-time banner (MrSurvivor) ============
 * The top bar trades its Sound and Settings buttons (Settings stays in the main menu, the pause menu has
 * both) for a Discord button. The main menu gets a Discord entry after the Leaderboard. The first time a
 * player reaches the main menu after this shipped, a banner says the game has a Discord and offers the
 * invite; it shows once per browser (localStorage ms.discord.banner), after any update notice.
 * Reward: the first time an account opens the invite (the button, the menu entry or the banner's Join; nobody
 * checks that they joined), it gets 5 ×10 tickets (the purple ones). save.discord = when, kept on merge
 * (G.forkMerge), so it's once per account. Until then the button and the banner's Join show a purple ticket
 * with +5. Guests don't get it: their progress can move to an account more than once.
 * Checked by fork/test-discord.cjs.
 */
(() => {
  const INVITE = 'https://discord.gg/VcwVYRXzT5';
  const SEEN = 'ms.discord.banner';
  const REWARD = 5;                               // ×10 tickets (save.tickets.t10)
  const $ = id => document.getElementById(id);
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nothing */ } };

  // Discord's official mark (the "Clyde" logo from its brand assets), drawn in the colour of the text around it.
  const MARK = 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z';
  const icon = n => `<svg class="dc-mark" width="${n}" height="${n}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${MARK}"/></svg>`;
  const open = () => { put(SEEN, '1'); window.open(INVITE, '_blank', 'noopener'); claim(); };

  // ---------------- the reward ----------------
  const canClaim = () => { const s = G.DB.save; return !!s && !G.DB.guest && !s.discord; };
  const tix = () => `<span class="dc-tix" title="+${REWARD} ×10 tickets">${G.Icons.html('ticket10', 24)}<b>+${REWARD}</b></span>`;
  function badges() {
    const on = canClaim();
    for (const el of [$('btn-discord'), banner && banner.querySelector('.dc-join')]) {
      if (!el) continue;
      const b = el.querySelector('.dc-tix');
      if (on && !b) el.insertAdjacentHTML('beforeend', tix());
      else if (!on && b) b.remove();
    }
    const btn = $('btn-discord');
    if (btn) btn.title = on ? `Join our Discord: +${REWARD} ×10 tickets` : 'Join our Discord';
    const line = banner && banner.querySelector('.dc-gift');
    if (line) line.classList.toggle('hidden', !on);
  }
  function grant() {
    if (!canClaim()) return;
    const s = G.DB.save;
    s.discord = Date.now();
    s.tickets.t10 = (s.tickets.t10 | 0) + REWARD;
    G.DB.commit();
    if (G.DB.mode === 'cloud') G.DB.flush();
    G.UI.refreshCoins();
    G.Audio.sfx('legend');
    G.UI.toast(`Thanks for joining! +${REWARD} ×10 tickets`, 3800);
    badges();
  }
  // In the cloud, the account's copy comes in first, so another device's claim counts.
  function claim() {
    if (!canClaim()) return;
    const p = G.DB.mode === 'cloud' ? G.DB.pull() : null;
    if (p && p.then) p.then(grant, grant); else grant();
  }

  const css = document.createElement('style');
  css.textContent = `
#topbar #btn-sound, #topbar #btn-settings, #sound-panel { display: none !important; }
#btn-discord { padding: 5px 9px; display: flex; align-items: center; gap: 4px; text-decoration: none; color: #fff; }
.dc-tix { position: relative; flex: none; margin-right: 3px; display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
.dc-tix b { position: absolute; right: -5px; top: -3px; font-size: 11px; line-height: 1; color: #fff;
  text-shadow: -1px -1px 0 #3a1466, 1px -1px 0 #3a1466, -1px 1px 0 #3a1466, 1px 1px 0 #3a1466, 0 2px 0 #3a1466; }
.dc-banner .dc-join { display: inline-flex; align-items: center; gap: 6px; }
.dc-banner .dc-gift { color: #e2c2ff; font-weight: bold; }
#btn-discord:hover { border-color: #8f98ff; background: #5865f2; }
#scr-menu [data-go="discord"] .mi-ico { color: #5865f2; filter: drop-shadow(2px 2px 0 var(--shadow)); }
.dc-banner { position: fixed; left: 50%; bottom: 46px; z-index: 40; width: min(560px, calc(100vw - 32px));
  display: flex; align-items: center; gap: 14px; padding: 14px 16px; transform: translate(-50%, 0);
  border-color: #8f98ff; box-shadow: 0 0 0 3px #3c45a5, 0 10px 30px rgba(0,0,0,.45);
  background: linear-gradient(135deg, #2b3290, #1d2c46 70%); animation: dc-in .35s ease-out; }
.dc-banner .dc-ico { flex: none; display: flex; align-items: center; justify-content: center; width: 56px; height: 56px;
  border-radius: 16px; background: #5865f2; color: #fff; box-shadow: 0 0 0 2px #c9d1ff; }
.dc-banner .dc-txt { flex: 1; min-width: 0; }
.dc-banner .dc-txt > b { display: block; font-size: 20px; color: #fff; }
.dc-banner .dc-txt span { display: block; font-size: 14px; color: #c9d1ff; margin-top: 2px; line-height: 1.3; }
.dc-banner .dc-join { flex: none; background: #5865f2; border-color: #c9d1ff; color: #fff; }
.dc-banner .dc-join:hover { background: #6b77ff; }
.dc-banner .dc-x { position: absolute; top: 4px; right: 6px; background: none; border: 0; color: #c9d1ff;
  font-size: 18px; line-height: 1; cursor: pointer; padding: 4px 6px; }
.dc-banner .dc-x:hover { color: #fff; }
@keyframes dc-in { from { opacity: 0; transform: translate(-50%, 24px); } }
@media (max-height: 520px) { .dc-banner { bottom: 8px; } }
@media (max-width: 560px) {
  .dc-banner { flex-wrap: wrap; gap: 10px; bottom: 16px; }
  .dc-banner .dc-txt { flex-basis: calc(100% - 70px); }
  .dc-banner .dc-join { width: 100%; }
}`;
  document.head.appendChild(css);

  function topButton() {
    const bar = $('topbar');
    if (!bar || $('btn-discord')) return;
    const a = document.createElement('a');
    a.id = 'btn-discord'; a.className = 'btn small ghost'; a.href = INVITE; a.target = '_blank'; a.rel = 'noopener';
    a.title = 'Join our Discord'; a.setAttribute('aria-label', 'Join our Discord'); a.setAttribute('translate', 'no');
    a.innerHTML = icon(20);
    a.addEventListener('click', () => { put(SEEN, '1'); claim(); });
    bar.insertBefore(a, $('btn-sound') || $('btn-logout'));
  }

  function menuItem() {
    const rank = document.querySelector('#scr-menu [data-go="rank"]');
    if (!rank || document.querySelector('#scr-menu [data-go="discord"]')) return;
    const b = document.createElement('button');
    b.className = 'menu-item'; b.dataset.go = 'discord'; b.dataset.sfx = 'click'; b.type = 'button';
    b.setAttribute('translate', 'no');
    b.innerHTML = `<span class="mi-ico">${icon(26)}</span>Discord<small>Chat, news and co-op partners</small>`;
    b.onclick = open;
    rank.after(b);
  }

  // The banner waits for the main menu with nothing over it (the update notices, a recovered run...).
  const shown = id => { const e = $(id); return !!e && !e.classList.contains('hidden'); };
  const clear = () => shown('scr-menu') && ![...document.querySelectorAll('.scr')].some(s => s.id !== 'scr-menu' && !s.classList.contains('hidden'));
  // It also waits for the toasts a new player gets on reaching the menu ("Bulbasaur joins you!", the first
  // achievement), which sit where it goes.
  const busy = () => [...document.querySelectorAll('.toast, .ach-pop')].some(e => e.getClientRects().length && getComputedStyle(e).display !== 'none');
  let banner = null, wait = 0;
  function maybeBanner() {
    if (banner || get(SEEN) || !clear()) return;
    if (!wait) wait = setTimeout(show, 1200);
  }
  function show() {
    wait = 0;
    if (banner || get(SEEN) || !clear()) return;
    if (busy()) { wait = setTimeout(show, 500); return; }
    banner = document.createElement('div');
    banner.className = 'box dc-banner'; banner.id = 'discord-banner'; banner.setAttribute('translate', 'no');
    banner.innerHTML = `<span class="dc-ico">${icon(36)}</span>
      <div class="dc-txt"><b>We now have a Discord!</b><span>Chat with other players, find co-op partners and hear about updates first.
        <span class="dc-gift">Join for ${REWARD} free ×10 tickets!</span></span></div>
      <button class="btn small dc-join" type="button" data-sfx="confirm">Join the Discord</button>
      <button class="dc-x" type="button" title="Close" aria-label="Close">✕</button>`;
    const close = () => { put(SEEN, '1'); if (banner) banner.remove(); banner = null; stop(); };
    banner.querySelector('.dc-join').onclick = () => { open(); close(); };
    banner.querySelector('.dc-x').onclick = close;
    document.body.appendChild(banner);
    badges();
  }
  // Leaving the menu (Play, another screen) hides it until the menu is back; it only counts as seen once closed or used.
  function sync() {
    if (banner) banner.classList.toggle('hidden', !clear());
    else maybeBanner();
  }
  let mo = null;
  const stop = () => { if (mo) mo.disconnect(); mo = null; };
  if (!get(SEEN)) {
    mo = new MutationObserver(sync);
    for (const s of document.querySelectorAll('.scr')) mo.observe(s, { attributes: true, attributeFilter: ['class'] });
  }

  const menuInit = G.MenuUI.init;
  G.MenuUI.init = function () { const r = menuInit.apply(this, arguments); topButton(); menuItem(); return r; };
  const menuOpen = G.MenuUI.open;
  G.MenuUI.open = function () { const r = menuOpen.apply(this, arguments); sync(); badges(); return r; };
  G.DB.onSync(badges);
  // Merging two copies keeps the claim. Hooked once every script has run: radiant.js sets G.forkMerge without chaining.
  document.addEventListener('DOMContentLoaded', () => {
    const merge = G.forkMerge;
    G.forkMerge = function (r, a, b) {
      if (merge) merge.apply(this, arguments);
      const t = Math.max(+(a && a.discord) || 0, +(b && b.discord) || 0);
      if (t) r.discord = t;
    };
  });
})();
