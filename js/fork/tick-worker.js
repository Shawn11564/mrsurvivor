/* tick-worker.js — reloj para js/fork/coop-background.js: un aviso cada `ms` (los temporizadores
 * de un Worker no se frenan con la pestaña oculta). Archivo propio porque la CSP no deja Workers blob:. */
let t = 0;
onmessage = e => { clearInterval(t); t = setInterval(() => postMessage(0), e.data); };
