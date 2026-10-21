/* ============ coop-random.js — Pokémon al azar en la sala (MrSurvivor) ============
 * En la sala, "Pokémon al azar" elige uno de los tuyos (con la rareza mínima del botón del
 * menú, G.Settings 'randMin') y lo lleva a la sala en vez de tu compañero, que no cambia
 * (como la partida al azar en solitario). Se puede volver a tirar o volver a tu compañero.
 * Los listos siguen igual: elegir no te pone listo ni empieza nada, y mientras estás listo
 * no se puede cambiar (así nadie cambia de Pokémon en plena cuenta atrás).
 * Dura lo que dure la sala. Lo usan js/net/social.js (mine) y G.Flow.startCoop (js/game.js).
 * get() lleva `rad: true` si ese Pokémon va radiante (js/fork/radiant.js), y entonces también
 * sin elegir al azar: así la ficha de la sala dice a los demás que te vean radiante.
 * Cambiar de compañero, de shiny o de radiante fuera de la sala (menú, colección) también llega
 * a la sala al momento: todo eso se guarda con G.DB.commit, que aquí mira si tu plaza de la sala
 * ya no coincide con tu Pokémon (si no, los demás te veían con el viejo hasta la partida siguiente).
 * Lo comprueba fork/test-coop-random.cjs.
 */
(() => {
  const $ = id => document.getElementById(id);
  let pick = null;                      // { dex, shiny } o null (tu compañero)

  const pool = () => {
    const owned = Object.keys(G.DB.save.owned).map(Number).filter(d => G.DEX_BY[d]);
    const m = G.Settings.get('randMin') | 0, min = m >= 1 && m <= 5 && owned.some(d => G.DEX_BY[d].rarity >= m) ? m : 1;
    return owned.filter(d => G.DEX_BY[d].rarity >= min);
  };
  // Tu plaza en la sala, si no coincide con tu Pokémon (G.Social.mine), se pone al día.
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

  // Los botones, debajo de las tarjetas de la sala.
  const members = $('lobby-members');
  if (members) {
    members.insertAdjacentHTML('afterend', `<div class="row lobby-rand" style="margin-top:10px;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="lobby-rand" class="btn small ghost" type="button" data-sfx="confirm"></button>
      <button id="lobby-partner" class="btn small ghost hidden" type="button"></button>
      <small id="lobby-rand-note" class="sub"></small></div>`);
    $('lobby-rand').onclick = roll;
    $('lobby-partner').onclick = back;
    G.Social.on(() => {
      if (!G.Social.room) pick = null;         // fuera de la sala, se olvida
      update();
    });
    const open = G.LobbyUI.open;
    G.LobbyUI.open = function () { const r = open.apply(this, arguments); update(); return r; };
  }

  // Textos: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Otro al azar', 'Reroll', 'Un autre au hasard', 'Un altro a caso', 'Outro aleatório', '再随机一个', '再隨機一個'],
    ['Volver a mi compañero', 'Back to my partner', 'Revenir à mon partenaire', 'Torna al mio compagno', 'Voltar ao meu parceiro', '换回我的伙伴', '換回我的夥伴'],
    ['Quita "Estoy listo" para cambiar de Pokémon.', 'Un-ready to change Pokémon.', 'Annule « Je suis prêt » pour changer de Pokémon.',
     'Togli "Sono pronto" per cambiare Pokémon.', 'Desmarque "Estou pronto" para trocar de Pokémon.', '取消“准备好了”才能更换宝可梦。', '取消「準備好了」才能更換寶可夢。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  // Fork: con `rad` si va radiante (js/fork/radiant.js), también con tu compañero de siempre.
  function get() {
    const s = G.DB.save, p = pick || (G.Radiant && G.Radiant.wants(s.partner)
      ? { dex: s.partner, shiny: !!s.partnerShiny && G.DB.ownsShiny(s.partner) } : null);
    return p && G.Radiant && G.Radiant.wants(p.dex) ? Object.assign({}, p, { rad: true }) : p;
  }

  G.LobbyPick = { get, roll, back };
})();
