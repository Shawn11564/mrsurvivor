/* ============ form-items.js — the forms that are a held item, not a Pokémon (MrSurvivor fork) ============
 * Some of the forms js/fork/extra-dex-data.js adds are, in the games, a Pokémon you already have changing shape
 * while it holds an item (Origin Giratina, Ogerpon's masks), fusing (Black/White Kyurem) or switching forme
 * (Rotom's appliances, Deoxys). Here they work like the Mega Stone (js/fork/forms.js): no gacha, collection,
 * pools or trades (js/fork/extra-dex.js leaves them out of G.DEX); the base Pokémon holds the form's item in a run.
 *   G.FORM_ITEMS   form dex -> [base dex, item name, icon shape, main colour, dark colour]
 * fork/build.cjs reads it too (no site pages for them). Test: fork/test-forms.cjs.
 */
G.FORM_ITEMS = {
  1557: [386, 'Attack Meteorite', 'rock', '#e0503c', '#8c2a20'],
  1558: [386, 'Defense Meteorite', 'rock', '#4f9e5a', '#2a5e34'],
  1559: [386, 'Speed Meteorite', 'rock', '#4fb4ff', '#2a6fb0'],
  1562: [479, 'Microwave Oven', 'box', '#ff8a3c', '#b04d18'],
  1563: [479, 'Washing Machine', 'box', '#4fb4ff', '#2a6fb0'],
  1564: [479, 'Refrigerator', 'box', '#bfe8ff', '#6aa6c8'],
  1565: [479, 'Electric Fan', 'box', '#c9a6ff', '#7a58b8'],
  1566: [479, 'Lawn Mower', 'box', '#6fd06a', '#3a8a36'],
  1567: [487, 'Griseous Core', 'orb', '#ffd23f', '#9a7a18'],
  1568: [483, 'Adamant Crystal', 'orb', '#8fd8ff', '#3a7ab0'],
  1569: [484, 'Lustrous Globe', 'orb', '#ff9ad8', '#a8508a'],
  1570: [492, 'Gracidea', 'flower', '#ff8ac8', '#b04880'],
  1573: [645, 'Reveal Glass', 'glass', '#ffb347', '#a86a18'],
  1574: [646, 'DNA Splicers (Zekrom)', 'dna', '#5a6a8a', '#2a3450'],
  1575: [646, 'DNA Splicers (Reshiram)', 'dna', '#f0f0f0', '#a8a8b8'],
  1577: [670, 'Eternal Flower', 'flower', '#ff5f6d', '#a02a38'],
  1583: [720, 'Prison Bottle', 'bottle', '#c9a6ff', '#7a58b8'],
  1584: [741, 'Yellow Nectar', 'nectar', '#ffe14f', '#b09a18'],
  1585: [741, 'Pink Nectar', 'nectar', '#ff9ad8', '#a8508a'],
  1586: [741, 'Purple Nectar', 'nectar', '#a87aff', '#5a38a8'],
  1594: [905, 'Reveal Glass', 'glass', '#ff9ad8', '#a8508a'],
  1595: [1017, 'Wellspring Mask', 'mask', '#4fb4ff', '#2a6fb0'],
  1596: [1017, 'Hearthflame Mask', 'mask', '#e0503c', '#8c2a20'],
  1597: [1017, 'Cornerstone Mask', 'mask', '#b8a68a', '#6a5a40']
};
