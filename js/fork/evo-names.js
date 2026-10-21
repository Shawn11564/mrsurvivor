/* ============ evo-names.js — evolutions without other moves' names (MrSurvivor fork) ============
 * Upstream, each move takes the name of another move from the games when it evolves (Bola Sombra
 * -> Golpe Fantasma, Placaje -> Derribo...). In this fork many of those are real moves in
 * Lab mode, and several are SIGNATURES (Ho-Oh's Sacred Fire, Pikachu's Volt Tackle, Giratina's
 * Shadow Force...): the same name was two different moves, one a signature and one not.
 * Here those evolutions switch to another real move of the same type that the game uses nowhere
 * else (neither upstream nor in Lab), with the official name in each language (PokeAPI; for Brazilian
 * Portuguese, the games' English). Only the name: what it gains on evolving doesn't change. The ★ on "was" marks signatures.
 * Lab's evolution of Vuelo (Fly) (js/fork/lab/lab-moves.js) is set there: Dual Wingbeat, not Sky Attack.
 * fork/build.cjs also reads this for the site's pages (FORK_TEXTS and FORK_EVO_NAMES).
 * Test: fork/test-shadow-force.cjs (no evolution is named like a Lab move).
 */
(() => {
  // id, evolved name: Spanish (the key, as in js/data/moves.js), English, French, Italian,
  // Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    ["shadow-ball", "Poltergeist", "Poltergeist", "Esprit Frappeur", "Poltergeist", "Poltergeist", "灵骚", "靈騷"],   // was Phantom Force
    ["ominous-wind", "Marcha Espectral", "Infernal Parade", "Cortège Funèbre", "Corteo Spettrale", "Infernal Parade", "群魔乱舞", "群魔亂舞"],   // was Shadow Force ★
    ["tackle", "Atizar", "Slam", "Souplesse", "Schianto", "Slam", "摔打", "摔打"],   // was Take Down
    ["quick-attack", "Amago", "Feint", "Ruse", "Fintoattacco", "Feint", "佯攻", "佯攻"],   // was Extreme Speed ★
    ["fire-spin", "Danza Llama", "Fiery Dance", "Danse du Feu", "Voldifuoco", "Fiery Dance", "火之舞", "火之舞"],   // was Sacred Fire ★
    ["bubble", "Salpicar", "Water Spout", "Giclédo", "Zampillo", "Water Spout", "喷水", "噴水"],   // was Surf
    ["hydro-pump", "Tajo Acuático", "Aqua Cutter", "Tranch'Aqua", "Idrotaglio", "Aqua Cutter", "水波刀", "水波刀"],   // was Hydro Cannon ★
    ["giga-drain", "Ciclón de Hojas", "Leaf Tornado", "Phytomixeur", "Vorticerba", "Leaf Tornado", "青草搅拌器", "青草攪拌器"],   // was Frenzy Plant ★
    ["discharge", "Onda Voltio", "Shock Wave", "Onde de Choc", "Ondashock", "Shock Wave", "电击波", "電擊波"],   // was Electric Terrain, then Parabolic Charge (it heals in the games; this doesn't)
    ["thunderbolt", "Alto Voltaje", "Rising Voltage", "Monte-Tension", "Elettroimpennata", "Rising Voltage", "电力上升", "電力上升"],   // was Zap Cannon ★
    ["wing-attack", "Pico Taladro", "Drill Peck", "Bec Vrille", "Perforbecco", "Drill Peck", "啄钻", "啄鑽"],   // was Brave Bird
    ["dazzling-gleam", "Bruma Explosiva", "Misty Explosion", "Explo-Brume", "Nebbioscoppio", "Misty Explosion", "薄雾炸裂", "薄霧炸裂"],   // was Misty Terrain
    ["flame-wheel", "Látigo Ígneo", "Fire Lash", "Fouet de Feu", "Frusta di Fuoco", "Fire Lash", "火焰鞭", "火焰鞭"],   // was Flare Blitz
    ["seed-bomb", "Semilladora", "Bullet Seed", "Balle Graine", "Semitraglia", "Bullet Seed", "种子机关枪", "種子機關槍"],   // was Wood Hammer
    ["thunder-wave", "Electrotela", "Electroweb", "Toile Élek", "Elettrotela", "Electroweb", "电网", "電網"],   // was Volt Tackle ★
    ["mist-ball", "Sincrorruido", "Synchronoise", "Synchropeine", "Sincrumore", "Synchronoise", "同步干扰", "同步干擾"],   // was Luster Purge ★
    ["acid-spray", "Carga Tóxica", "Venoshock", "Choc Venin", "Velenoshock", "Venoshock", "毒液冲击", "毒液衝擊"],   // was Sludge Wave
    ["air-slash", "Aire Afilado", "Air Cutter", "Tranch’Air", "Aerasoio", "Air Cutter", "空气利刃", "空氣利刃"],   // was Sky Attack ★
    ["rock-tomb", "Antiaéreo", "Smack Down", "Anti-Air", "Abbattimento", "Smack Down", "击落", "擊落"],   // was Head Smash
    ["ancient-power", "Pedrada", "Rock Blast", "Boule Roc", "Cadutamassi", "Rock Blast", "岩石爆击", "岩石爆擊"],   // was Diamond Storm ★
    ["freeze-dry", "Vaho Gélido", "Frost Breath", "Souffle Glacé", "Alitogelido", "Frost Breath", "冰息", "冰息"],   // was Sheer Cold ★
    ["outrage", "Vasto Impacto", "Breaking Swipe", "Abattage", "Vastoimpatto", "Breaking Swipe", "广域破坏", "廣域破壞"],   // was Dragon Darts ★
    ["night-slash", "Giro Vil", "Brutal Swing", "Centrifugifle", "Vorticolpo", "Brutal Swing", "狂舞挥打", "狂舞揮打"],   // was Darkest Lariat ★
    // Review of 2026-10-21: names that promised healing or repeated another evolution's name.
    ["energy-ball", "Hoja Mágica", "Magical Leaf", "Feuille Magik", "Fogliamagica", "Magical Leaf", "魔法叶", "魔法葉"],   // was Giga Drain (no healing here)
    ["u-turn", "Plancha", "Lunge", "Furie-Bond", "Assalto", "Lunge", "猛扑", "猛撲"],   // was Leech Life (no healing here)
    ["hex", "Homenaje Póstumo", "Last Respects", "Hommage Posthume", "Omaggio ai KO", "Last Respects", "扫墓", "掃墓"],   // was Poltergeist, like Shadow Ball's
    ["whirlwind", "Viento Afín", "Tailwind", "Vent Arrière", "Ventoincoda", "Tailwind", "顺风", "順風"],   // was Hurricane, like Gust's in English
    ["mirror-shot", "Anclaje", "Anchor Shot", "Ancrage", "Colpo d’Ancora", "Anchor Shot", "掷锚", "擲錨"],   // was Steel Beam, like Flash Cannon's in English (and it's no beam)
    ["dragon-dance", "Estruendo Escama", "Clangorous Soul", "Dracacophonie", "Dracofonia", "Clangorous Soul", "魂舞烈音爆", "魂舞烈音爆"]   // was Bulk Up (Lab, phase 9)
  ];
  const RENAME = Object.fromEntries(ROWS.map(r => [r[0], r[1]]));
  if (G.Moves && G.Moves.EVO) for (const id in RENAME) if (G.Moves.EVO[id]) G.Moves.EVO[id] = [RENAME[id]].concat(G.Moves.EVO[id].slice(1));
  G.FORK_EVO_NAMES = Object.assign(G.FORK_EVO_NAMES || {}, RENAME);
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => {
    const names = Object.fromEntries(ROWS.map(r => [r[1], r[i + 2]]));
    G.I18n.add(names, l);
    G.I18n.add(names, l, 'move');          // G.T(name, 'move'): cards and HUD
  });
  // The English names stay as they are when the game sends its text through the dictionary again on
  // the way to the screen: its word-by-word pass made "Leaf Tornado" "Leaf Gust" (Tornado is Gust's
  // Spanish name). fork/test-english.cjs checks every English text for this.
  G.I18n.add(Object.fromEntries(ROWS.map(r => [r[2], r[2]])), 'en');
})();
