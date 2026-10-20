/* ============ shiny-pref.js — shiny por defecto si lo tienes (MrSurvivor) ============
 * Si tienes el shiny de un Pokémon, se usa y se enseña el shiny salvo que hayas elegido
 * Normal para ese Pokémon. Lo elegido se guarda en la partida (save.shinyOff: dex -> 1 =
 * prefiere Normal), así que dura entre sesiones y aparatos. Lo usa js/ui/menu.js (ficha,
 * el selector del menú, elegir compañero, la partida al azar).
 * Al conseguir el shiny de tu compañero, pasas a jugar con él (al volver al menú).
 */
(() => {
  // La primera vez, quien ya jugaba con su compañero en Normal teniendo el shiny lo eligió así: se respeta.
  function off() {
    const s = G.DB.save;
    if (!s.shinyOff) { s.shinyOff = {}; if (G.DB.ownsShiny(s.partner) && !s.partnerShiny) s.shinyOff[s.partner] = 1; }
    return s.shinyOff;
  }

  /** ¿Usar el shiny de dex? Sí si lo tienes y no has elegido Normal. */
  function wants(dex) { return G.DB.ownsShiny(dex) && !off()[dex]; }
  /** Apunta la elección (sin guardar: quien la llama hace G.DB.commit()). */
  function set(dex, shiny) { if (shiny) delete off()[dex]; else off()[dex] = 1; }

  // Al volver al menú: si has conseguido el shiny de tu compañero (gacha, salvaje...), pasas a él.
  const open = G.MenuUI.open;
  G.MenuUI.open = function () {
    const s = G.DB.save;
    if (s && !s.partnerShiny && wants(s.partner)) { s.partnerShiny = true; G.DB.commit(); }
    return open.apply(this, arguments);
  };

  G.ShinyPref = { wants, set };
})();
