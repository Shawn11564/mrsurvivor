/* Final leaderboard appearance. Snapshot before Co-op clears its player puppets.
 * Species stays numeric for filters; form and skin are optional flags for old scores.
 * Regression: fork/test-ranking-appearance.cjs.
 */
G.RunAppearance = (() => {
  function of(pl, fallback = {}) {
    const p = pl || fallback;
    const radiant = p.radiant === true || (p.radiant == null && !pl && p.rad === true);
    return { dex: p.dex, shiny: !radiant && !!p.shiny, mega: !!(p.mega || p.megaKey), radiant };
  }
  function members() {
    const pl = G.Game.player;
    const mates = new Map(G.Coop.mates.map(m => [m.uid, m.pl]));
    return G.Coop.members.map(m => Object.assign({}, m, of(m.uid === pl.uid ? pl : mates.get(m.uid), m)));
  }
  function sprite(dex, flags) {
    let key = flags.mega && G.SPRITE_META['m' + dex] ? 'm' + dex : dex;
    const radiantArt = !!(flags.radiant && G.SPRITE_META[key + '/r']);
    if (radiantArt) key += '/r';
    const cv = G.UI.spriteCanvas(key, 44, 40, { scale: 1, shiny: radiantArt || (!flags.radiant && !!flags.shiny) });
    const form = flags.mega ? (G.MEGA_FORMS[dex] || 'Mega') + ' ' : '';
    cv.title = (flags.radiant ? 'Radiant ' : flags.shiny ? 'Shiny ' : '') + form + G.T(G.DEX_BY[dex].name);
    cv.setAttribute('aria-label', cv.title);
    return cv;
  }
  return { of, members, sprite };
})();
