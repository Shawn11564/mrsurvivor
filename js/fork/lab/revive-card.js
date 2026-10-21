/* ============ revive-card.js — la carta de Revivir (Lab primero, fork MrSurvivor) ============
 * En una partida Lab, a veces (RATE por tanda, desde el nivel 5, si no llevas ya una) la última carta
 * de subir de nivel es "Revive": la guardas en su propio hueco (un corazón junto a tu vida).
 *   - Solo: al caer, te levantas en el acto con el 50 % de la vida, 3 s intocable, y los enemigos de
 *     alrededor salen despedidos. Se gasta.
 *   - En grupo: al caer eliges cuándo usarla (R, o el botón en pantalla) o esperas a que te levante un
 *     compañero, como siempre (y entonces no se gasta).
 * Ganchos: G.LevelUp.offer (la carta), Player.hurt (solo), G.HUD.draw (el hueco y el botón, antes de
 * js/fork/ui-scale.js). Textos en inglés, como el Lab. Prueba: fork/test-revive-card.cjs.
 */
G.ReviveCard = (() => {
  const RATE = 1 / 25, MIN_LEVEL = 5, HP = 0.5, SAFE = 3, PUSH_R = 150;
  let force = false;
  const can = pl => !!(pl && G.Lab && G.Lab.active && !pl.remote && !(pl.selfRevive > 0) && pl.level >= MIN_LEVEL);

  function card() {
    return {
      w: 0, type: 'up', rare: true, key: 'rare:revive', icon: 'heart', color: '#ff8acb', tag: 'Rare',
      title: 'Revive',
      desc: 'Kept in its own slot: when you fall, get back up with 50% HP, 3 s untouchable, and the enemies around you are thrown back. In co-op you choose when to use it.',
      apply: p => { p.selfRevive = 1; G.FX.ring(p.x, p.y, 8, 90, '#ff8acb', 0.6, 5); G.Audio.sfx('legend'); }
    };
  }
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const out = offer.apply(this, arguments);
    if (Array.isArray(out) && out.length && can(pl) && (force || Math.random() < RATE)) { force = false; out[out.length - 1] = card(); }
    return out;
  };

  /** Usar la que llevas: arriba con la mitad de la vida, intocable, y los de cerca salen despedidos. */
  function use(pl) {
    if (!pl || !pl.dead || !(pl.selfRevive > 0)) return false;
    pl.selfRevive--;
    pl.revive(HP);
    pl.invuln = SAFE;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || G.U.dist2(e.x, e.y, pl.x, pl.y) > PUSH_R * PUSH_R) continue;   // todos (la rejilla de queryCircle es de este fotograma)
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.hurt(1, '#ff8acb', nx, ny, 1200);
    }
    G.FX.ring(pl.x, pl.y, 10, PUSH_R, '#ff8acb', 0.6, 6);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, 'Revive!', '#ff8acb', true);
    return true;
  }

  // Solo: en el mismo golpe que te tumba.
  const P = G.Player.prototype, hurt = P.hurt;
  P.hurt = function () {
    const was = this.dead, r = hurt.apply(this, arguments);
    if (!was && this.dead && !this.remote && !G.Coop.active && this.selfRevive > 0) use(this);
    return r;
  };

  // El hueco (junto a la vida) y, caído en grupo, el botón.
  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    const r = draw.apply(this, arguments);
    if (!pl || !(pl.selfRevive > 0)) return r;
    const sa = G.Touch.safeArea(), x = 16 + sa.left + 48 + 168 + 8, y = 20 + sa.top + 14;
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
