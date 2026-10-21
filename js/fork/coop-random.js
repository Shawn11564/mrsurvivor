/* ============ coop-random.js — random Pokémon in the lobby (MrSurvivor) ============
 * In the lobby, "Pokémon al azar" (Random Pokémon) picks one of yours (with the minimum rarity from the
 * menu button, G.Settings 'randMin') and brings it to the lobby instead of your partner, which doesn't change
 * (like the random run in solo). You can reroll or go back to your partner.
 * Ready states stay as they are: picking doesn't make you ready or start anything, and while you're ready
 * you can't change (so nobody switches Pokémon in the middle of the countdown).
 * It lasts as long as the lobby. Used by js/net/social.js (mine) and G.Flow.startCoop (js/game.js).
 * get() carries `rad: true` if that Pokémon is radiant (js/fork/radiant.js), and then also
 * without a random pick: that way the lobby card tells the others to show you as radiant.
 * Switching partner, shiny or radiant outside the lobby (menu, collection) also reaches
 * the lobby right away: all of that is saved with G.DB.commit, which here checks whether your lobby seat
 * no longer matches your Pokémon (before, the others saw you with the old one until the next run).
 * Checked by fork/test-coop-random.cjs.
 */
(() => {
  const $ = id => document.getElementById(id);
  let pick = null;                      // { dex, shiny } or null (your partner)

  const pool = () => {
    const owned = Object.keys(G.DB.save.owned).map(Number).filter(d => G.DEX_BY[d]);
    const m = G.Settings.get('randMin') | 0, min = m >= 1 && m <= 5 && owned.some(d => G.DEX_BY[d].rarity >= m) ? m : 1;
    return owned.filter(d => G.DEX_BY[d].rarity >= min);
  };
  // Your lobby seat gets updated if it doesn't match your Pokémon (G.Social.mine).
  const same = (a, b) => a.dex === b.dex && !!a.shiny === !!b.shiny && !!a.rad === !!b.rad;
  function syncSeat() {
    const r = G.Social.room, seat = r && r.members.find(x => x.uid === G.Social.uid);
    if (seat && !same(seat, G.Social.mine())) G.Social.refreshMember();
  }
  const commit = G.DB.commit;
  G.DB.commit = function () { const res = commit.apply(this, arguments); syncSeat(); return res; };

  const meReady = () => { const r = G.Social.room, m = r && r.members.find(x => x.uid === G.Social.uid); return !!(m && m.ready); };

  function roll() {
    if (!G.Social.room || meReady()) return;
    const list = pool().filter(d => !pick || d !== pick.dex);
    if (!list.length) return;
    const dex = G.U.pick(list);
    pick = { dex, shiny: G.ShinyPref ? G.ShinyPref.wants(dex) : G.DB.ownsShiny(dex) };
    G.UI.toast(G.I18n.f('¡Te toca {x}!', G.DEX_BY[dex].name), 2400);
    G.Social.refreshMember();
    update();
  }
  function back() {
    if (meReady()) return;
    pick = null;
    G.Social.refreshMember();
    update();
  }

  function update() {
    const ready = meReady();
    $('lobby-rand').disabled = ready || pool().length < (pick ? 2 : 1);
    $('lobby-rand').textContent = G.T(pick ? 'Otro al azar' : 'Pokémon al azar');
    $('lobby-partner').textContent = G.T('Volver a mi compañero');
    $('lobby-partner').classList.toggle('hidden', !pick);
    $('lobby-partner').disabled = ready;
    $('lobby-rand-note').textContent = ready ? G.T('Quita "Estoy listo" para cambiar de Pokémon.') : '';
  }

  // The buttons, under the lobby cards.
  const members = $('lobby-members');
  if (members) {
    members.insertAdjacentHTML('afterend', `<div class="row lobby-rand" style="margin-top:10px;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="lobby-rand" class="btn small ghost" type="button" data-sfx="confirm"></button>
      <button id="lobby-partner" class="btn small ghost hidden" type="button"></button>
      <small id="lobby-rand-note" class="sub"></small></div>`);
    $('lobby-rand').onclick = roll;
    $('lobby-partner').onclick = back;
    G.Social.on(() => {
      if (!G.Social.room) pick = null;         // outside the lobby, it's forgotten
      update();
    });
    const open = G.LobbyUI.open;
    G.LobbyUI.open = function () { const r = open.apply(this, arguments); update(); return r; };
  }

  // Texts: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    ['Otro al azar', 'Reroll', 'Un autre au hasard', 'Un altro a caso', 'Outro aleatório', '再随机一个', '再隨機一個'],
    ['Volver a mi compañero', 'Back to my partner', 'Revenir à mon partenaire', 'Torna al mio compagno', 'Voltar ao meu parceiro', '换回我的伙伴', '換回我的夥伴'],
    ['Quita "Estoy listo" para cambiar de Pokémon.', 'Un-ready to change Pokémon.', 'Annule « Je suis prêt » pour changer de Pokémon.',
     'Togli "Sono pronto" per cambiare Pokémon.', 'Desmarque "Estou pronto" para trocar de Pokémon.', '取消“准备好了”才能更换宝可梦。', '取消「準備好了」才能更換寶可夢。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  // Fork: with `rad` if it's radiant (js/fork/radiant.js), also with your usual partner.
  function get() {
    const s = G.DB.save, p = pick || (G.Radiant && G.Radiant.wants(s.partner)
      ? { dex: s.partner, shiny: !!s.partnerShiny && G.DB.ownsShiny(s.partner) } : null);
    return p && G.Radiant && G.Radiant.wants(p.dex) ? Object.assign({}, p, { rad: true }) : p;
  }

  G.LobbyPick = { get, roll, back };
})();
