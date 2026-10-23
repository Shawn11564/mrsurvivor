/* ============ move-text.js — move texts (MrSurvivor fork) ============
 * 1. English descriptions that didn't say what the move does (Lick "paralyzes" but
 *    only slows; Bubble comes out in a ring, not a fan...). Only the English changes, under the
 *    same Spanish key: so lang-en.js and the other languages stay as they are (fewer conflicts
 *    when pulling upstream changes). Hex does change in every language: it now counts stunned foes too.
 * 2. G.MoveText.tipNotes: what a move's box in the bar says (hud.js drawTip)
 *    under the type: which stat it hits with, what boosts it, and whether your Pokémon is worse at it.
 *    (No item is only physical or only special: Choice Band and Life Orb boost everything.)
 * 3. Level-up cards: the "Tu tipo" (Your type) chip goes with the type, and the weak-side note says
 *    it's because of the category (G.LevelUp.offer, before js/fork/lab/lab.js).
 * Test: fork/test-moves.cjs, fork/test-move-truth.cjs, fork/test-slow-look.cjs.
 */
(() => {
  // ---------------- 1. descriptions ----------------
  const EN = {
    'Lametazo espectral que paraliza un poco.':'A ghostly lick that slows the foes it touches.',
    'Burbujas en abanico que ralentizan a quien tocan.': 'A ring of bubbles that spreads in every direction, slowing whatever it touches.',
    'Látigos de largo alcance en arco amplio.': 'Whips that lash far out in front of you.',
    'Rayo psíquico ancho y contundente.': 'A wide psychic beam that’s hard to miss.',
    'Raíces que atrapan y machacan todo lo que tienes cerca.': 'Roots lash up from the ground and pound everything near you.',
    'Esquirlas rapidísimas que persiguen al enemigo.': 'Fires a rapid volley of ice shards that chase the enemy.',
    'Un muñeco que se queda disparando por ti.': 'Leaves a stand-in behind you that shoots nearby enemies on its own.',
    'No hace daño: acumula ATAQUE (físico) más rápido que Danza Espada.': 'Deals no damage: builds physical Attack in quicker, smaller steps than Swords Dance.',
    'Rayo helado que congela casi del todo.': 'An icy beam that heavily slows foes.',
    'Campo eléctrico permanente alrededor de ti.': 'An electric field around you that shocks everything nearby.',
    'Deja telarañas en el suelo que atrapan y frenan mucho al que las pisa.': 'Leaves sticky webs that burst when stepped on, damaging foes and greatly slowing them.',
    'Chorro perforante. Fiable a cualquier distancia.': 'A water jet that passes through the first enemy it hits.',
    'Mordisco rápido en arco corto.': 'A quick, short-range bite.',
    'Un ciclón de hojas gira amplio a tu alrededor.': 'A whirl of petals spins in a wide circle around you.',
    'Bola de fuego al enemigo más cercano.': 'Hurls a fireball at the nearest enemy, burning it.',
    'Llamas que giran a tu alrededor. Defensa constante.': 'Flames that spin around you and burn what they touch.',
    'Explota en llamas en todas las direcciones.': 'Bursts of flame in every direction that burn foes.',
    'Corres envuelto en fuego y dejas un rastro de llamas.': 'You run wrapped in fire, leaving a trail of flames that burns foes.',
    // Review of 2026-10-21 (so the text says what the code does):
    'Destello a tu alrededor.': 'A dazzling flash around you that hurts everything nearby.',
    'Remolinos de viento que te escoltan.': 'Whirlwinds that circle you and blow back the foes they hit.',
    'Embiste en arco a todo lo que tengas delante.': 'Slams everything in an arc in front of you, knocking it back.',
    'Esfera de energía que nunca falla.': 'An energy sphere that hunts down the nearest foe.',
    'Placaje con todo el peso: lento, corto y brutal.': 'A full-weight tackle: slow, short and brutal, sending foes flying.',
    'Golpe seco y potente al frente.': 'A sharp, powerful blow straight ahead that knocks foes back.',
    'Cruzas como un rayo hacia el enemigo y golpeas todo el camino.': 'You dash at the enemy like lightning, hitting everything along the way, briefly untouchable.',
    'Te lanzas en picado y cortas todo lo que cruzas.': 'You dive and slash everything you pass through, briefly untouchable.',
    'Te lanzas envuelto en llamas y quemas todo el camino.': 'You dash wrapped in flames, burning everything in your path, briefly untouchable.',
    'Cruzas entre los enemigos golpeando a todos los del camino.': 'You dash through the enemies, hitting everyone in your path, briefly untouchable.',
    'Una sombra que se escurre por el suelo hasta el enemigo.': 'A shadow that darts after the enemy.',
    'Dos meteoros de acero que aplastan donde caen.': 'Steel meteors that crush whatever they land on.',
    'Dos cuchillas de aire que buscan al enemigo.': 'Blades of air that seek out the enemy.',
    '×1,8 daño, rayo un 50% más grueso y más largo': '×1.8 damage, a 50% wider and longer beam, and 15% less cooldown'
  };
  G.I18n.add(EN, 'en');

  // Hex (combat.js hasStatus): new text in every language.
  const HEX = 'Maldición que salta entre enemigos. Mucho más daño si están quemados, envenenados, frenados o aturdidos (paralizados, congelados...).';
  G.Moves.BY_ID.hex.desc = HEX;

  // ---------------- 2. the bar's box ----------------
  const PHYS = 'Físico: pega con tu Ataque. Lo potencian Danza Espada y Danza Dragón.';
  const SPEC = 'Especial: pega con tu Ataque Especial. Lo potencia Maquinación.';
  const BUFF = { patk: 'Potencia tus ataques físicos.', satk: 'Potencia tus ataques especiales.' };
  const BUFF_CAT = { patk: 'physical', satk: 'special' };
  const BOTH = 'Potencia tus ataques físicos y especiales.';
  const COL = { physical: '#ff9a7a', special: '#c9a2ff', weak: '#ffb35c', good: '#7be08f', close: '#9fd3ff' };
  // Melee (player.js hurt) and the Lab's close-range families (G.LabKinds2.CLOSE): -25 % damage taken.
  const CLOSE = 'Cuerpo a cuerpo: mientras está activo recibes un 25 % menos de daño.';
  // The weak side, by category (it used to be "Peor para X: sólo hace un N %", which read as if it were about the move;
  // then "hits for only 71 %"; since 2026-10-22 it says how much less: "-29% damage"). English only (English first).
  const OFF = {
    physical: 'Physical move: {x} deals {x}% less damage with physical moves (it’s a special attacker).',
    special: 'Special move: {x} deals {x}% less damage with special moves (it’s a physical attacker).'
  };
  // Kept as they are by the English pass ("damage", "move"... are also Spanish keys).
  G.I18n.add({ [OFF.physical]: OFF.physical, [OFF.special]: OFF.special }, 'en');
  const offNote = (mon, cat) => {
    const f = G.Stats.fit(mon, cat);
    return f < 0.95 ? OFF[cat].replace('{x}', mon.name).replace('{x}', 100 - Math.round(f * 100)) : '';
  };
  const close = m => m.kind === 'melee' || !!(G.LabKinds2 && G.LabKinds2.CLOSE.has(m.kind));

  /** [[Spanish text, color]] for move m of pl. */
  function tipNotes(m, pl) {
    const mon = pl && pl.mon, out = [];
    if (m.cat) {
      out.push([m.cat === 'physical' ? PHYS : SPEC, COL[m.cat]]);
      // Like the level-up card (levelup.js fitNote): same text, already translated.
      const f = G.Stats.fit(mon, m.cat);
      if (mon && f < 0.95) out.push([offNote(mon, m.cat), COL.weak]);
      if (close(m)) out.push([CLOSE, COL.close]);
    } else if (BUFF[m.stat] && (m.also || []).some(a => BUFF_CAT[a.stat] && BUFF_CAT[a.stat] !== BUFF_CAT[m.stat])) {
      out.push([BOTH, COL.good]);                        // Work Up, Fillet Away (Lab): both sides
    } else if (BUFF[m.stat]) {
      out.push([BUFF[m.stat], COL[BUFF_CAT[m.stat]]]);
      if (mon && G.Stats.sideOf(mon) === BUFF_CAT[m.stat])
        out.push([`Bueno para ${mon.name}: potencia sus ataques ${BUFF_CAT[m.stat] === 'special' ? 'especiales' : 'físicos'}, su punto fuerte.`, COL.good]);
    }
    return out;
  }

  // Columns: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    [HEX, 'A curse that jumps between enemies. Much more damage if they are burned, poisoned, slowed or stunned (paralyzed, frozen...).',
     'Malédiction qui saute d’ennemi en ennemi. Bien plus de dégâts s’ils sont brûlés, empoisonnés, ralentis ou étourdis (paralysés, gelés...).',
     'Maledizione che salta tra i nemici. Molti più danni se sono scottati, avvelenati, rallentati o storditi (paralizzati, congelati...).',
     'Maldição que salta entre inimigos. Muito mais dano se estiverem queimados, envenenados, lentos ou atordoados (paralisados, congelados...).',
     '在敌人之间跳跃的诅咒。目标处于灼伤、中毒、减速或眩晕（麻痹、冰冻……）时伤害大幅提高。',
     '在敵人之間跳躍的詛咒。目標處於灼傷、中毒、減速或暈眩（麻痺、冰凍……）時傷害大幅提高。'],
    [PHYS, 'Physical: uses your Attack. Boosted by Swords Dance and Dragon Dance.',
     'Physique : utilise votre Attaque. Renforcé par Danse Lames et Danse Draco.',
     'Fisico: usa il tuo Attacco. Potenziato da Danzaspada e Dragodanza.',
     'Físico: usa seu Ataque. Fortalecido por Swords Dance e Dragon Dance.',
     '物理：使用你的攻击。剑舞和龙之舞可以强化。', '物理：使用你的攻擊。劍舞和龍之舞可以強化。'],
    [SPEC, 'Special: uses your Special Attack. Boosted by Nasty Plot.',
     'Spécial : utilise votre Attaque Spéciale. Renforcé par Machination.',
     'Speciale: usa il tuo Attacco Speciale. Potenziato da Congiura.',
     'Especial: usa seu Ataque Especial. Fortalecido por Nasty Plot.',
     '特殊：使用你的特攻。诡计可以强化。', '特殊：使用你的特攻。詭計可以強化。'],
    [CLOSE, 'Close range: you take 25% less damage while it’s active.',
     'Corps à corps : tant qu’elle est active, vous subissez 25 % de dégâts en moins.',
     'Corpo a corpo: finché è attiva subisci il 25% di danni in meno.',
     'Corpo a corpo: enquanto estiver ativo, você recebe 25% menos dano.',
     '近身：启用时受到的伤害减少25%。', '近身：啟用時受到的傷害減少25%。'],
    [BOTH, 'Boosts your physical and special moves.', 'Renforce vos attaques physiques et spéciales.',
     'Potenzia i tuoi attacchi fisici e speciali.', 'Fortalece seus ataques físicos e especiais.',
     '强化你的物理和特殊招式。', '強化你的物理和特殊招式。'],
    [BUFF.patk, 'Boosts your physical moves.', 'Renforce vos attaques physiques.', 'Potenzia i tuoi attacchi fisici.',
     'Fortalece seus ataques físicos.', '强化你的物理招式。', '強化你的物理招式。'],
    [BUFF.satk, 'Boosts your special moves.', 'Renforce vos attaques spéciales.', 'Potenzia i tuoi attacchi speciali.',
     'Fortalece seus ataques especiais.', '强化你的特殊招式。', '強化你的特殊招式。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));


  // ---------------- 3. level-up cards: "Tu tipo" ----------------
  // The "Tu tipo" (Your type) chip also required the move to be on its strong side (fit >= 95 %): with a
  // special Dragon/Water Pokémon, Dragon Claw (physical) came up without the chip and with a "71 %" note that
  // read as if it were about the move. Now the chip goes with the type (either of the two) and the note
  // says it's because of the category. Wraps G.LevelUp.offer before js/fork/lab/lab.js (which
  // removes it on signature moves). The same note is in the bar's box (tipNotes, above).
  const OLD = /Peor para [^<]*? \(lo suyo es el ataque (?:especial|físico)\)\./;
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const out = offer.apply(this, arguments);
    if (!Array.isArray(out) || !pl || !pl.mon) return out;
    for (const c of out) {
      if (c.type !== 'new' || !c.key) continue;
      const d = G.Moves.BY_ID[c.key.slice(4)];
      if (!d) continue;
      c.own = d.kind !== 'buff' && pl.mon.types.includes(d.type);
      if (typeof c.desc === 'string' && d.cat) c.desc = c.desc.replace(OLD, offNote(pl.mon, d.cat));
    }
    return out;
  };

  G.MoveText = { tipNotes, offNote };
})();
