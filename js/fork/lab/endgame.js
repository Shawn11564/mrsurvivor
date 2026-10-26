/* ============ endgame.js — the horde keeps getting stronger (MrSurvivor fork) ============
 * The endless (after Eternatus, js/fork/lab/eternatus.js) has no wall of its own: the horde's numbers grow linearly
 * (js/data/enemies.js scale(t): HP ×(1 + t/95), damage ×(1 + t/420), speed capped at ×1.35 by 8:00) while
 * a strong build's damage grows much faster, so a good run could go on for ever. In a run, every
 * regular enemy that joins the fight from 20:00 on gets, on top of the spawner's numbers:
 *   HP      × (1 + (t − 20:00)/10 min) × 1.2 ^ ((t − 30:00)/2 min)      ×2 at 30:00, ×13.7 at 45:00, ×77 at 60:00
 *   damage  × (1 + (t − 20:00)/15 min) × 1.16 ^ ((t − 30:00)/2 min)     ×1.67 at 30:00, ×8.1 at 45:00, ×34 at 60:00
 *   speed   × (1 + 0.3 × (t − 20:00)/30 min + 0.3 × (t − 30:00)/30 min), at most ×1.6
 *                                                                        ×1.1 at 30:00, ×1.4 at 45:00, ×1.6 at 55:00
 *   XP      × √(the HP factor), so levels keep coming, just not as fast as the horde grows
 * (the exponential terms only past 30:00: the "regime change" of plan C2.6, like Megabonk or Vampire
 * Survivors' late game: it doesn't stop until you do). Past 30:00 a growing share of them are also elites
 * (×1.6 HP, ×1.25 damage, ×1.6 XP, the spawner's own elite numbers) without the horde being at its cap,
 * and some get an elite affix (js/fork/lab/affixes.js): up to ELITE and AFFIX at 60:00.
 * The HUD shows the HP factor next to the clock from 20:00 ("THREAT ×4.1", red past 30:00).
 * Regular enemies only (horde, surges, summons, a dungeon's waves): bosses, legendaries, Eternatus's
 * obelisks, split copies, thieves and anything marked _noScale keep their own numbers (bosses grow in
 * js/fork/lab/boss-power.js). On the machine that runs the enemies (a guest's copy gets the host's numbers;
 * the HUD reads the shared clock). Load order: after affixes.js (so a Shielded shield is 60 % of the scaled
 * HP). Hook: G.EnemyMgr.add, G.Events.drawHud. Tests: fork/test-endgame.cjs,
 * fork/test-damage-pace.cjs (real shots and hazards through a late-run player's defenses).
 */
G.LabEndgame = (() => {
  const FROM = 1200, REGIME = 1800, STEP = 120, HP_EXP = 1.2, DMG_EXP = 1.16, SPD_MAX = 1.6;
  const ELITE = 0.5, AFFIX = 0.3, LATE = 1800;      // elite / affix share reached LATE s after the regime change
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const after = (t, from) => Math.max(0, t - from);

  const hp = t => (1 + after(t, FROM) / 600) * Math.pow(HP_EXP, after(t, REGIME) / STEP);
  const dmg = t => (1 + after(t, FROM) / 900) * Math.pow(DMG_EXP, after(t, REGIME) / STEP);
  const spd = t => Math.min(SPD_MAX, 1 + 0.3 * after(t, FROM) / 1800 + 0.3 * after(t, REGIME) / 1800);
  const eliteShare = t => Math.min(ELITE, ELITE * after(t, REGIME) / LATE);
  const affixShare = t => Math.min(AFFIX, AFFIX * after(t, REGIME) / LATE);
  const regular = e => !e.boss && !e.legend && !e.wildLegend && !e.judge && !e.obelisk && !e._split && !e._noScale && e.behavior !== 'thief';

  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    let affix = null;
    if (e && !e.remote && !e._endgame && lab() && authority() && G.Game.st && regular(e)) {
      const t = G.Game.st.time;
      if (t > FROM) {
        e._endgame = true;
        const k = hp(t);
        e.maxHp = e.hp = Math.max(1, Math.round(e.maxHp * k));
        e.dmg *= dmg(t);
        e.spd *= spd(t);
        e.xp = Math.round(e.xp * Math.sqrt(k));
        if (Math.random() < eliteShare(t)) { e.maxHp = e.hp = Math.round(e.maxHp * 1.6); e.dmg *= 1.25; e.xp = Math.round(e.xp * 1.6); e._elite = true; }
        if (G.LabAffixes && Math.random() < affixShare(t)) affix = true;
      }
    }
    const r = add.apply(this, arguments);
    // (After it joins: affixes.js rolls its own first, and tag() tells the guests.)
    if (affix && !e.affix) {
      const keys = ['shielded', 'swift', 'vampiric', 'splitting', 'explosive'];
      G.LabAffixes.tag(e, keys[Math.floor(Math.random() * keys.length)]);
    }
    return r;
  };

  // ---------------- HUD: the threat next to the clock ----------------
  const drawHud = G.Events.drawHud;
  G.Events.drawHud = function (ctx, w, h, pl, F) {
    const r = drawHud.apply(this, arguments);
    const t = G.Game.st && G.Game.st.time;
    if (lab() && t > FROM && !(G.Judgment && G.Judgment.cinematic)) {
      const k = hp(t), late = t > REGIME, beat = late ? 0.75 + Math.sin(performance.now() / 220) * 0.25 : 1;
      ctx.save();
      ctx.font = F(800, 11);
      ctx.textAlign = 'left';
      const txt = 'THREAT ×' + (k < 10 ? k.toFixed(1) : Math.round(k));
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.globalAlpha = beat;
      G.I18n.rawCanvas(ctx, 'strokeText', txt, w / 2 + 46, 37);
      ctx.fillStyle = late ? '#ff5f6d' : '#ffb35f';
      G.I18n.rawCanvas(ctx, 'fillText', txt, w / 2 + 46, 37);
      ctx.restore();
    }
    return r;
  };

  return { FROM, REGIME, hp, dmg, spd, eliteShare, affixShare };
})();
