/* ============ aim-style.js — la mira y el stick derecho (fork MrSurvivor) ============
 * Ajustes → Controles, para todos:
 *   - Color de la mira (dorada, blanca, roja, verde, celeste o rosa) y su tamaño (pequeña, mediana,
 *     grande). La mira es la de "Apuntar a mano" (drawAimMark, js/game.js: dos ganchos de una línea).
 *   - "Apuntar con el stick derecho" (encendido): empujar el stick derecho del mando apunta a mano
 *     aunque "Apuntar a mano" esté apagado; al soltarlo vuelve a apuntar solo (Player.handAim).
 * La fila va detrás de la de los marcadores (G.Markers.settingsRow). Prueba: fork/test-aim-style.cjs.
 */
G.AimStyle = (() => {
  const COLORS = [['#ffe9a8', 'Dorada'], ['#ffffff', 'Blanca'], ['#ff5f6d', 'Roja'], ['#5fe08a', 'Verde'], ['#4fd1ff', 'Celeste'], ['#ff8acb', 'Rosa']];
  const SIZES = [[0.75, 'Pequeña'], [1, 'Mediana'], [1.4, 'Grande']];
  const color = () => { const c = G.Settings.get('aimColor'); return COLORS.some(x => x[0] === c) ? c : COLORS[0][0]; };
  const size = () => { const k = +G.Settings.get('aimSize'); return SIZES.some(x => x[0] === k) ? k : 1; };
  /** Gancho de drawAimMark: mueve el lienzo a la mira y lo escala; la mira se dibuja en (0, 0). */
  function frame(ctx, x, y) { ctx.translate(x, y); const k = size(); ctx.scale(k, k); return { x: 0, y: 0 }; }

  // El stick derecho apunta aunque "Apuntar a mano" esté apagado.
  const P = G.Player.prototype, hand = P.handAim;
  P.handAim = function () {
    const r = hand.apply(this, arguments);
    if (r != null || this.remote || G.Settings.touch || G.Settings.get('padAim') === false) return r;
    const st = G.Pad.aim && G.Pad.aim();
    return st ? Math.atan2(st[1], st[0]) : null;
  };

  if (G.Markers && G.Markers.settingsRow) {
    const row = G.Markers.settingsRow;
    G.Markers.settingsRow = function (choice) {
      const pad = G.Settings.get('padAim') !== false;
      return row.apply(this, arguments)
        + `<div class="set-row"><div class="grow"><b>${G.T('Mira')}</b><small>${G.T('El color y el tamaño de la mira de "Apuntar a mano".')}</small></div></div>`
        + `<div class="chips set-chips">${COLORS.map(([v, l]) => `<button class="chip ${v === color() ? 'on' : ''}" data-k="aimColor" data-v="${v}"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${v};margin-right:4px"></i>${G.T(l)}</button>`).join('')}</div>`
        + choice('aimSize', SIZES.map(([v, l]) => [v, G.T(l)]))
        + `<div class="set-row"><div class="grow"><b>${G.T('Apuntar con el stick derecho')}</b><small>${G.T('Con mando: empuja el stick derecho para apuntar a mano (aunque "Apuntar a mano" esté apagado); al soltarlo vuelve a apuntar solo.')}</small></div>
          <button class="btn small switch ${pad ? 'gold' : ''}" data-k="padAim">${pad ? 'Sí' : 'No'}</button></div>`;
    };
  }

  // Columnas: español, inglés, francés, italiano, portugués (Brasil), chino simplificado y tradicional.
  const ROWS = [
    ['Mira', 'Crosshair', 'Viseur', 'Mirino', 'Mira', '准星', '準星'],
    ['El color y el tamaño de la mira de "Apuntar a mano".', 'The colour and size of the "Manual aim" crosshair.', 'La couleur et la taille du viseur de « Viser à la main ».',
     'Colore e dimensione del mirino di "Mira manuale".', 'A cor e o tamanho da mira de "Mirar à mão".', '"手动瞄准"准星的颜色和大小。', '「手動瞄準」準星的顏色和大小。'],
    ['Dorada', 'Gold', 'Doré', 'Oro', 'Dourada', '金色', '金色'], ['Blanca', 'White', 'Blanc', 'Bianco', 'Branca', '白色', '白色'],
    ['Roja', 'Red', 'Rouge', 'Rosso', 'Vermelha', '红色', '紅色'], ['Verde', 'Green', 'Vert', 'Verde', 'Verde', '绿色', '綠色'],
    ['Celeste', 'Cyan', 'Cyan', 'Ciano', 'Ciano', '青色', '青色'], ['Rosa', 'Pink', 'Rose', 'Rosa', 'Rosa', '粉色', '粉色'],
    ['Pequeña', 'Small', 'Petit', 'Piccolo', 'Pequena', '小', '小'], ['Mediana', 'Medium', 'Moyen', 'Medio', 'Média', '中', '中'], ['Grande', 'Large', 'Grand', 'Grande', 'Grande', '大', '大'],
    ['Apuntar con el stick derecho', 'Aim with the right stick', 'Viser avec le stick droit', 'Mira con lo stick destro', 'Mirar com o analógico direito', '用右摇杆瞄准', '用右搖桿瞄準'],
    ['Con mando: empuja el stick derecho para apuntar a mano (aunque "Apuntar a mano" esté apagado); al soltarlo vuelve a apuntar solo.',
     'With a controller: push the right stick to aim by hand (even with "Manual aim" off); let go and it aims on its own again.',
     'À la manette : poussez le stick droit pour viser à la main (même sans « Viser à la main ») ; relâchez et la visée redevient automatique.',
     'Con il controller: spingi lo stick destro per mirare a mano (anche con "Mira manuale" spenta); rilascialo e torna a mirare da solo.',
     'Com controle: empurre o analógico direito para mirar à mão (mesmo com "Mirar à mão" desligado); solte e volta a mirar sozinho.',
     '使用手柄时：推动右摇杆即可手动瞄准（即使关闭了"手动瞄准"）；松开后恢复自动瞄准。', '使用手把時：推動右搖桿即可手動瞄準（即使關閉了「手動瞄準」）；放開後恢復自動瞄準。']
  ];
  ['en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'].forEach((l, i) => G.I18n.add(Object.fromEntries(ROWS.map(r => [r[0], r[i + 1]])), l));

  return { COLORS, SIZES, color, size, frame };
})();
