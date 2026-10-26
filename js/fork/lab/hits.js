/* ============ hits.js — "after each of your hits" for the Lab's build layer (MrSurvivor fork) ============
 * fork/LAB.md "Phase 11: builds". G.LabHits.on(f): in a run, f(pl, e, m, dmg) runs right after
 * each hit of YOUR Pokémon lands on enemy e with move m (dmg: what Combat dealt, before Lab's hit
 * effects). Like kinds2.js and mech.js, it notes the move in G.RunStats.tag (Combat calls it on each of
 * your hits right before Enemy.hurt) and acts in Enemy.hurt. Burns, poison ticks and a teammate's hits
 * (the host applying a guest's 'h') never come through here: they aren't tagged. What f does to other
 * enemies (Combat.hit, applyBurn...) doesn't come back into f (no chains of chains).
 * Used by js/fork/lab/sets.js, synergy.js and recipes.js. Co-op: what f does goes through hit,
 * applyBurn/applySlow/applyStun, which a guest forwards to the host.
 */
G.LabHits = (() => {
  const fns = [];
  let pend = null, busy = false;
  const tag = G.RunStats.tag;
  G.RunStats.tag = function (e, m) {
    tag.apply(this, arguments);
    pend = { e, m };
  };
  const E = G.Enemy.prototype, hurt = E.hurt;
  E.hurt = function (amount) {
    const p = pend;
    pend = null;
    const r = hurt.apply(this, arguments);
    if (!p || p.e !== this || !p.m || busy || !fns.length || !(G.Lab && G.Lab.active)) return r;
    const pl = G.Game.player;
    if (!pl || pl.dead) return r;
    busy = true;
    try { for (const f of fns) f(pl, this, p.m, amount); } catch (err) { console.warn('[LabHits]', err); } finally { busy = false; }
    return r;
  };
  return { on(f) { fns.push(f); }, get busy() { return busy; } };
})();
