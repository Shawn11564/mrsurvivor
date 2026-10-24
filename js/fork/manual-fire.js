/* ============ manual-fire.js — "Auto-shoot" under "Manual aim" (MrSurvivor fork) ============
 * Settings → Accessibility: with "Apuntar a mano" (Manual aim) on, a second toggle under it, Auto-shoot
 * (G.Settings 'autoFire', on by default). On is how it always worked: your attacks go off on their own,
 * towards where you aim. Off: you aim AND fire by hand. The active slot's attacks only go off while you
 * hold the left mouse button on the map (G.Touch.mapHeld, which also aims at the cursor), hold Space, or
 * push the controller's right stick (which aims too). Let go and they wait, ready, so the next press fires
 * at once.
 * Still on their own, from any slot: stat boosts (buff, from the other slots with Second nature or once
 * evolved), orbiting moves (orbit), and Lab's support moves (guard, weather, terrain, heal, screen,
 * shout, endure: G.LabKinds.PASSIVE, G.LabKinds2.PASSIVE), which Lab casts with its own clocks.
 * Only your own Pokémon on this device; never on touch screens (they have no manual aim).
 *
 * "Fire mobility moves manually" (G.Settings 'mobileByHand', off by default; fork/PLAN-2026-10-22.md A2.4,
 * the owner's G2), with or without Manual aim: the moves that move you or charge along a line (dash,
 * Lab's leap and recoil, a rolling ramp: MOBILE) only go off while you hold the same button; every
 * other attack keeps firing on its own. It makes a mobility move a decision without changing anyone
 * else's game. Its row is under Manual aim's, in Accessibility.
 * Hooks: wraps G.Combat.tick outside Lab's wrappers (loads after js/fork/lab/kinds2.js), holding a ready
 * attack's clock (m.t) just above 0 so Combat.tickMove doesn't cast it; one line in js/ui/settings-ui.js.
 * Test: fork/test-manual-fire.cjs.
 */
G.ManualFire = (() => {
  if (G.Settings.get('autoFire') === undefined) G.Settings.set('autoFire', true);
  const byHand = () => !G.Settings.touch && !!G.Settings.get('aimManual') && G.Settings.get('autoFire') === false;
  const support = m => m.kind === 'buff' || m.kind === 'orbit'
    || !!(G.LabKinds && G.LabKinds.PASSIVE.has(m.kind)) || !!(G.LabKinds2 && G.LabKinds2.PASSIVE.has(m.kind));
  const firing = () => G.Touch.mapHeld || G.Input.held('space') || !!(G.Pad.aim && G.Pad.aim());
  const mobileByHand = () => !G.Settings.touch && !!G.Settings.get('mobileByHand');
  const mobile = m => m.kind === 'dash' || m.kind === 'leap' || m.kind === 'recoil' || (m.kind === 'ramp' && !!m.roll);

  const tick = G.Combat.tick;
  G.Combat.tick = function (dt, pl) {
    if (pl && pl === G.Game.player && !pl.remote && (byHand() || mobileByHand()) && !firing()) {
      const all = byHand();
      for (const m of pl.activeGroup()) if ((all ? !support(m) : mobile(m)) && m.t - dt <= 0) m.t = dt + 1e-4;
    }
    return tick.apply(this, arguments);
  };

  const css = document.createElement('style');
  css.textContent = '.set-row.set-sub { padding-left: 22px; }';
  document.head.appendChild(css);

  /** The row under "Manual aim" (only while it's on; settings-ui re-renders when that changes), then
   *  "Fire mobility moves manually" (not on touch screens: no button to hold). */
  const MOBILE_TEXT = ['Fire mobility moves manually', 'Dash, leap, charge and roll moves only go off while you hold the left mouse button (or Space, or push the right stick). Your other attacks still fire on their own.'];
  G.I18n.add({ [MOBILE_TEXT[0]]: MOBILE_TEXT[0], [MOBILE_TEXT[1]]: MOBILE_TEXT[1] }, 'en');
  function settingsRow(toggle) {
    const auto = !G.Settings.get('aimManual') ? '' : toggle('autoFire', 'Auto-shoot', 'On: your attacks go off on their own, towards where you aim. Off: they only go off while you hold the left mouse button (or Space, or push the right stick). Stat boosts and support moves still go off on their own.')
      .replace('class="set-row"', 'class="set-row set-sub"');
    return auto + (G.Settings.touch ? '' : toggle('mobileByHand', MOBILE_TEXT[0], MOBILE_TEXT[1]));
  }

  return { settingsRow, byHand, firing, support, mobile, mobileByHand };
})();
