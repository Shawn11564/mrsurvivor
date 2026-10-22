/* ============ variant-stats.js — shiny and radiant stat rolls (MrSurvivor fork) ============
 * At the start of every run (normal and Lab), playing a shiny gives N of its 6 stats +10 %, a radiant
 * +20 %, picked at random each run. N goes by the Pokémon's rarity (G.DEX_BY rarity): Common 4,
 * Uncommon 3, Rare 2, Epic 1, Legendary 1. A banner at the start says which (after Lab's, if it has one); the pause screen too.
 * (Until 2026-10-22 they gave XP and coins in Lab runs instead: js/fork/lab/shiny.js keeps only the rerolls.)
 * The boosts are on the player, not on its stat sheet, so they stay through a Lab evolution:
 *   HP       max HP × (1 + k) at the start (addMaxHp)
 *   Attack   physical moves' damage × (1 + k)       Sp. Atk   special moves' (Player.atkFor)
 *   Defense  physical hits ÷ (1 + k)                Sp. Def   special hits (Player.hurt's cat)
 *   Speed    spdMul × (1 + k)
 * pl._vstats = { kind, k, ids }. Only your own Pokémon (each player rolls their own in co-op).
 * Loads after js/fork/radiant.js, whose startRun hook marks the player radiant first.
 * Test: fork/test-variant-stats.cjs.
 */
G.VariantStats = (() => {
  const COUNT = { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 }, K = { shiny: 0.1, radiant: 0.2 };
  const STATS = [['hp', 'HP'], ['atk', 'Attack'], ['satk', 'Sp. Atk'], ['def', 'Defense'], ['sdef', 'Sp. Def'], ['spd', 'Speed']];
  const NAME = Object.fromEntries(STATS);
  const count = dex => COUNT[(G.DEX_BY[dex] || {}).rarity] || 1;
  const has = (pl, id) => !!(pl && pl._vstats && pl._vstats.ids.includes(id));
  const text = v => `${v.kind === 'radiant' ? 'Radiant' : 'Shiny'}: +${Math.round(v.k * 100)}% ${v.ids.map(id => NAME[id]).join(', ')}`;

  function roll(pl) {
    const kind = pl.radiant ? 'radiant' : pl.shiny ? 'shiny' : null;
    pl._vstats = null;
    if (!kind) return null;
    const pool = STATS.map(s => s[0]), ids = [];
    for (let n = count(pl.dex); n > 0 && pool.length; n--) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const order = STATS.map(s => s[0]);
    ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const v = pl._vstats = { kind, k: K[kind], ids };
    if (ids.includes('hp')) pl.addMaxHp(Math.round(pl.maxHp * v.k));
    if (ids.includes('spd')) pl.spdMul *= 1 + v.k;
    // After a banner already up (Lab's "LAB · Ability: ..."), not over it.
    const up = G.Spawner.banner();
    if (!up) G.Spawner.say(text(v), 5, true);
    else setTimeout(() => { if (G.Game.player === pl && G.Game.state !== 'ui' && G.Game.state !== 'over') G.Spawner.say(text(v), 5, true); }, up.t * 1000 + 200);
    return v;
  }

  const P = G.Player.prototype, atkFor = P.atkFor, hurt = P.hurt;
  P.atkFor = function (m) {
    const r = atkFor.apply(this, arguments), cat = m && m.cat;
    return (cat === 'physical' && has(this, 'atk')) || (cat === 'special' && has(this, 'satk')) ? r * (1 + this._vstats.k) : r;
  };
  P.hurt = function (amount, type, pure, cat) {
    if (!pure && ((cat === 'physical' && has(this, 'def')) || (cat === 'special' && has(this, 'sdef')))) arguments[0] = amount / (1 + this._vstats.k);
    return hurt.apply(this, arguments);
  };

  // The pause screen: what this run rolled.
  const showPause = G.RunUI.showPause;
  G.RunUI.showPause = function () {
    const r = showPause.apply(this, arguments), pl = G.Game.player, box = document.getElementById('pause-sum');
    if (pl && pl._vstats && box) box.insertAdjacentHTML('afterbegin', `<div class="vs-pause" translate="no" style="margin:0 0 8px;color:${pl._vstats.kind === 'radiant' ? '#ffb347' : '#9ae6ff'}">${text(pl._vstats)}</div>`);
    return r;
  };

  // game.js loads after the fork's files: wrap it once loading is done (as js/fork/prestige.js does).
  function wrapRun() {
    const startRun = G.Game.startRun;
    G.Game.startRun = function () {
      const r = startRun.apply(this, arguments);
      if (G.Game.player) roll(G.Game.player);
      return r;
    };
  }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);

  return { COUNT, K, STATS, count, roll, text };
})();
