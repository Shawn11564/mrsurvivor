/* ============ end-run.js — "End run" in the pause menu after 20:00 (MrSurvivor fork) ============
 * Long runs had no way to stop on purpose except falling, or "Quit run", which in co-op only takes
 * you out. From 20:00 on the clock the pause menu has an **End run** button:
 *   - solo: the run ends at once, like "Quit run" (coins, records, leaderboard, the end screens).
 *   - co-op: a vote. Everyone gets a prompt (Yes / No, VOTE_S seconds); the one who asked has said
 *     yes. The run ends for everyone only when every connected player says yes; one No, or the time
 *     running out, and it goes on (then COOLDOWN_S before anyone can ask again). Then the host ends it
 *     the way it ends when everyone falls (G.Coop.over with why 'vote', then its own end): the team
 *     summary and each one's end screen, as usual; nobody is counted as fallen.
 * The host runs the vote: a guest's ask and vote go to it (G.Net.toHost), it sends everyone the state
 * ({ k:'endvote', a:'state', id, by, yes, need, left }) and the result ({ a:'fail', why }). Its own
 * prompt it draws itself. Players who drop out stop counting.
 * Hooks: G.RunUI.showPause (the button); js/game.js's coopApi.over takes why 'vote'.
 * Test: fork/test-end-run.cjs.
 */
G.EndRun = (() => {
  const AFTER = 20 * 60, VOTE_S = 30, COOLDOWN_S = 30;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => performance.now();

  const inRun = () => !!G.Game.player && !['ui', 'over'].includes(G.Game.state);
  const coop = () => !!(G.Coop && G.Coop.active);
  const late = () => inRun() && G.Game.st.time >= AFTER;
  const myUid = () => G.Net.uid;
  const nameOf = u => u === myUid() ? (G.Social.me ? G.Social.me.name : 'You') : ((G.Coop.mates.find(m => m.uid === u) || {}).name || '?');
  /** Who has to say yes: you and every teammate still connected. */
  const voters = () => [myUid(), ...G.Coop.mates.filter(m => m.connected).map(m => m.uid)];

  // ---------------- the host's vote ----------------
  let vote = null;          // host: { id, by, yes:Set, end }
  let coolUntil = 0;        // host: no new vote before this
  let seen = null;          // everyone: the last state the host sent { id, by, yes, need, left }
  let mine = null;          // everyone: what I answered in vote `id` ({ id, yes })

  function ask() {
    if (!late()) return;
    if (!coop()) { G.UI.hide('scr-pause'); G.Game.quit(); return; }
    if (G.Coop.isHost) start(myUid());
    else G.Net.toHost({ k: 'endvote', a: 'ask' });
    mine = null;
  }

  function start(by) {
    if (!G.Coop.isHost || !late()) return;
    if (vote) { answer(by, true); return; }                 // a vote is on: asking again is a yes
    if (now() < coolUntil) { tell({ a: 'fail', why: 'Wait a little before asking again.' }, by); return; }
    vote = { id: Math.random().toString(36).slice(2, 8), by, yes: new Set([by]), end: now() + VOTE_S * 1000 };
    share();
  }

  function answer(uid, yes) {
    if (!vote) return;
    if (!yes) { fail(nameOf(uid) + ' said no: the run goes on.'); return; }
    vote.yes.add(uid);
    share();
  }

  /** Host: everyone's prompt, and the end if all said yes. */
  function share() {
    if (!vote) return;
    const need = voters();
    if (need.every(u => vote.yes.has(u))) { pass(); return; }
    const st = { a: 'state', id: vote.id, by: nameOf(vote.by), yes: [...vote.yes].filter(u => need.includes(u)), need, left: Math.max(0, Math.ceil((vote.end - now()) / 1000)) };
    tell(st);
    got(st);
  }

  function fail(why) {
    vote = null; coolUntil = now() + COOLDOWN_S * 1000;
    tell({ a: 'fail', why });
    got({ a: 'fail', why });
  }

  function pass() {
    vote = null;
    got({ a: 'done' });
    tell({ a: 'done' });
    // As when everyone falls (game.js checkAllDown), with why 'vote': nobody is counted as fallen.
    G.Coop.over(Object.assign(G.Game.coopApi.summary(), { why: 'vote' }));
    G.Game.quit();
  }

  /** Host → one player, or all of them. */
  function tell(msg, to) {
    msg = Object.assign({ k: 'endvote' }, msg);
    if (to && to !== myUid()) { G.Net.send(to, msg); return; }
    if (to === myUid()) { got(msg); return; }
    for (const m of G.Coop.mates) if (m.connected) G.Net.send(m.uid, msg);
  }

  G.Net.on((from, msg) => {
    if (!msg || msg.k !== 'endvote' || !coop()) return;
    if (G.Coop.isHost) {
      if (msg.a === 'ask') start(from);
      else if (msg.a === 'vote' && vote && msg.id === vote.id) answer(from, !!msg.yes);
      return;
    }
    if (from === G.Net.hostUid) got(msg);
  });

  // Host: the clock, and teammates who drop out.
  setInterval(() => {
    if (!vote) return;
    if (!coop() || !G.Coop.isHost || !inRun()) { vote = null; return; }
    if (now() >= vote.end) fail('Not everyone answered: the run goes on.');
    else share();
  }, 500);

  // ---------------- the prompt ----------------
  let box = null;
  function got(msg) {
    if (msg.a === 'state') { seen = msg; draw(); return; }
    seen = null; draw();
    if (msg.a === 'fail') G.UI.toast(msg.why, 3200);
  }
  function vote_(yes) {
    if (!seen) return;
    mine = { id: seen.id, yes };
    if (G.Coop.isHost) answer(myUid(), yes);
    else G.Net.toHost({ k: 'endvote', a: 'vote', id: seen.id, yes });
    draw();
  }
  function draw() {
    if (!box) {
      box = document.createElement('div');
      box.id = 'end-vote';
      box.className = 'box hidden';
      box.setAttribute('translate', 'no');
      box.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:70;padding:10px 14px;text-align:center;font-size:14px;max-width:min(420px,92vw)';
      document.body.appendChild(box);
    }
    if (!seen || !inRun()) { box.classList.add('hidden'); return; }
    const me = myUid(), said = seen.yes.includes(me) || (mine && mine.id === seen.id && mine.yes);
    const missing = seen.need.filter(u => !seen.yes.includes(u)).map(nameOf);
    box.innerHTML = `<b>End the run for everyone?</b><br><small>${G.PlayerNames.htmlFor(seen.by)} asked · ${seen.yes.length}/${seen.need.length} said yes · ${seen.left} s</small>`
      + (said ? `<div class="sub" style="margin-top:6px">You said yes. Waiting for ${missing.map(G.PlayerNames.htmlFor).join(', ')}…</div>`
        : `<div class="row" style="justify-content:center;gap:8px;margin-top:8px"><button class="btn small gold" data-v="yes">Yes, end it</button><button class="btn small" data-v="no">No</button></div>`);
    box.querySelectorAll('button').forEach(b => { b.onclick = () => vote_(b.dataset.v === 'yes'); });
    box.classList.remove('hidden');
  }

  // ---------------- the button ----------------
  function button() {
    let b = $('btn-endrun');
    if (!b) {
      b = document.createElement('button');
      b.id = 'btn-endrun'; b.className = 'btn danger';
      b.setAttribute('translate', 'no');
      b.onclick = ask;
      $('btn-quit').after(b);
    }
    const on = late();
    b.classList.toggle('hidden', !on);
    b.textContent = coop() ? 'Vote to end run' : 'End run';
    b.title = coop() ? 'Everyone must say yes; then the run ends for all of you, with the usual summary.'
      : 'End the run now, with the usual summary and rewards.';
  }
  const showPause = G.RunUI.showPause;
  G.RunUI.showPause = function () { const r = showPause.apply(this, arguments); button(); return r; };
  // In co-op the clock runs with the menu open: the button shows when it gets to 20:00.
  setInterval(() => { if (G.UI.isOpen('scr-pause')) button(); }, 1000);

  return { AFTER, VOTE_S, ask, get vote() { return vote; }, get seen() { return seen; } };
})();
