/* ============ open-another.js — "Open Another" after a roll (MrSurvivor fork) ============
 * Next to Continue at the end of a roll (#pull-fx, shared by the gacha and the Radiant Ritual):
 *   - Gacha: the same pull again (×1, ×10 with normal tickets or a ×10 ticket, rainbow ×25) right away,
 *     if you can still pay for it (G.Gacha.costOf). The last pull is noted by wrapping G.Gacha.pull.
 *   - Radiant Ritual: the next 10 shinies "Fill with the commonest" would take (never legendaries or your
 *     partner), sacrificed right away (G.Radiant.again), if you have 10 of them. The button says so.
 * It shows whenever Continue does (a MutationObserver on #pull-close) and you can afford it.
 * English only. Test: fork/test-open-another.cjs.
 */
G.OpenAnother = (() => {
  const $ = id => document.getElementById(id);
  let last = null;                                   // the last gacha pull: { n, use }
  const COST = { t1: n => `${n} ticket${n === 1 ? '' : 's'}`, t10: () => '1 ×10 ticket', t25: () => '1 rainbow ticket' };

  const pull = G.Gacha.pull;
  G.Gacha.pull = function (save, n, gen, use = 't1') {
    const r = pull.apply(this, arguments);
    if (r && save === G.DB.save) { last = { n, use: use || 't1' }; const fx = $('pull-fx'); if (fx) fx.dataset.from = 'gacha'; }
    return r;
  };

  /** What it would do now: { label, go } or null. */
  function offer() {
    const from = $('pull-fx') && $('pull-fx').dataset.from;
    if (from === 'gacha' && last && G.DB.save && G.Gacha.costOf(G.DB.save, last.n, last.use)) {
      const what = last.n === 25 ? 'Rainbow ×25' : '×' + last.n;
      return { label: `Open Another <small>${what} · ${COST[last.use](last.n)}</small>`, go: () => {
        const l = last;
        $('pull-close').click();                     // the gacha's Continue: closes the results
        G.GachaUI.pull(l.n, l.use);
      } };
    }
    if (from === 'ritual' && G.Radiant && G.Radiant.canAgain())
      return { label: `Open Another <small>the ${G.Radiant.NEED} commonest shinies</small>`, go: () => G.Radiant.again() };
    return null;
  }

  function refresh() {
    const ok = $('pull-close'), b = $('pull-another');
    if (!ok || !b) return;
    const o = !ok.classList.contains('hidden') && offer();
    b.classList.toggle('hidden', !o);
    if (o) { b.innerHTML = o.label; b.onclick = () => { b.classList.add('hidden'); G.Audio.sfx('confirm'); o.go(); }; }
  }

  function build() {
    const ok = $('pull-close');
    if (!ok || $('pull-another')) return;
    const row = document.createElement('div');
    row.className = 'pull-actions';
    row.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap';
    ok.parentNode.insertBefore(row, ok);
    row.appendChild(ok);
    const b = document.createElement('button');
    b.id = 'pull-another'; b.type = 'button'; b.className = 'btn hidden'; b.dataset.sfx = 'none';
    b.setAttribute('translate', 'no');
    row.appendChild(b);
    new MutationObserver(refresh).observe(ok, { attributes: true, attributeFilter: ['class'] });
  }
  build();

  return { refresh, get last() { return last; } };
})();
