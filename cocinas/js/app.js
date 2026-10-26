// app.js (cocinas)
// Pantalla del generador de presupuestos de cocina: tarifa, acabado, módulos y resumen.

const App = (() => {
  const $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const euros = n => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dec = (n, d = 2) => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const hoy = () => new Date().toISOString().slice(0, 10);
  const CLAVE_BORRADOR = 'cocinas-borrador';
  const AVISO_SIN_CARPETA = 'Sin conexión con la carpeta del NAS: el archivo se ha descargado. Usa Chrome o Edge y conecta la carpeta para guardar directamente.';
  const PESTANAS = [['Bajo', 'Bajos'], ['Alto', 'Altos'], ['Columna', 'Columnas'], ['Piezas', 'Piezas y extras']];

  let catActual = null;      // catálogo del Excel
  let pres = null;           // presupuesto abierto
  let res = null;            // último cálculo
  let modoCarpeta = false;
  let fechaArchivo = null;
  let cambios = false;
  let pestana = 'Bajo';
  const abiertos = new Set(); // líneas con el detalle desplegado

  // Precios congelados del presupuesto (o los del catálogo si es nuevo)
  const cat = () => pres?.precios || catActual;

  // ------------------------------------------------------------- datos
  function presupuestoVacio() {
    const c = catActual;
    const ac = c.acabados[0];
    pres = {
      tipo: 'cocina', version: 1, numero: '', fecha: hoy(),
      cliente: { codigo: '', nombre: '', contacto: '' }, referencia: '', descripcion: '',
      tarifa: c.tarifas[0].numero,
      acabado: { acabado: ac.acabado, tipo: ac.tipo, color: '' },
      guias: c.marcas[0] || '',
      lineas: [], extras: [],
      precios: c
    };
    fechaArchivo = null; cambios = false;
    abiertos.clear();
  }

  function prepararCargado(p) {
    if (p.tipo !== 'cocina' || !Array.isArray(p.lineas)) throw new Error('Este archivo no es un presupuesto de cocina.');
    p.cliente = { codigo: '', nombre: '', contacto: '', ...(p.cliente || {}) };
    p.extras = p.extras || [];
    p.precios = p.precios || catActual;
    p.acabado = p.acabado || { acabado: cat().acabados[0].acabado, tipo: cat().acabados[0].tipo, color: '' };
    p.lineas.forEach(l => { l.id = l.id || nuevoId(); });
    abiertos.clear();
    return p;
  }

  const nuevoId = () => Math.random().toString(36).slice(2, 9);

  function lineaModulo(def) {
    return {
      id: nuevoId(), clase: 'modulo', codigo: def.codigo,
      ancho: def.anchos[0], alto: def.altos[0], fondo: def.fondo, estantes: def.estantes,
      cantidad: 1, acabado: null, nota: ''
    };
  }

  function lineaPieza(def) {
    return {
      id: nuevoId(), clase: 'pieza', codigo: def.codigo,
      ancho: def.ancho, alto: def.alto, cantidad: 1, acabado: null, nota: ''
    };
  }

  // ------------------------------------------------------------- pintar
  function pintarTodo() {
    document.querySelectorAll('[data-bind]').forEach(el => {
      const v = el.dataset.bind.split('.').reduce((o, k) => o?.[k], pres);
      el.value = v ?? '';
    });
    pintarOpciones();
    pintarMosaico();
    pintarLineas();
    pintarExtras();
    recalcular();
    pintarCabecera();
    avisoPrecios();
  }

  function segmentos(cont, items, actual, accion) {
    cont.innerHTML = items.map(([valor, texto]) =>
      `<button type="button" data-accion="${accion}" data-valor="${esc(valor)}" class="${String(valor) === String(actual) ? 'activo' : ''}">${texto}</button>`).join('');
  }

  function pintarOpciones() {
    const c = cat();
    segmentos($('#op-tarifa'), c.tarifas.map(t => [t.numero, `<small>${t.numero}</small>${esc(t.nombre)}`]), pres.tarifa, 'tarifa');
    segmentos($('#op-acabado'), Catalogo.nombresAcabado(c).map(a => [a, esc(a)]), pres.acabado.acabado, 'acabado');
    segmentos($('#op-guias'), c.marcas.map(m => [m, esc(m)]), pres.guias, 'guias');
    const tipos = Catalogo.tiposDe(c, pres.acabado.acabado);
    $('#op-tipo').innerHTML = tipos.map(t => `<option ${t === pres.acabado.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('');
  }

  function pintarMosaico() {
    const c = cat();
    $('#pestanas').innerHTML = PESTANAS.map(([k, t]) => `<button type="button" data-accion="pestana" data-valor="${k}" class="${k === pestana ? 'activo' : ''}">${t}</button>`).join('');
    if (pestana === 'Piezas') {
      $('#mosaico').innerHTML = c.piezas.map(p => `<button type="button" class="ficha pieza" data-accion="anadir-pieza" data-valor="${esc(p.codigo)}">
        <span class="ficha-nombre">${esc(p.nombre)}</span>
        <span class="ficha-medidas">${p.precioFijo ? `${euros(p.precioFijo)} / ${p.unidad}` : p.unidad === 'ml' ? `por metro · alto ${p.alto} mm` : `${p.ancho} × ${p.alto} mm`}</span></button>`).join('');
      return;
    }
    $('#mosaico').innerHTML = c.modulos.filter(m => m.tipo === pestana).map(m => {
      const mod = conCajones(m);
      return `<button type="button" class="ficha" data-accion="anadir-modulo" data-valor="${esc(m.codigo)}">
        <span class="ficha-dibujo">${Dibujo.svg(mod, m.anchos[0], m.altos[0], m.estantes, 64)}</span>
        <span class="ficha-nombre">${esc(m.nombre)}</span>
        <span class="ficha-medidas">${m.anchos.length > 1 ? `${Math.min(...m.anchos)}–${Math.max(...m.anchos)}` : m.anchos[0]} × ${m.altos.join('/')} mm</span></button>`;
    }).join('');
  }

  const conCajones = def => ({ ...def, cajones: def.cajones.map(k => Catalogo.cajon(cat(), k)).filter(Boolean) });

  // Datalists con las medidas habituales de cada módulo (el campo admite cualquier medida)
  function pintarListasMedidas() {
    $('#listas-medidas').innerHTML = cat().modulos.map(m =>
      `<datalist id="anchos-${esc(m.codigo)}">${m.anchos.map(a => `<option value="${a}">`).join('')}</datalist>
       <datalist id="altos-${esc(m.codigo)}">${m.altos.map(a => `<option value="${a}">`).join('')}</datalist>`).join('');
  }

  function opcionesAcabado(l) {
    const c = cat();
    const gen = pres.acabado;
    const actual = l.acabado ? `${l.acabado.acabado}|${l.acabado.tipo}` : '';
    return `<option value="">General · ${esc(gen.acabado)} ${esc(gen.tipo)}</option>` +
      c.acabados.map(a => `<option value="${esc(a.acabado + '|' + a.tipo)}" ${actual === a.acabado + '|' + a.tipo ? 'selected' : ''}>${esc(a.acabado)} ${esc(a.tipo)}</option>`).join('');
  }

  function htmlLinea(l, i) {
    const c = cat();
    const n = pres.lineas.length;
    const botones = `<td class="acciones">
      ${l.clase === 'modulo' ? `<button class="mini" data-accion="detalle" data-l="${i}" title="Ver el desglose del precio">${abiertos.has(l.id) ? '▾' : '▸'}</button>` : ''}
      <button class="mini" data-accion="subir" data-l="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="mini" data-accion="bajar" data-l="${i}" title="Bajar" ${i === n - 1 ? 'disabled' : ''}>↓</button>
      <button class="mini" data-accion="copiar-linea" data-l="${i}" title="Duplicar">⧉</button>
      <button class="mini peligro" data-accion="borrar-linea" data-l="${i}" title="Quitar">✕</button></td>`;
    const nota = `<input type="text" class="nota" data-l="${i}" data-campo="nota" value="${esc(l.nota)}" placeholder="Nota (sale en el PDF)">`;
    const acabado = `<td class="celda-acabado"><select data-l="${i}" data-campo="acabado" class="${l.acabado ? 'acabado-propio' : ''}">${opcionesAcabado(l)}</select></td>`;
    const num = (campo, valor, attrs = '') => `<input type="number" class="num" data-l="${i}" data-campo="${campo}" value="${esc(valor)}" ${attrs}>`;

    if (l.clase === 'pieza') {
      const def = Catalogo.pieza(c, l.codigo);
      const fijo = def?.precioFijo;
      return `<tr data-fila="${i}">
        <td class="celda-dibujo"></td>
        <td class="celda-modulo"><select data-l="${i}" data-campo="codigo">${c.piezas.map(p => `<option value="${esc(p.codigo)}" ${p.codigo === l.codigo ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>${nota}
          <div class="error-linea" data-error="${i}"></div></td>
        <td class="medida">${!fijo && def?.unidad === 'ud' ? num('ancho', l.ancho, 'min="1" step="1"') : '<div class="nada">—</div>'}</td>
        <td class="medida">${!fijo ? num('alto', l.alto, 'min="1" step="1"') : '<div class="nada">—</div>'}</td>
        <td class="medida"><div class="nada">—</div></td><td class="estantes"><div class="nada">—</div></td>
        ${fijo ? '<td class="celda-acabado"><div class="nada">—</div></td>' : acabado}
        <td class="cantidad">${num('cantidad', l.cantidad, `min="0" step="${def?.unidad === 'ml' ? '0.01' : '1'}"`)}<div class="composicion">${def?.unidad === 'ml' ? 'metros' : 'unidades'}</div></td>
        <td class="num precio-ud salida" data-unidad="${i}"></td>
        <td class="num precio-total" data-total="${i}"></td>${botones}</tr>`;
    }

    const def = Catalogo.modulo(c, l.codigo);
    const hermanos = c.modulos.filter(m => m.tipo === def?.tipo);
    return `<tr data-fila="${i}">
      <td class="celda-dibujo" data-dibujo="${i}"></td>
      <td class="celda-modulo"><select data-l="${i}" data-campo="codigo">${(def ? hermanos : [{ codigo: l.codigo, nombre: l.codigo + ' (no está en el catálogo)' }]).map(m => `<option value="${esc(m.codigo)}" ${m.codigo === l.codigo ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select>
        <div class="composicion" data-composicion="${i}"></div>${nota}<div class="error-linea" data-error="${i}"></div></td>
      <td class="medida">${num('ancho', l.ancho, `min="1" step="1" list="anchos-${esc(l.codigo)}"`)}</td>
      <td class="medida">${num('alto', l.alto, `min="1" step="1" list="altos-${esc(l.codigo)}"`)}</td>
      <td class="medida">${def?.carcasa === 'ninguna' ? '<div class="nada">—</div>' : num('fondo', l.fondo, 'min="1" step="1"')}</td>
      <td class="estantes">${def?.carcasa === 'ninguna' ? '<div class="nada">—</div>' : num('estantes', l.estantes, 'min="0" step="1"')}</td>
      ${acabado}
      <td class="cantidad">${num('cantidad', l.cantidad, 'min="0" step="1"')}</td>
      <td class="num precio-ud salida" data-unidad="${i}"></td>
      <td class="num precio-total" data-total="${i}"></td>${botones}</tr>
      ${abiertos.has(l.id) ? `<tr class="detalle" data-detalle="${i}"><td colspan="11"></td></tr>` : ''}`;
  }

  function pintarLineas() {
    pintarListasMedidas();
    let html = '';
    let grupo = null;
    pres.lineas.forEach((l, i) => {
      const g = Imprimir.grupoDe(l, cat());
      if (g !== grupo) {
        grupo = g;
        html += `<tr class="grupo"><td colspan="11">${esc((PESTANAS.find(p => p[0] === g) || [g, g])[1])}</td></tr>`;
      }
      html += htmlLinea(l, i);
    });
    $('#lineas').innerHTML = html;
    $('#lineas-vacio').hidden = pres.lineas.length > 0;
  }

  function pintarExtras() {
    $('#extras').innerHTML = pres.extras.map((e, i) => `<tr>
      <td><input type="text" data-e="${i}" data-campo="nombre" value="${esc(e.nombre)}" placeholder="Ej: Transporte, encimera, electrodomésticos…"></td>
      <td class="num"><input type="number" class="num" data-e="${i}" data-campo="precio" value="${esc(e.precio)}" step="0.01"></td>
      <td class="num"><input type="number" class="num corto" data-e="${i}" data-campo="cantidad" value="${esc(e.cantidad)}" min="0" step="1"></td>
      <td class="num salida" data-extra-total="${i}"></td>
      <td class="acciones"><button class="mini peligro" data-accion="borrar-extra" data-e="${i}">✕</button></td></tr>`).join('');
  }

  // Actualiza precios, dibujos y resumen sin volver a pintar los campos (así no se pierde el foco)
  function recalcular() {
    res = Calculo.presupuesto(pres, cat());
    const c = cat();
    pres.lineas.forEach((l, i) => {
      const r = res.lineas[i];
      const fila = $(`#lineas tr[data-fila="${i}"]`);
      if (!fila) return;
      fila.classList.toggle('con-error', !!r.error);
      const err = fila.querySelector(`[data-error="${i}"]`);
      if (err) err.textContent = r.error || '';
      fila.querySelector(`[data-unidad="${i}"]`).textContent = euros(r.unidad);
      fila.querySelector(`[data-total="${i}"]`).textContent = euros(r.total);
      if (l.clase !== 'modulo') return;
      const def = Catalogo.modulo(c, l.codigo);
      if (def) {
        fila.querySelector(`[data-dibujo="${i}"]`).innerHTML = Dibujo.svg(conCajones(def), Catalogo.numero(l.ancho), Catalogo.numero(l.alto), Math.round(Catalogo.numero(l.estantes)), 46);
        fila.querySelector(`[data-composicion="${i}"]`).textContent = Imprimir.composicion(r);
      }
      const det = $(`#lineas tr[data-detalle="${i}"] td`);
      if (det && r.conceptos) {
        det.innerHTML = Calculo.CONCEPTOS.filter(([k]) => r.conceptos[k]).map(([k, t]) => `<span>${t}: <strong>${dec(r.conceptos[k])}</strong></span>`).join('') +
          (r.recargo ? `<span>Recargo tarifa: <strong>${dec(r.recargo)}</strong></span>` : '') +
          (r.puertas.length ? `<span>Puertas: ${r.puertas.map(p => `${dec(p.ancho, 0)}×${dec(p.alto, 0)}`).join(', ')} mm</span>` : '');
      }
    });
    pres.extras.forEach((e, i) => {
      const el = $(`[data-extra-total="${i}"]`);
      if (el) el.textContent = euros(res.extras[i]);
    });
    $('#cuenta-modulos').textContent = res.modulos ? `(${dec(res.modulos, 0)} módulo${res.modulos === 1 ? '' : 's'})` : '';
    pintarResumen();
  }

  function pintarResumen() {
    const t = res.tarifa;
    const p = cat().parametros;
    const fila = (a, b, clase = '') => `<div class="fila ${clase}"><span>${a}</span><span>${b}</span></div>`;
    let html = `<div class="tarifa-actual">Tarifa ${t.numero} · ${esc(t.nombre)}${t.recargoPct ? ` (+${dec(t.recargoPct, 0)} %)` : ''}</div>`;
    PESTANAS.forEach(([k, nombre]) => { if (res.porTipo[k]) html += fila(nombre, euros(res.porTipo[k])); });
    if (res.totalExtras) html += fila('Otros conceptos', euros(res.totalExtras));
    if (res.recargo) html += fila(`<span class="pequeno">Incluye recargo de tarifa</span>`, `<span class="pequeno">${euros(res.recargo)}</span>`);
    html += fila('Base imponible', euros(res.total), 'negrita separador');
    html += fila(`IVA (${dec(p.ivaPct, 0)} %)`, euros(res.iva));
    html += fila('TOTAL', euros(res.totalConIva), 'total');
    html += fila(`<span class="pequeno">Pago inicial (${dec(res.pagoInicialPct, 0)} %)</span>`, `<span class="pequeno">${euros(res.pagoInicial)}</span>`);
    $('#resumen').innerHTML = html;
  }

  function pintarCabecera() {
    const titulo = [pres.numero, pres.cliente.nombre || pres.referencia].filter(Boolean).join(' · ') || 'Cocina nueva';
    $('#titulo-presupuesto').textContent = titulo;
    const est = $('#estado-guardado');
    est.textContent = cambios ? '● Cambios sin guardar' : pres.ubicacion ? `Guardado en ${Almacen.PRESUPUESTOS}/${pres.ubicacion.ruta.join('/')}` : '';
    est.className = 'estado ' + (cambios ? 'pendiente' : 'ok');
    document.title = (pres.cliente.nombre ? pres.cliente.nombre + ' – ' : '') + 'Presupuestos de cocina';
  }

  // Aviso si el presupuesto tiene precios distintos del catálogo actual
  function avisoPrecios() {
    const av = $('#aviso-precios');
    if (!catActual || !pres.precios || Catalogo.mismosPrecios(pres.precios, catActual)) { av.hidden = true; return; }
    av.hidden = false;
    av.innerHTML = `Este presupuesto conserva los precios del catálogo del ${new Date(pres.precios.fecha).toLocaleDateString('es-ES')}.
      <button data-accion="actualizar-precios">Actualizar a precios actuales</button>`;
  }

  function marcarCambios() {
    cambios = true;
    pintarCabecera();
    guardarBorrador();
  }
  function guardarBorrador() {
    try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ pres, fechaArchivo })); } catch (e) { /* sin espacio: no pasa nada */ }
  }
  function borrarBorrador() { try { localStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* nada */ } }

  // ------------------------------------------------------------- eventos
  function alCambiarCampo(el, final) {
    if (el.dataset.bind) {
      const claves = el.dataset.bind.split('.');
      const ult = claves.pop();
      claves.reduce((o, k) => o[k], pres)[ult] = el.value;
      marcarCambios();
      if (el.dataset.bind.startsWith('cliente') || el.dataset.bind === 'referencia') pintarCabecera();
      return recalcular();
    }
    if (el.id === 'op-tipo') {
      pres.acabado.tipo = el.value;
      marcarCambios(); pintarLineas(); return recalcular();
    }
    if (el.dataset.l !== undefined) {
      const l = pres.lineas[+el.dataset.l];
      const campo = el.dataset.campo;
      if (campo === 'acabado') {
        if (!final) return;
        const [acabado, tipo] = el.value.split('|');
        l.acabado = el.value ? { acabado, tipo, color: '' } : null;
        marcarCambios(); pintarLineas(); return recalcular();
      }
      if (campo === 'codigo') {
        if (!final) return;
        const nuevo = l.clase === 'pieza' ? lineaPieza(Catalogo.pieza(cat(), el.value)) : lineaModulo(Catalogo.modulo(cat(), el.value));
        Object.assign(l, { ...nuevo, id: l.id, cantidad: l.cantidad, acabado: l.acabado, nota: l.nota });
        marcarCambios(); pintarLineas(); return recalcular();
      }
      l[campo] = el.type === 'number' ? el.value : el.value;
      marcarCambios();
      return recalcular();
    }
    if (el.dataset.e !== undefined) {
      pres.extras[+el.dataset.e][el.dataset.campo] = el.value;
      marcarCambios();
      return recalcular();
    }
  }

  async function accion(nombre, el) {
    const i = el.dataset.l !== undefined ? +el.dataset.l : null;
    switch (nombre) {
      case 'tarifa': pres.tarifa = +el.dataset.valor; marcarCambios(); pintarOpciones(); return recalcular();
      case 'guias': pres.guias = el.dataset.valor; marcarCambios(); pintarOpciones(); return recalcular();
      case 'acabado': {
        const acabado = el.dataset.valor;
        if (acabado === pres.acabado.acabado) return;
        pres.acabado = { ...pres.acabado, acabado, tipo: Catalogo.tiposDe(cat(), acabado)[0] || '' };
        marcarCambios(); pintarOpciones(); pintarLineas(); return recalcular();
      }
      case 'pestana': pestana = el.dataset.valor; return pintarMosaico();
      case 'anadir-modulo':
      case 'anadir-pieza': {
        const nueva = nombre === 'anadir-pieza' ? lineaPieza(Catalogo.pieza(cat(), el.dataset.valor)) : lineaModulo(Catalogo.modulo(cat(), el.dataset.valor));
        // Se coloca al final de su grupo, así la lista queda ordenada por bajos, altos, columnas y piezas
        const orden = PESTANAS.map(p => p[0]);
        const g = orden.indexOf(Imprimir.grupoDe(nueva, cat()));
        let pos = pres.lineas.length;
        while (pos > 0 && orden.indexOf(Imprimir.grupoDe(pres.lineas[pos - 1], cat())) > g) pos--;
        pres.lineas.splice(pos, 0, nueva);
        marcarCambios(); pintarLineas(); recalcular();
        const fila = $(`#lineas tr[data-fila="${pos}"]`);
        fila?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fila?.querySelector('[data-campo="ancho"], [data-campo="cantidad"]')?.focus();
        return;
      }
      case 'detalle': {
        const id = pres.lineas[i].id;
        abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id);
        pintarLineas(); return recalcular();
      }
      case 'subir': case 'bajar': {
        const j = nombre === 'subir' ? i - 1 : i + 1;
        if (j < 0 || j >= pres.lineas.length) return;
        [pres.lineas[i], pres.lineas[j]] = [pres.lineas[j], pres.lineas[i]];
        marcarCambios(); pintarLineas(); return recalcular();
      }
      case 'copiar-linea':
        pres.lineas.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(pres.lineas[i])), id: nuevoId() });
        marcarCambios(); pintarLineas(); return recalcular();
      case 'borrar-linea':
        pres.lineas.splice(i, 1);
        marcarCambios(); pintarLineas(); return recalcular();
      case 'anadir-extra':
        pres.extras.push({ nombre: '', precio: '', cantidad: 1 });
        marcarCambios(); pintarExtras(); recalcular();
        return $(`#extras tr:last-child input`)?.focus();
      case 'borrar-extra':
        pres.extras.splice(+el.dataset.e, 1);
        marcarCambios(); pintarExtras(); return recalcular();
      case 'nuevo':
        if (cambios && !confirm('Hay cambios sin guardar. ¿Empezar una cocina nueva igualmente?')) return;
        presupuestoVacio(); borrarBorrador(); return pintarTodo();
      case 'duplicar': {
        const copia = JSON.parse(JSON.stringify(pres));
        delete copia.numero; delete copia.ubicacion;
        copia.numero = ''; copia.fecha = hoy();
        pres = prepararCargado(copia); fechaArchivo = null;
        marcarCambios(); pintarTodo();
        return notificar('Copia creada. Al guardarla tendrá número nuevo.');
      }
      case 'guardar': return guardar();
      case 'abrir': return abrir();
      case 'pdf-cliente': return pdfCliente();
      case 'pdf-completo': return Imprimir.completo(pres, res, await catImprimir());
      case 'recargar-catalogo':
        try {
          if (modoCarpeta) await cargarCatalogo();
          else return $('#archivo-catalogo').click();
          avisoPrecios();
          notificar('Catálogo recargado.' + (catActual.avisos.length ? ' Tiene filas que no se han podido leer (ver consola).' : ''));
        } catch (e) { alert('No se ha podido leer el catálogo: ' + e.message); }
        return;
      case 'actualizar-precios':
        pres.precios = catActual;
        marcarCambios(); pintarTodo();
        return notificar('Presupuesto pasado a los precios actuales.');
      case 'importar-json': return $('#archivo-json').click();
      case 'cambiar-carpeta':
        if (!Almacen.soportado) return alert('Este navegador no permite elegir carpetas. Usa Chrome o Edge.');
        try { await Almacen.elegirCarpeta(); await cargarCatalogo(); modoCarpeta = true; notificar('Carpeta: ' + Almacen.nombreCarpeta()); }
        catch (e) { if (e.name !== 'AbortError') alert(e.message); }
        return;
    }
  }

  // El logo se lee de 00_PROGRAMA para el PDF
  async function catImprimir() {
    const c = { ...cat(), parametros: { ...cat().parametros } };
    if (catActual) ['logo', 'empresa', 'textoPie', 'iban', 'pagoInicialPct', 'validezDias'].forEach(k => { c.parametros[k] = catActual.parametros[k]; });
    if (c.parametros.logo) c.parametros.logo = modoCarpeta ? await Almacen.leerComoDataUrl(c.parametros.logo) : '../' + c.parametros.logo;
    return c;
  }

  function conectarEventos() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (!b || b.disabled) return;
      b.closest('details.menu')?.removeAttribute('open');
      accion(b.dataset.accion, b);
    });
    $('#app').addEventListener('input', e => alCambiarCampo(e.target, false));
    $('#app').addEventListener('change', e => alCambiarCampo(e.target, true));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); }
    });
    window.addEventListener('beforeunload', e => { if (cambios) { e.preventDefault(); e.returnValue = ''; } });
    $('#archivo-json').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const p = prepararCargado(JSON.parse(await f.text()));
        delete p.ubicacion;
        pres = p; fechaArchivo = null; marcarCambios(); pintarTodo();
        notificar('Presupuesto importado.' + (modoCarpeta ? ' Guárdalo para tenerlo en la carpeta.' : ''));
      } catch (err) { alert('No se ha podido importar: ' + err.message); }
    };
    $('#archivo-catalogo').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { await cargarCatalogo(await f.arrayBuffer(), f.lastModified); if (pres) avisoPrecios(); else { modoCarpeta = false; arrancarApp(); } }
      catch (err) { ($('#inicio').hidden ? alert : t => { $('#inicio-error').textContent = t; })(err.message); }
    };
  }

  // ------------------------------------------------------- guardar / abrir
  async function guardar(nuevaVersion = false) {
    pres.resumen = { total: res.total };
    if (!modoCarpeta) {
      descargar(Almacen.nombreBase(pres) + '.json', JSON.stringify(pres, null, 2), 'application/json');
      cambios = false; borrarBorrador(); pintarCabecera();
      alert(AVISO_SIN_CARPETA);
      return true;
    }
    try {
      let r = await Almacen.guardar(pres, fechaArchivo, false, nuevaVersion);
      if (r.conflicto) {
        if (!confirm('Otro ordenador ha modificado este presupuesto desde que lo abriste.\n\n¿Sobrescribirlo con tu versión?')) return false;
        r = await Almacen.guardar(pres, fechaArchivo, true, nuevaVersion);
      }
      fechaArchivo = r.fecha;
      cambios = false; borrarBorrador(); pintarCabecera();
      notificar(`${nuevaVersion ? 'Versión nueva guardada' : 'Guardado'} en ${r.ruta}.json`);
      return true;
    } catch (e) {
      alert('No se ha podido guardar: ' + e.message + '\n\n¿Está conectado el NAS?');
      return false;
    }
  }

  // PDF del cliente junto al .json con el mismo nombre. Si ya tenía PDF, se guarda como versión nueva (…_V2).
  async function pdfCliente() {
    if (!pres.lineas.length && !pres.extras.length) return alert('La cocina no tiene módulos todavía.');
    const nuevaVersion = modoCarpeta && await Almacen.tienePdf(pres);
    const ok = nuevaVersion ? await guardar(true) : (cambios || (modoCarpeta && !pres.numero)) ? await guardar() : true;
    if (!ok) return;
    const c = await catImprimir();
    let blob;
    try {
      notificar('Generando PDF…');
      blob = await Imprimir.pdfCliente(pres, res, c);
    } catch (e) {
      alert('No se ha podido generar el PDF: ' + e.message + '\n\nSe abrirá el diálogo de impresión.');
      return Imprimir.cliente(pres, res, c);
    }
    const url = URL.createObjectURL(blob);
    if (!modoCarpeta) {
      const a = document.createElement('a');
      a.href = url; a.download = Imprimir.nombreArchivo(pres) + '.pdf'; a.click();
      return;
    }
    try {
      const ruta = await Almacen.guardarPdf(pres, blob);
      notificar(`PDF guardado en ${ruta}${nuevaVersion ? ' (versión nueva, con su .json)' : ''}`, { texto: 'Abrir PDF', url });
    } catch (e) {
      alert('No se ha podido guardar el PDF: ' + e.message + '\n\n¿Está conectado el NAS?');
    }
  }

  async function abrir() {
    if (cambios && !confirm('Hay cambios sin guardar. ¿Abrir otro presupuesto igualmente?')) return;
    if (!modoCarpeta) { $('#archivo-json').click(); return; }
    const dialogo = $('#dialogo-abrir');
    const lista = $('#lista-presupuestos');
    lista.innerHTML = '<p>Buscando presupuestos de cocina…</p>';
    $('#buscar').value = '';
    dialogo.showModal();
    try {
      const items = await Almacen.listar();
      const pintar = filtro => {
        const f = Catalogo.normalizar(filtro);
        const vis = items.filter(it => !f || Catalogo.normalizar(`${it.numero} ${it.codigo} ${it.cliente} ${it.referencia} ${it.ruta.join(' ')}`).includes(f));
        lista.innerHTML = vis.length ? `<table class="tabla"><thead><tr><th>Número</th><th>Código</th><th>Cliente</th><th>Referencia</th><th>Fecha</th><th class="num">Total</th></tr></thead><tbody>
          ${vis.map(it => `<tr class="clicable" data-k="${items.indexOf(it)}">
            <td>${esc(it.numero)}</td><td>${esc(it.codigo || it.ruta[0] || '')}</td><td>${esc(it.cliente)}</td><td>${esc(it.referencia)}</td>
            <td>${it.fecha ? new Date(it.fecha).toLocaleDateString('es-ES') : ''}</td>
            <td class="num">${it.total != null ? euros(it.total) : ''}</td></tr>`).join('')}</tbody></table>`
          : '<p>No hay presupuestos de cocina guardados' + (f ? ' que coincidan' : ' todavía') + '.</p>';
      };
      pintar('');
      $('#buscar').oninput = e => pintar(e.target.value);
      $('#buscar').focus();
      lista.onclick = async e => {
        const tr = e.target.closest('tr[data-k]');
        if (!tr) return;
        try {
          const r = await Almacen.abrir(items[+tr.dataset.k]);
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

  function notificar(texto, enlace) {
    const n = $('#notificacion');
    n.textContent = texto; n.hidden = false;
    if (enlace) {
      const a = document.createElement('a');
      a.href = enlace.url; a.target = '_blank'; a.textContent = enlace.texto;
      n.append(' ', a);
    }
    clearTimeout(notificar.t);
    notificar.t = setTimeout(() => { n.hidden = true; }, enlace ? 10000 : 3500);
  }

  // ------------------------------------------------------------- arranque
  async function cargarCatalogo(buffer, fecha) {
    if (!buffer) ({ buffer, fecha } = await Almacen.leerCatalogo());
    catActual = Catalogo.desdeArchivo(buffer, fecha);
    if (catActual.avisos.length) console.warn('Avisos del catálogo:', catActual.avisos);
  }

  function arrancarApp() {
    $('#inicio').hidden = true;
    $('#app').hidden = false;
    if (!modoCarpeta && !$('.aviso-error')) {
      $('#aviso-precios').insertAdjacentHTML('beforebegin',
        `<div class="aviso aviso-error">⚠ ${AVISO_SIN_CARPETA.replace('el archivo se ha descargado', 'lo que guardes se descarga')}</div>`);
    }
    let borrador = null;
    try { borrador = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null'); } catch (e) { /* nada */ }
    if (borrador?.pres && confirm(`Hay un presupuesto de cocina sin guardar de la última vez${borrador.pres.cliente?.nombre ? ` (${borrador.pres.cliente.nombre})` : ''}.\n\n¿Recuperarlo?`)) {
      try { pres = prepararCargado(borrador.pres); fechaArchivo = borrador.fechaArchivo; cambios = true; }
      catch (e) { presupuestoVacio(); }
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
            ? `No encuentro ${Almacen.PROGRAMA}/${Almacen.CARPETA_APP}/${Almacen.ARCHIVO_CATALOGO} en esa carpeta. Elige la carpeta que contiene ${Almacen.PROGRAMA} y ${Almacen.PRESUPUESTOS}.`
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
      [['Cargar catalogo_cocinas.xlsx', () => $('#archivo-catalogo').click(), true]]);
  }

  function mostrarError(e) {
    const msg = e?.message || e?.reason?.message || String(e?.reason || e);
    console.error(e);
    alert('Ha ocurrido un error:\n\n' + msg + '\n\nHaz una captura de este mensaje para revisarlo.');
  }
  window.addEventListener('unhandledrejection', e => mostrarError(e.reason));
  window.addEventListener('error', e => mostrarError(e.error || e.message));

  async function iniciar() {
    conectarEventos();
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
      `Elige la carpeta compartida del NAS que contiene <strong>${Almacen.PROGRAMA}</strong> y <strong>${Almacen.PRESUPUESTOS}</strong>.<br>` +
      'Es la misma que usa la app de muebles. Solo hay que hacerlo una vez en cada ordenador.',
      [['Elegir carpeta', async () => { await Almacen.elegirCarpeta(); await conCarpeta(); }, true]]);
  }

  return { iniciar };
})();

App.iniciar();
