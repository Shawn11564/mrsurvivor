/* ============ rare-cards.js — cartas de nivel muy raras (fork MrSurvivor) ============
 * Maestría de objetos: muy de vez en cuando (RATE por cada tanda de cartas, también al
 * cambiarlas) la última carta es esta. Desde que la eliges tienes la mejora de todos los
 * objetos que suben stats (STAT_ITEMS) sin llevarlos, y sin sus pegas: la Cinta Elección
 * ya no te ata a un movimiento y la Vidasfera no te quita vida (esas pegas sólo van con
 * pl.hasItem, es decir, llevándolos). Si llevabas uno de ellos, se te quita (si no,
 * contaría dos veces) y el hueco queda libre para los demás (Banda Focus, Cascabel
 * Concha, Casco Dentado). Si luego te sale uno de STAT_ITEMS, no se equipa: ya lo tienes.
 * Ganchos: G.LevelUp.offer (maybe), Game offerItem (has), RunUI.renderCards (.card.rare).
 * Prueba: fork/test-gameplay.cjs.
 */
G.RareCards = (() => {
  const RATE = 1 / 150;
  const STAT_ITEMS = ['choiceband', 'lifeorb', 'quickclaw', 'choicescarf', 'assaultvest', 'luckyegg', 'amuletcoin', 'leftovers'];
  const TITLE = 'Maestría de objetos', TAG = 'Muy rara';
  const DESC = 'El resto de la partida tienes la mejora de estos objetos sin llevarlos, y sin sus pegas:';
  const HAVE = 'Ya tienes su mejora (Maestría de objetos)';
  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    [TITLE, 'Item Mastery', 'Maîtrise des objets', 'Maestria degli strumenti', 'Maestria de itens', '道具精通', '道具精通'],
    [TAG, 'Very rare', 'Très rare', 'Rarissima', 'Muito rara', '极其稀有', '極其稀有'],
    [DESC, 'For the rest of the run you get the boost of these items without holding them, and without their drawbacks:',
     'Pour le reste de la partie, tu as le bonus de ces objets sans les tenir, et sans leurs défauts :',
     'Per il resto della partita hai il bonus di questi strumenti senza tenerli, e senza i loro svantaggi:',
     'Pelo resto da partida você tem o bônus destes itens sem segurá-los, e sem as desvantagens:',
     '本局剩余时间里，无需携带即可获得以下道具的加成，且没有它们的副作用：',
     '本局剩餘時間裡，無需攜帶即可獲得以下道具的加成，且沒有它們的副作用：'],
    [HAVE, 'You already have its boost (Item Mastery)', 'Tu as déjà son bonus (Maîtrise des objets)',
     'Hai già il suo bonus (Maestria degli strumenti)', 'Você já tem o bônus dele (Maestria de itens)',
     '你已拥有它的加成（道具精通）', '你已擁有它的加成（道具精通）']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  let force = false;          // menú de admin: la próxima tanda trae la carta seguro

  function card() {
    // La lista de objetos ya en tu idioma (la frase entera no está en los diccionarios).
    const names = STAT_ITEMS.map(id => G.I18n.t(G.Items.BY[id].name)).join(', ');
    return {
      w: 0, type: 'up', rare: true, key: 'rare:items',
      icon: 'crown', color: '#c47bff', tag: TAG,
      title: TITLE, desc: DESC + ' <b>' + names + '</b>.',
      apply: master
    };
  }

  /** Eliges la carta. */
  function master(pl) {
    if (pl.innate) return;
    if (pl.item && STAT_ITEMS.includes(pl.item)) pl.equip(null);
    for (const id of STAT_ITEMS) G.Items.BY[id].on(pl);
    pl.innate = new Set(STAT_ITEMS);
    G.FX.ring(pl.x, pl.y, 8, 140, '#c47bff', 0.9, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#e2c2ff', 50, 260);
    G.Audio.sfx('legend');
  }

  /** G.LevelUp.offer: a veces cambia la última carta por esta (una vez por partida). */
  function maybe(pl, picked) {
    if (pl.innate || !picked.length || (!force && Math.random() >= RATE)) return;
    force = false;
    picked[picked.length - 1] = card();
  }

  return {
    RATE, STAT_ITEMS, HAVE, maybe, master,
    /** Game offerItem: ¿ese objeto ya te lo da la carta? */
    has(pl, id) { return !!(pl.innate && pl.innate.has(id)); },
    forceNext() { force = true; }
  };
})();
