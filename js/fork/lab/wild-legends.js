/* ============ wild-legends.js — legendarios salvajes por el mapa (Lab primero, fork MrSurvivor) ============
 * En una partida Lab, desde el minuto 15, un legendario salvaje aparece por el mapa (no en la grieta)
 * cada GAP segundos mientras haya menos de MAX vivos: uno al azar de los que tienen sprite, a
 * 650-850 px de un jugador, con su propia vida y daño (crecen con el minuto; más vida en grupo, como
 * los jefes). Va como un jefe (barra de vida, recompensa de jefe), pero no cuenta como vencer a ese
 * legendario en una grieta (no lleva `legend`). Tampoco cuenta como combate de jefe (G.EnemyMgr.bossAlive):
 * si contara, con uno casi siempre vivo desde el minuto 15 no habría grietas, ni eventos, ni mareas.
 * Lo decide quien manda (solo, o el anfitrión): los invitados lo reciben como cualquier enemigo ('ne').
 * Prueba: fork/test-wild-legends.cjs.
 */
G.WildLegends = (() => {
  const FROM = 900, MAX = 2, GAP = 75;
  let last = -1e9;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const alive = () => G.EnemyMgr.all().filter(e => e.wildLegend && !e.dead);
  const pool = () => G.DEX.filter(p => p.rarity === 5 && G.SPRITE_META[p.dex]);

  /** Vida, daño y experiencia a los t segundos con n jugadores. */
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
    const pl = G.Game.player, st = G.Game.st;
    if (!pl || G.Game.state !== 'playing' || !(G.Lab && G.Lab.active) || !authority() || G.Rift.inArena || (G.Judgment && G.Judgment.active)) return;
    if (st.time < FROM || st.time - last < GAP || alive().length >= MAX) return;
    spawn();
  }, 1000);
  // Cada run empieza sin ninguno pendiente.
  function wrapRun() { const s = G.Game.startRun; G.Game.startRun = function () { last = -1e9; return s.apply(this, arguments); }; }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);

  return { FROM, MAX, GAP, stats, spawn, alive };
})();
