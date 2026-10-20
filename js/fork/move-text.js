/* ============ move-text.js — textos de los movimientos (fork MrSurvivor) ============
 * 1. Descripciones en inglés que no decían lo que hace el movimiento (Lengüetazo "paraliza" y
 *    sólo frena; Burbuja sale en círculo, no en abanico...). Se cambia sólo el inglés, con la
 *    misma clave española: así lang-en.js y los demás idiomas siguen como están (menos conflictos
 *    al traer cambios de upstream). Infortunio sí cambia en todos: ahora también cuenta aturdidos.
 * 2. G.MoveText.tipNotes: lo que dice el recuadro de un movimiento en la barra (hud.js drawTip)
 *    bajo el tipo: con qué estadística pega y qué lo potencia, y si a tu Pokémon le va peor.
 *    (Ningún objeto es sólo físico o sólo especial: Cinta Elección o Vidasfera suben todo.)
 * Prueba: fork/test-moves.cjs.
 */
(() => {
  // ---------------- 1. descripciones ----------------
  const EN = {
    'Lametazo espectral que paraliza un poco.':'A ghostly lick that slows the foes it touches.',
    'Burbujas en abanico que ralentizan a quien tocan.': 'A ring of bubbles in every direction that slows whatever they touch.',
    'Látigos de largo alcance en arco amplio.': 'Whips that lash far out in front of you.',
    'Rayo psíquico ancho y contundente.': 'A wide psychic beam that’s hard to miss.',
    'Raíces que atrapan y machacan todo lo que tienes cerca.': 'Roots lash up from the ground and pound everything near you.',
    'Esquirlas rapidísimas que persiguen al enemigo.': 'Fires ice shards in rapid succession that chase the enemy.',
    'Un muñeco que se queda disparando por ti.': 'Leaves a doll behind you that shoots nearby enemies on its own.',
    'No hace daño: acumula ATAQUE (físico) más rápido que Danza Espada.': 'Deals no damage: builds (physical) ATTACK in quicker, smaller steps than Swords Dance.',
    'Rayo helado que congela casi del todo.': 'An icy beam that heavily slows foes.',
    'Campo eléctrico permanente alrededor de ti.': 'An electric field around you that shocks everything nearby.',
    'Deja telarañas en el suelo que atrapan y frenan mucho al que las pisa.': 'Leaves sticky webs that burst when stepped on, damaging foes and greatly slowing them.',
    'Chorro perforante. Fiable a cualquier distancia.': 'A water jet that passes through the first enemy it hits.',
    'Mordisco rápido en arco corto.': 'A quick, short-range bite.',
    'Un ciclón de hojas gira amplio a tu alrededor.': 'A whirl of petals spins widely around you.',
    'Bola de fuego al enemigo más cercano.': 'A fireball at the nearest enemy that burns.',
    'Llamas que giran a tu alrededor. Defensa constante.': 'Flames that spin around you and burn what they touch.',
    'Explota en llamas en todas las direcciones.': 'Bursts of flame in every direction that burn foes.',
    'Corres envuelto en fuego y dejas un rastro de llamas.': 'You run wrapped in fire, leaving a trail of flames that burns foes.'
  };
  G.I18n.add(EN, 'en');

  // Infortunio (combat.js hasStatus): texto nuevo en todos los idiomas.
  const HEX = 'Maldición que salta entre enemigos. Mucho más daño si están quemados, envenenados, frenados o aturdidos (paralizados, congelados...).';
  G.Moves.BY_ID.hex.desc = HEX;

  // ---------------- 2. recuadro de la barra ----------------
  const PHYS = 'Físico: pega con tu Ataque. Lo potencian Danza Espada y Danza Dragón.';
  const SPEC = 'Especial: pega con tu Ataque Especial. Lo potencia Maquinación.';
  const BUFF = { patk: 'Potencia tus ataques físicos.', satk: 'Potencia tus ataques especiales.' };
  const BUFF_CAT = { patk: 'physical', satk: 'special' };
  const COL = { physical: '#ff9a7a', special: '#c9a2ff', weak: '#ffb35c', good: '#7be08f' };

  /** [[texto en español, color]] para el movimiento m de pl. */
  function tipNotes(m, pl) {
    const mon = pl && pl.mon, out = [];
    if (m.cat) {
      out.push([m.cat === 'physical' ? PHYS : SPEC, COL[m.cat]]);
      // Como la carta de subir de nivel (levelup.js fitNote): mismo texto, ya traducido.
      const f = G.Stats.fit(mon, m.cat);
      if (mon && f < 0.95) out.push([`Peor para ${mon.name}: sólo hace un ${Math.round(f * 100)} % del daño (lo suyo es el ataque ${G.Stats.sideOf(mon) === 'special' ? 'especial' : 'físico'}).`, COL.weak]);
    } else if (BUFF[m.stat]) {
      out.push([BUFF[m.stat], COL[BUFF_CAT[m.stat]]]);
      if (mon && G.Stats.sideOf(mon) === BUFF_CAT[m.stat])
        out.push([`Bueno para ${mon.name}: potencia sus ataques ${BUFF_CAT[m.stat] === 'special' ? 'especiales' : 'físicos'}, su punto fuerte.`, COL.good]);
    }
    return out;
  }

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    [HEX, 'A curse that jumps between enemies. Much more damage if they are burned, poisoned, slowed or stunned (paralyzed, frozen...).',
     'Malédiction qui saute d’ennemi en ennemi. Bien plus de dégâts s’ils sont brûlés, empoisonnés, ralentis ou étourdis (paralysés, gelés...).',
     'Maledizione che salta tra i nemici. Molti più danni se sono scottati, avvelenati, rallentati o storditi (paralizzati, congelati...).',
     'Maldição que salta entre inimigos. Muito mais dano se estiverem queimados, envenenados, lentos ou atordoados (paralisados, congelados...).',
     '在敌人之间跳跃的诅咒。目标处于灼伤、中毒、减速或眩晕（麻痹、冰冻……）时伤害大幅提高。',
     '在敵人之間跳躍的詛咒。目標處於灼傷、中毒、減速或暈眩（麻痺、冰凍……）時傷害大幅提高。'],
    [PHYS, 'Physical: hits with your Attack. Boosted by Swords Dance and Dragon Dance.',
     'Physique : utilise votre Attaque. Renforcé par Danse Lames et Danse Draco.',
     'Fisico: usa il tuo Attacco. Potenziato da Danzaspada e Dragodanza.',
     'Físico: usa seu Ataque. Fortalecido por Swords Dance e Dragon Dance.',
     '物理：使用你的攻击。剑舞和龙之舞可以强化。', '物理：使用你的攻擊。劍舞和龍之舞可以強化。'],
    [SPEC, 'Special: hits with your Special Attack. Boosted by Nasty Plot.',
     'Spécial : utilise votre Attaque Spéciale. Renforcé par Machination.',
     'Speciale: usa il tuo Attacco Speciale. Potenziato da Congiura.',
     'Especial: usa seu Ataque Especial. Fortalecido por Nasty Plot.',
     '特殊：使用你的特攻。诡计可以强化。', '特殊：使用你的特攻。詭計可以強化。'],
    [BUFF.patk, 'Boosts your physical moves.', 'Renforce vos attaques physiques.', 'Potenzia i tuoi attacchi fisici.',
     'Fortalece seus ataques físicos.', '强化你的物理招式。', '強化你的物理招式。'],
    [BUFF.satk, 'Boosts your special moves.', 'Renforce vos attaques spéciales.', 'Potenzia i tuoi attacchi speciali.',
     'Fortalece seus ataques especiais.', '强化你的特殊招式。', '強化你的特殊招式。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  G.MoveText = { tipNotes };
})();
