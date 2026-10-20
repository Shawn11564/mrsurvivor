/* ============ mega.js — megapiedras y megaevolución (fork MrSurvivor) ============
 * Al vencer al legendario de una grieta, si tu Pokémon puede megaevolucionar (tiene
 * sprite de mega en SpriteCollab: G.MEGA_FORMS, js/fork/mega-sprites.js, lo genera
 * fork/fetch-megas.py) y no la llevas ya, te ofrece su MEGAPIEDRA. Es un objeto
 * equipable como los demás (uno por partida): si llevabas otro, eliges.
 * Mientras la llevas tu Pokémon está megaevolucionado:
 *   - el sprite de la mega (y el shiny, si lo hay)
 *   - +25 % de daño, +10 % de velocidad, +15 % de vida máxima y +8 % de defensa
 *   - el tipo de la mega cuando cambia (TYPES); si no, el mismo
 * Si la cambias por otro objeto, vuelve a ser como era.
 * Cooperativo: { k:'mega', u, on } al anfitrión, que lo reparte; todos ven tu mega.
 * Ganchos: Rift won (riftWon), G.Game.offerItem; el aspecto lo pinta G.Admin.repaint.
 * Prueba: fork/test-gameplay.cjs (solitario) y fork/test-admin.cjs (grupo).
 */
G.Mega = (() => {
  // Megas que cambian de tipo (las demás conservan el del Pokémon).
  const TYPES = { 6: ['fire', 'dragon'], 334: ['dragon', 'fairy'], 383: ['ground', 'fire'], 428: ['normal', 'fighting'] };
  const ATK = 1.25, SPD = 1.1, HP = 0.15, DEF = 0.08;
  const NAME = 'Megapiedra', DESC = 'Tu Pokémon megaevoluciona mientras la lleve: +25 % de daño, +10 % de velocidad, +15 % de vida y +8 % de defensa.';
  const SAY = '¡Megaevolución!', SAY_PRIMAL = '¡Regresión primigenia!';
  const CAN = 'Puede megaevolucionar', HINT = 'Puede megaevolucionar: gana una grieta con él y te dará su Megapiedra.';
  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    [NAME, 'Mega Stone', 'Méga-Gemme', 'Megapietra', 'Mega Pedra', '超级石', '超級石'],
    [DESC, 'Your Pokémon Mega Evolves while holding it: +25% damage, +10% speed, +15% HP and +8% defense.',
     'Ton Pokémon méga-évolue tant qu’il la tient : +25 % de dégâts, +10 % de vitesse, +15 % de PV et +8 % de défense.',
     'Il tuo Pokémon megaevolve finché la tiene: +25% di danni, +10% di velocità, +15% di PS e +8% di difesa.',
     'Seu Pokémon megaevolui enquanto a segura: +25% de dano, +10% de velocidade, +15% de PS e +8% de defesa.',
     '携带时你的宝可梦会超级进化：伤害+25%，速度+10%，HP+15%，防御+8%。',
     '攜帶時你的寶可夢會超級進化：傷害+25%，速度+10%，HP+15%，防禦+8%。'],
    [SAY, 'Mega Evolution!', 'Méga-Évolution !', 'Megaevoluzione!', 'Megaevolução!', '超级进化！', '超級進化！'],
    [SAY_PRIMAL, 'Primal Reversion!', 'Primo-Résurgence !', 'Archeorisveglio!', 'Reversão Primitiva!', '原始回归！', '原始回歸！'],
    [CAN, 'Can Mega Evolve', 'Peut méga-évoluer', 'Può megaevolversi', 'Pode megaevoluir', '可以超级进化', '可以超級進化'],
    [HINT, 'Can Mega Evolve: win a rift with it and you’ll get its Mega Stone.',
     'Peut méga-évoluer : gagne une faille avec lui pour obtenir sa Méga-Gemme.',
     'Può megaevolversi: vinci una fenditura con lui e otterrai la sua Megapietra.',
     'Pode megaevoluir: vença uma fenda com ele e ganhe sua Mega Pedra.',
     '可以超级进化：带它赢下一次裂缝，就能得到它的超级石。', '可以超級進化：帶它贏下一次裂縫，就能得到它的超級石。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  /** ¿Tiene mega (con sprite)? */
  const can = dex => !!(G.MEGA_FORMS && G.MEGA_FORMS[dex] && G.SPRITE_META['m' + dex]);

  // "Puede megaevolucionar", fuera de la partida (js/ui/menu.js; estilos en css/brand.css):
  // la megapiedra en su casilla de la colección, un chip en el compañero del menú y una
  // línea en su ficha que dice cómo conseguirla. Vacíos si no tiene mega.
  const stone = (size = 14) => G.Icons.html('megastone', size);
  const badge = dex => can(dex) ? `<span class="mega-badge" title="${CAN}">${stone(18)}</span>` : '';
  const chip = dex => can(dex) ? `<span class="mega-chip" title="${CAN}">${stone()} Mega</span>` : '';
  const hint = dex => can(dex) ? `<p class="mega-hint">${stone()} ${HINT}</p>` : '';

  // Icono: una esfera azul con la doble hélice.
  G.Icons.UI.megastone = { pal: { b: '#4fb4ff', d: '#2a6fb0', w: '#e6f4ff', y: '#ffd23f', r: '#ff5f6d' }, rows: [
    '....kkkk....', '..kkbbbbkk..', '.kwbbbyrbdk.', '.kwbbyrbbdk.', 'kbbbyrbbbbdk', 'kbbbbrybbbdk',
    'kbbbbbrybbdk', 'kbbbbyrbbbdk', '.kbbyrbbbdk.', '.kbbbbbbddk.', '..kkddddkk..', '....kkkk....'] };

  // Objeto equipable (no está en G.Items.LIST: no sale en cofres, sólo de las grietas).
  G.Items.BY.megastone = { id: 'megastone', name: NAME, desc: DESC, on: p => evolve(p), off: p => revert(p) };

  // ---------------- megaevolución ----------------

  /** Tu Pokémon megaevoluciona (al ponerse la piedra). */
  function evolve(p) {
    if (p.mega || !can(p.dex)) return;
    const hp = Math.round(p.maxHp * HP);
    p.mega = { mon: p.mon, hp };
    if (TYPES[p.dex]) p.mon = Object.assign({}, p.mon, { types: TYPES[p.dex] });
    p.atkMul *= ATK; p.spdMul *= SPD; p.dmgReduce += DEF;
    p.addMaxHp(hp);
    look(p, true);
    G.FX.ring(p.x, p.y, 8, 150, '#ff8ad8', 0.9, 6);
    G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ffd3f1', 60, 280);
    G.Audio.sfx('legend');
    G.Camera.kick(0.6);
    G.Spawner.say(G.MEGA_FORMS[p.dex] === 'Primal' ? SAY_PRIMAL : SAY, 2.8, true);
    share(true);
  }

  /** Vuelve a ser como era (al quitarse la piedra). */
  function revert(p) {
    if (!p.mega) return;
    p.mon = p.mega.mon;
    p.atkMul /= ATK; p.spdMul /= SPD; p.dmgReduce -= DEF;
    p.maxHp -= p.mega.hp; p.hp = Math.min(p.hp, p.maxHp);
    p.mega = null;
    look(p, false);
    share(false);
  }

  /** El sprite de la mega o el de siempre (en tu Pokémon o en el muñeco de un compañero). */
  function look(p, on) {
    p.megaKey = on ? 'm' + p.dex : null;
    if (on) G.Sprites.preload([p.megaKey], 8000, p.shiny);
    G.Admin.repaint(p);
  }

  // ---------------- cooperativo ----------------

  function share(on) {
    if (!G.Coop.active) return;
    const msg = { k: 'mega', u: G.Net.uid, on };
    if (G.Coop.isHost) { for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg); }
    else G.Net.toHost(msg);
  }

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'mega' || !G.Coop.active || typeof msg.on !== 'boolean') return;
    // El anfitrión sólo acepta lo de cada uno sobre sí mismo, y lo reparte; el invitado, lo del anfitrión.
    if (G.Coop.isHost) {
      if (msg.u !== from) return;
      for (const m of G.Coop.mates) if (m.connected && m.uid !== from) G.Net.send(m.uid, msg);
    } else if (from !== G.Net.hostUid) return;
    const m = G.Coop.mate(msg.u);
    if (m && m.pl && can(m.pl.dex)) look(m.pl, msg.on);
  });

  // ---------------- la piedra, al ganar una grieta ----------------

  let pending = false;
  /** Rift won: si tu Pokémon puede megaevolucionar y no la llevas, te toca su piedra. */
  function riftWon(pl) {
    if (can(pl.dex) && pl.item !== 'megastone') pending = true;
  }
  // Se ofrece de vuelta en el mapa, sin otra pantalla delante (vínculo, cartas...).
  setInterval(() => {
    const pl = G.Game.player;
    if (!pending) return;
    if (!pl || G.Game.state === 'ui' || G.Game.state === 'over') { pending = false; return; }
    if (G.Game.state !== 'playing' || G.Rift.inArena || pl.dead) return;
    if (['scr-bond', 'scr-item', 'scr-levelup', 'scr-pause'].some(G.UI.isOpen)) return;
    pending = false;
    G.Game.offerItem('megastone');
  }, 250);

  return { can, riftWon, TYPES, badge, chip, hint };
})();
