/* ============ overhealth.js — the Sitrus Berry's extra becomes Overhealth (MrSurvivor fork) ============
 * In a run, the level-up's Sitrus Berry (G.LevelUp.STATS 'heal', with card-rarity.js's tiers: 45% and up)
 * heals as before, and what it would heal past your max HP becomes Overhealth: hits take it first
 * (Player.hurt, a one-line hook: G.Overhealth.absorb), and once lost it doesn't come back (regeneration
 * and heals fill HP only). Berries add up, to your max HP at most. pl._oh, so a new run starts at 0.
 * HUD: a gold strip under the top left's HP bar and over the bar above your Pokémon (js/fork/hp-above.js).
 * Checked by fork/test-overhealth.cjs.
 */
G.Overhealth = (() => {
  const GOLD = '#ffd23f';
  const lab = () => !!(G.Lab && G.Lab.active);
  const of = pl => (pl && pl._oh) || 0;

  /** What of a hit of d is left for HP after the Overhealth took its part. */
  function absorb(pl, d) {
    const oh = of(pl);
    if (!oh || !(d > 0)) return d;
    const take = Math.min(oh, d);
    pl._oh = oh - take;
    return d - take;
  }
  function grant(pl, amount) {
    if (!(amount > 0)) return;
    const before = of(pl);
    pl._oh = Math.min(pl.maxHp, before + amount);
    const got = Math.round(pl._oh - before);
    if (got >= 1) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, '+' + got + ' Overhealth', GOLD);
  }

  // The berry card in the hand: in a run, its heal past max HP is noted (heal() as the card calls it, with
  // Gluttony's healMul) and given as Overhealth, and its text says so.
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const out = offer.apply(this, arguments);
    if (!Array.isArray(out) || !pl || !lab()) return out;
    for (const c of out) {
      if (c.key !== 'stat:heal' || c._oh) continue;
      const apply = c.apply, pct = (String(c.desc).match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1] || '45';
      c._oh = true;
      c.desc = `Restores ${pct}% of your HP now. Healing past your max HP becomes Overhealth, taken first by hits and lost for good (up to your max HP).`;
      c.apply = p => {
        let over = 0;
        p.heal = function (amount) {
          const a = amount * (this.abil && this.abil.healMul ? this.abil.healMul : 1);
          over += Math.max(0, this.hp + a - this.maxHp);
          return G.Player.prototype.heal.apply(this, arguments);
        };
        try { return apply.apply(this, arguments); } finally { delete p.heal; grant(p, over); }
      };
    }
    return out;
  };

  // The top left: a gold strip under the HP bar (js/ui/hud.js: x 16 + 48, y 20 + 17, 168 x 11).
  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    const r = draw.apply(this, arguments);
    const oh = of(pl);
    if (oh > 0 && !G.HUD.hpAbove) {
      const sa = G.Touch.safeArea(), x = 16 + sa.left + 48, y = 20 + sa.top + 17 + 11 + 1;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, 168, 4);
      ctx.fillStyle = GOLD; ctx.fillRect(x, y, 168 * Math.min(1, oh / pl.maxHp), 4);
      ctx.restore();
    }
    return r;
  };
  // Above your Pokémon: a gold strip over the green bar.
  const P = G.Player.prototype, pdraw = P.draw;
  P.draw = function (ctx) {
    const r = pdraw.apply(this, arguments);
    const oh = of(this);
    if (oh > 0 && this === G.Game.player && !this.remote && !this.dead && G.Game.state !== 'ui' && G.HpAbove) {
      const b = G.HpAbove.box(this);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(b.x - 1, b.y - 4, b.w + 2, 3);
      ctx.fillStyle = GOLD; ctx.fillRect(b.x, b.y - 3.5, b.w * Math.min(1, oh / this.maxHp), 2);
      ctx.restore();
    }
    return r;
  };

  return { of, absorb, grant };
})();
