/* ============ affixes.js — elite affixes (MrSurvivor fork) ============
 * Once the spawner is near its cap (85 % of 64: 55+ enemies alive, js/systems/spawner.js), what it sends are elites:
 * ×1.6 HP, ×1.25 damage, ×1.6 XP, and nothing on screen says so (plan C1.3). In a run, one elite in
 * CHANCE also gets an AFFIX, a readable threat with its name over it and a coloured ring at its feet:
 *   Shielded   a shield of 60 % of its HP that doesn't wear off (blue bubble, like a shielder's)
 *   Swift      ×1.4 speed
 *   Vampiric   each touch that lands heals it 10 % of its max HP
 *   Splitting  when it falls, two copies at 30 % of its HP, 60 % of its damage and 25 % of its XP
 *   Explosive  when it falls, a blast after a 0.8 s warning on the ground (its contact damage, 70 px)
 * Regular enemies only: never bosses, legendaries, Eternatus's obelisks, Meowth/Gholdengo or a split copy.
 * Co-op: the host decides. It rolls the affix and sends { k:'labaffix', a:'set', id, x } so guests show it;
 * splits and blasts happen on the host only (die() on a guest's copy returns before the loot), and reach
 * guests as new enemies ('ne') and a hazard ('hz'). A guest touched by a Vampiric one tells the host
 * ({ a:'drain', id }), which heals it.
 * Hooks: G.EnemyMgr.add (roll), G.Enemy.prototype.strike / die / draw. (G.LabBadges.enemyMark draws only
 * for enemies with a type-chart arrow, so the label hooks draw itself.) Test: fork/test-affixes.cjs.
 */
G.LabAffixes = (() => {
  const FROM = G.Spawner.CAP * 0.85, CHANCE = 1 / 3;   // the spawner's elite rule (ELITE_FROM)
  const DEF = {
    shielded: { name: 'Shielded', color: '#9fd8ff' },
    swift: { name: 'Swift', color: '#7dff9a' },
    vampiric: { name: 'Vampiric', color: '#ff4a6a' },
    splitting: { name: 'Splitting', color: '#c47bff' },
    explosive: { name: 'Explosive', color: '#ff9a3c' }
  };
  const KEYS = Object.keys(DEF);
  const SHIELD = 0.6, SWIFT = 1.4, DRAIN = 0.1, SPLIT_HP = 0.3, SPLIT_DMG = 0.6, SPLIT_XP = 0.25, BLAST_R = 70, BLAST_DELAY = 0.8;
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const regular = e => !e.boss && !e.legend && !e.wildLegend && !e.judge && !e.obelisk && !e._split && e.behavior !== 'thief';

  function send(to, msg) {
    msg.k = 'labaffix';
    if (to) { G.Net.send(to, msg); return; }
    if (G.Coop.active && G.Coop.isHost) for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }

  /** Authority: gives e the affix (its effect and its look), and tells the guests. */
  function give(e, x) {
    if (!DEF[x] || e.affix) return false;
    e.affix = x;
    if (x === 'shielded') { e.shield = Math.max(e.shield || 0, Math.round(e.maxHp * SHIELD)); e.shieldT = 1e9; }
    if (x === 'swift') e.spd *= SWIFT;
    return true;
  }

  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    let x = null;
    if (e && !e.remote && !e.affix && lab() && authority() && regular(e) && G.EnemyMgr.count >= FROM && Math.random() < CHANCE) {
      x = KEYS[Math.floor(Math.random() * KEYS.length)];
      give(e, x);
    }
    const r = add.apply(this, arguments);
    if (x) send(null, { a: 'set', id: e.id, x });
    return r;
  };
  /** Authority, for the checks: this enemy (already in the fight) gets affix x, guests told. */
  function tag(e, x) { if (!give(e, x)) return false; send(null, { a: 'set', id: e.id, x }); return true; }

  const P = G.Enemy.prototype;
  const strike = P.strike;
  P.strike = function (pl) {
    if (this.affix === 'vampiric' && !this.dead && pl && !pl.dead && !pl.god && !(pl.invuln > 0)) {
      if (this.remote) send(G.Net.hostUid, { a: 'drain', id: this.id });
      else drain(this);
    }
    return strike.apply(this, arguments);
  };
  function drain(e) {
    if (e.dead) return;
    const h = Math.min(e.maxHp - e.hp, Math.round(e.maxHp * DRAIN));
    if (h <= 0) return;
    e.hp += h;
    G.FX.dmgText(e.x, e.y - e.bodyH - 4, '+' + h, DEF.vampiric.color);
  }

  const die = P.die;
  P.die = function () {
    const was = this.dead, r = die.apply(this, arguments);
    if (!was && this.dead && !this.remote && this.affix) {
      if (this.affix === 'splitting') split(this);
      if (this.affix === 'explosive') blast(this);
    }
    return r;
  };
  function split(e) {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * 6.2832;
      const c = new G.Enemy(e.def, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 20, { hp: 1, spd: 1, dmg: 1 });
      c._split = e.id;
      c._xpPaced = true;                   // its XP comes from the parent's, already paced (xp-pace.js)
      c.maxHp = c.hp = Math.max(1, Math.round(e.maxHp * SPLIT_HP));
      c.spd = e.spd;
      c.dmg = e.dmg * SPLIT_DMG;
      c.xp = Math.max(1, Math.round(e.xp * SPLIT_XP));
      G.EnemyMgr.add(c);
      G.FX.burst(c.x, c.y - 8, DEF.splitting.color, 8, 90);
      out.push(c);
    }
    return out;
  }
  function blast(e) {
    return G.Hazards.add({ kind: 'zone', x: e.x, y: e.y, r: BLAST_R, delay: BLAST_DELAY, dmg: e.dmg, type: e.atkType,
      color: DEF.explosive.color, cat: e.cat, boom: true, affixOf: e.id });
  }

  const draw = P.draw;
  P.draw = function (ctx) {
    const r = draw.apply(this, arguments);
    if (this.affix && !this.dead && DEF[this.affix]) mark(ctx, this);
    return r;
  };
  const SUP = { healer: 1, shielder: 1, summoner: 1 };
  function mark(ctx, e) {
    const d = DEF[e.affix];
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = d.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.35, e.r * 0.52, 0, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = '700 8px Pixelify, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const y = Math.round(e.y - e.bodyH - (SUP[e.behavior] ? 30 : 14));
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    G.I18n.rawCanvas(ctx, 'strokeText', d.name, Math.round(e.x), y);
    ctx.fillStyle = d.color;
    G.I18n.rawCanvas(ctx, 'fillText', d.name, Math.round(e.x), y);
    ctx.restore();
  }

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'labaffix' || !G.Coop.active) return;
    if (msg.a === 'set' && !G.Coop.isHost && from === G.Net.hostUid && DEF[msg.x]) {
      const put = (n = 0) => { const e = G.EnemyMgr.get(msg.id); if (e) e.affix = msg.x; else if (n < 20) setTimeout(() => put(n + 1), 150); };
      put();
    } else if (msg.a === 'drain' && G.Coop.isHost) {
      const e = G.EnemyMgr.get(msg.id);
      if (e && e.affix === 'vampiric') drain(e);
    }
  });

  return { FROM, CHANCE, DEF, KEYS, tag };
})();
