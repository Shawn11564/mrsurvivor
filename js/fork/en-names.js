/* ============ en-names.js — the Pokémon's English names (MrSurvivor) ============
 * js/data/pokedex.js names every Pokémon with its Spanish name from PokeAPI (tools/fetch_pokedex.py).
 * Spanish uses the English names for almost all of them, but not for Type: Null and the Paradox
 * Pokémon, so English players met "Bramaluna" instead of Roaring Moon. Upstream's English dictionary
 * only had Type: Null, and screens marked translate="no" (candy, gems, the underdog card...) skip the
 * dictionary anyway. So in English the dex itself carries the English name (G.DEX_BY shares its
 * objects), and the dictionary has them too for texts that arrive with the Spanish one. Checked against
 * the English names of all 966 (fork/test-english.cjs). fork/english.cjs puts them in the English site
 * pages too. Other languages keep upstream's Spanish key, which their own dictionaries translate.
 */
G.FORK_EN_NAMES = {
  'Código Cero': 'Type: Null',
  'Colmilargo': 'Great Tusk', 'Colagrito': 'Scream Tail', 'Melenaleteo': 'Flutter Mane',
  'Reptalada': 'Slither Wing', 'Pelarena': 'Sandy Shocks', 'Ferrosaco': 'Iron Bundle',
  'Ferropalmas': 'Iron Hands', 'Ferropolilla': 'Iron Moth', 'Ferropúas': 'Iron Thorns',
  'Bramaluna': 'Roaring Moon', 'Ferropaladín': 'Iron Valiant', 'Ondulagua': 'Walking Wake',
  'Ferroverdor': 'Iron Leaves'
};
G.I18n.add(G.FORK_EN_NAMES, 'en');
if (G.I18n.lang === 'en') for (const p of G.DEX) if (G.FORK_EN_NAMES[p.name]) p.name = G.FORK_EN_NAMES[p.name];
