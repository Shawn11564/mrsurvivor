/* ============ import-save.js — bring over your PokéSurvivor save (MrSurvivor fork) ============
 * A website can't read what another one stores in the browser. So the player
 * runs a snippet ON the original site (bookmarklet or console): it reads the copy of their
 * save that the game keeps there (ps.save.<account> or ps.cloud.<uid>),
 * turns it into a "MRSV1:..." text and copies it (or downloads it if it can't).
 * That text is pasted here and G.DB.adopt() merges it with yours.
 *
 * Upstream's name and domain are written in pieces: fork/brand.cjs
 * replaces "PokéSurvivor" and its domain with ours across the whole build.
 * Test: fork/test-import.cjs.
 */
G.ImportSave = (() => {
  const UP_NAME = 'Pok' + String.fromCharCode(233) + 'Survivor';
  const UP_URL = 'https://' + ['pokesurvivor', 'com'].join('.') + '/';
  const UP_HOST = UP_URL.slice(8, -1);
  const PREFIX = 'MRSV1:';
  const FILE = 'pokesurvivor-save.txt';
  const MAX = 4 * 1024 * 1024;
  // Texts for this screen (fork only: they don't go in upstream's dictionaries).
  // Columns: Spanish, English, French, Italian, Portuguese (Brazil), Simplified and Traditional Chinese.
  const ROWS = [
    ["Importar partida de {x}", "Import save from {x}", "Importer la partie de {x}", "Importa partita da {x}", "Importar jogo de {x}", "从 {x} 导入存档", "從 {x} 匯入存檔"],
    ["Importar tu partida de {x}", "Import your {x} save", "Importer ta partie de {x}", "Importa la tua partita di {x}", "Importar seu jogo de {x}", "导入你的 {x} 存档", "匯入你的 {x} 存檔"],
    ["Trae tu colección, shinies, monedas, mejoras y estadísticas de {x}. Se juntan con lo que ya tienes aquí: no pierdes nada de ninguna de las dos.", "Bring your collection, shinies, coins, upgrades and stats from {x}. They're merged with what you already have here, so you won't lose anything from either.", "Récupère ta collection, tes shinies, tes pièces, tes améliorations et tes statistiques de {x}. Tout s’ajoute à ce que tu as déjà ici : tu ne perds rien.", "Porta collezione, shiny, monete, potenziamenti e statistiche da {x}. Si uniscono a ciò che hai già qui: non perdi niente.", "Traga sua coleção, shinies, moedas, melhorias e estatísticas de {x}. Tudo se junta ao que você já tem aqui: você não perde nada.", "把你在 {x} 的收藏、异色、金币、强化和数据带过来。会与你这里已有的进度合并，两边都不会丢失。", "把你在 {x} 的收藏、異色、金幣、強化和數據帶過來。會與你這裡已有的進度合併，兩邊都不會遺失。"],
    ["Abre {x} en este navegador y entra en tu cuenta.", "Open {x} in this browser and log in.", "Ouvre {x} dans ce navigateur et connecte-toi.", "Apri {x} in questo browser e accedi.", "Abra {x} neste navegador e entre na sua conta.", "在此浏览器中打开 {x} 并登录。", "在此瀏覽器中開啟 {x} 並登入。"],
    ["Arrastra este botón a tu barra de marcadores y púlsalo estando allí:", "Drag this button to your bookmarks bar, then click it while you're on that site:", "Fais glisser ce bouton dans ta barre de favoris et clique dessus une fois là-bas :", "Trascina questo pulsante nella barra dei preferiti e premilo quando sei lì:", "Arraste este botão para a barra de favoritos e clique nele quando estiver lá:", "把这个按钮拖到书签栏，在那个网站上点击它：", "把這個按鈕拖到書籤列，在那個網站上點擊它："],
    ["Copiar mi partida", "Copy my save", "Copier ma partie", "Copia la mia partita", "Copiar meu jogo", "复制我的存档", "複製我的存檔"],
    ["O abre allí la consola del navegador (F12), pega este código y pulsa Intro. Si Chrome no te deja pegar, escribe «allow pasting» y vuelve a probar.", "Or open the browser console there (F12), paste this code and press Enter. If Chrome won't let you paste, type “allow pasting” and try again.", "Ou ouvre là-bas la console du navigateur (F12), colle ce code et appuie sur Entrée. Si Chrome refuse le collage, tape « allow pasting » et réessaie.", "Oppure apri lì la console del browser (F12), incolla questo codice e premi Invio. Se Chrome non ti lascia incollare, scrivi «allow pasting» e riprova.", "Ou abra lá o console do navegador (F12), cole este código e aperte Enter. Se o Chrome não deixar colar, digite “allow pasting” e tente de novo.", "或者在那里打开浏览器控制台（F12），粘贴这段代码并按回车。如果 Chrome 不让粘贴，先输入 “allow pasting” 再试。", "或者在那裡開啟瀏覽器主控台（F12），貼上這段程式碼並按 Enter。如果 Chrome 不讓貼上，先輸入「allow pasting」再試。"],
    ["Copiar código", "Copy code", "Copier le code", "Copia codice", "Copiar código", "复制代码", "複製程式碼"],
    ["Pega aquí lo que se ha copiado (o sube el archivo descargado):", "Paste the copied save here (or upload the downloaded file):", "Colle ici ce qui a été copié (ou envoie le fichier téléchargé) :", "Incolla qui ciò che è stato copiato (o carica il file scaricato):", "Cole aqui o que foi copiado (ou envie o arquivo baixado):", "在这里粘贴复制的内容（或上传下载的文件）：", "在這裡貼上複製的內容（或上傳下載的檔案）："],
    ["Importar", "Import", "Importer", "Importa", "Importar", "导入", "匯入"],
    ["Arrástralo a la barra de marcadores; púlsalo luego en la otra web.", "Drag it to your bookmarks bar, then click it on the other site.", "Fais-le glisser dans ta barre de favoris, puis clique dessus sur l’autre site.", "Trascinalo nella barra dei preferiti, poi premilo sull’altro sito.", "Arraste para a barra de favoritos e depois clique nele no outro site.", "把它拖到书签栏，然后在另一个网站上点击。", "把它拖到書籤列，然後在另一個網站上點擊。"],
    ["Código copiado.", "Code copied.", "Code copié.", "Codice copiato.", "Código copiado.", "代码已复制。", "程式碼已複製。"],
    ["Ese archivo no es una partida.", "That file is not a save.", "Ce fichier n’est pas une partie.", "Quel file non è una partita.", "Esse arquivo não é um jogo salvo.", "这个文件不是存档。", "這個檔案不是存檔。"],
    ["Termina la partida antes de importar.", "Finish your run before importing.", "Termine ta partie avant d’importer.", "Finisci la partita prima di importare.", "Termine a partida antes de importar.", "请先结束本局再导入。", "請先結束本局再匯入。"],
    ["Eso no es un código de partida. Cópialo otra vez y pégalo entero.", "That is not a save code. Copy it again and paste all of it.", "Ce n’est pas un code de partie. Copie-le à nouveau et colle-le en entier.", "Non è un codice di partita. Copialo di nuovo e incollalo per intero.", "Isso não é um código de jogo. Copie de novo e cole inteiro.", "这不是存档代码。请重新复制并完整粘贴。", "這不是存檔代碼。請重新複製並完整貼上。"],
    ["Esa partida está incompleta o dañada.", "That save is incomplete or damaged.", "Cette partie est incomplète ou endommagée.", "Quella partita è incompleta o danneggiata.", "Esse jogo está incompleto ou danificado.", "这个存档不完整或已损坏。", "這個存檔不完整或已損壞。"],
    ["¡Importada! {x} Pokémon nuevos, {x} shinies nuevos y {x} Pokémonedas.", "Imported! {x} new Pokémon, {x} new shinies and {x} coins.", "Importée ! {x} nouveaux Pokémon, {x} nouveaux shinies et {x} Pokédollars.", "Importata! {x} nuovi Pokémon, {x} nuovi shiny e {x} Pokémonete.", "Importado! {x} Pokémon novos, {x} shinies novos e {x} Pokémoedas.", "导入完成！新增 {x} 只宝可梦、{x} 只异色和 {x} 宝可梦币。", "匯入完成！新增 {x} 隻寶可夢、{x} 隻異色和 {x} 寶可夢幣。"],
    ["No hay ninguna partida en este navegador. Abre {x}, entra en tu cuenta y vuelve a probar.", "There is no save in this browser. Open {x}, log in and try again.", "Aucune partie dans ce navigateur. Ouvre {x}, connecte-toi et réessaie.", "Nessuna partita in questo browser. Apri {x}, accedi e riprova.", "Não há jogo salvo neste navegador. Abra {x}, entre na conta e tente de novo.", "此浏览器中没有存档。请打开 {x}，登录后再试。", "此瀏覽器中沒有存檔。請開啟 {x}，登入後再試。"],
    ["¿Qué partida? Escribe su número.", "Which save? Type its number.", "Quelle partie ? Tape son numéro.", "Quale partita? Scrivi il suo numero.", "Qual jogo? Digite o número.", "要哪个存档？请输入编号。", "要哪個存檔？請輸入編號。"],
    ["Copiada la partida de {x}. Vuelve a MrSurvivor y pégala en Importar.", "Copied {x}'s save. Go back to MrSurvivor and paste it in Import.", "Partie de {x} copiée. Retourne sur MrSurvivor et colle-la dans Importer.", "Partita di {x} copiata. Torna su MrSurvivor e incollala in Importa.", "Jogo de {x} copiado. Volte ao MrSurvivor e cole em Importar.", "已复制 {x} 的存档。回到 MrSurvivor，粘贴到导入中。", "已複製 {x} 的存檔。回到 MrSurvivor，貼到匯入中。"],
    ["No se ha podido copiar: la partida de {x} se ha descargado en un archivo. Súbelo en Importar, en MrSurvivor.", "Couldn't copy it, so {x}'s save was downloaded as a file instead. Upload it in Import on MrSurvivor.", "Copie impossible : la partie de {x} a été téléchargée dans un fichier. Envoie-le dans Importer, sur MrSurvivor.", "Impossibile copiare: la partita di {x} è stata scaricata in un file. Caricalo in Importa, su MrSurvivor.", "Não foi possível copiar: o jogo de {x} foi baixado como arquivo. Envie em Importar, no MrSurvivor.", "无法复制：{x} 的存档已下载为文件。请在 MrSurvivor 的导入中上传。", "無法複製：{x} 的存檔已下載為檔案。請在 MrSurvivor 的匯入中上傳。"]
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * The code that runs on the original site (in its console or as a bookmarklet).
   * Nothing from this game inside: only localStorage, the clipboard and alerts.
   * `msg` holds the texts, already translated.
   */
  function snippet(msg) {
    const M = JSON.stringify(msg);
    return `(async()=>{const M=${M},L=[];` +
      `for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);` +
      `if(/^ps\\.(save|cloud)\\./.test(k))try{const s=JSON.parse(localStorage.getItem(k));if(s&&s.owned&&s.stats)L.push(s)}catch(e){}}` +
      `if(!L.length)return alert(M.none);` +
      `L.sort((a,b)=>(b.updated||0)-(a.updated||0));let s=L[0];` +
      `if(L.length>1){const n=prompt(L.map((x,i)=>(i+1)+'. '+x.name+' ('+Object.keys(x.owned).length+')').join('\\n')+'\\n\\n'+M.which,'1');` +
      `if(n===null)return;s=L[(+n||1)-1]||L[0]}` +
      `const c=${JSON.stringify(PREFIX)}+btoa(unescape(encodeURIComponent(JSON.stringify(s))));let ok=0;` +
      `try{if(typeof copy=='function'){copy(c);ok=1}else{await navigator.clipboard.writeText(c);ok=1}}catch(e){}` +
      `if(!ok){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:'text/plain'}));` +
      `a.download=${JSON.stringify(FILE)};document.body.appendChild(a);a.click();a.remove()}` +
      `alert((ok?M.copied:M.saved).replace('{n}',s.name))})()`;
  }

  function texts() {
    return {
      none: G.I18n.f('No hay ninguna partida en este navegador. Abre {x}, entra en tu cuenta y vuelve a probar.', UP_HOST),
      which: G.T('¿Qué partida? Escribe su número.'),
      copied: G.I18n.f('Copiada la partida de {x}. Vuelve a MrSurvivor y pégala en Importar.', '{n}'),
      saved: G.I18n.f('No se ha podido copiar: la partida de {x} se ha descargado en un archivo. Súbelo en Importar, en MrSurvivor.', '{n}')
    };
  }

  /** Reads a "MRSV1:..." code (or the save as plain JSON) → object, or null. */
  function decode(text) {
    const t = String(text || '').trim();
    if (!t || t.length > MAX) return null;
    try {
      if (t.startsWith('{')) return JSON.parse(t);
      if (!t.startsWith(PREFIX)) return null;
      return JSON.parse(decodeURIComponent(escape(atob(t.slice(PREFIX.length).replace(/\s+/g, '')))));
    } catch (e) { return null; }
  }

  function open() {
    const code = snippet(texts());
    const el = document.createElement('section');
    el.className = 'scr dim';
    el.id = 'scr-import';
    el.style.zIndex = 70;
    el.innerHTML = `<div class="box" style="max-width:520px;width:100%">
      <div class="row between"><h3>${esc(G.I18n.f('Importar tu partida de {x}', UP_NAME))}</h3><button class="btn small ghost" data-a="close">Cerrar</button></div>
      <p class="sub">${esc(G.I18n.f('Trae tu colección, shinies, monedas, mejoras y estadísticas de {x}. Se juntan con lo que ya tienes aquí: no pierdes nada de ninguna de las dos.', UP_NAME))}</p>
      <p><b>1.</b> ${esc(G.I18n.f('Abre {x} en este navegador y entra en tu cuenta.', UP_NAME))}
        <a class="btn small" href="${UP_URL}" target="_blank" rel="noopener" translate="no">${UP_HOST}</a></p>
      <p><b>2.</b> ${esc(G.T('Arrastra este botón a tu barra de marcadores y púlsalo estando allí:'))}
        <a class="btn small gold" data-a="mark" href="javascript:${encodeURIComponent(code)}">${esc(G.T('Copiar mi partida'))}</a></p>
      <p class="sub" style="margin-bottom:6px">${esc(G.T('O abre allí la consola del navegador (F12), pega este código y pulsa Intro. Si Chrome no te deja pegar, escribe «allow pasting» y vuelve a probar.'))}</p>
      <textarea class="field" readonly translate="no" rows="3" data-a="snippet" style="width:100%;font:11px monospace;resize:none">${esc(code)}</textarea>
      <button class="btn small" data-a="copy" style="margin:6px 0 12px">${esc(G.T('Copiar código'))}</button>
      <p><b>3.</b> ${esc(G.T('Pega aquí lo que se ha copiado (o sube el archivo descargado):'))}</p>
      <textarea class="field" rows="3" data-a="paste" translate="no" style="width:100%;font:11px monospace;resize:none"></textarea>
      <div class="row wrap" style="gap:8px;margin-top:8px;align-items:center">
        <input type="file" accept=".txt,.json,text/plain,application/json" data-a="file">
        <button class="btn gold" data-a="go">${esc(G.T('Importar'))}</button>
      </div>
      <p class="note" data-a="msg"></p></div>`;
    document.body.appendChild(el);
    const q = a => el.querySelector(`[data-a="${a}"]`);
    const say = (s, bad) => { const m = q('msg'); m.textContent = s; m.style.color = bad ? '#ff8a96' : '#8ff0a8'; };
    q('close').onclick = () => el.remove();
    // It does nothing here (and the security policy wouldn't allow it): it's there to be dragged.
    q('mark').onclick = e => { e.preventDefault(); say(G.T('Arrástralo a la barra de marcadores; púlsalo luego en la otra web.')); };
    q('copy').onclick = () => {
      const ta = q('snippet');
      ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(
        () => say(G.T('Código copiado.')), () => { document.execCommand('copy'); say(G.T('Código copiado.')); });
    };
    q('file').onchange = () => {
      const f = q('file').files[0];
      if (!f) return;
      if (f.size > MAX) { say(G.T('Ese archivo no es una partida.'), true); return; }
      f.text().then(t => { q('paste').value = t.trim(); });
    };
    q('go').onclick = () => {
      if (G.Game.state !== 'ui') { say(G.T('Termina la partida antes de importar.'), true); return; }
      const data = decode(q('paste').value);
      if (!data) { say(G.T('Eso no es un código de partida. Cópialo otra vez y pégalo entero.'), true); return; }
      const r = G.DB.adopt(data);
      if (!r.ok) { say(r.why === 'guest' ? G.T('Inicia sesión primero.') : G.T('Esa partida está incompleta o dañada.'), true); return; }
      if (G.DB.mode === 'cloud') G.DB.saveNow();
      G.UI.refreshCoins();
      if (G.UI.isOpen('scr-menu')) G.MenuUI.open();
      const a = r.added;
      say(G.I18n.f('¡Importada! {x} Pokémon nuevos, {x} shinies nuevos y {x} Pokémonedas.', a.owned, a.shiny, Math.max(0, a.coins)));
      q('go').disabled = true;
    };
  }

  return { open, decode, snippet: () => snippet(texts()), UP_NAME };
})();
