/* ============ one-tab.js — the game runs in one tab at a time (MrSurvivor fork) ============
 * Every tab keeps its own copy of the save in memory, and the merge (G.DB.merge) keeps the union of
 * what two copies own while it counts a browser's spending once (its ledger takes the larger entry).
 * So with two tabs open you could roll the gacha in both and keep the results of both, or keep only
 * the tab you liked. Now only one tab plays; the others are "parked" and show a "Play here" screen.
 *
 *   - At load (G.DB.ready, wrapped below, before it reads any save) a tab asks the others over a
 *     BroadcastChannel whether one is playing. If one answers within PING ms, this tab parks and the
 *     save is never opened. Otherwise it becomes the owner: localStorage ms.tab.owner = its id.
 *   - "Play here" makes the parked tab the owner and tells the others. The tab that was playing
 *     parks: it stops writing to localStorage and reloads into the parked screen (sessionStorage
 *     ms.tab.parked, so it stays parked across reloads). Then the new owner reloads and opens the
 *     save, which by then holds everything the other tab did.
 *   - A tab that missed the message (frozen in the background) finds out from ms.tab.owner when it
 *     comes back to the front or the next time it saves (G.DB.commit), and parks instead of saving.
 * Checked by fork/test-one-tab.cjs.
 */
(() => {
  const OWNER = 'ms.tab.owner', PARKED = 'ms.tab.parked', PING = 300;
  const me = Math.random().toString(36).slice(2, 10);
  const ls = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const ss = (() => { try { return window.sessionStorage; } catch (e) { return null; } })();
  const get = (st, k) => { try { return st ? st.getItem(k) : null; } catch (e) { return null; } };
  const set = (st, k, v) => { try { if (st) st.setItem(k, v); } catch (e) { /* nothing */ } };
  const del = (st, k) => { try { if (st) st.removeItem(k); } catch (e) { /* nothing */ } };
  const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ms.tab') : null;
  let state = 'boot';                              // 'boot' | 'owner' | 'parked'
  let acked = null;                                // resolves when the old owner has parked

  // A parked tab writes nothing to localStorage: its copy of the save is out of date.
  const setItem = Storage.prototype.setItem, removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) {
    if (state === 'parked' && this === ls && k !== OWNER) return;
    return setItem.call(this, k, v);
  };
  Storage.prototype.removeItem = function (k) {
    if (state === 'parked' && this === ls && k !== OWNER) return;
    return removeItem.call(this, k);
  };

  function screen() {
    if (document.getElementById('one-tab')) return;
    const el = document.createElement('div');
    el.id = 'one-tab';
    el.setAttribute('translate', 'no');
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
      'padding:16px;background:rgba(8,12,24,.94);color:#f4f8ff;font-family:inherit;text-align:center';
    el.innerHTML = '<div class="panel" style="max-width:420px;background:#141c30">' +
      '<h2 style="margin:0 0 10px">Open in another tab</h2>' +
      '<p style="margin:0 0 16px;line-height:1.4">The game is already open in another tab or window. ' +
      'It can only run in one at a time, so your save stays in one piece.</p>' +
      '<button type="button" class="btn" id="one-tab-here">Play here</button></div>';
    document.body.appendChild(el);
    document.getElementById('one-tab-here').onclick = here;
  }

  /** Stop this tab: no more saving, and reload into the parked screen if a save was open. */
  function park() {
    if (state === 'parked') return;
    const had = state === 'owner';
    state = 'parked';
    set(ss, PARKED, '1');
    if (bc) bc.postMessage({ t: 'parked', id: me });
    if (had) location.reload();
    else screen();
  }

  function claim() { state = 'owner'; set(ls, OWNER, me); }

  /** "Play here": the other tab parks, then this one reloads and opens the save. */
  async function here() {
    const b = document.getElementById('one-tab-here');
    if (b) { b.disabled = true; b.textContent = 'Switching…'; }
    del(ss, PARKED);
    set(ls, OWNER, me);
    if (bc) {
      const done = new Promise(res => { acked = res; });
      bc.postMessage({ t: 'claim', id: me });
      await Promise.race([done, new Promise(res => setTimeout(res, 1000))]);
    }
    location.reload();
  }

  /** Is another tab playing? Asks over the channel and waits PING ms for an answer. */
  function anyoneThere() {
    if (!bc) return Promise.resolve(false);
    return new Promise(res => {
      const t = setTimeout(() => { bc.removeEventListener('message', on); res(false); }, PING);
      const on = e => { if (e.data && e.data.t === 'pong') { clearTimeout(t); bc.removeEventListener('message', on); res(true); } };
      bc.addEventListener('message', on);
      bc.postMessage({ t: 'ping', id: me });
    });
  }

  if (bc) bc.onmessage = e => {
    const m = e.data || {};
    if (m.t === 'ping' && state === 'owner') bc.postMessage({ t: 'pong', id: me });
    else if (m.t === 'claim' && m.id !== me && state !== 'parked') park();
    else if (m.t === 'parked' && acked) acked();
  };

  // Someone else took over while this tab wasn't listening (frozen, or no BroadcastChannel).
  const check = () => { if (state === 'owner' && ls && get(ls, OWNER) && get(ls, OWNER) !== me) park(); };
  addEventListener('storage', e => { if (e.key === OWNER) check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('focus', check);
  addEventListener('pageshow', check);

  const commit = G.DB.commit;
  G.DB.commit = function () {
    check();
    if (state === 'parked') return false;
    return commit.apply(this, arguments);
  };

  const ready = G.DB.ready;
  let gate = null;
  G.DB.ready = function () {
    if (!gate) gate = (async () => {
      if (get(ss, PARKED) || await anyoneThere()) { park(); return new Promise(() => {}); }
      claim();
    })();
    return gate.then(() => ready.apply(G.DB, arguments));
  };

  G.OneTab = { get state() { return state; }, get id() { return me; } };
})();
