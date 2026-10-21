/* ============ shiny-pref.js — shiny by default if you own it (MrSurvivor) ============
 * If you own a Pokémon's shiny, the shiny is used and shown unless you've picked
 * Normal for that Pokémon. The choice is kept in the save (save.shinyOff: dex -> 1 =
 * prefers Normal), so it lasts across sessions and devices. Used by js/ui/menu.js (detail card,
 * the menu's picker, choosing a partner, the random run).
 * When you get your partner's shiny, you switch to playing with it (on returning to the menu).
 */
(() => {
  // The first time, a player already using their partner in Normal while owning the shiny chose that: it's kept.
  function off() {
    const s = G.DB.save;
    if (!s.shinyOff) { s.shinyOff = {}; if (G.DB.ownsShiny(s.partner) && !s.partnerShiny) s.shinyOff[s.partner] = 1; }
    return s.shinyOff;
  }

  /** Use dex's shiny? Yes if you own it and haven't picked Normal. */
  function wants(dex) { return G.DB.ownsShiny(dex) && !off()[dex]; }
  /** Notes the choice (without saving: the caller does G.DB.commit()). */
  function set(dex, shiny) { if (shiny) delete off()[dex]; else off()[dex] = 1; }

  // On returning to the menu: if you've got your partner's shiny (gacha, wild...), you switch to it.
  const open = G.MenuUI.open;
  G.MenuUI.open = function () {
    const s = G.DB.save;
    if (s && !s.partnerShiny && wants(s.partner)) { s.partnerShiny = true; G.DB.commit(); }
    return open.apply(this, arguments);
  };

  G.ShinyPref = { wants, set };
})();
