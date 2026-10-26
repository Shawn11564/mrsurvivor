/* ============ rat-title.js — the "Rat" title (MrSurvivor fork) ============
 * An achievement with a title for the profile (js/data/achievements.js, G.AchDefs): beat the Eternatus
 * raid (js/fork/lab/eternatus.js, every run at 30:00) as Rattata (dex 19). The raid calls beat() the
 * moment Eternatus falls, on every computer in co-op, so each Rattata on the team gets it. s.ratBeat keeps
 * when (the save goes up with the rest), and G.Progress.checkAch grants the achievement and its title as usual.
 * Until 2026-10-26 it was "reach 15:00 as Rattata" (s.ratRun): whoever got it then keeps it.
 * Test: fork/test-rat-title.cjs.
 */
G.RatTitle = (() => {
  const DEX = 19;
  const ACH = { id: 'rat', cat: 'supervivencia', tier: 1, name: 'Rat', desc: 'Beat Eternatus as Rattata.',
                value: s => (s.ratBeat ? 1 : 0), goal: 1, title: 'Rat' };
  G.AchDefs.LIST.push(ACH);
  G.AchDefs.BY[ACH.id] = ACH;
  // (Its own English: "Rat" must not go through the word-by-word pass.)
  G.I18n.add({ Rat: 'Rat', [ACH.desc]: ACH.desc }, 'en');

  /** Eternatus has just fallen (G.Eternatus's won()). */
  function beat() {
    const s = G.DB.save, pl = G.Game.player;
    if (!s || s.ratBeat || !pl || pl.dex !== DEX) return;
    s.ratBeat = Date.now();
    G.Progress.checkAch();
    G.DB.commit();
  }

  return { ACH, DEX, beat };
})();
