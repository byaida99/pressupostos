// imprimir.js (cocinas)
// PDF del cliente (se guarda junto al .json) y PDF de detalle interno (diálogo de impresión).

const Imprimir = (() => {
  const euros = n => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dec = (n, d = 2) => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fecha = f => f ? new Date(f).toLocaleDateString('es-ES') : '';
  const GRUPOS = [['Bajo', 'Módulos bajos'], ['Alto', 'Módulos altos'], ['Columna', 'Columnas'], ['Piezas', 'Piezas y complementos']];

  function imprimir(html, titulo) {
    const cont = document.getElementById('impresion');
    const tituloAnterior = document.title;
    cont.innerHTML = html;
    document.title = titulo;
    document.body.classList.add('imprimiendo');
    const limpiar = () => {
      document.body.classList.remove('imprimiendo');
      cont.innerHTML = '';
      document.title = tituloAnterior;
      window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);
    const img = cont.querySelector('img');
    const lanzar = () => setTimeout(() => window.print(), 50);
    if (img && !img.complete) { img.onload = lanzar; img.onerror = () => { img.remove(); lanzar(); }; }
    else lanzar();
  }

  const nombreArchivo = (pres, sufijo) => [pres.ubicacion?.base || Almacen.nombreBase(pres), sufijo].filter(Boolean).join('_');
  const textoAcabado = ac => [ac.acabado, ac.tipo, ac.color ? `(${ac.color})` : ''].filter(Boolean).join(' ');

  // Grupo de una línea: Bajo, Alto, Columna o Piezas
  const grupoDe = (l, cat) => l.clase === 'pieza' ? 'Piezas' : (Catalogo.modulo(cat, l.codigo)?.tipo || 'Piezas');

  // Composición de un módulo para el cliente: «2 puertas · 2 cajones grandes · 2 estantes · guías Legrabox»
  function composicion(r) {
    const partes = [];
    if (r.puertas?.length) partes.push(`${r.puertas.length} puerta${r.puertas.length > 1 ? 's' : ''}`);
    const cuenta = {};
    (r.cajones || []).forEach(c => { cuenta[c.nombre] = (cuenta[c.nombre] || 0) + 1; });
    Object.entries(cuenta).forEach(([n, c]) => partes.push(c > 1 ? `${c} × ${n.toLowerCase()}` : n.toLowerCase()));
    if (r.nEstantes) partes.push(`${r.nEstantes} estante${r.nEstantes > 1 ? 's' : ''}`);
    const guias = [...new Set(r.nombresGuia || [])];
    if (guias.length) partes.push(`guías ${guias.join(', ')}`);
    return partes.join(' · ');
  }

  function descripcion(l, r, cat) {
    if (l.clase === 'pieza') {
      const def = Catalogo.pieza(cat, l.codigo);
      const medidas = !r.fijo && def ? (def.unidad === 'ml' ? `alto ${dec(l.alto, 0)} mm` : `${dec(l.ancho, 0)} × ${dec(l.alto, 0)} mm`) : '';
      return { nombre: def?.nombre || l.codigo, sub: [medidas, !r.fijo ? textoAcabado(r.acabado) : ''].filter(Boolean).join(' · ') };
    }
    const def = Catalogo.modulo(cat, l.codigo);
    const medidas = `${dec(l.ancho, 0)} × ${dec(l.alto, 0)}${Catalogo.numero(l.fondo) ? ' × ' + dec(l.fondo, 0) : ''} mm`;
    return { nombre: def?.nombre || l.codigo, sub: [medidas, textoAcabado(r.acabado), composicion(r)].filter(Boolean).join(' · ') };
  }

  const unidad = (l, cat) => l.clase === 'pieza' && Catalogo.pieza(cat, l.codigo)?.unidad === 'ml' ? 'ml' : 'ud';

  function htmlCliente(pres, res, cat) {
    const p = cat.parametros;
    const validez = p.validezDias ? `${dec(p.validezDias, 0)} días` : '';
    const vence = p.validezDias && pres.fecha
      ? new Date(new Date(pres.fecha).getTime() + p.validezDias * 864e5).toLocaleDateString('es-ES') : '';

    let filas = '';
    let n = 0;
    GRUPOS.forEach(([clave, titulo]) => {
      const lineas = pres.lineas.map((l, i) => [l, res.lineas[i]]).filter(([l, r]) => grupoDe(l, cat) === clave && r.total > 0);
      if (!lineas.length) return;
      filas += `<tr class="cli-grupo"><td colspan="5">${titulo}</td></tr>`;
      lineas.forEach(([l, r]) => {
        n++;
        const d = descripcion(l, r, cat);
        filas += `<tr class="cli-mueble${n % 2 === 0 ? ' par' : ''}">
          <td class="cli-n">${n}</td>
          <td><div class="cli-nombre">${esc(d.nombre)}</div><div class="cli-mats">${esc(d.sub)}</div>${l.nota ? `<div class="cli-mats">${esc(l.nota)}</div>` : ''}</td>
          <td class="num">${dec(r.cantidad, unidad(l, cat) === 'ml' ? 2 : 0)} ${unidad(l, cat)}</td>
          <td class="num">${euros(r.unidad)}</td>
          <td class="num cli-importe">${euros(r.total)}</td></tr>`;
      });
    });
    const extras = (pres.extras || []).map((e, i) => [e, res.extras[i]]).filter(([, t]) => t > 0);
    if (extras.length) {
      filas += `<tr class="cli-grupo"><td colspan="5">Otros</td></tr>`;
      extras.forEach(([e, t]) => {
        n++;
        filas += `<tr class="cli-mueble${n % 2 === 0 ? ' par' : ''}"><td class="cli-n">${n}</td>
          <td><div class="cli-nombre">${esc(e.nombre || 'Extra')}</div></td>
          <td class="num">${dec(Catalogo.numero(e.cantidad), 0)} ud</td><td class="num">${euros(Catalogo.numero(e.precio))}</td>
          <td class="num cli-importe">${euros(t)}</td></tr>`;
      });
    }

    const pagoIni = res.pagoInicial, pagoFin = res.totalConIva - res.pagoInicial;
    const pctIni = dec(res.pagoInicialPct, 0), pctFin = dec(100 - res.pagoInicialPct, 0);
    const ac = pres.acabado;

    return `<div class="pdf cli">
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
          <div class="cli-rotulo">Cliente${pres.cliente.codigo && pres.cliente.codigo !== '1000' ? ` · nº ${esc(pres.cliente.codigo)}` : ''}</div>
          <div class="cli-valor">${esc(pres.cliente.nombre || '—')}</div>
          ${pres.cliente.contacto ? `<div class="cli-contacto">${esc(pres.cliente.contacto)}</div>` : ''}
        </div>
        ${pres.referencia ? `<div><div class="cli-rotulo">Proyecto</div><div class="cli-valor">${esc(pres.referencia)}</div></div>` : ''}
        <div><div class="cli-rotulo">Acabado exterior</div><div class="cli-valor">${esc(textoAcabado(ac))}</div></div>
      </section>
      ${pres.descripcion ? `<p class="cli-descripcion">${esc(pres.descripcion).replace(/\n/g, '<br>')}</p>` : ''}

      <table class="cli-tabla">
        <thead><tr><th class="cli-n">#</th><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="cli-nota">Medidas en mm (ancho × alto × fondo). Interior en melamina blanca. Incluye herrajes, guías y montaje de los módulos.</p>

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
        </section>
      </div>

      <footer class="cli-pie">
        ${validez ? `Presupuesto válido durante ${validez} desde la fecha de emisión.` : ''}
        ${p.textoPie ? `<br>${esc(p.textoPie)}` : ''}
      </footer>
    </div>`;
  }

  const cliente = (pres, res, cat) => imprimir(htmlCliente(pres, res, cat), nombreArchivo(pres));

  // PDF del cliente como archivo: la página se dibuja con html2canvas y se pasa a A4 con jsPDF,
  // cortando las páginas entre filas.
  async function pdfCliente(pres, res, cat) {
    const MARGEN = 15, ANCHO_MM = 210 - 2 * MARGEN, ALTO_MM = 297 - 2 * MARGEN;
    const ANCHO_PX = 680, ESCALA = 2;
    const cont = document.createElement('div');
    cont.style.cssText = `position:fixed;left:-10000px;top:0;width:${ANCHO_PX}px;background:#fff`;
    cont.innerHTML = htmlCliente(pres, res, cat);
    document.body.appendChild(cont);
    try {
      await Promise.all([...cont.querySelectorAll('img')].map(img => img.complete ? null
        : new Promise(ok => { img.onload = ok; img.onerror = () => { img.remove(); ok(); }; })));
      const arriba = cont.getBoundingClientRect().top;
      const cortes = [...cont.querySelectorAll('.cli > *, .cli-tabla thead, .cli-tabla tbody tr')]
        .map(el => el.getBoundingClientRect().bottom - arriba).sort((a, b) => a - b);
      const lienzo = await html2canvas(cont, { scale: ESCALA, backgroundColor: '#ffffff', logging: false });
      const altoPagina = ALTO_MM * ANCHO_PX / ANCHO_MM;
      const total = lienzo.height / ESCALA;
      const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      doc.setProperties({ title: nombreArchivo(pres) });
      for (let inicio = 0, pagina = 0; inicio < total - 1; pagina++) {
        let fin = Math.min(total, inicio + altoPagina);
        if (fin < total) {
          const corte = cortes.filter(c => c > inicio + 20 && c <= fin).pop();
          if (corte) fin = corte;
        }
        const trozo = document.createElement('canvas');
        trozo.width = lienzo.width;
        trozo.height = Math.ceil((fin - inicio) * ESCALA);
        trozo.getContext('2d').drawImage(lienzo, 0, -Math.floor(inicio * ESCALA));
        if (pagina) doc.addPage();
        doc.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', MARGEN, MARGEN, ANCHO_MM, (fin - inicio) * ANCHO_MM / ANCHO_PX);
        inicio = fin;
      }
      return doc.output('blob');
    } finally {
      cont.remove();
    }
  }

  // Detalle interno: cada módulo con sus conceptos, para revisar el cálculo
  function completo(pres, res, cat) {
    const p = cat.parametros;
    const tar = res.tarifa;
    let filas = '';
    pres.lineas.forEach((l, i) => {
      const r = res.lineas[i];
      const d = descripcion(l, r, cat);
      const c = r.conceptos || {};
      filas += `<tr><td>${i + 1}</td><td><strong>${esc(d.nombre)}</strong><div class="pdf-sub">${esc(d.sub)}</div>${r.error ? `<div class="error">${esc(r.error)}</div>` : ''}</td>
        ${Calculo.CONCEPTOS.map(([k]) => `<td class="num">${l.clase === 'pieza' ? '' : dec(c[k])}</td>`).join('')}
        <td class="num">${dec(r.recargo)}</td><td class="num">${dec(r.unidad)}</td><td class="num">${dec(r.cantidad, l.clase === 'pieza' ? 2 : 0)}</td><td class="num"><strong>${dec(r.total)}</strong></td></tr>`;
    });
    (pres.extras || []).forEach((e, i) => {
      filas += `<tr><td></td><td>${esc(e.nombre || 'Extra')}</td>${Calculo.CONCEPTOS.map(() => '<td></td>').join('')}<td></td>
        <td class="num">${dec(Catalogo.numero(e.precio))}</td><td class="num">${esc(e.cantidad)}</td><td class="num"><strong>${dec(res.extras[i])}</strong></td></tr>`;
    });
    const html = `<div class="pdf pdf-completo">
      <h1 class="pdf-titulo">Presupuesto de cocina – detalle interno</h1>
      <table class="pdf-datos">
        <tr><th>Presupuesto nº</th><td>${esc(pres.numero || '(sin guardar)')}</td><th>Fecha</th><td>${fecha(pres.fecha)}</td></tr>
        <tr><th>Cliente</th><td>${esc(pres.cliente.nombre || '—')}</td><th>Tarifa</th><td>${tar.numero} · ${esc(tar.nombre)}${tar.recargoPct ? ` (+${dec(tar.recargoPct, 0)} %)` : ''}</td></tr>
        <tr><th>Acabado</th><td>${esc(textoAcabado(pres.acabado))}</td><th>Guías</th><td>${esc(pres.guias)}</td></tr>
      </table>
      <table class="pdf-tabla compacta"><thead><tr><th>#</th><th>Módulo</th>${Calculo.CONCEPTOS.map(([, t]) => `<th class="num">${t}</th>`).join('')}
        <th class="num">Recargo</th><th class="num">Precio ud</th><th class="num">Cant.</th><th class="num">Total</th></tr></thead>
        <tbody>${filas}</tbody></table>
      <table class="pdf-tabla resumen-pdf" style="margin-top:14px">
        <tr><td>Base imponible</td><td class="num">${euros(res.total)}</td></tr>
        <tr><td>IVA (${dec(p.ivaPct, 0)} %)</td><td class="num">${euros(res.iva)}</td></tr>
        <tr class="pdf-total"><td>TOTAL (IVA incluido)</td><td class="num">${euros(res.totalConIva)}</td></tr>
      </table>
      <p class="pdf-pie">Precios del catálogo de cocinas del ${fecha(cat.fecha)}. Importes en €.</p></div>`;
    imprimir(html, nombreArchivo(pres, 'detalle'));
  }

  return { cliente, htmlCliente, pdfCliente, completo, nombreArchivo, descripcion, composicion, textoAcabado, GRUPOS, grupoDe };
})();
