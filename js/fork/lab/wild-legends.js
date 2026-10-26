/* ============ wild-legends.js — wild legendaries roaming the map (MrSurvivor fork) ============
 * In a run, from minute 15, a wild legendary appears on the map (not in the rift)
 * every GAP seconds while fewer than MAX are alive: a random one among those with a sprite,
 * 650-850 px from a player, with its own HP and damage (they grow with the minute; more HP in co-op, like
 * bosses). It acts as a boss (HP bar, boss reward), but doesn't count as beating that
 * legendary in a rift (it has no `legend`). Nor does it count as a boss fight (G.EnemyMgr.bossAlive):
 * if it did, with one almost always alive from minute 15 there would be no rifts, events or surges.
 * None during a map site's fight (js/fork/lab/sites.js). Whoever is in charge decides (solo, or the host): guests get it like any other enemy ('ne').
 * Test: fork/test-wild-legends.cjs.
 */
G.WildLegends = (() => {
  const FROM = 900, MAX = 2, GAP = 75;
  let last = -1e9;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const alive = () => G.EnemyMgr.all().filter(e => e.wildLegend && !e.dead);
  const pool = () => G.DEX.filter(p => p.rarity === 5 && G.SPRITE_META[p.dex]);

  /** HP, damage and experience at t seconds with n players. */
  function stats(t, n) {
    return { hp: Math.round((2600 + t * 6) * G.Coop.scaleHp(n) * (n > 1 ? 1.3 : 1)), dmg: Math.round(30 + t / 25),
             shotDmg: Math.round(16 + t / 45), xp: Math.round(400 + t) };
  }
  function spawn(dexWanted) {
    const ps = G.Game.everyone().filter(p => !p.dead), pl = ps.length ? G.U.pick(ps) : G.Game.player;
    if (!pl) return null;
    const list = pool(), mon = (dexWanted && G.DEX_BY[dexWanted]) || G.U.pick(list);
    if (!mon) return null;
    let x = pl.x, y = pl.y;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(650, 850);
      x = pl.x + Math.cos(a) * d; y = pl.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, 26)) break;
    }
    const t = G.Game.st.time, s = stats(t, G.Game.everyone().length);
    const def = { dex: mon.dex, name: mon.name, hp: s.hp, spd: Math.round(G.U.clamp(46 + (mon.spd - 78) * 0.5, 46, 100)), dmg: s.dmg, xp: s.xp,
      behavior: mon.types.some(x => ['psychic', 'electric', 'ghost', 'fairy', 'fire', 'water', 'ice', 'dragon'].includes(x)) ? 'ranged' : 'charger',
      shotDmg: s.shotDmg, shotCd: 1.0, range: 280 };
    const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, true);
    e.wildLegend = true;
    e.flying = false;
    e.spawnD = Math.round(Math.hypot(x - pl.x, y - pl.y));
    G.EnemyMgr.add(e);
    last = t;
    G.Spawner.say('A wild ' + e.name + ' appeared!', 3);
    G.Audio.sfx('boss');
    return e;
  }

  const bossAlive = G.EnemyMgr.bossAlive;
  G.EnemyMgr.bossAlive = function () { return bossAlive.apply(this, arguments) && G.EnemyMgr.all().some(e => e.boss && !e.dead && !e.wildLegend); };

  setInterval(() => {
    if (!G.Game) return;                           // dev.html may still be loading js/game.js
    const pl = G.Game.player, st = G.Game.st;
    if (!pl || G.Game.state !== 'playing' || !(G.Lab && G.Lab.active) || !authority() || G.Rift.inArena || (G.Judgment && G.Judgment.active) || (G.LabSites && G.LabSites.busy)) return;
    if (st.time < FROM || st.time - last < GAP || alive().length >= MAX) return;
    spawn();
  }, 1000);
  // Every run starts with none pending.
  function wrapRun() { const s = G.Game.startRun; G.Game.startRun = function () { last = -1e9; return s.apply(this, arguments); }; }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);

  return { FROM, MAX, GAP, stats, spawn, alive };
})();
