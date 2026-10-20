/* ============ run-stats.js — estadísticas de la partida (fork MrSurvivor) ============
 * Al acabar: en grupo, un resumen del equipo (derrotados, caídas, rescates, daño hecho
 * y recibido de cada uno) y luego, para cada jugador, el desglose de sus ataques (daño,
 * % del total, derrotados y daño por segundo) en la pantalla de fin de siempre.
 *
 * Quién sabe qué:
 *   daño hecho      cada uno el suyo (combat.js lo suma en cada movimiento: m.dealt)
 *   daño recibido,  cada uno el suyo (Player.hurt)
 *   caídas
 *   rescates        el que estaba caído: quién tenía al lado al levantarse (game.js reviveTick)
 *   derrotados      quien manda (anfitrión, o tú en solitario): el último golpe de cada
 *                   enemigo y con qué movimiento (tag / tagRemote; el 'h' del invitado
 *                   lleva el movimiento)
 * Los invitados mandan lo suyo al anfitrión cada 3 s y al caer ('st'); el anfitrión lo
 * junta todo en el 'ov' del final (game.js summary → rs).
 * Prueba: fork/test-coop.cjs (grupo) y fork/test-gameplay.cjs (solitario).
 */
G.RunStats = (() => {
  // Textos de esta pantalla (sólo del fork). Columnas: español, inglés, francés, italiano,
  // portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Resumen del equipo', 'Team summary', 'Résumé de l’équipe', 'Riepilogo della squadra', 'Resumo da equipe', '队伍总结', '隊伍總結'],
    ['Jugador', 'Player', 'Joueur', 'Giocatore', 'Jogador', '玩家', '玩家'],
    ['Caídas', 'Downs', 'K.O.', 'K.O.', 'Quedas', '倒下', '倒下'],
    ['Rescates', 'Revives', 'Réanimations', 'Rianimazioni', 'Reanimações', '救援', '救援'],
    ['Recibido', 'Taken', 'Subis', 'Subiti', 'Recebido', '承受', '承受'],
    ['Ver mis estadísticas', 'See my stats', 'Voir mes statistiques', 'Vedi le mie statistiche', 'Ver minhas estatísticas', '查看我的数据', '查看我的數據'],
    ['% del daño', '% of damage', '% des dégâts', '% dei danni', '% do dano', '伤害占比', '傷害占比'],
    ['Daño total', 'Total damage', 'Dégâts totaux', 'Danni totali', 'Dano total', '总伤害', '總傷害'],
    ['Daño recibido', 'Damage taken', 'Dégâts subis', 'Danni subiti', 'Dano recebido', '承受伤害', '承受傷害'],
    ['Más daño del equipo', 'Most damage in the team', 'Le plus de dégâts de l’équipe', 'Più danni della squadra', 'Mais dano da equipe', '队伍中伤害最高', '隊伍中傷害最高'],
    ['Tú', 'You', 'Toi', 'Tu', 'Você', '你', '你']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  let my = null;            // lo de tu Pokémon que sólo sabe tu máquina
  let tally = {};           // quien manda: uid -> { k, mk: { movimiento: derrotados } }
  let remotes = {};         // anfitrión: uid -> lo último que ha mandado ese invitado
  let final = null;         // invitado: el equipo entero, del 'ov' del anfitrión
  let sendT = 0;
  const SEND_EVERY = 3;

  // Tu id: el de la cuenta en grupo; también al pintar el final, cuando el grupo ya se ha
  // cerrado (si no, no se encontraba tu fila y salían 0 derrotados por movimiento).
  const me = () => (G.Coop.active || final ? G.Net.uid : 'me');
  const guest = () => G.Coop.active && !G.Coop.isHost;

  function reset() { my = { t: 0, dn: 0, rb: {} }; tally = {}; remotes = {}; final = null; sendT = 0; }
  reset();

  /** Lo tuyo, en corto (lo que se manda): daño, recibido, caídas, quién te levantó, daño por movimiento. */
  function snapshot() {
    const pl = G.Game.player;
    const mv = {};
    if (pl) for (const m of pl.moves) if (m.cat) mv[m.id] = Math.round(m.dealt || 0);
    return { d: Math.round(pl ? pl.dmgDealt || 0 : 0), t: Math.round(my.t), dn: my.dn, rb: my.rb, mv };
  }
  function send() { if (guest()) G.Coop.toHost(['st', snapshot()]); }

  // ---------------- lo que va pasando ----------------
  function tag(e, m) { if (e && m) { e.lastBy = me(); e.lastMove = m.id; } }
  function tagRemote(e, from, moveId) { if (e) { e.lastBy = from; e.lastMove = moveId || null; } }
  function kill(e) {
    if (!e || !e.lastBy) return;
    const t = tally[e.lastBy] = tally[e.lastBy] || { k: 0, mk: {} };
    t.k++;
    if (e.lastMove) t.mk[e.lastMove] = (t.mk[e.lastMove] || 0) + 1;
  }
  function taken(d) { my.t += d; }
  // Al caer: se manda ya, y otra vez al segundo, cuando han llegado los golpes que ya iban de
  // camino (si no, su daño faltaba en el resumen: el anfitrión espera 1,6 s antes de acabar).
  function down() { my.dn++; send(); sendT = 1; }
  function revived(uids) { for (const u of uids) my.rb[u] = (my.rb[u] || 0) + 1; send(); }
  function remote(from, st) { if (st && typeof st === 'object') remotes[from] = st; }
  function update(dt) { if (guest() && (sendT -= dt) <= 0) { sendT = SEND_EVERY; send(); } }
  function setFinal(rs) { if (Array.isArray(rs)) final = rs; }

  /** Anfitrión (o solitario): el equipo entero, en el orden de la sala. */
  function all() {
    const ms = G.Coop.active ? G.Coop.members : [{ uid: 'me', name: (G.Social.me && G.Social.me.name) || '', dex: G.Game.player && G.Game.player.dex }];
    const mine = me();
    const rows = ms.map((m, i) => {
      const st = m.uid === mine ? snapshot() : remotes[m.uid] || { d: 0, t: 0, dn: 0, rb: {}, mv: {} };
      const t = tally[m.uid] || { k: 0, mk: {} };
      return { uid: m.uid, name: m.name, dex: m.dex, color: G.Coop.COLORS[i] || '#ffcb3d', d: st.d | 0, t: st.t | 0, dn: st.dn | 0,
               rb: st.rb || {}, mv: st.mv || {}, k: t.k, mk: t.mk };
    });
    // El anfitrión lo junta al acabar (summary → 'ov'): se guarda, porque cuando se pinta
    // el final el grupo ya está cerrado.
    if (G.Coop.active && G.Coop.isHost) final = rows;
    return rows;
  }

  /**
   * El equipo al acabar: lo que mandó el anfitrión en el 'ov' (o lo que juntó él). null en
   * solitario o si no llegó (el grupo se cortó).
   */
  function party() {
    if (final) return final;
    return G.Coop.active && G.Coop.isHost ? all() : null;
  }

  /** Tu desglose: por movimiento, daño, %, derrotados y por segundo. */
  function mine(time, rows) {
    const pl = G.Game.player;
    if (!pl) return null;
    const row = (rows || []).find(r => r.uid === me()) || null;
    const mk = row ? row.mk : (tally[me()] || { mk: {} }).mk;
    const kills = row ? row.k : (tally[me()] || { k: 0 }).k;
    const total = Math.max(1, pl.dmgDealt || 0);
    const moves = pl.moves.filter(m => m.cat).map(m => ({
      id: m.id, name: m.name, lvl: m.lvl, d: Math.round(m.dealt || 0), share: (m.dealt || 0) / total,
      k: mk[m.id] || 0, dps: (m.dealt || 0) / Math.max(5, time - (m.since || 0))
    })).sort((a, b) => b.d - a.d);
    const rev = rows ? rows.reduce((a, r) => a + ((r.rb || {})[me()] || 0), 0) : null;
    return { moves, d: Math.round(pl.dmgDealt || 0), t: Math.round(my.t), dn: my.dn, k: kills, rev };
  }

  // ---------------- pantallas ----------------
  const n = v => Math.round(v).toLocaleString(G.I18n.locale);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Resumen del equipo; `next` abre tu pantalla de fin. */
  function showParty(rows, next) {
    const revOf = uid => rows.reduce((a, r) => a + ((r.rb || {})[uid] || 0), 0);
    const best = rows.reduce((b, r) => (r.d > b.d ? r : b), rows[0]);
    const el = document.createElement('section');
    el.className = 'scr dim';
    el.id = 'scr-party';
    el.style.zIndex = 60;
    el.innerHTML = `<div class="box center" style="width:min(640px,100%)">
      <h2>Resumen del equipo</h2>
      <table class="sum-moves party-sum"><tr><th>Jugador</th><th class="num">Derrotados</th><th class="num">Caídas</th><th class="num">Rescates</th>
        <th class="num">Daño</th><th class="num">Recibido</th></tr>
        ${rows.map(r => `<tr${r.uid === me() ? ' class="me"' : ''}>
          <td><i class="pdot" style="background:${r.color}"></i><b translate="no" style="color:${r.color}">${esc(r.name)}</b>
            ${r === best && r.d > 0 ? `<span title="Más daño del equipo">${G.Icons.html('crown', 12)}</span>` : ''}
            <small>${esc((G.DEX_BY[r.dex] || {}).name || '')}</small></td>
          <td class="num">${n(r.k)}</td><td class="num">${n(r.dn)}</td><td class="num">${n(revOf(r.uid))}</td>
          <td class="num">${n(r.d)}</td><td class="num">${n(r.t)}</td></tr>`).join('')}
      </table>
      <button class="btn gold" data-a="next" style="margin-top:14px">Ver mis estadísticas</button></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-a=next]').onclick = () => { el.remove(); next(); };
  }

  /** Lo de la pantalla de fin (run-ui.js showOver): tus ataques y tus números. */
  function mineHTML(s) {
    if (!s) return '';
    const pct = v => Math.round(v * 100) + ' %';
    return `<div style="grid-column:1/-1"><span>Tus ataques</span>
      <table class="sum-moves"><tr><th></th><th class="num">Daño</th><th class="num">% del daño</th><th class="num">Derrotados</th><th class="num">Por segundo</th></tr>
      ${s.moves.map(m => `<tr><td>${G.Icons.html('move:' + m.id, 16)} ${G.T(m.name, 'move')} <small>Nv.${m.lvl}</small></td>
        <td class="num">${n(m.d)}</td><td class="num">${pct(m.share)}</td><td class="num">${n(m.k)}</td><td class="num">${n(m.dps)}/s</td></tr>`).join('') || '<tr><td>—</td></tr>'}
      </table></div>
      <div><span>Daño total</span><b>${n(s.d)}</b></div>
      <div><span>Daño recibido</span><b>${n(s.t)}</b></div>
      <div><span>Caídas</span><b>${n(s.dn)}</b></div>
      ${s.rev != null ? `<div><span>Rescates</span><b>${n(s.rev)}</b></div>` : ''}`;
  }

  return { reset, tag, tagRemote, kill, taken, down, revived, remote, update, setFinal, all, party, mine, showParty, mineHTML,
           get my() { return my; }, get tally() { return tally; } };
})();
