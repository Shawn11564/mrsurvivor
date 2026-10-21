/* ============ en-fixes.js — upstream texts that had no English (MrSurvivor) ============
 * Texts upstream's game shows that its English dictionary (js/data/lang-en.js) never got, so
 * English players saw them in Spanish. Found by fork/test-english.cjs's "no Spanish left" checks,
 * which run the game's source texts and data through the English pass. The personality traits are
 * in js/fork/trait-names.js.
 */
G.I18n.add({
  // The run's end screen (js/ui/run-ui.js showOver): the shinies caught, and the coins' breakdown
  // ("tiempo 12 · derrotados 30 · recogidas 300", js/game.js; the other words were in already).
  'Shinies conseguidos': 'Shinies caught',
  'recogidas': 'Collected',
  // The co-op lobby's invite list (js/ui/social-ui.js).
  'Aún no tienes amigos añadidos.': "You haven't added any friends yet.",
  // The save dot's tooltip in the top bar (js/ui/ui.js).
  'Sin guardar en la nube: pulsa Guardar': 'Not saved to the cloud: press Save',
  'Sin conexión: pulsa Guardar cuando vuelva': "Offline: press Save when you're back online",
  // Move levels on the level-up and bond cards (js/systems/levelup.js, js/ui/run-ui.js).
  'Nv.{x}': 'Lv.{x}',
  'Nuevo · Nv.{x}': 'New · Lv.{x}',
  // The Pokédex entry's number (js/ui/menu.js).
  'Nº {x}': 'No. {x}',
  // The HUD's buff chips (js/ui/hud.js): Sp. Atk and Speed.
  'AT.E ×{x}': 'SP.ATK ×{x}',
  'VEL ×{x}': 'SPD ×{x}',
  // Forgotten password and "link your Gmail" (dev.html #forgot-note, #scr-recover).
  'Si vinculaste tu Gmail, pulsa': 'If you linked your Gmail, press',
  'con ese Gmail: es tu misma cuenta. Si no lo vinculaste, no se puede recuperar: crea una cuenta nueva (y esta vez vincula tu Gmail desde el aviso que sale al entrar).':
    "with that Gmail: it's the same account. If you didn't link it, it can't be recovered: create a new account (and this time link your Gmail from the notice you get when you sign in).",
  'Vincula tu Gmail: si un día olvidas la contraseña, pulsas': 'Link your Gmail: if you ever forget your password, press',
  'y es tu misma cuenta, con todo lo tuyo.': "and it's the same account, with everything in it."
}, 'en');
