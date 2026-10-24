/* ============ rat-title.js — the "Rat" title (MrSurvivor fork) ============
 * An achievement with a title for the profile (js/data/achievements.js, G.AchDefs): reach 15:00 on a
 * run's clock as Rattata (dex 19). It's checked once a second during a run, so it pops the moment the
 * clock gets there; the run doesn't have to end. s.ratRun keeps when it was reached (the save goes up
 * with the rest), and G.Progress.checkAch grants the achievement and its title as usual.
 * Test: fork/test-rat-title.cjs.
 */
G.RatTitle = (() => {
  const DEX = 19, AT = 15 * 60;
  const ACH = { id: 'rat', cat: 'supervivencia', tier: 1, name: 'Rat', desc: 'Reach 15:00 in a run as Rattata.',
                value: s => (s.ratRun ? 1 : 0), goal: 1, title: 'Rat' };
  G.AchDefs.LIST.push(ACH);
  G.AchDefs.BY[ACH.id] = ACH;
  // (Its own English: "Rat" must not go through the word-by-word pass.)
  G.I18n.add({ Rat: 'Rat', [ACH.desc]: ACH.desc }, 'en');

  function tick() {
    const s = G.DB.save, pl = G.Game.player;
    if (!s || s.ratRun || !pl || pl.dex !== DEX || ['ui', 'over'].includes(G.Game.state) || G.Game.st.time < AT) return;
    s.ratRun = Date.now();
    G.Progress.checkAch();
    G.DB.commit();
  }
  setInterval(tick, 1000);

  return { ACH, DEX, AT, tick };
})();
