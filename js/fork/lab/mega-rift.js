/* ============ mega-rift.js — Mega Evolved rift legendaries (MrSurvivor fork) ============
 * In a run, from minute 15, a rift legendary that has a Mega Evolution or
 * Primal Reversion (sprite in G.MEGA_FORMS, js/fork/mega-sprites.js: Mewtwo, Latias, Latios,
 * Kyogre, Groudon, Rayquaza...) can come in that form: 5 % at 15 min, 15 % at 30 and 30 % at
 * 60 (a straight line in between). It then has ×1.3 HP, ×1.2 damage and ×1.2
 * experience (what it drops), its own sprite and "Mega" / "Primal" before its name.
 * Hook: G.EnemyMgr.add (rift.js adds the legendary with legend = true, in the arena). In co-op the
 * host decides: HP and damage already travel in its 'ne'; the sprite, with { k:'labmega', id }.
 * Test: fork/test-mega-rift.cjs.
 */
G.MegaRift = (() => {
  const HP = 1.3, DMG = 1.2, REW = 1.2;
  /** Chance at t seconds. */
  function chance(t) {
    if (t < 900) return 0;
    if (t < 1800) return 0.05 + (t - 900) / 900 * 0.10;
    if (t < 3600) return 0.15 + (t - 1800) / 1800 * 0.15;
    return 0.30;
  }
  const has = dex => !!(G.MEGA_FORMS && G.MEGA_FORMS[dex] && G.SPRITE_META['m' + dex]);

  /** Its Mega look (on the guests' screens too). */
  function look(e) {
    if (e.megaForm) return;
    const key = 'm' + e.dex;
    e.megaForm = G.MEGA_FORMS[e.dex] === 'Primal' ? 'Primal' : 'Mega';
    e.anim = new G.Sprites.Animator(key, e.scale, !!e.shiny);
    G.Sprites.preload([key], 8000, !!e.shiny);
    e.bodyH = G.Sprites.bodyHeight(key, e.scale);
    e.name = e.megaForm + ' ' + e.name;
  }
  function megafy(e) {
    e.maxHp *= HP; e.hp = e.maxHp;
    e.dmg *= DMG;
    e.xp = Math.round((e.xp || 0) * REW);
    look(e);
  }

  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    const go = e && e.legend && !e.remote && G.Lab && G.Lab.active && G.Rift.inArena && has(e.dex)
      && Math.random() < chance(G.Game.st.time);
    if (go) megafy(e);
    const r = add.apply(this, arguments);
    if (go && G.Coop.active && G.Coop.isHost) for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, { k: 'labmega', id: e.id });
    return r;
  };
  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'labmega' || !G.Coop.active || from !== G.Net.hostUid) return;
    const tryLook = (n = 0) => { const e = G.EnemyMgr.get(msg.id); if (e) look(e); else if (n < 20) setTimeout(() => tryLook(n + 1), 150); };
    tryLook();
  });

  return { chance, has, megafy, look };
})();
