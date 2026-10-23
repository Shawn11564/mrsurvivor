/* ============ revive-card.js — the Revive card (Lab first, MrSurvivor fork) ============
 * In a Lab run, rarely (RATE per batch, from level 5, if you don't already carry one) the last
 * level-up card is "Revive": you keep it in its own slot (a heart next to your HP).
 * It's a Legendary card: the Legendary odds of js/fork/card-rarity.js (1 %) and its gold look
 * (card-rarity's paint does the chip and border, from rarity 5).
 *   - Solo: when you fall, you get up at once with 50 % HP, 3 s untouchable, and the enemies
 *     around you are thrown back. It's used up.
 *   - In co-op: when you fall you choose when to use it (R, or the on-screen button) or wait for a
 *     teammate to revive you, as always (and then it isn't used up).
 * Hooks: G.LevelUp.offer (the card), Player.hurt (solo), G.HUD.draw (the slot and the button, before
 * js/fork/ui-scale.js). Texts in English, like Lab. Test: fork/test-revive-card.cjs.
 */
G.ReviveCard = (() => {
  const LEGEND = G.CardRarity.TIERS[4], RATE = LEGEND.w / 100, MIN_LEVEL = 5, HP = 0.5, SAFE = 3, PUSH_R = 150;
  const GOLD = G.Gacha.RARITY_COLOR[LEGEND.r];
  let force = false;
  const can = pl => !!(pl && G.Lab && G.Lab.active && !pl.remote && !(pl.selfRevive > 0) && pl.level >= MIN_LEVEL);

  function card() {
    return {
      w: 0, type: 'up', key: 'rare:revive', icon: 'heart', rarity: LEGEND.r, color: GOLD, tag: G.Gacha.RARITY_NAME[LEGEND.r],
      title: 'Revive',
      desc: 'Kept in its own slot: when you\'re knocked out, you get back up with 50% HP and are untouchable for 3 s, and nearby enemies are thrown back. In co-op, you choose when to use it.',
      apply: p => { p.selfRevive = 1; G.FX.ring(p.x, p.y, 8, 90, GOLD, 0.6, 5); G.Audio.sfx('legend'); }
    };
  }
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const out = offer.apply(this, arguments);
    if (Array.isArray(out) && out.length && can(pl) && (force || Math.random() < RATE)) { force = false; out[out.length - 1] = card(); }
    return out;
  };

  /** Use the one you carry: back up with half your HP, untouchable, and those nearby are thrown back. */
  function use(pl) {
    if (!pl || !pl.dead || !(pl.selfRevive > 0)) return false;
    pl.selfRevive--;
    pl.revive(HP);
    pl.invuln = SAFE;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || G.U.dist2(e.x, e.y, pl.x, pl.y) > PUSH_R * PUSH_R) continue;   // all of them (queryCircle's grid is from this frame)
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.hurt(1, '#ff8acb', nx, ny, 1200);
    }
    G.FX.ring(pl.x, pl.y, 10, PUSH_R, '#ff8acb', 0.6, 6);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, 'Revive!', '#ff8acb', true);
    return true;
  }

  // Solo: on the same hit that knocks you down.
  const P = G.Player.prototype, hurt = P.hurt;
  P.hurt = function () {
    const was = this.dead, r = hurt.apply(this, arguments);
    if (!was && this.dead && !this.remote && !G.Coop.active && this.selfRevive > 0) use(this);
    return r;
  };

  // The slot (next to the HP) and, when down in co-op, the button.
  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    const r = draw.apply(this, arguments);
    if (!pl || !(pl.selfRevive > 0)) return r;
    const sa = G.Touch.safeArea(), x = 16 + sa.left + 48 + (G.HUD.hpAbove ? 0 : 168 + 8), y = 20 + sa.top + 14;   // right of the level (where the HP bar was: js/fork/hp-above.js)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 2, y - 2, 20, 18);
    G.Icons.draw(ctx, 'heart', x, y, 14);
    ctx.font = '800 9px Pixelify,"Segoe UI",sans-serif'; ctx.fillStyle = '#ffdcef'; ctx.textAlign = 'left';
    G.I18n.rawCanvas(ctx, 'fillText', 'R', x + 13, y + 15);
    if (pl.dead && G.Coop.active) {
      const bw = 210, bh = 30, bx = (w - bw) / 2, by = h - 150;
      ctx.fillStyle = 'rgba(40,10,30,.85)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ff8acb'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#ffdcef'; ctx.textAlign = 'center'; ctx.font = '800 12px Pixelify,"Segoe UI",sans-serif';
      G.I18n.rawCanvas(ctx, 'fillText', 'Use your Revive  [R]', w / 2, by + 20);
      G.Touch.addButton(bx, by, bw, bh, () => use(pl));
      if (G.Input.tap('keyr')) use(pl);
    }
    ctx.restore();
    return r;
  };

  return { RATE, use, card, forceNext() { force = true; } };
})();
