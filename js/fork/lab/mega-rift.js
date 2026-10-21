/* ============ mega-rift.js — legendarios de grieta megaevolucionados (Lab primero, fork MrSurvivor) ============
 * En una partida Lab, desde el minuto 15, el legendario de una grieta que tiene megaevolución o
 * regresión primigenia (sprite en G.MEGA_FORMS, js/fork/mega-sprites.js: Mewtwo, Latias, Latios,
 * Kyogre, Groudon, Rayquaza...) puede salir en esa forma: 5 % a los 15 min, 15 % a los 30 y 30 % a
 * los 60 (en línea recta entre medias). Así sale con ×1,3 de vida, ×1,2 de daño y ×1,2 de
 * experiencia (lo que suelta), su sprite y "Mega" / "Primal" delante del nombre.
 * Gancho: G.EnemyMgr.add (rift.js añade al legendario con legend = true, en la arena). En grupo lo
 * decide el anfitrión: la vida y el daño ya van en su 'ne'; el sprite, con { k:'labmega', id }.
 * Prueba: fork/test-mega-rift.cjs.
 */
G.MegaRift = (() => {
  const HP = 1.3, DMG = 1.2, REW = 1.2;
  /** Probabilidad a los t segundos. */
  function chance(t) {
    if (t < 900) return 0;
    if (t < 1800) return 0.05 + (t - 900) / 900 * 0.10;
    if (t < 3600) return 0.15 + (t - 1800) / 1800 * 0.15;
    return 0.30;
  }
  const has = dex => !!(G.MEGA_FORMS && G.MEGA_FORMS[dex] && G.SPRITE_META['m' + dex]);

  /** Su aspecto de mega (también en la pantalla de los invitados). */
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
