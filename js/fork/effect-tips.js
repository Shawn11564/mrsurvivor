/* ============ effect-tips.js — what an ongoing effect does, on hover (MrSurvivor fork) ============
 * In a run, the mouse over one of the HUD's effect chips shows a box under it with what the effect does
 * and its numbers right now:
 *   buff     a stat boost from your moves (Swords Dance, Agility...): the stat, the total with its stacks
 *            (+40 % damage to physical moves...) and the time left
 *   weather  the type multipliers for everyone (Fire ×1.5 · Water ×0.5...), the HP it wears off or the
 *            speed it takes from you, your moves it changes (Ember ×1.5), and your ability's speed with it
 *   power    an altar's power: what it does and the time left
 * js/ui/hud.js says where it drew each chip (G.EffectTips.chip, one line per chip). Wraps G.HUD.draw
 * inside js/fork/ui-scale.js (it loads before it), so the mouse is already in the HUD's units.
 * Drawn on the canvas, in English, with rawCanvas (no dictionary pass). Mouse only (touch has no hover).
 * Test: fork/test-effect-tips.cjs.
 */
G.EffectTips = (() => {
  let chips = [], shown = null;
  const W = 240, PAD = 9;
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = (ctx, k, s, x, y) => G.I18n.rawCanvas(ctx, k, s, x, y);
  const pct = v => Math.round(v * 100);
  const mul = v => '×' + (Math.round(v * 100) / 100);
  const TYPE = t => G.T(G.U.TYPE_NAME[t]);

  const BUFF = {
    atk:   ['Attack boost', (v, pl) => `+${pct(v)}% damage to all your moves`],
    patk:  ['Attack boost (physical)', v => `+${pct(v)}% damage to your physical moves`],
    satk:  ['Sp. Atk boost (special)', v => `+${pct(v)}% damage to your special moves`],
    spd:   ['Speed boost', v => `+${pct(v)}% speed`],
    def:   ['Defense boost', (v, pl) => `+${pct(v)}% damage reduction (${pct(pl.reduction)}% in all, 80% at most)`],
    regen: ['Regeneration boost', v => `+${(Math.round(v * 10) / 10)} HP a second`]
  };
  const POWER = {
    dmg: ['Damage ×2', 'All your moves hit twice as hard.'],
    spd: ['+45% speed', 'You run much faster.'],
    mag: ['Magnet', 'You pull in every pickup from far away.'],
    cd:  ['−40% cooldown', 'Your moves come back much sooner.']
  };

  /** [title, color, lines] for a chip, or null. */
  function about(c, pl) {
    if (c.kind === 'buff') {
      const b = pl.buffs[c.key], d = BUFF[c.key];
      if (!b || b.n <= 0 || !d) return null;
      return [`${d[0]} ×${b.n}`, '#ffd23f', [d[1](b.n * b.amount, pl), 'From your stat-boosting moves.', `${Math.ceil(b.t)} s left.`]];
    }
    if (c.kind === 'power') {
      const pw = pl.power, d = pw && POWER[pw.def.id];
      if (!d) return null;
      return [`Altar: ${d[0]}`, pw.def.color, [d[1], `${Math.ceil(pw.t)} s left.`]];
    }
    if (c.kind === 'weather') {
      const wx = G.Weather.current;
      if (!wx) return null;
      const lines = [];
      const types = Object.keys(wx.mult).map(t => `${TYPE(t)} ${mul(G.Weather.mult(t))}`);
      lines.push(`${types.join(' · ')} damage, for you and the enemies.`);
      const mine = pl.moves.filter(m => m.cat && G.Weather.mult(m.type) !== 1).map(m => `${G.T(m.name, 'move')} ${mul(G.Weather.mult(m.type))}`);
      if (mine.length) lines.push(`Your moves: ${mine.join(', ')}.`);
      if (G.Weather.hurts(pl.mon.types)) lines.push(`It wears your HP down a little every 2 s (never to a KO). ${wx.safe.map(TYPE).join(', ')} types are safe.`);
      const sp = G.Weather.speedFor(pl.mon.types);
      if (sp < 1) lines.push(`You move ${pct(1 - sp)}% slower (Ice types don't).`);
      const ab = pl.abil, as = ab && ab.speed ? ab.speed(pl) : 1;
      if (as !== 1) lines.push(`Your ability, ${G.Mons.abilityName(pl.abilId)}: ${mul(as)} speed.`);
      lines.push(`${Math.ceil(wx.left)} s left.`);
      return [G.T(wx.name), wx.color, lines];
    }
    return null;
  }

  function wrap(ctx, text, max) {
    const out = [];
    let line = '';
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (line && raw(ctx, 'measureText', t).width > max) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  function draw(ctx, w, h, c, a) {
    const [title, color, lines] = a, inner = W - PAD * 2;
    ctx.save();
    ctx.font = F(500, 11);
    const body = lines.flatMap(l => wrap(ctx, l, inner));
    const H = PAD * 2 + 16 + body.length * 14;
    const x = G.U.clamp(c.kind === 'weather' ? c.x + c.w - W : c.x, 6, Math.max(6, w - W - 6));
    const y = G.U.clamp(c.y + c.h + 6, 6, Math.max(6, h - H - 6));
    ctx.fillStyle = 'rgba(12,18,30,.94)'; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, W, H, 8); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = F(800, 12); ctx.fillStyle = color;
    raw(ctx, 'fillText', title, x + PAD, y + PAD + 11);
    ctx.font = F(500, 11); ctx.fillStyle = '#c9d3e6';
    body.forEach((l, i) => raw(ctx, 'fillText', l, x + PAD, y + PAD + 16 + 12 + i * 14));
    ctx.restore();
  }

  const hudDraw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h, pl) {
    chips = [];
    const r = hudDraw.apply(this, arguments);
    shown = null;
    const mo = G.Touch.mouseAt;
    if (!mo || !pl || G.Game.state !== 'playing' || G.Touch.active) return r;
    const c = chips.find(c => mo.x >= c.x && mo.x <= c.x + c.w && mo.y >= c.y && mo.y <= c.y + c.h);
    const a = c && about(c, pl);
    if (a) { shown = c.kind + ':' + c.key; draw(ctx, w, h, c, a); }
    return r;
  };

  return {
    /** Where hud.js drew an effect chip (HUD units). */
    chip(kind, key, x, y, w, h) { chips.push({ kind, key, x, y, w, h }); },
    /** For tests: last frame's chips, the tooltip shown ('kind:key' or null), the HUD's scale. */
    get chips() { return chips.slice(); }, get shown() { return shown; },
    get scale() { return G.UIScale ? G.UIScale.now : 1; }
  };
})();
