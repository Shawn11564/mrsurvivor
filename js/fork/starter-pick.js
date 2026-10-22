/* ============ starter-pick.js — pick your starter right away (MrSurvivor fork) ============
 * Upstream gives a new player a personality test (js/ui/test.js) whose result picks a starter, with
 * "Pick another" opening the grid of starters. Now a new player (after the login screen, which
 * offers an account first) goes straight to that grid: every starter with its types, starting
 * move and traits; choosing one adds it and opens the menu. The grid's Back button (to the test's
 * result) is hidden, and no personality is saved (save.personality stays null).
 * Hook: G.TestUI.start (game.js calls it when the save has no partner, also after a Player
 * Manager reset). Test: fork/test-starter-pick.cjs.
 */
(() => {
  const $ = id => document.getElementById(id);
  G.TestUI.start = function () {
    G.UI.chrome(false);
    $('res-other').click();                           // test.js openStarters, with no test result
    $('starter-back').classList.add('hidden');
  };
})();
