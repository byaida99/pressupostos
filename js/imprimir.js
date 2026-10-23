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

  function cliente(pres, res, cat) {
    const p = cat.parametros;
    const filas = [
      ['Mobiliario a medida: materiales, mecanizado y accesorios', euros(res.base + res.recargoBase)]
    ];
    if (res.descuento > 0) filas.push(['Descuento', '−' + euros(res.descuento), 'verde']);
    if (res.acabadoTotal > 0) filas.push(['Acabado superficial (opcional)', euros(res.acabadoTotal), 'cursiva']);

    let pie = `<tr class="pdf-total"><td>${p.mostrarIva ? 'Total sin IVA' : 'PRESUPUESTO FINAL'}</td><td>${euros(res.total)}</td></tr>`;
    if (p.mostrarIva) {
      pie += `<tr><td>IVA (${dec(p.ivaPct, 0)} %)</td><td>${euros(res.iva)}</td></tr>
              <tr class="pdf-total"><td>TOTAL CON IVA</td><td>${euros(res.totalConIva)}</td></tr>`;
    }
    const validez = p.validezDias ? `Presupuesto válido ${dec(p.validezDias, 0)} días.` : '';
    const html = `<div class="pdf">
      ${cabecera(pres, cat, 'Presupuesto')}
      <table class="pdf-tabla">
        <thead><tr><th>Descripción</th><th class="num">Importe</th></tr></thead>
        <tbody>${filas.map(([t, v, c]) => `<tr class="${c || ''}"><td>${t}</td><td class="num">${v}</td></tr>`).join('')}</tbody>
        <tfoot>${pie}</tfoot>
      </table>
      <p class="pdf-pie">${p.mostrarIva ? '' : 'Precio sin IVA. '}${validez}${p.textoPie ? '<br>' + esc(p.textoPie) : ''}</p>
    </div>`;
    imprimir(html, nombreArchivo(pres));
  }

  function completo(pres, res, cat) {
    const p = cat.parametros;
    const nombresConcepto = Object.fromEntries(Calculo.CONCEPTOS);
    let html = `<div class="pdf pdf-completo">${cabecera(pres, cat, 'Presupuesto – detalle interno')}`;

    pres.secciones.forEach((sec, i) => {
      const r = res.secciones[i];
      const fam = Catalogo.familia(cat, sec.familia);
      const tab = Catalogo.tablero(cat, sec.familia, sec.acabado, sec.grosor);
      const conCanto = fam?.canto === 'CANTO', conAcabado = fam?.acabadoSuperficial;
      html += `<h2>${i + 1}. ${esc(fam?.nombre || sec.familia)} – ${esc(tab ? Catalogo.textoTablero(tab) : `${sec.acabado} ${sec.grosor} mm`)}</h2>
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

    if (pres.extras.length) {
      html += `<h2>Extras y herrajes</h2><table class="pdf-tabla compacta"><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Cant.</th><th class="num">Total</th></tr></thead><tbody>
        ${pres.extras.map((ex, e) => `<tr class="${ex.excluir ? 'tachado' : ''}"><td>${esc(ex.nombre || ex.producto)}</td><td class="num">${euros(Catalogo.numero(ex.precio))}</td>
          <td class="num">${esc(ex.cantidad)}</td><td class="num">${euros(res.extras[e])}</td></tr>`).join('')}</tbody></table>`;
    }

    html += `<h2>Resumen</h2><table class="pdf-tabla resumen-pdf">
      <tr><td>Materiales, mecanizado y extras</td><td class="num">${euros(res.base)}</td></tr>
      <tr><td>+ Recargo por escala (${dec(res.recargoBasePct, 0)} %)</td><td class="num">${euros(res.recargoBase)}</td></tr>
      ${res.descuento > 0 ? `<tr class="verde"><td>− Descuento carpintero (${dec(res.descuentoPct, 1)} % s/ tablero y canto)</td><td class="num">−${euros(res.descuento)}</td></tr>` : ''}
      <tr><td><strong>Subtotal</strong></td><td class="num"><strong>${euros(res.subtotal)}</strong></td></tr>
      ${res.acabadoTotal > 0 ? `<tr><td>+ Acabado superficial (${euros(res.acabado)} + recargo ${dec(res.recargoAcabadoPct, 0)} %)</td><td class="num">${euros(res.acabadoTotal)}</td></tr>` : ''}
      <tr class="pdf-total"><td>TOTAL (sin IVA)</td><td class="num">${euros(res.total)}</td></tr>
      ${p.mostrarIva ? `<tr><td>IVA (${dec(p.ivaPct, 0)} %)</td><td class="num">${euros(res.iva)}</td></tr><tr class="pdf-total"><td>Total con IVA</td><td class="num">${euros(res.totalConIva)}</td></tr>` : ''}
    </table>
    <p class="pdf-pie">Precios del catálogo del ${fecha(cat.fecha)}. Los conceptos tachados no se cobran.</p></div>`;
    imprimir(html, nombreArchivo(pres, 'detalle'));
  }

  return { cliente, completo };
})();
