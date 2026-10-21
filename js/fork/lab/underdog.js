/* ============ underdog.js — showing the weak Pokémon's extra XP (Lab, MrSurvivor fork) ============
 * The extra XP (G.LabGrowth.underdogK, js/fork/lab/growth.js: up to +60 % based on base
 * stats) shows in two places:
 *   - On the XP bar (G.HUD.draw): the part that comes from the extra, in gold at the end
 *     of the filled part, with "Underdog Bonus +N%" under it; it flashes for a moment when you gain XP.
 *     The extra multiplies all XP (xpMul), so its part of the bar is always
 *     k / (1 + k) of the filled part: no need to keep count of each gem.
 *   - Before starting: on pressing Play or Random Pokémon with the Lab on (solo), a
 *     ladder by rarity (the extra's range in each one, computed from G.DEX) with
 *     your Pokémon's highlighted and its exact extra, and the button to start. Only once per Pokémon:
 *     it doesn't come back until you play another one (G.Settings 'underdogSeen' = the last dex that saw it),
 *     so several runs in a row with the same one don't repeat it. It can be turned off for good
 *     (G.Settings 'underdogLadder', for this device). Only those two buttons arm it, so
 *     whoever calls G.Game.startRun on their own (tests, group) doesn't see it.
 *   - Always, on the menu's Play button (with the Lab on): your partner's "LAB · Underdog +N% XP"
 *     (#ud-play), so it's known without the ladder.
 * Texts in English only, like the rest of the Lab. Test: fork/test-underdog.cjs.
 */
G.LabUnderdog = (() => {
  const GOLD = '#ffd23f';
  const RAR = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
  const $ = id => document.getElementById(id);
  const pct = k => Math.round(k * 100);
  const k = mon => G.LabGrowth.underdogK(mon);

  // ---------------- the bar ----------------

  let lastXp = 0, lastLv = 0, glow = 0, lastT = 0;
  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    const r = draw.apply(this, arguments);
    const u = pl && G.Lab.active ? pl._labUnder || 0 : 0;
    if (u > 0) bar(ctx, w, pl, u);
    return r;
  };
  function bar(ctx, w, pl, u) {
    const now = performance.now(), dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    if (pl.level !== lastLv || pl.xp > lastXp + 1e-6) glow = 0.6;
    lastLv = pl.level; lastXp = pl.xp;
    glow = Math.max(0, glow - dt);
    const end = w * G.U.clamp(pl.xp / pl.xpNext, 0, 1), start = end / (1 + u);
    ctx.save();
    ctx.globalAlpha = 0.85 + glow * 0.25;
    ctx.fillStyle = GOLD;
    ctx.fillRect(start, 0, end - start, 7);
    if (glow > 0) { ctx.fillStyle = `rgba(255,255,255,${glow * 0.6})`; ctx.fillRect(start, 0, end - start, 7); }
    ctx.globalAlpha = 1;
    ctx.font = '700 10px Pixelify,"Segoe UI",system-ui,sans-serif';
    ctx.textBaseline = 'top';
    const text = `Underdog Bonus +${pct(u)}%`, tw = ctx.measureText(text).width;
    // Under the gold part, without going off screen or over the "LAB · ability" tag
    // in the middle (js/fork/lab/lab.js): if it lands on it, to whichever side is closer to the gold.
    let x = G.U.clamp(end - tw, 6, w - tw - 6);
    const [L, R] = tagSpan(ctx, w);
    if (x < R && x + tw > L) x = (start + end) / 2 < w / 2 ? Math.max(6, L - tw - 6) : Math.min(w - tw - 6, R + 6);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(text, x, 9);
    ctx.fillStyle = GOLD;
    ctx.fillText(text, x, 9);
    ctx.restore();
  }

  /** Where the Lab tag (#lab-hud) is across the canvas width; without it, the middle. */
  function tagSpan(ctx, w) {
    const tag = $('lab-hud'), cv = ctx.canvas.getBoundingClientRect();
    if (!tag || tag.classList.contains('hidden') || !cv.width) return [w / 2 - 130, w / 2 + 130];
    const r = tag.getBoundingClientRect(), k = w / cv.width;
    return [(r.left - cv.left) * k - 6, (r.right - cv.left) * k + 6];
  }

  // ---------------- the ladder, before starting ----------------

  /** Lowest and highest extra for each rarity (the whole Pokédex). */
  let bands = null;
  function ladder() {
    if (bands) return bands;
    bands = {};
    for (const m of G.DEX) {
      const b = bands[m.rarity] = bands[m.rarity] || { min: Infinity, max: 0 };
      b.min = Math.min(b.min, k(m)); b.max = Math.max(b.max, k(m));
    }
    return bands;
  }
  const range = b => !b || b.max <= 0 ? 'no bonus' : b.min <= 0 ? `up to +${pct(b.max)}%` : b.min === b.max ? `+${pct(b.min)}%` : `+${pct(b.min)}% to +${pct(b.max)}%`;
  const on = () => G.Settings.get('underdogLadder') !== false;

  function html(mon) {
    const mine = k(mon), col = r => (G.Gacha.RARITY_COLOR || {})[r] || '#fff';
    const rows = [5, 4, 3, 2, 1].map(r => `<div class="ud-row${r === mon.rarity ? ' me' : ''}" style="--rc:${col(r)}">
        <span class="ud-stars">${'★'.repeat(r)}</span><b>${RAR[r]}</b><span class="ud-range">${range(ladder()[r])}</span>
        ${r === mon.rarity ? `<span class="ud-you">${mon.name}: <b>${mine > 0 ? '+' + pct(mine) + '% XP' : 'no bonus'}</b></span>` : ''}</div>`).join('');
    return `<div class="ud-card" role="dialog" aria-labelledby="ud-title">
      <h2 id="ud-title"><span class="ud-tag">LAB</span> Underdog XP</h2>
      <p class="sub">Weaker Pokémon level up faster in Lab runs: the lower its base stats, the more XP it gets,
        up to +60%. Evolving during the run changes it.</p>
      <div class="ud-ladder">${rows}</div>
      <p class="ud-mine" style="color:${col(mon.rarity)}">${mine > 0
        ? `${mon.name} gets <b>+${pct(mine)}% XP</b>. It shows in gold on your XP bar.`
        : `${mon.name} is strong enough already: no bonus.`}</p>
      <label class="ud-opt"><input type="checkbox" id="ud-show" checked> Show this when I play a different Pokémon</label>
      <div class="row" style="gap:8px;justify-content:flex-end;margin-top:10px">
        <button class="btn ghost" id="ud-back" type="button">Back</button>
        <button class="btn gold" id="ud-go" type="button" data-sfx="confirm">Start run</button>
      </div></div>`;
  }

  // Styles here and not in css/brand.css: dev.html doesn't load brand.css and the ladder covers the menu.
  const CSS = `
#ud-ladder { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(8,12,20,.78); }
#ud-ladder.hidden { display: none; }
.ud-card { width: 100%; max-width: 520px; padding: 16px 18px; border-radius: 14px; background: #151f30; border: 2px solid #79b8ff; }
.ud-card h2 { margin: 0 0 4px; }
.ud-tag { font-size: 12px; font-weight: 800; padding: 1px 7px; border-radius: 999px; vertical-align: 4px;
  color: #9ff0e2; background: rgba(60,200,180,.2); border: 1px solid rgba(60,200,180,.6); }
.ud-ladder { display: flex; flex-direction: column; gap: 4px; margin: 10px 0; }
.ud-row { display: grid; grid-template-columns: 74px 90px 1fr; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px;
  color: var(--rc); background: rgba(0,0,0,.22); border: 2px solid transparent; opacity: .7; }
.ud-row b { color: var(--rc); }
.ud-row .ud-range { color: #e6f0fb; font-size: 14px; }
.ud-row .ud-stars { letter-spacing: 1px; font-size: 13px; }
.ud-row.me { opacity: 1; border-color: var(--rc); background: rgba(255,255,255,.07); box-shadow: 0 0 14px -4px var(--rc); }
.ud-row .ud-you { grid-column: 1 / -1; color: #ffd23f; font-size: 14px; }
.ud-row .ud-you b { color: #ffd23f; }
.ud-mine { margin: 4px 0 0; }
.ud-play { display: block; margin-top: 3px; font-size: 11px; font-weight: 700; color: #ffd23f; letter-spacing: .2px; }
.ud-play.hidden { display: none; }
.ud-play .ud-tag { font-size: 9px; vertical-align: 1px; margin-right: 3px; }
.ud-opt { display: inline-flex; gap: 6px; align-items: center; margin-top: 8px; font-size: 13px; color: var(--muted); cursor: pointer; }`;

  /** Shows the ladder for mon; go() starts the run. */
  function show(mon, go) {
    let box = $('ud-ladder');
    if (!box) {
      if (!$('ud-css')) { const st = document.createElement('style'); st.id = 'ud-css'; st.textContent = CSS; document.head.appendChild(st); }
      box = document.createElement('div'); box.id = 'ud-ladder'; document.body.appendChild(box);
    }
    box.innerHTML = html(mon);
    box.classList.remove('hidden');
    const close = () => { box.classList.add('hidden'); document.removeEventListener('keydown', key, true); };
    // Seen with a run started: it doesn't come back until you play another one (Back doesn't count).
    const start = () => { close(); G.Settings.set('underdogSeen', mon.dex); go(); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); start(); }
    };
    document.addEventListener('keydown', key, true);
    $('ud-show').onchange = e => G.Settings.set('underdogLadder', e.target.checked);
    $('ud-back').onclick = close;
    $('ud-go').onclick = start;
    $('ud-go').focus();
  }

  // Only Play and Random Pokémon (solo, with the Lab on) arm it.
  let armed = false;
  document.addEventListener('click', e => {
    if (e.target.closest('#scr-menu [data-go=play], #rand-go')) armed = true;
  }, true);
  // Outside all the other startRun wrappers (Lab, radiant...): they're installed on
  // DOMContentLoaded and this on load, which comes after.
  addEventListener('load', () => {
    const startRun = G.Game.startRun;
    G.Game.startRun = function (coop = null, pick = null) {
      const was = armed;
      armed = false;
      if (!was || coop || !G.Settings.get('lab') || !on()) return startRun.apply(this, arguments);
      const mon = G.DEX_BY[pick ? pick.dex : G.DB.save.partner];
      if (!mon || G.Settings.get('underdogSeen') === mon.dex) return startRun.apply(this, arguments);   // already saw it with this one
      const self = this, args = arguments;
      show(mon, () => startRun.apply(self, args));
    };
  });

  // ---------------- on the Play button ----------------

  /** Your partner's "LAB · Underdog +N% XP" on the Play button, with the Lab on and some extra. */
  function playTag() {
    const btn = document.querySelector('#scr-menu [data-go=play]');
    if (!btn) return;
    let tag = $('ud-play');
    if (!tag) {
      if (!$('ud-css')) { const st = document.createElement('style'); st.id = 'ud-css'; st.textContent = CSS; document.head.appendChild(st); }
      tag = document.createElement('span'); tag.id = 'ud-play'; tag.className = 'ud-play'; btn.appendChild(tag);
    }
    const mon = G.DEX_BY[G.DB.save && G.DB.save.partner], u = mon ? k(mon) : 0;
    tag.classList.toggle('hidden', !G.Settings.get('lab') || u <= 0);
    tag.innerHTML = `<span class="ud-tag">LAB</span>Underdog +${pct(u)}% XP`;
    tag.title = mon ? `${mon.name} levels up ${pct(u)}% faster in Lab runs` : '';
  }
  const open = G.MenuUI.open;
  G.MenuUI.open = function () { const r = open.apply(this, arguments); try { playTag(); } catch (e) { /* no partner yet */ } return r; };

  return { ladder, range, show, playTag };
})();
