/* ============ net-stats.js — the connection to your teammates, on screen (MrSurvivor fork) ============
 * Settings → Graphics, for everyone: "Estadísticas de red" (Network stats, off). In a co-op run, bottom
 * right (above the FPS): per teammate, their ping (the round-trip time of the candidate pair
 * in use, from RTCPeerConnection.getStats: G.Net.peerStats, a fork getter in js/net/net.js) and the jitter
 * (how much the ping varies from one sample to the next, on average), and your FPS. Only on your screen: it
 * sends nothing over the network. Measured once per second. Test: fork/test-net-stats.cjs.
 */
G.NetStats = (() => {
  const on = () => !!G.Settings.get('netStats');
  const S = new Map();                 // uid -> { rtt, jit, last }
  let fps = 0, frames = 0, t0 = performance.now();

  (function count() {
    frames++;
    const now = performance.now();
    if (now - t0 >= 1000) { fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; }
    requestAnimationFrame(count);
  })();

  /** Ping of the candidate pair in use (ms), or null. */
  function rttOf(report) {
    if (!report) return null;
    let pair = null, tid = null;
    report.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) tid = r.selectedCandidatePairId; });
    report.forEach(r => { if (r.type === 'candidate-pair' && (r.id === tid || (!tid && r.nominated && r.state === 'succeeded'))) pair = pair || r; });
    return pair && typeof pair.currentRoundTripTime === 'number' ? pair.currentRoundTripTime * 1000 : null;
  }
  /** A new sample for u (ms): the ping, and the jitter as a moving average of the change from the last one. */
  function sample(u, ms) {
    if (ms == null) return;
    const s = S.get(u) || { rtt: ms, jit: 0, last: ms };
    s.jit = s.jit * 0.7 + Math.abs(ms - s.last) * 0.3;
    s.last = ms; s.rtt = ms;
    S.set(u, s);
  }
  setInterval(() => {
    if (!on() || !G.Coop.active || !G.Net.peerStats) return;
    for (const u of G.Net.peers()) G.Net.peerStats(u).then(r => sample(u, rttOf(r))).catch(() => {});
  }, 1000);

  function lines() {
    const out = [];
    for (const m of G.Coop.mates) {
      const s = S.get(m.uid);
      out.push({ col: m.color || '#eaf2ff', text: `${m.name}: ${s ? Math.round(s.rtt) + ' ms · ±' + Math.round(s.jit) + ' ms' : '…'}` });
    }
    out.push({ col: fps >= 50 ? '#5fe08a' : fps >= 30 ? '#ffd23f' : '#ff5f6d', text: fps + ' FPS' });
    return out;
  }

  const draw = G.HUD.draw;
  G.HUD.draw = function (ctx, w, h) {
    const r = draw.apply(this, arguments);
    if (!on() || !G.Coop.active) return r;
    ctx.save();
    ctx.font = '700 10px Pixelify, monospace';
    ctx.textAlign = 'right';
    const L = lines(), y0 = h - 24 - (G.Settings.get('fps') ? 14 : 0);
    L.slice().reverse().forEach((l, i) => {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      const tw = ctx.measureText(l.text).width;
      ctx.fillRect(w - 14 - tw, y0 - i * 13 - 10, tw + 8, 12);
      ctx.fillStyle = l.col;
      G.I18n.rawCanvas(ctx, 'fillText', l.text, w - 10, y0 - i * 13);
    });
    ctx.restore();
    return r;
  };

  if (G.RadiantGlow) {
    const row = G.RadiantGlow.settingsRow;
    G.RadiantGlow.settingsRow = function () {
      const v = on();
      return row.apply(this, arguments) + `<div class="set-row"><div class="grow"><b>${G.T('Estadísticas de red')}</b><small>${G.T('En cooperativo, abajo a la derecha: el ping y el jitter con cada compañero, y tus FPS.')}</small></div>
        <button class="btn small switch ${v ? 'gold' : ''}" data-k="netStats">${v ? 'Sí' : 'No'}</button></div>`;
    };
  }
  const ROWS = [
    ['Estadísticas de red', 'Network stats', 'Statistiques réseau', 'Statistiche di rete', 'Estatísticas de rede', '网络状态', '網路狀態'],
    ['En cooperativo, abajo a la derecha: el ping y el jitter con cada compañero, y tus FPS.', 'In co-op, bottom right: the ping and jitter with each teammate, and your FPS.',
     'En coopération, en bas à droite : le ping et la gigue avec chaque coéquipier, et vos FPS.', 'In cooperativa, in basso a destra: ping e jitter con ogni compagno, e i tuoi FPS.',
     'No cooperativo, embaixo à direita: o ping e o jitter com cada companheiro, e seus FPS.', '合作模式中显示在右下角：与每位队友的延迟和抖动，以及你的帧率。', '合作模式中顯示在右下角：與每位隊友的延遲和抖動，以及你的幀率。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { rttOf, sample, lines, get fps() { return fps; }, S };
})();
