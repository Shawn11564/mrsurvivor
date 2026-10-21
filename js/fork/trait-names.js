/* ============ trait-names.js — the personality traits in English (MrSurvivor) ============
 * The personality test (js/ui/test.js) shows the winning trait capitalised on the result screen
 * ("Your personality is… Impulsivo") and the starters' two traits in lower case under each one
 * ("impulsivo, valiente"). Upstream's English dictionary only had "Valiente", so the other 15 stayed
 * Spanish. The names follow the English descriptions (G.TRAIT_TEXT). Test: fork/test-english.cjs.
 */
(() => {
  const EN = {
    valiente: 'brave', impulsivo: 'impulsive', prudente: 'careful', leal: 'loyal',
    paciente: 'patient', dulce: 'kind', tímido: 'shy', travieso: 'mischievous',
    sereno: 'serene', astuto: 'clever', alegre: 'cheerful', tenaz: 'determined',
    orgulloso: 'proud', solitario: 'lone wolf', tranquilo: 'laid-back', caótico: 'chaotic'
  };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // Capitalised first: the word-by-word pass keys its words in lower case and the last one added wins,
  // so 'leal' inside 'leal, valiente' becomes 'loyal', not 'Loyal'. A whole 'Leal' is matched exactly.
  G.I18n.add(Object.fromEntries(Object.entries(EN).map(([es, en]) => [cap(es), cap(en)])), 'en');
  G.I18n.add(EN, 'en');
})();
