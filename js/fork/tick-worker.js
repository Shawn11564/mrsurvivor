/* tick-worker.js — clock for js/fork/coop-background.js: one message every `ms` (a Worker's timers
 * don't slow down when the tab is hidden). Its own file because the CSP doesn't allow blob: Workers. */
let t = 0;
onmessage = e => { clearInterval(t); t = setInterval(() => postMessage(0), e.data); };
