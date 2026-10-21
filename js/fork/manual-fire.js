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

  const tick = G.Combat.tick;
  G.Combat.tick = function (dt, pl) {
    if (pl && pl === G.Game.player && !pl.remote && byHand() && !firing()) {
      for (const m of pl.activeGroup()) if (!support(m) && m.t - dt <= 0) m.t = dt + 1e-4;
    }
    return tick.apply(this, arguments);
  };

  const css = document.createElement('style');
  css.textContent = '.set-row.set-sub { padding-left: 22px; }';
  document.head.appendChild(css);

  /** The row under "Manual aim" (only while it's on); settings-ui re-renders when that changes. */
  function settingsRow(toggle) {
    if (!G.Settings.get('aimManual')) return '';
    return toggle('autoFire', 'Auto-shoot', 'On: your attacks go off on their own, towards where you aim. Off: they only go off while you hold the left mouse button (or Space, or push the right stick). Stat boosts and support moves still go off on their own.')
      .replace('class="set-row"', 'class="set-row set-sub"');
  }

  return { settingsRow, byHand, firing, support };
})();
