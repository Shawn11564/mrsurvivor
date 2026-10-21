/* ============ pity-bar.js — la barra del pity en el gacha (fork MrSurvivor) ============
 * Bajo "Tiradas sin legendaria: N / 220", una barra de 22 tramos de 10 tiradas: se llena con las
 * tuyas en ese banner, y los tramos desde la 180 (el pity blando de js/systems/gacha.js, donde la
 * Legendaria empieza a subir) van en dorado, con el 180 marcado debajo. Estilos en línea: dev.html
 * no carga css/brand.css. Gancho de una línea en js/ui/gacha-ui.js (refresh, también al cambiar de
 * banner). Prueba: fork/test-pity-bar.cjs.
 */
G.PityBar = (() => {
  const STEP = 10;
  function draw(after, pity) {
    if (!after || !G.Gacha.PITY_5) return;
    let bar = document.getElementById('gacha-pitybar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'gacha-pitybar';
      bar.style.cssText = 'position:relative;display:flex;gap:2px;margin:4px 0 16px;height:10px';
      after.insertAdjacentElement('afterend', bar);
    }
    const max = G.Gacha.PITY_5, soft = G.Gacha.SOFT_PITY || max, n = Math.ceil(max / STEP);
    bar.innerHTML = '';
    bar.dataset.pity = pity;
    for (let i = 0; i < n; i++) {
      const from = i * STEP, fill = G.U.clamp((pity - from) / STEP, 0, 1), hot = from >= soft;
      const seg = document.createElement('div');
      seg.className = 'pity-seg' + (hot ? ' soft' : '') + (fill >= 1 ? ' full' : fill > 0 ? ' part' : '');
      seg.style.cssText = `flex:1;position:relative;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px ${hot ? '#ffcb3d88' : 'rgba(255,255,255,.12)'}`;
      if (fill > 0) {
        const f = document.createElement('i');
        f.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:${fill * 100}%;background:${hot ? '#ffcb3d' : '#c47bff'}`;
        seg.appendChild(f);
      }
      bar.appendChild(seg);
    }
    if (soft < max) {
      const mark = document.createElement('small');
      mark.className = 'pity-mark';
      mark.textContent = soft;
      mark.style.cssText = `position:absolute;top:12px;left:${soft / max * 100}%;transform:translateX(-50%);font-size:10px;color:#ffcb3d`;
      bar.appendChild(mark);
    }
  }
  return { draw };
})();
