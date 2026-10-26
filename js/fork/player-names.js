/* Public weekly podiums. Read the two server-owned leaderboard summaries, never peer claims.
 * DOM names retain their UID so existing screens update when standings or the week change.
 * Canvas names read the same registry each frame. Regression: fork/test-player-names.cjs.
 */
G.PlayerNames = (() => {
  const COLORS = { 1: '#ffd45a', 2: '#c9d9ee', 3: '#e3a06c' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let account = '', week = '', stops = [], generation = 0;
  const podiums = { s: new Map(), g: new Map() };
  const mine = () => (G.DB.fb && G.DB.fb.uid) || '';
  const ranks = uid => ['s', 'g'].flatMap(board => podiums[board].has(uid) ? [{ board, rank: podiums[board].get(uid) }] : []);
  const title = r => 'Weekly ' + (r.board === 's' ? 'solo' : 'group') + ' #' + r.rank;
  function paint(el) {
    const rs = ranks(el.dataset.playerUid), sig = rs.map(r => r.board + r.rank).join(',');
    if (el._podium === sig) return;
    el._podium = sig;
    const best = rs.length ? Math.min(...rs.map(r => r.rank)) : 0;
    el.classList.toggle('pn-ranked', !!best);
    if (best) el.style.setProperty('--pn-color', COLORS[best]); else el.style.removeProperty('--pn-color');
    const box = el.querySelector('.pn-badges');
    if (box) box.innerHTML = rs.map(r => `<span class="pn-badge pn-${r.board}" data-board="${r.board}" data-rank="${r.rank}" title="${title(r)}" aria-label="${title(r)}" style="--badge-color:${COLORS[r.rank]}" translate="no">${r.rank}</span>`).join('');
  }
  function paintTree(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('[data-player-uid]')) paint(root);
    root.querySelectorAll('[data-player-uid]').forEach(paint);
  }
  const repaint = () => document.querySelectorAll('[data-player-uid]').forEach(paint);
  function html(uid, name) {
    return `<span class="player-name" data-player-uid="${esc(uid)}" translate="no"><span class="pn-text">${esc(name)}</span><span class="pn-badges"></span></span>`;
  }
  function knownUid(name) {
    if (G.Social.me && G.Social.me.name === name) return mine();
    return [...(G.Social.room ? G.Social.room.members : []), ...G.Coop.members, ...G.Social.friends].find(m => m.name === name)?.uid || '';
  }
  const htmlFor = name => html(knownUid(name), name);
  const width = (ctx, uid, text) => ctx.measureText(String(text)).width + ranks(uid).length * (Math.max(8, +(ctx.font.match(/([\d.]+)px/) || [0, 10])[1] + 1) + 3);
  function accept(board, top) {
    const map = new Map();
    Object.entries(top || {}).filter(([, r]) => Number.isFinite(r.t) && Array.isArray(r.uids))
      .sort((a, b) => b[1].t - a[1].t || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 3)
      .forEach(([, row], i) => row.uids.slice(0, 4).forEach(uid => { if (typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !map.has(uid)) map.set(uid, i + 1); }));
    podiums[board] = map; repaint();
  }
  function watch() {
    const fb = G.DB.online && G.DB.fb, next = fb ? G.Ranking.board('s', 'w') : '';
    if ((fb ? fb.uid : '') === account && next === week) return;
    stops.forEach(f => f()); stops = []; generation++;
    account = fb ? fb.uid : ''; week = next;
    podiums.s.clear(); podiums.g.clear(); repaint();
    if (!fb) return;
    const token = generation;
    for (const board of ['s', 'g']) stops.push(fb.fs.collection('lbs').doc(G.Ranking.board(board, 'w')).onSnapshot(s => {
      if (token !== generation) return;
      const top = s.exists ? s.data().top : {};
      accept(board, top);
      G.Ranking.receiveSummary(G.Ranking.board(board, 'w'), top);
    }, () => { if (token === generation) accept(board, {}); }));
  }
  /** Draw a name plus circular solo/square group number icons using the caller's current font. */
  function draw(ctx, uid, name, x, y, opts = {}) {
    const rs = ranks(uid);
    ctx.save();
    const size = +(ctx.font.match(/([\d.]+)px/) || [0, 10])[1], icon = Math.max(8, size + 1), gap = 3;
    let text = String(name), badgeWidth = rs.length * (icon + gap), textWidth = ctx.measureText(text).width;
    if (opts.maxWidth) while (text.length > 1 && textWidth + badgeWidth > opts.maxWidth) {
      text = text.replace(/…$/, '').slice(0, -1) + '…'; textWidth = ctx.measureText(text).width;
      if (text === '…') break;
    }
    const width = textWidth + badgeWidth, align = ctx.textAlign;
    let left = x - (align === 'center' ? width / 2 : align === 'right' || align === 'end' ? width : 0);
    ctx.textAlign = 'left';
    if (rs.length) ctx.fillStyle = COLORS[Math.min(...rs.map(r => r.rank))];
    if (opts.stroke) G.I18n.rawCanvas(ctx, 'strokeText', text, left, y);
    G.I18n.rawCanvas(ctx, 'fillText', text, left, y);
    left += textWidth + gap;
    for (const r of rs) {
      const cy = y - size * 0.35;
      ctx.beginPath();
      if (r.board === 's') ctx.arc(left + icon / 2, cy, icon / 2, 0, Math.PI * 2);
      else ctx.rect(left, cy - icon / 2, icon, icon);
      ctx.fillStyle = '#101a2b'; ctx.fill(); ctx.strokeStyle = COLORS[r.rank]; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '800 ' + Math.max(6, icon - 2) + 'px Pixelify,"Segoe UI",sans-serif';
      ctx.fillStyle = COLORS[r.rank]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      G.I18n.rawCanvas(ctx, 'fillText', String(r.rank), left + icon / 2, cy + 0.2);
      left += icon + gap;
    }
    ctx.restore(); return width;
  }
  const style = document.createElement('style');
  style.textContent = `.player-name{display:inline-flex;align-items:center;max-width:100%;vertical-align:baseline;gap:4px}.pn-text{min-width:0}.pn-ranked>.pn-text{color:var(--pn-color)!important;text-shadow:0 0 7px color-mix(in srgb,var(--pn-color) 25%,transparent)}.pn-badges{display:inline-flex;gap:3px;flex:none;vertical-align:middle}.pn-badges:empty{display:none}.pn-badge{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:15px;height:15px;padding:0 3px;border:1px solid var(--badge-color);color:var(--badge-color)!important;background:#101a2b;font:800 10px/1 Pixelify,"Segoe UI",sans-serif;flex:none;text-shadow:none}.pn-s{border-radius:50%}.pn-g{border-radius:3px}`;
  document.head.appendChild(style);
  new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(paintTree); if (m.target.nodeType === 1) { const el = m.target.closest('[data-player-uid]'); if (el) paint(el); } }))
    .observe(document.body, { childList: true, subtree: true });
  G.DB.onLeave(() => { account = ''; week = ''; stops.forEach(f => f()); stops = []; generation++; podiums.s.clear(); podiums.g.clear(); repaint(); });
  setInterval(watch, 1000);
  return { html, htmlFor, mine, ranks, draw, width, COLORS };
})();
