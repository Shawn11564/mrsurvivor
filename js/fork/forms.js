/* ============ forms.js — forms held as an item, like the Mega Stone (MrSurvivor fork) ============
 * The forms in G.FORM_ITEMS (js/fork/form-items.js: Origin Giratina, Ogerpon's masks, Black/White Kyurem, Hoopa
 * Unbound, Sky Shaymin, Therian Forme, Eternal Floette, Deoxys's Formes, Rotom's appliances, Oricorio's styles)
 * aren't Pokémon of their own (js/fork/extra-dex.js): their base Pokémon takes the form while it holds the
 * form's item (one per form: 'form' + its dex, a holdable item like the others, one per run):
 *   - the form's sprite (and its shiny) and its types
 *   - the Mega Stone's bonus: +25 % damage, +10 % speed, +15 % max HP and +8 % defense (G.Mega)
 * If you swap it for another item, it goes back to how it was. Its moves and ability stay the base Pokémon's.
 * The item, if your Pokémon has forms (one of them at random, not the one you hold):
 *   - a rift legendary you beat drops it like the Mega Stone (from minute 5, 1 in 30: G.Mega.DROP_T, DROP_P);
 *   - each level up, 1 in 500 (LEVEL_P).
 * It's offered back on the map with no other screen in front, like the Mega Stone.
 * The Pokémon's card in the collection says it can change form and how (G.Mega.hint, js/ui/menu.js).
 * Co-op: { k:'form', u, f } to the host, who passes it on; everyone sees your form.
 * Hooks: G.Mega.riftWon (js/systems/rift.js), G.Game.offerItem; G.Admin.repaint draws the look (p.formKey).
 * Test: fork/test-forms.cjs.
 */
G.Forms = (() => {
  const FI = G.FORM_ITEMS || {};
  const ATK = 1.25, SPD = 1.1, HP = 0.15, DEF = 0.08;   // the Mega Stone's (js/fork/mega.js)
  const LEVEL_P = 1 / 500;                              // each level up
  const id = f => 'form' + f;
  const BY_BASE = {};
  for (const f of Object.keys(FI)) (BY_BASE[FI[f][0]] = BY_BASE[FI[f][0]] || []).push(+f);
  /** The forms dex can hold an item for ([] if none). */
  const forms = dex => BY_BASE[dex] || [];
  const nameOf = d => G.DEX_BY[d] ? G.DEX_BY[d].name : '';
  const types = d => G.DEX_BY[d].types.map(t => t[0].toUpperCase() + t.slice(1)).join('/');
  const list = names => names.length < 2 ? names[0] : names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];

  // Icons (12×12): a = the item's colour, b = its shade, w = light, y = gold, g = stem.
  const SHAPES = {
    orb: ['....kkkk....', '..kkaaaakk..', '.kawaaaaabk.', '.kwwaaaaabk.', 'kawaaaaaabbk', 'kaaaaaaaabbk',
      'kaaaaaaabbbk', 'kaaaaaaabbbk', '.kaaaaabbbk.', '.kabbbbbbbk.', '..kkbbbbkk..', '....kkkk....'],
    rock: ['............', '....kkkk....', '..kkaaaakk..', '.kawaaaabak.', '.kaaabaaaak.', 'kaaaaaaabaak',
      'kabaaaaaaabk', 'kaaaaabaaabk', '.kaaaaaaabk.', '.kkbaaabbkk.', '...kkbbkk...', '.....kk.....'],
    mask: ['............', '.kkkkkkkkkk.', 'kaaaaaaaaaak', 'kawaaaaaaabk', 'kakkkaakkkak', 'kakkkaakkkak',
      'kaaaaaaaaabk', 'kaaabbbbaabk', '.kaaaaaaabk.', '..kaaaaabk..', '...kkbbkk...', '.....kk.....'],
    dna: ['..kk....kk..', '..kak..kak..', '...kakkak...', '....kaak....', '...kawwbk...', '..kak..kbk..',
      '..kbk..kak..', '...kbkkak...', '....kbak....', '...kawwak...', '..kak..kak..', '..kk....kk..'],
    bottle: ['....kkkk....', '....kwbk....', '...kkkkkk...', '....kaak....', '...kaaaak...', '..kawaaabk..',
      '.kawaaaaabk.', '.kaaaaaaabk.', '.kaaayyaabk.', '.kaaaaaaabk.', '..kbbbbbbk..', '...kkkkkk...'],
    flower: ['.....kk.....', '....kaak....', '.kk.kaak.kk.', 'kaakkaakkaak', '.kaakyykaak.', '..kayyyyak..',
      '..kayyyybk..', '.kaakyykbak.', 'kaakkggkkbak', '.kk.kggk.kk.', '....kggk....', '.....kk.....'],
    glass: ['...kkkkkk...', '..kwwaaaak..', '.kwaaaaaaak.', '.kwaaaaaaak.', '.kaaaaaaaak.', '.kaaaaaaabk.',
      '..kaaaaabk..', '...kkkkkk...', '.....kyk....', '.....kyk....', '.....kyk....', '.....kkk....'],
    box: ['............', '.kkkkkkkkkk.', '.kaaaaaaaak.', '.kawwwwwwak.', '.kawkkkkwak.', '.kawkyykwak.',
      '.kawkkkkwak.', '.kawwwwwwak.', '.kaaaaaaaak.', '.kbbbbbbbbk.', '.kkkkkkkkkk.', '..kk....kk..'],
    nectar: ['.....kk.....', '....kaak....', '....kaak....', '...kaaaak...', '...kwaaak...', '..kwaaaaak..',
      '..kwaaaaak..', '.kaaaaaaabk.', '.kaaaaaaabk.', '.kaaaaaabbk.', '..kbbbbbbk..', '...kkkkkk...']
  };

  // ---------------- the items ----------------

  const en = {};
  for (const f of Object.keys(FI)) {
    const [base, name, shape, a, b] = FI[f];
    if (!G.DEX_BY[f] || !G.DEX_BY[base]) continue;
    const desc = `${nameOf(base)} becomes ${nameOf(f)} while holding it (${types(f)}): +25% damage, +10% speed, +15% HP and +8% defense.`;
    G.Icons.UI[id(f)] = { pal: { a, b, w: '#ffffff', y: '#ffd23f', g: '#4f9e5a' }, rows: SHAPES[shape] };
    G.Items.BY[id(f)] = { id: id(f), name, desc, form: +f, on: p => change(p, +f), off: p => back(p) };
    en[name] = name; en[desc] = desc; en[nameOf(f) + '!'] = nameOf(f) + '!';
  }
  const HINT = dex => `Can change form: ${list(forms(dex).map(nameOf))}. From minute 5, each rift legendary you defeat with it has a 1 in 30 chance to drop one of their items, and each level up a 1 in 500 chance. While holding it, it takes that form's look and types, with +25% damage, +10% speed, +15% HP and +8% defense.`;
  for (const base of Object.keys(BY_BASE)) if (G.DEX_BY[base]) en[HINT(base)] = HINT(base);
  // English already: kept as it is (the word-by-word pass would change "Core", "Fan" or "Glass").
  G.I18n.add(en, 'en');

  // ---------------- changing form ----------------

  /** p takes form f (when it takes the form's item). */
  function change(p, f) {
    if (p.form || !FI[f] || FI[f][0] !== p.dex) return;
    const hp = Math.round(p.maxHp * HP);
    p.form = { f, mon: p.mon, hp };
    p.mon = Object.assign({}, p.mon, { types: G.DEX_BY[f].types.slice() });
    p.atkMul *= ATK; p.spdMul *= SPD; p.dmgReduce += DEF;
    p.addMaxHp(hp);
    look(p, f);
    G.FX.ring(p.x, p.y, 8, 150, '#ffd23f', 0.9, 6);
    G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#fff3c4', 60, 280);
    G.Audio.sfx('legend');
    G.Camera.kick(0.6);
    G.Spawner.say(nameOf(f) + '!', 2.8, true);
    share(f);
  }

  /** Goes back to how it was (when the item comes off). */
  function back(p) {
    if (!p.form) return;
    p.mon = p.form.mon;
    p.atkMul /= ATK; p.spdMul /= SPD; p.dmgReduce -= DEF;
    p.maxHp -= p.form.hp; p.hp = Math.min(p.hp, p.maxHp);
    p.form = null;
    look(p, 0);
    share(0);
  }

  /** The form's sprite or the usual one (on your Pokémon or on a teammate's puppet). */
  function look(p, f) {
    p.formKey = f || null;
    if (f) G.Sprites.preload([f], 8000, p.shiny);
    G.Admin.repaint(p);
  }

  // ---------------- co-op ----------------

  function share(f) {
    if (!G.Coop.active) return;
    const msg = { k: 'form', u: G.Net.uid, f };
    if (G.Coop.isHost) { for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg); }
    else G.Net.toHost(msg);
  }

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'form' || !G.Coop.active || typeof msg.f !== 'number') return;
    // The host only accepts what each player sends about themselves, and passes it on; a guest, only what the host sends.
    if (G.Coop.isHost) {
      if (msg.u !== from) return;
      for (const m of G.Coop.mates) if (m.connected && m.uid !== from) G.Net.send(m.uid, msg);
    } else if (from !== G.Net.hostUid) return;
    const m = G.Coop.mate(msg.u);
    if (m && m.pl && (!msg.f || (FI[msg.f] && FI[msg.f][0] === m.pl.dex))) look(m.pl, msg.f);
  });

  // ---------------- the item: rifts and level ups ----------------

  let pending = 0, lastPl = null, lastLv = 0;
  /** One of pl's forms at random, not the one it holds (0 if none). */
  function pick(pl) {
    const fs = forms(pl.dex).filter(f => pl.item !== id(f) && G.Items.BY[id(f)]);
    return fs.length ? fs[Math.floor(Math.random() * fs.length)] : 0;
  }
  // Rift won (js/systems/rift.js calls G.Mega.riftWon): from minute 5 and with a 1 in 30 chance, like the Mega Stone.
  const riftWon = G.Mega.riftWon;
  G.Mega.riftWon = pl => {
    riftWon(pl);
    if (forms(pl.dex).length && G.Game.st.time >= G.Mega.DROP_T && Math.random() < G.Mega.DROP_P) pending++;
  };
  setInterval(() => {
    if (!G.Game) return;                           // (G.Game: dev.html may still be loading js/game.js)
    const pl = G.Game.player;
    if (!pl || G.Game.state === 'ui' || G.Game.state === 'over') { pending = 0; lastPl = null; return; }
    // Each level up, 1 in 500 (a new run starts counting from its level).
    if (pl !== lastPl) { lastPl = pl; lastLv = pl.level; }
    for (; lastLv < pl.level; lastLv++) if (forms(pl.dex).length && Math.random() < LEVEL_P) pending++;
    // It's offered back on the map, with no other screen in front (bond, cards...).
    if (!pending || G.Game.state !== 'playing' || G.Rift.inArena || pl.dead) return;
    if (['scr-bond', 'scr-item', 'scr-levelup', 'scr-pause'].some(G.UI.isOpen)) return;
    pending--;
    const f = pick(pl);
    if (f) G.Game.offerItem(id(f));
  }, 250);

  // ---------------- the collection ----------------

  // Its card says it can change form (under the Mega's line, if it has one).
  const hint = G.Mega.hint;
  G.Mega.hint = dex => hint(dex) + (forms(dex).some(f => G.Items.BY[id(f)])
    ? `<p class="mega-hint">${G.Icons.html(id(forms(dex)[0]), 14)} ${HINT(dex)}</p>` : '');

  return { forms, id, LEVEL_P, HINT };
})();
