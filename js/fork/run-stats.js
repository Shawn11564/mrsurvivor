/* ============ run-stats.js — run stats (MrSurvivor fork) ============
 * At the end: in a group, a team summary (defeated, downs, revives, damage dealt
 * and taken by each player) and then, for each player, the breakdown of their attacks (damage,
 * % of the total, defeated and damage per second) on the usual end screen.
 *
 * Who knows what:
 *   damage dealt    each player their own (combat.js adds it up on each move: m.dealt)
 *   damage taken,   each player their own (Player.hurt)
 *   downs
 *   revives         the one who was down: who was next to them on getting up (game.js reviveTick)
 *   defeated        the one in charge (the host, or you in solo): the last hit on each
 *                   enemy and with which move (tag / tagRemote; the guest's 'h'
 *                   carries the move)
 * Guests send theirs to the host every 3 s and on going down ('st'); the host
 * gathers it all in the final 'ov' (game.js summary → rs).
 * Test: fork/test-coop.cjs (group) and fork/test-gameplay.cjs (solo).
 */
G.RunStats = (() => {
  // Text for this screen (fork only). Columns: Spanish, English, French, Italian,
  // Portuguese (Brazil), Simplified and Traditional Chinese.
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
    ['Más daño del equipo', 'Most damage on the team', 'Le plus de dégâts de l’équipe', 'Più danni della squadra', 'Mais dano da equipe', '队伍中伤害最高', '隊伍中傷害最高'],
    ['Tú', 'You', 'Toi', 'Tu', 'Você', '你', '你']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  let my = null;            // what only your machine knows about your Pokémon
  let tally = {};           // the one in charge: uid -> { k, mk: { move: defeated } }
  let remotes = {};         // host: uid -> the last thing that guest sent
  let final = null;         // guest: the whole team, from the host's 'ov'
  let sendT = 0;
  const SEND_EVERY = 3;

  // Your id: the account's in a group; also when drawing the end, when the group has already
  // closed (otherwise your row wasn't found and it showed 0 defeated per move).
  const me = () => (G.Coop.active || final ? G.Net.uid : 'me');
  const guest = () => G.Coop.active && !G.Coop.isHost;

  function reset() { my = { t: 0, dn: 0, rb: {} }; tally = {}; remotes = {}; final = null; sendT = 0; }
  reset();

  /** Your numbers, in short (what gets sent): damage, taken, downs, who revived you, damage per move. */
  function snapshot() {
    const pl = G.Game.player;
    const mv = {};
    if (pl) for (const m of pl.moves) if (m.cat) mv[m.id] = Math.round(m.dealt || 0);
    return { d: Math.round(pl ? pl.dmgDealt || 0 : 0), t: Math.round(my.t), dn: my.dn, rb: my.rb, mv };
  }
  function send() { if (guest()) G.Coop.toHost(['st', snapshot()]); }

  // ---------------- what happens as it goes ----------------
  function tag(e, m) { if (e && m) { e.lastBy = me(); e.lastMove = m.id; } }
  function tagRemote(e, from, moveId) { if (e) { e.lastBy = from; e.lastMove = moveId || null; } }
  function kill(e) {
    if (!e || !e.lastBy) return;
    const t = tally[e.lastBy] = tally[e.lastBy] || { k: 0, mk: {} };
    t.k++;
    if (e.lastMove) t.mk[e.lastMove] = (t.mk[e.lastMove] || 0) + 1;
  }
  function taken(d) { my.t += d; }
  // On going down: sent right away, and again a second later, once the hits already on their
  // way have arrived (otherwise their damage was missing from the summary: the host waits 1.6 s before ending).
  function down() { my.dn++; send(); sendT = 1; }
  function revived(uids) { for (const u of uids) my.rb[u] = (my.rb[u] || 0) + 1; send(); }
  function remote(from, st) { if (st && typeof st === 'object') remotes[from] = st; }
  function update(dt) { if (guest() && (sendT -= dt) <= 0) { sendT = SEND_EVERY; send(); } }
  function setFinal(rs) { if (Array.isArray(rs)) final = rs; }

  /** Host (or solo): the whole team, in lobby order. */
  function all() {
    const ms = G.Coop.active ? G.Coop.members : [{ uid: 'me', name: (G.Social.me && G.Social.me.name) || '', dex: G.Game.player && G.Game.player.dex }];
    const mine = me();
    const rows = ms.map((m, i) => {
      const st = m.uid === mine ? snapshot() : remotes[m.uid] || { d: 0, t: 0, dn: 0, rb: {}, mv: {} };
      const t = tally[m.uid] || { k: 0, mk: {} };
      return { uid: m.uid, name: m.name, dex: m.dex, color: G.Coop.COLORS[i] || '#ffcb3d', d: st.d | 0, t: st.t | 0, dn: st.dn | 0,
               rb: st.rb || {}, mv: st.mv || {}, k: t.k, mk: t.mk };
    });
    // The host gathers it at the end (summary → 'ov'): it's kept, because when the end
    // is drawn the group has already closed.
    if (G.Coop.active && G.Coop.isHost) final = rows;
    return rows;
  }

  /**
   * The team at the end: what the host sent in the 'ov' (or what it gathered itself). null in
   * solo or if it never arrived (the group dropped).
   */
  function party() {
    if (final) return final;
    return G.Coop.active && G.Coop.isHost ? all() : null;
  }

  /** Your breakdown: per move, damage, %, defeated and per second. */
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

  // ---------------- screens ----------------
  const n = v => Math.round(v).toLocaleString(G.I18n.locale);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Team summary; `next` opens your end screen. */
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
        <th class="num">Daño</th><th class="num">Daño recibido</th></tr>
        ${rows.map(r => `<tr${r.uid === me() ? ' class="me"' : ''}>
      <td><i class="pdot" style="background:${r.color}"></i><b translate="no" style="color:${r.color}">${G.PlayerNames.html(r.uid === 'me' ? G.PlayerNames.mine() : r.uid, r.name)}</b>
            ${r === best && r.d > 0 ? `<span title="Más daño del equipo">${G.Icons.html('crown', 12)}</span>` : ''}
            <small>${esc((G.DEX_BY[r.dex] || {}).name || '')}</small></td>
          <td class="num">${n(r.k)}</td><td class="num">${n(r.dn)}</td><td class="num">${n(revOf(r.uid))}</td>
          <td class="num">${n(r.d)}</td><td class="num">${n(r.t)}</td></tr>`).join('')}
      </table>
      <button class="btn gold" data-a="next" style="margin-top:14px">Ver mis estadísticas</button></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-a=next]').onclick = () => { el.remove(); next(); };
  }

  /** The end screen part (run-ui.js showOver): your attacks and your numbers. */
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
