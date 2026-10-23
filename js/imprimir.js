// imprimir.js
// PDF del cliente y PDF completo (interno). Ambos usan el resultado de Calculo.

const Imprimir = (() => {
  const euros = n => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dec = (n, d = 2) => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fecha = f => f ? new Date(f).toLocaleDateString('es-ES') : '';

  function imprimir(html, titulo) {
    const cont = document.getElementById('impresion');
    const tituloAnterior = document.title;
    cont.innerHTML = html;
    document.title = titulo; // Chrome lo propone como nombre del PDF
    document.body.classList.add('imprimiendo');
    const limpiar = () => {
      document.body.classList.remove('imprimiendo');
      cont.innerHTML = '';
      document.title = tituloAnterior;
      window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);
    // Espera a que cargue el logo antes de abrir el diálogo
    const img = cont.querySelector('img');
    const lanzar = () => setTimeout(() => window.print(), 50);
    if (img && !img.complete) { img.onload = lanzar; img.onerror = () => { img.remove(); lanzar(); }; }
    else lanzar();
  }

  function cabecera(pres, cat, titulo) {
    const p = cat.parametros;
    return `
      <div class="pdf-cabecera">
        ${p.logo ? `<img src="${esc(p.logo)}" alt="" class="pdf-logo">` : ''}
        ${p.empresa ? `<div class="pdf-empresa">${esc(p.empresa)}</div>` : ''}
      </div>
      <h1 class="pdf-titulo">${titulo}</h1>
      <table class="pdf-datos">
        <tr><th>Presupuesto nº</th><td>${esc(pres.numero || '(sin guardar)')}</td><th>Fecha</th><td>${fecha(pres.fecha)}</td></tr>
        <tr><th>Cliente</th><td>${esc(pres.cliente.nombre || '—')}</td><th>Contacto</th><td>${esc(pres.cliente.contacto || '—')}</td></tr>
        <tr><th>Referencia</th><td colspan="3">${esc(pres.referencia || '—')}</td></tr>
      </table>
      ${pres.descripcion ? `<div class="pdf-descripcion"><strong>Descripción</strong><br>${esc(pres.descripcion).replace(/\n/g, '<br>')}</div>` : ''}`;
  }

  function nombreArchivo(pres, sufijo) {
    return [pres.numero || 'Presupuesto', pres.cliente.nombre, sufijo].filter(Boolean).join(' - ');
  }

  const nombreMueble = (mu, m) => mu.nombre || (m === 0 ? 'Mobiliario a medida' : `Mueble ${m + 1}`);

  // Materiales de un mueble en una línea, para el PDF del cliente
  function materialesDe(mu, cat) {
    const textos = [];
    mu.secciones.forEach(sec => {
      if (!sec.piezas.some(p => p.largo && p.ancho)) return;
      const fam = Catalogo.familia(cat, sec.familia);
      const t = `${fam?.nombre || sec.familia} ${sec.acabado} ${sec.grosor} mm`;
      if (!textos.includes(t)) textos.push(t);
    });
    return textos.join(' · ');
  }

  function cliente(pres, res, cat) {
    const p = cat.parametros;
    const validez = p.validezDias ? `${dec(p.validezDias, 0)} días` : '';
    const vence = p.validezDias && pres.fecha
      ? new Date(new Date(pres.fecha).getTime() + p.validezDias * 864e5).toLocaleDateString('es-ES') : '';

    let filas = '';
    let n = 0;
    pres.muebles.forEach((mu, m) => {
      const rm = res.muebles[m];
      if (mu.activo === false || (!rm.precio && !rm.acabadoTotal)) return;
      n++;
      const par = n % 2 === 0 ? ' par' : '';
      const mats = materialesDe(mu, cat);
      filas += `<tr class="cli-mueble${par}">
          <td class="cli-n">${n}</td>
          <td><div class="cli-nombre">${esc(nombreMueble(mu, m))}</div>${mats ? `<div class="cli-mats">${esc(mats)}</div>` : ''}</td>
          <td class="num cli-importe">${euros(rm.precio)}</td></tr>`;
      if (rm.acabadoTotal > 0) {
        filas += `<tr class="cli-opcional${par}"><td></td>
          <td>Acabado superficial (lacado / barnizado) <span class="cli-etiqueta">opcional</span></td>
          <td class="num">${euros(rm.acabadoTotal)}</td></tr>`;
      }
    });

    const pagoIni = res.pagoInicial, pagoFin = res.totalConIva - res.pagoInicial;
    const pctIni = dec(res.pagoInicialPct, 0), pctFin = dec(100 - res.pagoInicialPct, 0);

    const html = `<div class="pdf cli">
      <header class="cli-cabecera">
        <div class="cli-marca">
          ${p.logo ? `<img src="${esc(p.logo)}" alt="" class="cli-logo">` : ''}
          ${p.empresa ? `<div class="cli-empresa">${esc(p.empresa)}</div>` : ''}
        </div>
        <div class="cli-doc">
          <div class="cli-titulo">PRESUPUESTO</div>
          <table class="cli-meta">
            <tr><td>Nº</td><td><strong>${esc(pres.numero || 'borrador')}</strong></td></tr>
            <tr><td>Fecha</td><td>${fecha(pres.fecha)}</td></tr>
            ${vence ? `<tr><td>Válido hasta</td><td>${vence}</td></tr>` : ''}
          </table>
        </div>
      </header>

      <section class="cli-cliente">
        <div>
          <div class="cli-rotulo">Cliente</div>
          <div class="cli-valor">${esc(pres.cliente.nombre || '—')}</div>
          ${pres.cliente.contacto ? `<div class="cli-contacto">${esc(pres.cliente.contacto)}</div>` : ''}
        </div>
        ${pres.referencia ? `<div><div class="cli-rotulo">Proyecto</div><div class="cli-valor">${esc(pres.referencia)}</div></div>` : ''}
      </section>
      ${pres.descripcion ? `<p class="cli-descripcion">${esc(pres.descripcion).replace(/\n/g, '<br>')}</p>` : ''}

      <table class="cli-tabla">
        <thead><tr><th class="cli-n">#</th><th>Descripción</th><th class="num">Importe</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${res.descuento > 0 ? `<p class="cli-descuento">✓ Los precios incluyen un descuento de ${euros(res.descuento)}.</p>` : ''}

      <div class="cli-final">
        <section class="cli-condiciones">
          <h3>Condiciones de aceptación</h3>
          <div class="cli-paso"><span class="cli-paso-n">1</span>
            <div><strong>Inicio del proyecto · ${pctIni} %</strong><br>Para empezar el trabajo se abona el ${pctIni} % del total:
              <span class="cli-resalte">${euros(pagoIni)}</span></div></div>
          <div class="cli-paso"><span class="cli-paso-n">2</span>
            <div><strong>Entrega · ${pctFin} %</strong><br>El ${pctFin} % restante, <strong>${euros(pagoFin)}</strong>, se liquida a la entrega del material.</div></div>
          ${p.iban ? `<div class="cli-iban"><span>Número de cuenta para el ingreso</span><code>${esc(p.iban)}</code></div>` : ''}
        </section>
        <section class="cli-totales">
          <div class="cli-linea"><span>Base imponible</span><span>${euros(res.total)}</span></div>
          <div class="cli-linea"><span>IVA (${dec(p.ivaPct, 0)} %)</span><span>${euros(res.iva)}</span></div>
          <div class="cli-total"><span>TOTAL<small>IVA incluido</small></span><span>${euros(res.totalConIva)}</span></div>
          ${res.acabadoTotal > 0 ? `<p class="cli-nota">El total incluye el acabado superficial opcional. Sin él: ${euros(res.subtotal * (1 + (p.ivaPct || 0) / 100))} IVA incluido.</p>` : ''}
        </section>
      </div>

      <footer class="cli-pie">
        ${validez ? `Presupuesto válido durante ${validez} desde la fecha de emisión.` : ''}
        ${p.textoPie ? `<br>${esc(p.textoPie)}` : ''}
      </footer>
    </div>`;
    imprimir(html, nombreArchivo(pres));
  }

  function completo(pres, res, cat) {
    const p = cat.parametros;
    const nombresConcepto = Object.fromEntries(Calculo.CONCEPTOS);
    let html = `<div class="pdf pdf-completo">${cabecera(pres, cat, 'Presupuesto – detalle interno')}`;

    pres.muebles.forEach((mu, m) => {
      const rm = res.muebles[m];
      if (mu.activo === false) return;
      html += `<h2 class="pdf-mueble">${esc(nombreMueble(mu, m))} — ${euros(rm.precio)}${rm.acabadoTotal > 0 ? ` + ${euros(rm.acabadoTotal)} acabado opcional` : ''}</h2>`;
      mu.secciones.forEach((sec, i) => {
        const r = rm.secciones[i];
        const fam = Catalogo.familia(cat, sec.familia);
        const tab = Catalogo.tablero(cat, sec.familia, sec.acabado, sec.grosor);
        const conCanto = fam?.canto === 'CANTO', conAcabado = fam?.acabadoSuperficial;
        html += `<h3>${i + 1}. ${esc(fam?.nombre || sec.familia)} – ${esc(tab ? Catalogo.textoTablero(tab) : `${sec.acabado} ${sec.grosor} mm`)}</h3>
          <p class="pdf-meta">Tablero ${esc(sec.medida.replace('x', ' × '))} cm · ${sec.modo === 'M2_MERMA' ? 'm² de pieza + merma' : 'tableros enteros'}</p>
          <table class="pdf-tabla compacta"><thead><tr><th>Pieza</th><th class="num">Largo</th><th class="num">Ancho</th><th class="num">Cant.</th>
            ${conCanto ? '<th>Cantos</th>' : ''}${conAcabado ? '<th>Acabado</th>' : ''}<th class="num">m²</th><th class="num">€</th></tr></thead><tbody>
          ${sec.piezas.map((pz, j) => {
            const rp = r.piezas[j];
            if (!rp.m2) return '';
            const cantos = ['L1', 'L2', 'A1', 'A2'].filter((_, k) => pz.cantos[k]).join(' ') || '—';
            return `<tr><td>${esc(pz.nombre || `Pieza ${j + 1}`)}</td><td class="num">${esc(pz.largo)}</td><td class="num">${esc(pz.ancho)}</td><td class="num">${esc(pz.cantidad)}</td>
              ${conCanto ? `<td>${cantos}</td>` : ''}${conAcabado ? `<td>${esc(pz.acabado)}${pz.dosCaras ? ' (2 caras)' : ''}</td>` : ''}
              <td class="num">${dec(rp.m2)}</td><td class="num">${dec(rp.coste)}</td></tr>`;
          }).join('')}</tbody></table>
          <p class="pdf-meta">${dec(r.m2Piezas)} m² piezas · ${dec(r.m2Neto)} m² con merma ${dec(p.mermaPct, 0)} % · ${dec(r.tableros, 1)} tablero(s) ·
            ${dec(r.mlCorte)} ml corte · ${dec(r.mlCanteado)} ml canteado${r.rollos ? ` (${r.rollos} rollo${r.rollos > 1 ? "s" : ""})` : ''}</p>
          <table class="pdf-tabla compacta conceptos"><tr>
            ${Calculo.CONCEPTOS.map(([k]) => `<th class="${sec.excluir[k] ? 'tachado' : ''}">${nombresConcepto[k]}</th>`).join('')}<th>Subtotal</th></tr><tr>
            ${Calculo.CONCEPTOS.map(([k]) => `<td class="num ${sec.excluir[k] ? 'tachado' : ''}">${euros(r.costes[k])}</td>`).join('')}<td class="num"><strong>${euros(r.subtotal)}</strong></td></tr>
          </table>`;
      });

      if (mu.extras.length) {
        html += `<h3>Extras y herrajes</h3><table class="pdf-tabla compacta"><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Cant.</th><th class="num">Total</th></tr></thead><tbody>
          ${mu.extras.map((ex, e) => `<tr class="${ex.excluir ? 'tachado' : ''}"><td>${esc(ex.nombre || ex.producto)}</td><td class="num">${euros(Catalogo.numero(ex.precio))}</td>
            <td class="num">${esc(ex.cantidad)}</td><td class="num">${euros(rm.extras[e])}</td></tr>`).join('')}</tbody></table>`;
      }
    });

    html += `<h2 class="pdf-mueble">Resumen</h2><table class="pdf-tabla resumen-pdf">
      ${pres.muebles.length > 1 ? pres.muebles.filter(mu => mu.activo !== false).map(mu => [mu, pres.muebles.indexOf(mu)]).map(([mu, m]) => `<tr><td>${esc(nombreMueble(mu, m))}</td><td class="num">${euros(res.muebles[m].precio)}${res.muebles[m].acabadoTotal > 0 ? ` (+ ${euros(res.muebles[m].acabadoTotal)} acabado)` : ''}</td></tr>`).join('') : ''}
      <tr><td>Materiales, mecanizado y extras</td><td class="num">${euros(res.base)}</td></tr>
      <tr><td>+ Recargo por escala (${pres.recargoActivo === false ? 'desactivado' : dec(res.recargoPct, 0) + ' % s/ total'})</td><td class="num">${euros(res.recargoBase)}</td></tr>
      ${res.descuento > 0 ? `<tr class="verde"><td>− Descuento carpintero (${dec(res.descuentoPct, 1)} % s/ tablero y canto)</td><td class="num">−${euros(res.descuento)}</td></tr>` : ''}
      <tr><td><strong>Subtotal</strong></td><td class="num"><strong>${euros(res.subtotal)}</strong></td></tr>
      ${res.acabadoTotal > 0 ? `<tr><td>+ Acabado superficial (${euros(res.acabado)} + recargo)</td><td class="num">${euros(res.acabadoTotal)}</td></tr>` : ''}
      <tr><td><strong>Base imponible</strong></td><td class="num"><strong>${euros(res.total)}</strong></td></tr>
      <tr><td>IVA (${dec(p.ivaPct, 0)} %)</td><td class="num">${euros(res.iva)}</td></tr>
      <tr class="pdf-total"><td>TOTAL (IVA incluido)</td><td class="num">${euros(res.totalConIva)}</td></tr>
      <tr><td>Pago inicial (${dec(res.pagoInicialPct, 0)} %)</td><td class="num">${euros(res.pagoInicial)}</td></tr>
    </table>
    <p class="pdf-pie">Precios del catálogo del ${fecha(cat.fecha)}. Los conceptos tachados no se cobran.</p></div>`;
    imprimir(html, nombreArchivo(pres, 'detalle'));
  }

  return { cliente, completo };
})();
