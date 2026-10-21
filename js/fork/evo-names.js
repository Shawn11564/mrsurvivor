/* ============ evo-names.js — evoluciones sin nombres de otros movimientos (fork MrSurvivor) ============
 * Arriba, cada movimiento al evolucionar toma el nombre de otro movimiento de los juegos (Bola Sombra
 * -> Golpe Fantasma, Placaje -> Derribo...). En este fork muchos de esos son movimientos de verdad del
 * modo Lab, y varios FIRMAS (Fuego Sagrado de Ho-Oh, Voltio Cruel de Pikachu, Golpe Umbrío de
 * Giratina...): el mismo nombre era dos movimientos distintos, uno con firma y otro sin ella.
 * Aquí esas evoluciones pasan a otro movimiento de verdad del mismo tipo que el juego no usa en ningún
 * sitio (ni arriba ni en el Lab), con el nombre oficial en cada idioma (PokeAPI; en portugués de Brasil,
 * el inglés de los juegos). Sólo el nombre: lo que gana al evolucionar no cambia. Los ★ de "was" son firmas.
 * La evolución de Vuelo del Lab (js/fork/lab/lab-moves.js) va allí: Dual Wingbeat, no Sky Attack.
 * fork/build.cjs lo lee también para las páginas del sitio (FORK_TEXTS y FORK_EVO_NAMES).
 * Prueba: fork/test-shadow-force.cjs (ninguna evolución se llama como un movimiento del Lab).
 */
(() => {
  // id, nombre evolucionado: español (la clave, como en js/data/moves.js), inglés, francés, italiano,
  // portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ["shadow-ball", "Poltergeist", "Poltergeist", "Esprit Frappeur", "Poltergeist", "Poltergeist", "灵骚", "靈騷"],   // was Phantom Force
    ["ominous-wind", "Marcha Espectral", "Infernal Parade", "Cortège Funèbre", "Corteo Spettrale", "Infernal Parade", "群魔乱舞", "群魔亂舞"],   // was Shadow Force ★
    ["tackle", "Atizar", "Slam", "Souplesse", "Schianto", "Slam", "摔打", "摔打"],   // was Take Down
    ["quick-attack", "Amago", "Feint", "Ruse", "Fintoattacco", "Feint", "佯攻", "佯攻"],   // was Extreme Speed ★
    ["fire-spin", "Danza Llama", "Fiery Dance", "Danse du Feu", "Voldifuoco", "Fiery Dance", "火之舞", "火之舞"],   // was Sacred Fire ★
    ["bubble", "Salpicar", "Water Spout", "Giclédo", "Zampillo", "Water Spout", "喷水", "噴水"],   // was Surf
    ["hydro-pump", "Tajo Acuático", "Aqua Cutter", "Tranch'Aqua", "Idrotaglio", "Aqua Cutter", "水波刀", "水波刀"],   // was Hydro Cannon ★
    ["giga-drain", "Ciclón de Hojas", "Leaf Tornado", "Phytomixeur", "Vorticerba", "Leaf Tornado", "青草搅拌器", "青草攪拌器"],   // was Frenzy Plant ★
    ["discharge", "Carga Parábola", "Parabolic Charge", "Parabocharge", "Caricaparabola", "Parabolic Charge", "抛物面充电", "拋物面充電"],   // was Electric Terrain
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
    ["night-slash", "Giro Vil", "Brutal Swing", "Centrifugifle", "Vorticolpo", "Brutal Swing", "狂舞挥打", "狂舞揮打"]   // was Darkest Lariat ★
  ];
  const RENAME = Object.fromEntries(ROWS.map(r => [r[0], r[1]]));
  if (G.Moves && G.Moves.EVO) for (const id in RENAME) if (G.Moves.EVO[id]) G.Moves.EVO[id] = [RENAME[id]].concat(G.Moves.EVO[id].slice(1));
  G.FORK_EVO_NAMES = Object.assign(G.FORK_EVO_NAMES || {}, RENAME);
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => {
    const names = Object.fromEntries(ROWS.map(r => [r[1], r[i + 2]]));
    G.I18n.add(names, l);
    G.I18n.add(names, l, 'move');          // G.T(name, 'move'): cartas y HUD
  });
})();
