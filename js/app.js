// app.js
// Pantalla principal: estado del presupuesto, eventos y pintado.

const App = (() => {
  const SIN = Catalogo.SIN_ACABADO;
  const CLAVE_BORRADOR = 'presupuesto-borrador-v4';

  let catActual = null;      // catálogo leído ahora del Excel
  let pres = null;           // presupuesto en pantalla (lleva sus propios precios en pres.precios)
  let res = null;            // último cálculo
  let fechaArchivo = null;   // fecha del presupuesto.json cuando se abrió o guardó
  let cambios = false;
  let modoCarpeta = false;   // true = trabajando con la carpeta del NAS

  const $ = sel => document.querySelector(sel);
  const cat = () => pres.precios;
  const hoy = () => new Date().toISOString().slice(0, 10);
  const euros = n => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dec = (n, d = 2) => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const opt = (valor, texto, sel) => `<option value="${esc(valor)}"${sel ? ' selected' : ''}>${esc(texto)}</option>`;

  // ------------------------------------------------------------------ modelo
  function acabadoPorDefecto(codigoFamilia) {
    const fam = Catalogo.familia(cat(), codigoFamilia);
    if (!fam?.acabadoSuperficial) return SIN;
    return Catalogo.acabadosDe(cat(), codigoFamilia)[0]?.nombre || SIN;
  }

  function piezaNueva(codigoFamilia, datos = {}) {
    return {
      nombre: '', largo: '', ancho: '', cantidad: 1,
      cantos: [false, false, false, false],
      acabado: acabadoPorDefecto(codigoFamilia), dosCaras: false,
      ...datos
    };
  }

  function seccionNueva(codigoFamilia, acabado, grosor) {
    const c = cat();
    const fam = Catalogo.familia(c, codigoFamilia) || c.familias[0];
    const tabs = Catalogo.tablerosDe(c, fam.codigo);
    const t = tabs.find(x => x.acabado === acabado && x.grosor === grosor) || tabs[0];
    return {
      familia: fam.codigo, acabado: t?.acabado || '', grosor: t?.grosor || 0,
      medida: fam.medida || c.medidas[0] || '', modo: 'TABLERO_ENTERO',
      piezas: [], excluir: {}
    };
  }

  function presupuestoVacio() {
    pres = {
      version: 4, numero: '', fecha: hoy(),
      cliente: { nombre: '', contacto: '' }, referencia: '', descripcion: '',
      descuento: { activo: false, porcentaje: catActual.parametros.descuentoCarpinteroPct },
      secciones: [], extras: [], precios: catActual
    };
    const s = seccionNueva(catActual.familias[0]?.codigo);
    s.piezas.push(piezaNueva(s.familia));
    pres.secciones.push(s);
    return pres;
  }

  // Completa campos que pueden faltar en presupuestos guardados
  function prepararCargado(p) {
    p.cliente = p.cliente || { nombre: '', contacto: '' };
    p.descuento = p.descuento || { activo: false, porcentaje: catActual.parametros.descuentoCarpinteroPct };
    p.secciones = p.secciones || [];
    p.extras = p.extras || [];
    p.precios = p.precios || catActual;
    p.secciones.forEach(s => { s.excluir = s.excluir || {}; s.piezas.forEach(pz => { pz.cantos = pz.cantos || [false, false, false, false]; }); });
    return p;
  }

  // --------------------------------------------------------------- pintado
  function pintarTodo() {
    document.querySelectorAll('.app [data-bind]').forEach(el => {
      if (el.closest('#secciones, #extras, #desglose')) return;
      const v = el.dataset.bind.split('.').reduce((o, k) => o?.[k], pres);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    });
    pintarSecciones();
    pintarExtras();
    Mueble.rellenarMateriales(cat());
    avisoPrecios();
    recalcular();
  }

  function pintarSecciones() {
    const c = cat();
    $('#secciones').innerHTML = pres.secciones.map((sec, i) => {
      const fam = Catalogo.familia(c, sec.familia);
      const conCanto = fam?.canto === 'CANTO';
      const conAcabado = fam?.acabadoSuperficial;
      const tabs = Catalogo.tablerosDe(c, sec.familia);
      const tabActual = tabs.some(t => t.acabado === sec.acabado && t.grosor === sec.grosor);
      const acabados = conAcabado ? [SIN, ...Catalogo.acabadosDe(c, sec.familia).map(a => a.nombre)] : [];

      const filas = sec.piezas.map((pz, j) => `
        <tr data-s="${i}" data-p="${j}">
          <td><input type="text" data-bind="pz.nombre" value="${esc(pz.nombre)}" placeholder="Pieza ${j + 1}"></td>
          <td><input type="number" class="num" data-bind="pz.largo" value="${esc(pz.largo)}" min="0" placeholder="mm"></td>
          <td><input type="number" class="num" data-bind="pz.ancho" value="${esc(pz.ancho)}" min="0" placeholder="mm"></td>
          <td><input type="number" class="num corto" data-bind="pz.cantidad" value="${esc(pz.cantidad)}" min="1"></td>
          ${conCanto ? `<td class="cantos">${['L1', 'L2', 'A1', 'A2'].map((t, k) =>
            `<label title="Canto en ${k < 2 ? 'largo' : 'ancho'} ${k % 2 + 1}"><input type="checkbox" data-bind="pz.canto" data-k="${k}"${pz.cantos[k] ? ' checked' : ''}>${t}</label>`).join('')}
            <button class="mini" data-accion="cantos-todos" title="Marcar / desmarcar los 4 lados">4</button></td>` : ''}
          ${conAcabado ? `<td class="acabado-celda"><select data-bind="pz.acabado">${acabados.map(a => opt(a, a, a === pz.acabado)).join('')}</select>
            <label title="Acabado por las dos caras"><input type="checkbox" data-bind="pz.dosCaras"${pz.dosCaras ? ' checked' : ''}>2 caras</label></td>` : ''}
          <td class="num salida" data-out="m2"></td>
          <td class="num salida" data-out="coste"></td>
          <td class="acciones">
            <button class="mini" data-accion="duplicar-pieza" title="Duplicar fila">⧉</button>
            <button class="mini peligro" data-accion="borrar-pieza" title="Borrar fila">✕</button>
          </td>
        </tr>`).join('');

      return `
      <section class="tarjeta seccion" data-s="${i}">
        <div class="seccion-cabecera">
          <h3>Material ${i + 1}</h3>
          <label>Material <select data-bind="sec.familia">${c.familias.map(f => opt(f.codigo, f.nombre, f.codigo === sec.familia)).join('')}</select></label>
          <label class="crece">Tablero <select data-bind="sec.tablero">
            ${tabActual ? '' : opt('', `⚠ ${sec.acabado} ${sec.grosor} mm (ya no está en el catálogo)`, true)}
            ${tabs.map(t => opt(`${t.acabado}|${t.grosor}`, Catalogo.textoTablero(t), t.acabado === sec.acabado && t.grosor === sec.grosor)).join('')}
          </select></label>
          <label>Medida tablero <select data-bind="sec.medida">${c.medidas.map(m => opt(m, m.replace('x', ' × ') + ' cm', m === sec.medida)).join('')}</select></label>
          <label>Coste tablero <select data-bind="sec.modo">
            ${opt('TABLERO_ENTERO', 'Tableros enteros', sec.modo !== 'M2_MERMA')}
            ${opt('M2_MERMA', 'm² de pieza + merma', sec.modo === 'M2_MERMA')}
          </select></label>
          <div class="seccion-botones">
            <button class="mini" data-accion="duplicar-seccion" title="Duplicar este material con sus piezas">⧉</button>
            <button class="mini peligro" data-accion="borrar-seccion" title="Eliminar este material">✕</button>
          </div>
        </div>
        <table class="tabla tabla-piezas">
          <thead><tr>
            <th>Pieza</th><th class="num">Largo</th><th class="num">Ancho</th><th class="num">Cant.</th>
            ${conCanto ? '<th>Cantos</th>' : ''}${conAcabado ? '<th>Acabado</th>' : ''}
            <th class="num">m²</th><th class="num">€</th><th></th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="seccion-pie">
          <button class="anadir" data-accion="anadir-pieza">➕ Añadir pieza <small>(o Intro en la última fila)</small></button>
          <span class="seccion-totales" data-out="seccion"></span>
        </div>
      </section>`;
    }).join('');
  }

  function pintarExtras() {
    const c = cat();
    $('#extras').innerHTML = pres.extras.map((ex, e) => `
      <tr data-e="${e}">
        <td><select data-bind="ex.producto">
          ${opt('', 'Otro (escribir)', !ex.producto)}
          ${c.extras.map(x => opt(x.nombre, `${x.nombre} (${dec(x.precio)} €)`, x.nombre === ex.producto)).join('')}
        </select></td>
        <td><input type="text" data-bind="ex.nombre" value="${esc(ex.nombre)}" placeholder="Descripción"></td>
        <td><input type="number" class="num" data-bind="ex.precio" value="${esc(ex.precio)}" step="0.01" min="0"></td>
        <td><input type="number" class="num corto" data-bind="ex.cantidad" value="${esc(ex.cantidad)}" min="0"></td>
        <td class="num salida" data-out="extra"></td>
        <td class="acciones"><button class="mini peligro" data-accion="borrar-extra" title="Borrar">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin extras</td></tr>';
  }

  function pintarDesglose() {
    const c = cat();
    const celda = (clave, importe, excluido) =>
      `<td class="num"><label class="${excluido ? 'excluido' : ''}">${euros(importe)}
        <input type="checkbox" data-excl="${clave}"${excluido ? '' : ' checked'}></label></td>`;
    let html = `<table class="tabla tabla-desglose"><thead><tr><th>Material / extra</th>
      ${Calculo.CONCEPTOS.map(([, t]) => `<th class="num">${t}</th>`).join('')}<th class="num">Subtotal</th></tr></thead><tbody>`;
    pres.secciones.forEach((sec, i) => {
      const r = res.secciones[i];
      const fam = Catalogo.familia(c, sec.familia);
      html += `<tr><td>${i + 1}. ${esc(fam?.nombre || sec.familia)} – ${esc(sec.acabado)} ${sec.grosor} mm</td>
        ${Calculo.CONCEPTOS.map(([k]) => celda(`s|${i}|${k}`, r.costes[k], sec.excluir[k])).join('')}
        <td class="num"><strong>${euros(r.subtotal)}</strong></td></tr>`;
    });
    pres.extras.forEach((ex, e) => {
      html += `<tr><td>Extra: ${esc(ex.nombre || ex.producto || 'Extra')}</td>
        <td colspan="${Calculo.CONCEPTOS.length - 1}"></td>${celda(`e|${e}`, res.extras[e], ex.excluir)}
        <td class="num"><strong>${euros(ex.excluir ? 0 : res.extras[e])}</strong></td></tr>`;
    });
    html += '</tbody></table>';
    $('#desglose').innerHTML = html;
  }

  function pintarResumen() {
    const p = cat().parametros;
    const fila = (t, v, cls = '') => `<div class="fila ${cls}"><span>${t}</span><span>${v}</span></div>`;
    let html = fila('Materiales, mecanizado y extras', euros(res.base));
    html += fila(`+ Recargo por escala (${dec(res.recargoBasePct, 0)} %)`, euros(res.recargoBase));
    if (pres.descuento.activo) html += fila(`− Descuento carpintero (${dec(res.descuentoPct, 1)} % s/ tablero y canto)`, '−' + euros(res.descuento), 'verde');
    html += fila('Subtotal', euros(res.subtotal), 'negrita');
    if (res.acabadoTotal > 0) html += fila(`+ Acabado superficial (opcional, recargo ${dec(res.recargoAcabadoPct, 0)} %)`, euros(res.acabadoTotal));
    html += fila('TOTAL (sin IVA)', euros(res.total), 'total');
    if (p.mostrarIva) {
      html += fila(`IVA (${dec(p.ivaPct, 0)} %)`, euros(res.iva));
      html += fila('Total con IVA', euros(res.totalConIva), 'negrita');
    }
    const avisos = res.secciones.map((r, i) => r.aviso ? `Material ${i + 1}: ${r.aviso}` : '').filter(Boolean);
    if (avisos.length) html += `<p class="error">⚠ ${avisos.map(esc).join('<br>⚠ ')}</p>`;
    html += `<div class="botones resumen-botones">
      <button class="principal" data-accion="guardar">💾 Guardar</button>
      <button class="principal" data-accion="pdf-cliente">🖨️ PDF cliente</button></div>`;
    $('#resumen').innerHTML = html;
  }

  function recalcular() {
    res = Calculo.calcular(pres, cat());
    document.querySelectorAll('#secciones tr[data-p]').forEach(tr => {
      const r = res.secciones[+tr.dataset.s].piezas[+tr.dataset.p];
      tr.querySelector('[data-out=m2]').textContent = r.m2 ? dec(r.m2) : '';
      tr.querySelector('[data-out=coste]').textContent = r.coste ? dec(r.coste) : '';
    });
    document.querySelectorAll('#secciones section[data-s]').forEach(sEl => {
      const r = res.secciones[+sEl.dataset.s];
      const p = cat().parametros;
      sEl.querySelector('[data-out=seccion]').innerHTML = r.aviso ? `<span class="error">⚠ ${r.aviso}</span>` :
        `${dec(r.m2Piezas)} m² piezas · ${dec(r.m2Neto)} m² con merma ${dec(p.mermaPct, 0)} % · ` +
        `${dec(r.tableros, 1)} tablero(s) · ${dec(r.mlCorte)} ml corte · ${dec(r.mlCanteado)} ml canteado` +
        (r.rollos ? ` (${r.rollos} rollo${r.rollos > 1 ? 's' : ''})` : '') +
        ` · <strong>${euros(r.subtotal)}</strong>`;
    });
    document.querySelectorAll('#extras tr[data-e]').forEach(tr => {
      tr.querySelector('[data-out=extra]').textContent = euros(res.extras[+tr.dataset.e]);
    });
    pintarDesglose();
    pintarResumen();
    pintarCabecera();
  }

  function pintarCabecera() {
    const nombre = pres.cliente.nombre ? ` · ${pres.cliente.nombre}` : '';
    $('#titulo-presupuesto').textContent = (pres.numero ? `Presupuesto ${pres.numero}` : 'Presupuesto nuevo') + nombre;
    $('#estado-guardado').textContent = cambios ? '● Cambios sin guardar' : (pres.numero ? '✓ Guardado' : '');
    $('#estado-guardado').className = 'estado ' + (cambios ? 'pendiente' : 'ok');
  }

  function avisoPrecios() {
    const el = $('#aviso-precios');
    if (Catalogo.mismosPrecios(pres.precios, catActual)) { el.hidden = true; return; }
    const fecha = new Date(pres.precios.fecha).toLocaleDateString('es-ES');
    el.innerHTML = `Este presupuesto usa los precios del catálogo del ${fecha}, distintos de los actuales.
      <button data-accion="actualizar-precios">Actualizar a precios actuales</button>`;
    el.hidden = false;
  }

  // --------------------------------------------------------------- cambios
  function marcarCambios() {
    cambios = true;
    clearTimeout(marcarCambios.t);
    marcarCambios.t = setTimeout(guardarBorrador, 800);
  }

  // Copia de seguridad en el navegador por si se cierra sin guardar
  function guardarBorrador() {
    if (!cambios || !pres) return;
    try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ pres, fechaArchivo })); } catch (e) { /* sin almacenamiento */ }
  }

  function borrarBorrador() {
    clearTimeout(marcarCambios.t);
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* nada */ }
  }

  const indice = (el, d) => {
    const c = el.closest(`[data-${d}]`);
    return c ? +c.dataset[d] : null;
  };

  function alCambiarCampo(el) {
    const b = el.dataset.bind;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    const s = indice(el, 's'), p = indice(el, 'p'), e = indice(el, 'e');
    let repintar = null;

    if (b === 'pz.canto') pres.secciones[s].piezas[p].cantos[+el.dataset.k] = v;
    else if (b.startsWith('pz.')) pres.secciones[s].piezas[p][b.slice(3)] = v;
    else if (b === 'sec.familia') { cambiarFamilia(pres.secciones[s], v); repintar = pintarSecciones; }
    else if (b === 'sec.tablero') {
      if (!v) return;
      const [acabado, grosor] = v.split('|');
      Object.assign(pres.secciones[s], { acabado, grosor: Number(grosor) });
      repintar = pintarSecciones;
    }
    else if (b.startsWith('sec.')) pres.secciones[s][b.slice(4)] = v;
    else if (b === 'ex.producto') {
      const x = cat().extras.find(x => x.nombre === v);
      Object.assign(pres.extras[e], { producto: v, nombre: x ? x.nombre : '', precio: x ? x.precio : '' });
      repintar = pintarExtras;
    }
    else if (b.startsWith('ex.')) pres.extras[e][b.slice(3)] = v;
    else {
      const ruta = b.split('.');
      const ultimo = ruta.pop();
      ruta.reduce((o, k) => o[k], pres)[ultimo] = v;
    }
    marcarCambios();
    if (repintar) repintar();
    recalcular();
  }

  function cambiarFamilia(sec, codigo) {
    const nueva = seccionNueva(codigo);
    const fam = Catalogo.familia(cat(), codigo);
    const validos = [SIN, ...Catalogo.acabadosDe(cat(), codigo).map(a => a.nombre)];
    Object.assign(sec, { familia: nueva.familia, acabado: nueva.acabado, grosor: nueva.grosor, medida: nueva.medida });
    sec.piezas.forEach(pz => {
      if (fam.canto !== 'CANTO') pz.cantos = [false, false, false, false];
      if (!fam.acabadoSuperficial) { pz.acabado = SIN; pz.dosCaras = false; }
      else if (!validos.includes(pz.acabado)) pz.acabado = acabadoPorDefecto(codigo);
    });
  }

  // --------------------------------------------------------------- acciones
  const acciones = {
    'anadir-seccion'() {
      const ultima = pres.secciones[pres.secciones.length - 1];
      const s = seccionNueva(ultima?.familia || cat().familias[0].codigo);
      s.piezas.push(piezaNueva(s.familia));
      pres.secciones.push(s);
      marcarCambios(); pintarSecciones(); recalcular();
      enfocar(pres.secciones.length - 1, 0);
    },
    'borrar-seccion'(el) {
      const s = indice(el, 's');
      const n = pres.secciones[s].piezas.length;
      if (n > 1 && !confirm(`¿Eliminar el material ${s + 1} con sus ${n} piezas?`)) return;
      pres.secciones.splice(s, 1);
      marcarCambios(); pintarSecciones(); recalcular();
    },
    'duplicar-seccion'(el) {
      const s = indice(el, 's');
      pres.secciones.splice(s + 1, 0, JSON.parse(JSON.stringify(pres.secciones[s])));
      marcarCambios(); pintarSecciones(); recalcular();
    },
    'anadir-pieza'(el) { anadirPieza(indice(el, 's')); },
    'duplicar-pieza'(el) {
      const s = indice(el, 's'), p = indice(el, 'p');
      pres.secciones[s].piezas.splice(p + 1, 0, JSON.parse(JSON.stringify(pres.secciones[s].piezas[p])));
      marcarCambios(); pintarSecciones(); recalcular();
      enfocar(s, p + 1);
    },
    'borrar-pieza'(el) {
      const s = indice(el, 's'), p = indice(el, 'p');
      pres.secciones[s].piezas.splice(p, 1);
      marcarCambios(); pintarSecciones(); recalcular();
    },
    'cantos-todos'(el) {
      const pz = pres.secciones[indice(el, 's')].piezas[indice(el, 'p')];
      const marcar = !pz.cantos.every(Boolean);
      pz.cantos = [marcar, marcar, marcar, marcar];
      marcarCambios(); pintarSecciones(); recalcular();
    },
    'anadir-extra'() {
      const x = cat().extras[0];
      pres.extras.push({ producto: x?.nombre || '', nombre: x?.nombre || '', precio: x?.precio ?? '', cantidad: 1 });
      marcarCambios(); pintarExtras(); recalcular();
      document.querySelector(`#extras tr[data-e="${pres.extras.length - 1}"] select`)?.focus();
    },
    'borrar-extra'(el) {
      pres.extras.splice(indice(el, 'e'), 1);
      marcarCambios(); pintarExtras(); recalcular();
    },
    'actualizar-precios'() {
      if (!confirm('Se recalculará el presupuesto con los precios actuales del catálogo. ¿Continuar?')) return;
      pres.precios = catActual;
      pres.extras.forEach(ex => {
        const x = catActual.extras.find(x => x.nombre === ex.producto);
        if (x) ex.precio = x.precio;
      });
      marcarCambios(); pintarTodo();
      notificar('Precios actualizados. Recuerda guardar.');
    },
    nuevo() {
      if (cambios && !confirm('Hay cambios sin guardar. ¿Empezar un presupuesto nuevo igualmente?')) return;
      presupuestoVacio(); fechaArchivo = null; cambios = false; borrarBorrador();
      pintarTodo();
    },
    duplicar() {
      pres = JSON.parse(JSON.stringify(pres));
      Object.assign(pres, { numero: '', fecha: hoy(), precios: catActual });
      delete pres.resumen;
      fechaArchivo = null;
      marcarCambios(); pintarTodo();
      notificar('Copia creada con los precios actuales. Al guardar tendrá un número nuevo.');
    },
    guardar,
    abrir,
    async 'pdf-cliente'() { if (await guardarAntesDeImprimir()) Imprimir.cliente(pres, res, cat()); },
    async 'pdf-completo'() { if (await guardarAntesDeImprimir()) Imprimir.completo(pres, res, cat()); },
    async 'recargar-catalogo'() {
      $('.menu').open = false;
      try {
        await cargarCatalogo();
        if (!pres.numero && !cambiosEnPiezas()) pres.precios = catActual;
        pintarTodo();
        notificar('Catálogo recargado.');
      } catch (e) { alert('No se ha podido leer el catálogo: ' + e.message); }
    },
    'importar-csv'() { $('.menu').open = false; $('#archivo-csv').click(); },
    async 'cambiar-carpeta'() {
      $('.menu').open = false;
      if (!Almacen.soportado) return alert('Este navegador no permite elegir carpetas. Usa Chrome o Edge.');
      try { await Almacen.elegirCarpeta(); await cargarCatalogo(); notificar('Carpeta: ' + Almacen.nombreCarpeta()); }
      catch (e) { if (e.name !== 'AbortError') alert(e.message); }
    }
  };

  const cambiosEnPiezas = () => pres.secciones.some(s => s.piezas.some(p => p.largo || p.ancho));

  function anadirPieza(s) {
    const sec = pres.secciones[s];
    sec.piezas.push(piezaNueva(sec.familia));
    marcarCambios(); pintarSecciones(); recalcular();
    enfocar(s, sec.piezas.length - 1);
  }

  function enfocar(s, p, campo = 'pz.largo') {
    const tr = document.querySelector(`#secciones tr[data-s="${s}"][data-p="${p}"]`);
    tr?.querySelector(`[data-bind="${campo}"]`)?.focus();
  }

  // Añade piezas del generador de muebles, agrupadas por material
  function anadirPiezasMueble(lista) {
    lista.forEach(pz => {
      let s = pres.secciones.findIndex(x => x.familia === pz.familia && x.acabado === pz.acabado && x.grosor === pz.grosor);
      if (s === -1) {
        // Reaprovecha la sección inicial si está vacía
        const vacia = pres.secciones.findIndex(x => x.piezas.every(p => !p.largo && !p.ancho));
        if (vacia !== -1) pres.secciones.splice(vacia, 1);
        pres.secciones.push(seccionNueva(pz.familia, pz.acabado, pz.grosor));
        s = pres.secciones.length - 1;
      }
      const sec = pres.secciones[s];
      sec.piezas = sec.piezas.filter(p => p.largo || p.ancho);
      sec.piezas.push(piezaNueva(sec.familia, { nombre: pz.nombre, largo: Math.round(pz.largo), ancho: Math.round(pz.ancho), cantidad: pz.cantidad }));
    });
    marcarCambios(); pintarSecciones(); recalcular();
    notificar(`${lista.reduce((n, p) => n + p.cantidad, 0)} piezas añadidas.`);
  }

  // ------------------------------------------------------- guardar / abrir
  async function guardar() {
    pres.resumen = { total: Math.round(res.total * 100) / 100 };
    if (!modoCarpeta) {
      descargar(`${pres.numero || 'presupuesto'} ${pres.cliente.nombre || ''}`.trim() + '.json',
        JSON.stringify(pres, null, 2), 'application/json');
      cambios = false; borrarBorrador(); pintarCabecera();
      return true;
    }
    try {
      let r = await Almacen.guardar(pres, fechaArchivo);
      if (r.conflicto) {
        if (!confirm('Otro ordenador ha modificado este presupuesto desde que lo abriste.\n\n¿Sobrescribirlo con tu versión?')) return false;
        r = await Almacen.guardar(pres, fechaArchivo, true);
      }
      fechaArchivo = r.fecha;
      cambios = false; borrarBorrador(); pintarCabecera();
      notificar(`Guardado en Presupuestos/${pres.numero.slice(0, 4)}/${r.carpeta}`);
      return true;
    } catch (e) {
      alert('No se ha podido guardar: ' + e.message + '\n\n¿Está conectado el NAS?');
      return false;
    }
  }

  async function guardarAntesDeImprimir() {
    if (modoCarpeta && (cambios || !pres.numero)) return guardar();
    return true;
  }

  async function abrir() {
    if (cambios && !confirm('Hay cambios sin guardar. ¿Abrir otro presupuesto igualmente?')) return;
    if (!modoCarpeta) { $('#archivo-json').click(); return; }
    const dialogo = $('#dialogo-abrir');
    const lista = $('#lista-presupuestos');
    lista.innerHTML = '<p>Buscando presupuestos…</p>';
    $('#buscar').value = '';
    dialogo.showModal();
    try {
      const items = await Almacen.listar();
      const pintar = filtro => {
        const f = Catalogo.normalizar(filtro);
        const vis = items.filter(it => !f || Catalogo.normalizar(`${it.numero} ${it.cliente} ${it.referencia}`).includes(f));
        lista.innerHTML = vis.length ? `<table class="tabla"><thead><tr><th>Número</th><th>Cliente</th><th>Referencia</th><th>Fecha</th><th class="num">Total</th></tr></thead><tbody>
          ${vis.map((it, k) => `<tr class="clicable" data-k="${items.indexOf(it)}">
            <td>${esc(it.numero)}</td><td>${esc(it.cliente)}</td><td>${esc(it.referencia)}</td>
            <td>${it.fecha ? new Date(it.fecha).toLocaleDateString('es-ES') : ''}</td>
            <td class="num">${it.total != null ? euros(it.total) : ''}</td></tr>`).join('')}</tbody></table>`
          : '<p>No hay presupuestos guardados' + (f ? ' que coincidan' : ' todavía') + '.</p>';
      };
      pintar('');
      $('#buscar').oninput = e => pintar(e.target.value);
      $('#buscar').focus();
      lista.onclick = async e => {
        const tr = e.target.closest('tr[data-k]');
        if (!tr) return;
        const it = items[+tr.dataset.k];
        try {
          const r = await Almacen.abrir(it.anyo, it.carpeta);
          pres = prepararCargado(r.pres); fechaArchivo = r.fecha; cambios = false; borrarBorrador();
          dialogo.close(); pintarTodo();
        } catch (err) { alert('No se ha podido abrir: ' + err.message); }
      };
    } catch (e) {
      lista.innerHTML = `<p class="error">No se ha podido leer la carpeta: ${esc(e.message)}</p>`;
    }
  }

  function descargar(nombre, contenido, tipo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // CSV exportado por la versión anterior (v3)
  function importarCsv(texto) {
    const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) throw new Error('El CSV está vacío');
    const cab = lineas[0].split(';').map(h => Catalogo.normalizar(h));
    const filas = lineas.slice(1).map(l => {
      const c = l.split(';');
      return Object.fromEntries(cab.map((h, i) => [h, (c[i] || '').trim()]));
    });
    presupuestoVacio();
    pres.secciones = [];
    let actual = null, numSec = null;
    filas.forEach(f => {
      const tipo = (f.tipo || '').toUpperCase();
      if (tipo === 'PIEZA') {
        const sn = f.seccion || '1';
        if (!actual || numSec !== sn) {
          const [ac, gr] = (f.acabado_grosor || '').split('|');
          actual = seccionNueva(f.material || 'MEL');
          const t = cat().tableros.find(t => t.familia === actual.familia &&
            Catalogo.normalizar(t.acabado) === Catalogo.normalizar(ac) && t.grosor === Number(gr));
          if (t) Object.assign(actual, { acabado: t.acabado, grosor: t.grosor });
          if (f.medida_bruto && cat().medidas.includes(f.medida_bruto)) actual.medida = f.medida_bruto;
          if (f.modo_calculo) actual.modo = f.modo_calculo;
          pres.secciones.push(actual);
          numSec = sn;
        }
        if (!f.largo_mm || !f.ancho_mm) return;
        actual.piezas.push(piezaNueva(actual.familia, {
          largo: f.largo_mm, ancho: f.ancho_mm, cantidad: f.cantidad || 1,
          cantos: [f.cantos_l1, f.cantos_l2, f.cantos_a1, f.cantos_a2].map(x => x === '1'),
          acabado: f.acabado_superficial || SIN, dosCaras: f.dos_caras === '1'
        }));
      } else if (tipo === 'EXTRA') {
        const x = cat().extras.find(x => x.nombre === f.nombre_extra);
        pres.extras.push({ producto: x ? x.nombre : '', nombre: f.nombre_extra || 'Extra', precio: f.precio_unitario || 0, cantidad: f.cantidad_extra || 1 });
      }
    });
    if (!pres.secciones.length) { const s = seccionNueva(cat().familias[0].codigo); s.piezas.push(piezaNueva(s.familia)); pres.secciones.push(s); }
    fechaArchivo = null;
    marcarCambios(); pintarTodo();
    notificar('CSV importado. Completa los datos del cliente y guarda.');
  }

  // --------------------------------------------------------------- eventos
  function conectarEventos() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (b && acciones[b.dataset.accion]) { e.preventDefault(); acciones[b.dataset.accion](b); }
    });
    document.addEventListener('input', e => {
      const el = e.target;
      if (!el.dataset?.bind || el.tagName === 'SELECT' || el.type === 'checkbox') return;
      alCambiarCampo(el);
    });
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset?.excl) {
        const [tipo, a, b] = el.dataset.excl.split('|');
        if (tipo === 's') pres.secciones[+a].excluir[b] = !el.checked;
        else pres.extras[+a].excluir = !el.checked;
        marcarCambios(); recalcular();
        return;
      }
      if (el.dataset?.bind && (el.tagName === 'SELECT' || el.type === 'checkbox')) alCambiarCampo(el);
    });
    // Intro en la tabla de piezas: baja a la fila siguiente o crea una nueva
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); return; }
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      const tr = e.target.closest('#secciones tr[data-p]');
      if (!tr) return;
      e.preventDefault();
      const s = +tr.dataset.s, p = +tr.dataset.p, campo = e.target.dataset.bind;
      if (p < pres.secciones[s].piezas.length - 1) enfocar(s, p + 1, campo);
      else anadirPieza(s);
    });
    window.addEventListener('beforeunload', e => { if (cambios) { guardarBorrador(); e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('pagehide', guardarBorrador);

    $('#archivo-csv').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (cambios && !confirm('Hay cambios sin guardar. ¿Importar igualmente?')) return;
      try { importarCsv(await f.text()); } catch (err) { alert('No se ha podido importar: ' + err.message); }
    });
    $('#archivo-json').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { pres = prepararCargado(JSON.parse(await f.text())); fechaArchivo = null; cambios = false; pintarTodo(); }
      catch (err) { alert('No se ha podido abrir: ' + err.message); }
    });
  }

  function notificar(texto) {
    const n = $('#notificacion');
    n.textContent = texto; n.hidden = false;
    clearTimeout(notificar.t);
    notificar.t = setTimeout(() => { n.hidden = true; }, 3500);
  }

  // ------------------------------------------------------------- arranque
  async function cargarCatalogo(buffer, fecha) {
    if (!buffer) ({ buffer, fecha } = await Almacen.leerCatalogo());
    catActual = Catalogo.desdeArchivo(buffer, fecha);
    if (!catActual.familias.length || !catActual.tableros.length) throw new Error('El catálogo no tiene familias o tableros');
    if (catActual.avisos.length) console.warn('Avisos del catálogo:', catActual.avisos);
  }

  function arrancarApp() {
    $('#inicio').hidden = true;
    $('#app').hidden = false;
    let borrador = null;
    try { borrador = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null'); } catch (e) { /* nada */ }
    if (borrador?.pres && confirm(`Hay un presupuesto sin guardar de la última vez${borrador.pres.cliente?.nombre ? ` (${borrador.pres.cliente.nombre})` : ''}.\n\n¿Recuperarlo?`)) {
      pres = prepararCargado(borrador.pres); fechaArchivo = borrador.fechaArchivo; cambios = true;
    } else {
      borrarBorrador();
      presupuestoVacio();
    }
    pintarTodo();
    if (catActual.avisos.length) notificar('El catálogo tiene filas que no se han podido leer (ver consola).');
  }

  function pantallaInicio(texto, botones, error = '') {
    $('#inicio-texto').innerHTML = texto;
    $('#inicio-error').textContent = error;
    const cont = $('#inicio-botones');
    cont.innerHTML = '';
    botones.forEach(([t, fn, principal]) => {
      const b = document.createElement('button');
      b.textContent = t;
      if (principal) b.className = 'principal';
      b.onclick = async () => {
        try { await fn(); } catch (e) {
          if (e.name === 'AbortError') return;
          $('#inicio-error').textContent = e.name === 'NotFoundError'
            ? `No encuentro ${Almacen.ARCHIVO_CATALOGO} en esa carpeta. Elige la carpeta donde está index.html y el catálogo.`
            : e.message;
        }
      };
      cont.appendChild(b);
    });
  }

  async function conCarpeta() {
    await cargarCatalogo();
    modoCarpeta = true;
    arrancarApp();
  }

  function sinCarpeta() {
    pantallaInicio(
      'Este navegador no permite guardar directamente en carpetas. Usa <strong>Chrome</strong> o <strong>Edge</strong> para trabajar con normalidad.<br><br>' +
      'Mientras tanto puedes cargar el catálogo a mano; los presupuestos se descargarán como archivo.',
      [['Cargar catalogo.xlsx', () => $('#archivo-catalogo').click(), true]]);
    $('#archivo-catalogo').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { await cargarCatalogo(await f.arrayBuffer(), f.lastModified); modoCarpeta = false; arrancarApp(); }
      catch (err) { $('#inicio-error').textContent = err.message; }
    };
  }

  async function iniciar() {
    conectarEventos();
    Mueble.iniciar(() => cat(), anadirPiezasMueble);
    const estado = await Almacen.recuperarCarpeta();
    if (estado === 'no-soportado') return sinCarpeta();
    if (estado === 'ok') {
      try { return await conCarpeta(); } catch (e) { /* se pide de nuevo abajo */ }
    }
    if (estado === 'pedir-permiso') {
      return pantallaInicio(`Pulsa para conectar con la carpeta <strong>${esc(Almacen.nombreCarpeta())}</strong>.`, [
        ['Conectar', async () => { if (await Almacen.pedirPermiso()) await conCarpeta(); }, true],
        ['Elegir otra carpeta', async () => { await Almacen.elegirCarpeta(); await conCarpeta(); }]
      ]);
    }
    pantallaInicio(
      'Elige la carpeta compartida del NAS donde están <strong>index.html</strong> y <strong>catalogo.xlsx</strong>.<br>' +
      'Solo hay que hacerlo una vez en cada ordenador.',
      [['Elegir carpeta', async () => { await Almacen.elegirCarpeta(); await conCarpeta(); }, true]]);
  }

  return { iniciar };
})();

App.iniciar();
