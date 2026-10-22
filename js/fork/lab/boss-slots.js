/* ============ boss-slots.js — bosses after 15:00 (Lab first, MrSurvivor fork) ============
 * Upstream's boss slots (G.Enemies.BOSS_SLOTS) end at 15:00, so the second half of a run had no boss
 * (plan C1.1). In a Lab run there are four more, at 18:00, 21:00, 24:00 and 27:00, and in Lab's
 * endless (after Eternatus, js/fork/lab/eternatus.js) one every 3 minutes from 33:00 on.
 *   - Picked the way rollRun picks the earlier ones: rollRun itself picks them (the extra slots are
 *     pushed onto BOSS_SLOTS for that one call), so a non-legendary in the slot's BST band, never one
 *     already in the run, with rollRun's own HP ×1.35, damage ×1.2, speed and behaviour.
 *   - Their base numbers continue upstream's table from its last slot (15:00: 16 000 HP, 68 damage,
 *     1800 XP) at the table's own trend (least-squares slope over its five slots: +3500 HP, +8 damage,
 *     +400 XP per 3 minutes); bossScale(t) does the rest when they spawn, as for every boss.
 *   - Only as many as rollRun can pick without running out of Pokémon (16 with BST ≥ 580); later
 *     endless slots reuse one of the run's late bosses with that slot's numbers.
 * Lab-only: the extra slots wait on the bosses array (bosses.lab) and join it on the first spawner
 * update of a Lab run, so a normal run keeps upstream's five. The spawner only runs where the
 * enemies are decided (solo, or the co-op host); guests get the bosses like any enemy ('ne').
 * A run that starts late (js/fork/lab/resume.js puts the clock back) skips the slots already past,
 * upstream's included, instead of spawning all of them in the first frames.
 * Hooks: G.Enemies.rollRun, G.Spawner.update. Test: fork/test-boss-slots.cjs.
 */
G.LabBossSlots = (() => {
  const LATE = [1080, 1260, 1440, 1620], ENDLESS = 1980, EVERY = 180, ROLL_ENDLESS = 6, LATE_START = 10;
  const E = G.Enemies, S = E.BOSS_SLOTS, N = S.length, last = S[N - 1];
  const lab = () => !!(G.Lab && G.Lab.active);

  // The table's trend per second: least squares over upstream's slots.
  const slope = k => {
    const mt = S.reduce((a, s) => a + s.at, 0) / N, mv = S.reduce((a, s) => a + s[k], 0) / N;
    return S.reduce((a, s) => a + (s.at - mt) * (s[k] - mv), 0) / S.reduce((a, s) => a + (s.at - mt) ** 2, 0);
  };
  const PER = { hp: slope('hp') * EVERY, dmg: slope('dmg') * EVERY, xp: slope('xp') * EVERY };
  /** Slot k after upstream's: 0-3 are 18-27 minutes, then every 3 minutes from 33:00. */
  const atOf = k => k < LATE.length ? LATE[k] : ENDLESS + (k - LATE.length) * EVERY;
  /** Upstream-style slot (base numbers) for a time. */
  function slotAt(at) {
    const n = (at - last.at) / EVERY;
    return { at, hp: Math.round((last.hp + PER.hp * n) / 100) * 100, dmg: Math.round(last.dmg + PER.dmg * n),
      xp: Math.round((last.xp + PER.xp * n) / 10) * 10, bst: last.bst.slice() };
  }
  /** What rollRun makes of a slot's numbers (enemies.js: ×1.35 HP, ×1.2 damage, shots 0.55). */
  const defNumbers = s => ({ at: s.at, hp: Math.round(s.hp * 1.35), dmg: Math.round(s.dmg * 1.2), xp: s.xp, shotDmg: Math.round(s.dmg * 0.55) });

  const rollRun = E.rollRun;
  E.rollRun = function () {
    const ok = p => !p.leg && G.SPRITE_META[p.dex];
    const room = Math.max(0, G.DEX.filter(p => ok(p) && p.bst >= 580).length - N);
    const n = Math.min(LATE.length + ROLL_ENDLESS, room);
    for (let k = 0; k < n; k++) S.push(slotAt(atOf(k)));
    let r;
    try { r = rollRun.apply(this, arguments); } finally { S.length = N; }
    if (r && Array.isArray(r.bosses) && r.bosses.length > N) {
      const extra = r.bosses.splice(N);
      extra.forEach(b => { b.labSlot = true; });
      r.bosses.lab = extra;       // waiting: they join on a Lab run's first spawner update (join)
      r.bosses.labK = extra.length;   // the next slot to make (next)
    }
    return r;
  };

  /** Slot k made later (endless): one of the run's late bosses again, with that slot's numbers. */
  function next(B, k, prev) {
    const pool = B.lab.filter(b => b.dex !== prev);
    return Object.assign({}, G.U.pick(pool.length ? pool : B.lab), defNumbers(slotAt(atOf(k))), { labSlot: true });
  }
  function join(t) {
    const B = E.BOSSES;
    if (!B.lab || !B.lab.length) return;
    if (!B.labIn) {
      B.labIn = true;
      // The first update of this run, so the spawner hasn't taken a boss yet: a late start
      // (a resumed run) drops the slots already past instead of spawning them all at once.
      const past = b => t > LATE_START && b.at < t - LATE_START;
      let i = 0;
      while (i < B.length && past(B[i])) i++;
      B.splice(0, i);
      B.push(...B.lab.filter(b => !past(b)));
    }
    let prev = B.length ? B[B.length - 1].dex : 0;
    while (atOf(B.labK) < t + 120) {
      const k = B.labK++;
      if (atOf(k) < t - LATE_START) continue;
      const b = next(B, k, prev);
      B.push(b);
      prev = b.dex;
    }
  }
  const update = G.Spawner.update;
  G.Spawner.update = function (dt, who, t) {
    if (lab()) join(t);
    return update.apply(this, arguments);
  };

  return { LATE, ENDLESS, EVERY, slotAt, defNumbers, PER };
})();
