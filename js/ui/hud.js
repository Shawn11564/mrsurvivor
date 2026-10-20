/* ============ hud.js — interfaz dentro del canvas ============
 * Se dibuja en coordenadas de PANTALLA (sin la transformación de cámara).
 */
G.HUD = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, col, bg = 'rgba(0,0,0,.55)') {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (frac > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w * G.U.clamp(frac, 0, 1), h);
      ctx.restore();
    }
  }

  /*
   * Potenciadores (Danza Espada, Maquinación...): cuánto les queda. Todas las cargas
   * caducan a la vez al acabarse el tiempo (Player.addBuff/update), así que se pinta
   * en su hueco: barra que se vacía, segundos y cargas; en los últimos segundos, si no
   * es el ataque activo, borde dorado que late ("cámbiate a él").
   */
  const BUFF_COL = { atk: '#ff6b4d', patk: '#ff6b4d', satk: '#c47bff', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
  const BUFF_WARN = G.Player.BUFF_WARN;
  function buffLeft(pl, m) {
    const b = m.kind === 'buff' && pl.buffs[m.stat];
    return b && b.n > 0 ? { b, frac: G.U.clamp(b.t / (m.dur || 7), 0, 1) } : null;
  }
  // Segundos que quedan, sin redondear hacia arriba: 10,5 s salía "11s" y medio segundo
  // después "9.9s" (fork, fork/test-moves.cjs). Con decimal por debajo de 10.
  const buffSecs = t => t < 10 ? (Math.floor(t * 10) / 10).toFixed(1) : String(Math.floor(t));

  function draw(ctx, w, h, pl, st) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    G.Touch.clearButtons();
    const touch = G.Touch.active;

    // ---------- barra de experiencia (borde superior) ----------
    const xpF = pl.xp / pl.xpNext;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, w, 7);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#4fd1ff'); g.addColorStop(1, '#a98bff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w * G.U.clamp(xpF, 0, 1), 7);

    // ---------- vida + nivel ----------
    const sa = G.Touch.safeArea();
    const px = 16 + sa.left, py = 20 + sa.top;     // lejos de la muesca del iPhone
    ctx.font = F(800, 13);
    ctx.fillStyle = '#eaf2ff';
    ctx.textAlign = 'left';
    ctx.fillText(pl.mon.name, px, py + 10);

    ctx.font = F(700, 11);
    ctx.fillStyle = '#ffcb3d';
    ctx.fillText('Nv. ' + pl.level, px, py + 26);

    bar(ctx, px + 48, py + 17, 168, 11, pl.hp / pl.maxHp, '#ff5f6d');
    ctx.font = F(700, 10);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp), px + 48 + 84, py + 26);

    // buffs activos
    const COL = { atk: '#ff6b4d', patk: '#ff6b4d', satk: '#c47bff', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    const LBL = { atk: 'ATK', patk: 'ATK', satk: 'AT.E', spd: 'VEL', def: 'DEF', regen: 'REG' };
    let bx = px;
    ctx.textAlign = 'left';
    for (const k in pl.buffs) {
      const b = pl.buffs[k];
      if (b.n <= 0) continue;
      ctx.font = F(800, 9);
      const txt = LBL[k] + ' ×' + b.n;
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
      ctx.fillStyle = COL[k];
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    // ---------- reloj / bioma / kills ----------
    ctx.textAlign = 'center';
    ctx.font = F(800, 26);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(G.U.mmss(st.time), w / 2, 42);
    ctx.font = F(600, 10);
    ctx.fillStyle = '#8fa3c4';
    ctx.fillText(G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS', w / 2, 58);

    // ---------- clima (arriba a la derecha) ----------
    const wx = G.Weather.current;
    if (wx) {
      ctx.font = F(800, 11);
      ctx.textAlign = 'left';
      const txt = wx.name.toUpperCase() + ' · ' + Math.ceil(wx.left) + 's';
      const tw = ctx.measureText(txt).width + 40;
      const x0 = w - tw - 16 - sa.right - (touch ? 56 : 0), y0 = 14 + sa.top;
      roundRect(ctx, x0, y0, tw, 26, 9);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      G.Icons.draw(ctx, wx.icon, x0 + 6, y0 + 3, 20);
      ctx.fillStyle = wx.color;
      ctx.fillText(txt, x0 + 32, y0 + 17);
    }

    // ---------- barra del jefe ----------
    const boss = G.EnemyMgr.all().find(e => e.boss && !e.dead);
    if (boss) {
      const bw = Math.min(420, w - 80);
      bar(ctx, (w - bw) / 2, 70, bw, 12, boss.hp / boss.maxHp, '#ffcb3d');
      ctx.font = F(800, 10);
      ctx.fillStyle = '#20160a';
      ctx.fillText(boss.name.toUpperCase(), w / 2, 80);
    }

    // ---------- aviso ----------
    // ---------- shinies fuera de pantalla: destello en el borde ----------
    const cam = G.Camera, pulse = 0.6 + Math.sin(performance.now() / 160) * 0.4;
    for (const e of G.EnemyMgr.shinies()) {
      const sx = (e.x - cam.left()) * cam.scale, sy = (e.y - cam.top()) * cam.scale;
      // Fork: alrededor de tu Pokémon y con su disco (js/fork/markers.js).
      const mk = G.Markers.at('shiny:' + e.id, sx, sy, w, h);
      if (!mk) continue;
      const a = mk.a;
      ctx.save();
      ctx.translate(mk.x, mk.y); ctx.scale(mk.k, mk.k);
      G.Markers.halo(ctx, '#9ae6ff', mk);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#9ae6ff';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 31, Math.sin(a) * 31);
      ctx.lineTo(Math.cos(a + 2.5) * 14, Math.sin(a + 2.5) * 14);
      ctx.lineTo(Math.cos(a - 2.5) * 14, Math.sin(a - 2.5) * 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      G.Icons.draw(ctx, 'shiny', -12, -12, 24);
      ctx.restore();
    }

    // Poder de altar activo.
    if (pl.power) {
      const pw = pl.power, txt = pw.def.name.toUpperCase() + ' ' + Math.ceil(pw.t) + 's';
      ctx.font = F(800, 9);
      ctx.textAlign = 'left';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = pw.def.color;
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    if (G.Coop.active) drawCoop(ctx, w, h, pl, px, py + (bx > px ? 56 : 40));

    // Grieta: flecha grande que late en el borde si no se ve, y si se ve, una
    // flecha que bota encima; en la arena, cuenta atrás.
    const rift = G.Rift.rift;
    if (rift) {
      const sx = (rift.x - cam.left()) * cam.scale, sy = (rift.y - 40 - cam.top()) * cam.scale;
      const now = performance.now() / 1000, beat = 0.5 + Math.sin(now * 7) * 0.5;
      const label = 'GRIETA · ' + Math.round(G.U.dist(pl.x, pl.y, rift.x, rift.y) / 32) + ' m · ' + Math.ceil(rift.ttl) + ' s';
      const off = sx < 0 || sx > w || sy < 0 || sy > h;
      ctx.save();
      const mk = G.Markers.at('rift', sx, sy, w, h);      // fork: js/fork/markers.js
      if (off && mk) {
        const a = mk.a, ca = Math.cos(a), sa = Math.sin(a);
        ctx.translate(mk.x, mk.y); ctx.scale(mk.k, mk.k);
        // Halo que late.
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.fillStyle = '#b48aff';
        ctx.beginPath(); ctx.arc(0, 0, 30 + beat * 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        const tri = (k) => {
          ctx.beginPath();
          ctx.moveTo(ca * 40 * k, sa * 40 * k);
          ctx.lineTo(Math.cos(a + 2.45) * 20 * k, Math.sin(a + 2.45) * 20 * k);
          ctx.lineTo(Math.cos(a - 2.45) * 20 * k, Math.sin(a - 2.45) * 20 * k);
          ctx.closePath();
        };
        tri(1.12); ctx.fillStyle = '#1a0b33'; ctx.fill();
        tri(1); ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 12);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 34, ly = -sa * 30 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#e2d0ff';
        ctx.fillText(label, lx, ly);
      } else {
        // Encima de la grieta: flecha hacia abajo que bota.
        const by = sy - 46 - Math.abs(Math.sin(now * 4)) * 10;
        ctx.translate(sx, by);
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(15, -12); ctx.lineTo(0, 8); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = '#1a0b33'; ctx.stroke();
        ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 11); ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const l2 = 'GRIETA · ' + Math.ceil(rift.ttl) + ' s';
        ctx.strokeText(l2, 0, -18); ctx.fillStyle = '#e2d0ff'; ctx.fillText(l2, 0, -18);
      }
      ctx.restore();
    }
    if (G.Rift.inArena) {
      ctx.textAlign = 'center';
      ctx.font = F(800, 12);
      ctx.fillStyle = '#d9c2ff';
      ctx.fillText('GRIETA · ' + G.U.mmss(G.Rift.timeLeft), w / 2, boss ? 98 : 76);
    }

    // Eventos: cuenta atrás, flecha al Pokémon perdido / a la marca y a los duendes.
    G.Events.drawHud(ctx, w, h, pl, F);

    // Aviso propio al abrirse una grieta (no lo tapan los otros avisos).
    if (rift && rift.t < 4.5) {
      const a = Math.min(1, rift.t * 4, (4.5 - rift.t) * 2), pop = 1 + Math.max(0, 0.25 - rift.t) * 1.6;
      const y0 = h * 0.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y0); ctx.scale(pop, pop);
      ctx.font = F(800, 20);
      const t1 = '¡SE HA ABIERTO UNA GRIETA!', t2 = 'Sigue la flecha morada: dentro te espera un legendario';
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = F(700, 11), ctx.measureText(t2).width)) + 36);
      roundRect(ctx, -bw / 2, -26, bw, 52, 10);
      ctx.fillStyle = 'rgba(26,11,51,.88)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#b48aff'; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20); ctx.fillStyle = '#e2d0ff'; ctx.fillText(t1, 0, -2);
      ctx.font = F(700, 11); ctx.fillStyle = '#c9b0ff'; ctx.fillText(t2, 0, 16);
      ctx.restore();
    }

    const ban = G.Spawner.banner();
    if (ban) {
      const a = Math.min(1, ban.t * 1.6);
      ctx.save();
      ctx.globalAlpha = a;
      // Siempre centrado (antes heredaba la alineación de lo último dibujado, p.
      // ej. la flecha de un duende del tesoro, y salía descolocado).
      ctx.textAlign = 'center';
      ctx.font = F(800, 22);
      ctx.fillStyle = '#ffcb3d';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
      ctx.strokeText(ban.text, w / 2, h * 0.3);
      ctx.fillText(ban.text, w / 2, h * 0.3);
      ctx.restore();
    }

    // ---------- ranura de movimientos ----------
    // Tamaño de los iconos (Ajustes > Gráficos): todo el bloque escala con K.
    const K = G.Settings.get('hudSize') || 1, FIT = K !== 1;
    const S = 54 * K, GAP = 9 * K, IG = 18 * K;
    const n = Math.max(1, pl.slots.length);
    const totalW = n * S + (n - 1) * GAP;
    let sx = (w - totalW) / 2;
    // Por encima de la barra de inicio del iPhone (allí los toques a veces no llegan).
    let sy = h - S - 18 - (touch ? Math.min(28, G.Touch.safeArea().bottom) : 0);
    // En móvil, donde la haya puesto el jugador: el bloque objeto + todos los
    // huecos (aunque aún no estén llenos), por su centro, como en el editor
    // (layout-ui.js); los ataques nuevos van saliendo hacia la derecha.
    const pb = touch && G.Touch.spot('bar');
    if (pb) {
      const nAll = Math.max(n, pl.maxMoves), bw = S + IG + nAll * S + (nAll - 1) * GAP;
      sx = G.U.clamp(pb[0] * w - bw / 2, 6, Math.max(6, w - bw - 6)) + S + IG;
      sy = G.U.clamp(pb[1] * h - S / 2, 24, h - S - 6);
    }
    const BOND = '#ff8ad8';
    const cdOf = m => m.kind === 'orbit' ? 0 : G.U.clamp(m.t / (m.cd * pl.cdMul), 0, 1);
    // Ratón: lo que hay debajo (descripción) y el hueco que se arrastra.
    const mo = G.Touch.mouseAt, inBox = (x, y) => mo && mo.x >= x && mo.x <= x + S && mo.y >= y && mo.y <= y + S;
    const drag = G.Touch.drag && G.Touch.drag.moved && pl.slots[G.Touch.drag.slot] ? G.Touch.drag : null;
    let tip = null;

    for (let i = 0; i < n; i++) {
      const g = pl.slots[i] || [];
      const m = g[0];
      const fused = g.length > 1;
      const on = i === pl.active;
      const x = sx + i * (S + GAP);
      const y = on ? sy - 6 * K : sy;
      // Tocar (o hacer clic en) un icono activa ese movimiento.
      if (m) G.Touch.addButton(x, y, S, S, () => { if (G.Game.state === 'playing' && pl.active !== i) { pl.setActive(i); G.Audio.sfx('click'); } }, GAP / 2 + 3, i);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';
      if (m && inBox(x, y)) tip = { cx: x + S / 2, top: y, group: g };
      ctx.save();
      if (drag && drag.slot === i) ctx.globalAlpha = 0.35;

      // fondo
      roundRect(ctx, x, y, S, S, 12 * K);
      ctx.fillStyle = on ? 'rgba(20,30,50,.95)' : 'rgba(10,16,28,.8)';
      ctx.fill();
      ctx.lineWidth = on ? 2.5 : fused || (m && m.evolved) ? 2 : 1.2;
      // Vínculo: borde rosa. Evolucionado: dorado.
      ctx.strokeStyle = fused ? BOND : m && m.evolved ? '#ffd23f' : on ? col : 'rgba(140,170,210,.22)';
      ctx.stroke();
      // Al arrastrar: el hueco donde caería, con borde blanco.
      if (drag && drag.slot !== i && m && inBox(x, y)) {
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#f4f8ff'; ctx.setLineDash([5, 4]);
        roundRect(ctx, x - 3, y - 3, S + 6, S + 6, 14 * K); ctx.stroke();
        ctx.setLineDash([]);
      }

      if (!m) { ctx.restore(); continue; }

      if (fused) {
        // Vínculo: los movimientos en una cuadrícula de 2×2, cada uno con su recarga.
        const C = 22 * K, P = (S - C * 2) / 3;
        g.forEach((gm, k) => {
          const cx = x + P + (k % 2) * (C + P), cy = y + P + Math.floor(k / 2) * (C + P);
          G.Icons.draw(ctx, 'move:' + gm.id, cx, cy, C, FIT);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, cy, C, C * f); }
          if (gm.evolved) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, C - 1, C - 1); }
          const bl = buffLeft(pl, gm);
          if (bl) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx, cy + C - 3 * K, C, 3 * K); ctx.fillStyle = BUFF_COL[gm.stat] || '#fff'; ctx.fillRect(cx, cy + C - 3 * K, C * bl.frac, 3 * K); }
          // Destello al lanzarse.
          const fl = 1 - (performance.now() - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.55).toFixed(2) + ')'; ctx.fillRect(cx, cy, C, C); }
        });
      } else {
        // recarga: se vacía de abajo a arriba
        const cdFrac = cdOf(m);
        if (cdFrac > 0) {
          ctx.save();
          roundRect(ctx, x, y, S, S, 12 * K); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.6)';
          ctx.fillRect(x, y, S, S * cdFrac);
          ctx.restore();
        }

        // emblema del tipo + insignia de la familia
        const I = 32 * K;
        G.Icons.draw(ctx, 'move:' + m.id, x + (S - I) / 2, y + (S - I) / 2 - 2 * K, I, FIT);

        // nivel del movimiento (puntitos)
        const dots = m.def.maxLvl;
        const dw = 4 * K, dgap = 2 * K;
        const tw = dots * dw + (dots - 1) * dgap;
        for (let d = 0; d < dots; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dgap), y + S - 9 * K, dw, 3 * K);
        }

        // Potenciador activo: tiempo que le queda (ver buffLeft).
        const bl = buffLeft(pl, m);
        if (bl) {
          // (A la derecha del número de tecla, que va arriba a la izquierda.)
          const bc = BUFF_COL[m.stat] || '#fff', bx0 = x + 12 * K, bw = S - 16 * K;
          ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(bx0, y + 3 * K, bw, 4 * K);
          ctx.fillStyle = bc; ctx.fillRect(bx0, y + 3 * K, bw * bl.frac, 4 * K);
          ctx.font = F(800, Math.round(9 * K));
          ctx.textAlign = 'right'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
          const secs = buffSecs(bl.b.t);
          ctx.strokeText(secs + 's', x + S - 3 * K, y + S - 12 * K); ctx.fillStyle = '#f4f8ff'; ctx.fillText(secs + 's', x + S - 3 * K, y + S - 12 * K);
          ctx.strokeText('×' + bl.b.n, x + S - 3 * K, y + 17 * K); ctx.fillStyle = bc; ctx.fillText('×' + bl.b.n, x + S - 3 * K, y + 17 * K);
          // (Con Segunda naturaleza, js/fork/rare-cards.js, o ya evolucionado, se relanza solo: no hace falta avisar.)
          if (bl.b.t < BUFF_WARN && !on && !pl.passiveBuffs && !m.passive) {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
            ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255,210,63,${(0.45 + 0.55 * pulse).toFixed(2)})`;
            roundRect(ctx, x - 2, y - 2, S + 4, S + 4, 13 * K); ctx.stroke();
            ctx.font = F(800, Math.round(16 * K)); ctx.textAlign = 'center';
            ctx.strokeText('!', x + S / 2, y - 4 * K); ctx.fillStyle = '#ffd23f'; ctx.fillText('!', x + S / 2, y - 4 * K);
          }
        }
      }

      // tecla
      ctx.font = F(800, Math.round(9 * K));
      ctx.fillStyle = fused ? BOND : on ? col : 'rgba(180,200,230,.6)';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 3 * K, y + 10 * K);

      // nombre encima del activo (con un vínculo: "Ascuas +2")
      if (on) {
        ctx.font = F(700, Math.round(10 * K));
        ctx.textAlign = 'center';
        ctx.fillStyle = fused ? BOND : col;
        ctx.fillText(fused ? G.T(m.name, 'move') + ' +' + (g.length - 1) : G.T(m.name, 'move'), x + S / 2, y - 7 * K);
      }
      ctx.restore();
    }

    // ---------- vínculo guardado (aún no hay dos movimientos sueltos) ----------
    if (pl.bonds > 0) {
      const bx = sx + totalW + 12 * K, by = sy + S / 2 - 12 * K;
      G.Icons.draw(ctx, 'bond', bx, by, 24 * K, FIT);
      if (pl.bonds > 1) {
        ctx.font = F(800, Math.round(10 * K));
        ctx.textAlign = 'left';
        ctx.fillStyle = BOND;
        ctx.fillText('×' + pl.bonds, bx + 25 * K, by + 20 * K);
      }
    }

    // ---------- objeto equipado (a la izquierda de los movimientos) ----------
    {
      const ix = sx - S - IG, iy = sy;
      roundRect(ctx, ix, iy, S, S, 12 * K);
      ctx.fillStyle = pl.item ? 'rgba(40,30,10,.9)' : 'rgba(10,16,28,.55)';
      ctx.fill();
      ctx.lineWidth = pl.item ? 2 : 1;
      ctx.strokeStyle = pl.item ? '#ffd23f' : 'rgba(140,170,210,.18)';
      ctx.stroke();
      if (pl.item) {
        if (inBox(ix, iy)) tip = { cx: ix + S / 2, top: iy, item: pl.item };
        G.Icons.draw(ctx, pl.item, ix + (S - 36 * K) / 2, iy + (S - 36 * K) / 2, 36 * K, FIT);
        ctx.font = F(700, Math.round(9 * K));
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(G.Items.BY[pl.item].name, ix + S / 2, iy - 6 * K);
      }
    }

    // ---------- botón de pausa (táctil) ----------
    if (touch) {
      const sa = G.Touch.safeArea();
      const pp = G.Touch.spot('pause');
      const bx = pp ? G.U.clamp(pp[0] * w - 20, 4, w - 44) : w - 52 - Math.min(44, sa.right);
      const by = pp ? G.U.clamp(pp[1] * h - 20, 10, h - 44) : 12 + Math.min(20, sa.top), bs = 40;
      roundRect(ctx, bx, by, bs, bs, 10);
      ctx.fillStyle = 'rgba(10,16,28,.7)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(bx + 13, by + 11, 5, 18); ctx.fillRect(bx + 22, by + 11, 5, 18);
      G.Touch.addButton(bx, by, bs, bs, () => G.Game.togglePause(), 8);
    }

    // pista de controles
    if (st.time < 14) {
      ctx.font = F(600, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,200,230,.55)';
      ctx.fillText(touch ? 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo'
                         : 'WASD moverse  ·  1-4 / Q / E o clic en un ataque para cambiarlo  ·  Esc pausa', w / 2, h - 4);
    }

    // ---------- arrastrando un movimiento: su icono va con el ratón ----------
    if (drag) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      const gi = 32 * (G.Settings.get('hudSize') || 1);
      G.Icons.draw(ctx, 'move:' + pl.slots[drag.slot][0].id, drag.x - gi / 2, drag.y - gi / 2, gi);
      ctx.restore();
    }

    // ---------- descripción de lo que hay bajo el ratón ----------
    if (tip && !drag && G.Game.state === 'playing') drawTip(ctx, w, pl, tip, n > 1);

    ctx.restore();
  }

  // ---------------- descripción (ratón sobre un movimiento o el objeto) ----------------
  // Los textos se traducen antes (G.T) y se pintan con rawCanvas: cortados en
  // líneas, cada trozo suelto no se traduciría bien.
  const TIP_W = 250, TIP_PAD = 10;
  const CJK = /[\u2e80-\u9fff\uff00-\uffef]/;
  const raw = (ctx, k, s, x, y) => G.I18n.rawCanvas(ctx, k, s, x, y);
  const num = (v, d = 0) => v.toLocaleString(G.I18n.locale, { minimumFractionDigits: d, maximumFractionDigits: d });

  /** Corta `text` (ya traducido) en líneas de `max` px como mucho (el chino, por caracteres). */
  function wrap(ctx, text, max) {
    const out = [];
    let line = '';
    for (const tk of text.match(/[\u2e80-\u9fff\uff00-\uffef]|[^\s\u2e80-\u9fff\uff00-\uffef]+/g) || []) {
      const t = line + (line && !CJK.test(tk) && !CJK.test(line.slice(-1)) ? ' ' : '') + tk;
      if (line && raw(ctx, 'measureText', t).width > max) { out.push(line); line = tk; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  /**
   * Caja encima del hueco con nombre, tipo, categoría, daño por golpe (con tu
   * ataque de ahora, antes de la defensa y la tabla de tipos del enemigo),
   * recarga y descripción; con un vínculo, cada movimiento del grupo.
   */
  function drawTip(ctx, w, pl, tip, canDrag) {
    const inner = TIP_W - TIP_PAD * 2, ops = [];
    let y = 0;
    const para = (s, font, col, lh) => {
      ctx.font = font;
      for (const l of wrap(ctx, s, inner)) { y += lh; const ly = y; ops.push(o => { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = 'left'; raw(ctx, 'fillText', l, TIP_PAD, o + ly); }); }
    };
    const at = f => { const ly = y; ops.push(o => f(o + ly)); };
    let border = '#ffd23f';

    if (tip.item) {
      const it = G.Items.BY[tip.item];
      y += 18;
      at(o => {
        G.Icons.draw(ctx, tip.item, TIP_PAD, o - 14, 18);
        ctx.font = F(800, 13); ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'left';
        raw(ctx, 'fillText', G.T(it.name), TIP_PAD + 24, o);
      });
      y += 2; para(G.T(it.desc), F(500, 11), '#c9d3e6', 15);
    } else {
      tip.group.forEach((m, k) => {
        const col = G.U.TYPE_COLOR[m.type];
        if (k === 0) border = tip.group.length > 1 ? '#ff8ad8' : col;
        if (k > 0) { y += 9; at(o => { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(TIP_PAD, o - 4, inner, 1); }); }
        // nombre y nivel
        y += 18;
        at(o => {
          G.Icons.draw(ctx, 'move:' + m.id, TIP_PAD, o - 14, 16);
          ctx.font = F(800, 13); ctx.fillStyle = m.evolved ? '#ffd23f' : '#f4f8ff'; ctx.textAlign = 'left';
          raw(ctx, 'fillText', G.T(m.name, 'move'), TIP_PAD + 22, o);
          ctx.font = F(700, 10); ctx.fillStyle = '#8fa3c4'; ctx.textAlign = 'right';
          raw(ctx, 'fillText', G.T('Nv.') + m.lvl + '/' + m.def.maxLvl, TIP_W - TIP_PAD, o);
        });
        // tipo (en su color) y categoría
        y += 18;
        at(o => {
          const tn = G.T(G.U.TYPE_NAME[m.type]);
          ctx.font = F(800, 10);
          const tw = raw(ctx, 'measureText', tn).width + 12;
          roundRect(ctx, TIP_PAD, o - 11, tw, 15, 4); ctx.fillStyle = col; ctx.fill();
          ctx.fillStyle = '#10131a'; ctx.textAlign = 'left'; raw(ctx, 'fillText', tn, TIP_PAD + 6, o);
          ctx.font = F(700, 10); ctx.fillStyle = '#c9d3e6';
          raw(ctx, 'fillText', G.T(m.cat ? G.Stats.NAME[m.cat] : 'Mejora'), TIP_PAD + tw + 8, o);
        });
        // Con qué pega y qué lo potencia (fork: js/fork/move-text.js).
        for (const [s, c] of G.MoveText.tipNotes(m, pl)) { y += 2; para(G.T(s), F(600, 10), c, 14); }
        // daño y recarga
        if (m.cat) {
          const row = (label, val) => {
            y += 15;
            at(o => {
              ctx.font = F(600, 11); ctx.fillStyle = '#8fa3c4'; ctx.textAlign = 'left'; raw(ctx, 'fillText', G.T(label), TIP_PAD, o);
              ctx.font = F(800, 11); ctx.fillStyle = '#f4f8ff'; ctx.textAlign = 'right'; raw(ctx, 'fillText', val, TIP_W - TIP_PAD, o);
            });
          };
          y += 2;
          row('Daño', G.I18n.f('{x} por golpe', num(m.dmg * pl.atkFor(m))));
          if (m.kind !== 'orbit') row('Recarga', num(m.cd * pl.cdMul, 1) + ' s');
        }
        y += 2; para(G.T(m.desc), F(500, 11), '#c9d3e6', 15);
      });
      if (canDrag) { y += 4; para(G.T('Arrastra para cambiarlo de hueco'), F(600, 10), '#8fa3c4', 14); }
    }

    const H = y + TIP_PAD + 2;
    const tx = G.U.clamp(tip.cx - TIP_W / 2, 6, Math.max(6, w - TIP_W - 6));
    const ty = Math.max(6, tip.top - 24 - H);
    ctx.save();
    ctx.translate(tx, ty);
    roundRect(ctx, 0, 0, TIP_W, H, 10);
    ctx.fillStyle = 'rgba(10,16,28,.95)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = border; ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    for (const op of ops) op(TIP_PAD - 4);
    ctx.restore();
  }

  // ---------------- cooperativo ----------------

  /**
   * - Vida de cada compañero debajo de la tuya.
   * - Flecha en el borde de la pantalla hacia los que no se ven, con su nombre
   *   y a cuántos metros están (roja y parpadeando si está caído).
   * - Si has caído tú: aviso y barra de "te están levantando".
   */
  function drawCoop(ctx, w, h, pl, px, top) {
    const cam = G.Camera;
    const t = performance.now() / 1000;
    let y = top;
    ctx.textAlign = 'left';
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      ctx.font = F(800, 10);
      ctx.fillStyle = m.color;
      G.I18n.rawCanvas(ctx, 'fillText', m.name, px, y + 9);
      const lx = px + 78;
      bar(ctx, lx, y + 1, 110, 8, o.dead ? 0 : o.hp / o.maxHp, o.dead ? '#ff5f6d' : '#5fe08a');
      if (o.dead) {
        ctx.font = F(800, 9);
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff8a96' : '#ffd0d5';
        ctx.fillText('CAÍDO', lx + 116, y + 9);
      }
      y += 15;
    }

    // Flechas hacia los compañeros fuera de la vista.
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      const sx = (o.x - cam.left()) * cam.scale, sy = (o.y - o.bodyH * 0.5 - cam.top()) * cam.scale;
      // Fork: alrededor de tu Pokémon y con su disco (js/fork/markers.js); caído es otro marcador (se juntan).
      const mk = G.Markers.at((o.dead ? 'down:' : 'mate:') + m.uid, sx, sy, w, h);
      if (!mk) continue;
      const a = mk.a;
      const metres = Math.round(G.U.dist(pl.x, pl.y, o.x, o.y) / 32);
      const col = o.dead ? (Math.sin(t * 8) > 0 ? '#ff5f6d' : '#ffd0d5') : m.color;
      ctx.save();
      ctx.translate(mk.x, mk.y); ctx.scale(mk.k, mk.k);
      G.Markers.halo(ctx, o.dead ? '#ff5f6d' : m.color, mk);
      // Flecha
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a + 2.4) * 14, Math.sin(a + 2.4) * 14);
      ctx.lineTo(Math.cos(a - 2.4) * 14, Math.sin(a - 2.4) * 14);
      ctx.closePath(); ctx.fill();
      // Inicial del compañero dentro del círculo
      ctx.font = F(800, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      G.I18n.rawCanvas(ctx, 'fillText', m.name.charAt(0).toUpperCase(), 0, 5);
      // Nombre y distancia: al lado contrario de la flecha, para que no se salga
      const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
      ctx.font = F(800, 12);
      const label = o.dead ? G.I18n.f('¡{x} necesita ayuda! · {x} m', m.name, metres) : m.name + ' · ' + metres + ' m';
      ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      G.I18n.rawCanvas(ctx, 'strokeText', label, lx, ly);
      ctx.fillStyle = col;
      G.I18n.rawCanvas(ctx, 'fillText', label, lx, ly);
      ctx.restore();
    }

    // Tú, caído.
    if (pl.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const msg = G.Coop.players().every(p => p.dead) ? 'Habéis caído todos…' : 'Has caído: un compañero puede levantarte';
      ctx.strokeText(msg, w / 2, h * 0.62);
      ctx.fillStyle = '#ffb0b8';
      ctx.fillText(msg, w / 2, h * 0.62);
      const f = (pl.reviveT || 0) / G.Player.REVIVE_TIME;
      if (f > 0) bar(ctx, w / 2 - 110, h * 0.62 + 12, 220, 10, f, '#5fe08a');
      // Mirando a un compañero vivo (game.js watched): su nombre entre flechas que se pueden pulsar.
      const wm = G.Game.watching;
      if (wm) {
        const y = h * 0.62 + 46;
        ctx.font = F(800, 15);
        const label = G.I18n.f('Viendo a {x}', wm.name);
        const lw = G.I18n.rawCanvas(ctx, 'measureText', label).width;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = wm.color || '#f4f8ff';
        G.I18n.rawCanvas(ctx, 'strokeText', label, w / 2, y);
        G.I18n.rawCanvas(ctx, 'fillText', label, w / 2, y);
        for (const dir of [-1, 1]) {
          const ax = w / 2 + dir * (lw / 2 + 24), S = 30;
          roundRect(ctx, ax - S / 2, y - 21, S, S, 8);
          ctx.fillStyle = 'rgba(10,16,28,.75)'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
          ctx.fillStyle = '#f4f8ff';
          ctx.beginPath(); ctx.moveTo(ax + dir * 6, y - 6); ctx.lineTo(ax - dir * 5, y - 13); ctx.lineTo(ax - dir * 5, y + 1); ctx.closePath(); ctx.fill();
          G.Touch.addButton(ax - S / 2, y - 21, S, S, () => G.Game.watchNext(dir), 6);
        }
        ctx.font = F(600, 11);
        ctx.fillStyle = 'rgba(200,215,240,.75)';
        ctx.fillText(G.Touch.active ? 'Toca las flechas para cambiar de compañero' : 'Q/E o A/D: cambiar de compañero', w / 2, y + 22);
      }
      ctx.restore();
    }
  }

  return { draw, roundRect, bar };
})();
