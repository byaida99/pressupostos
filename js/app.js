// app.js
// Pantalla principal: estado del presupuesto, eventos y pintado.
// Un presupuesto se divide en muebles (apartados); cada mueble tiene sus
// materiales con piezas y sus extras.

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
  // Los datos de la empresa (logo, nombre, cuenta, pie) no son precios: salen siempre del catálogo actual
  const DATOS_EMPRESA = ['logo', 'empresa', 'iban', 'textoPie'];
  const catImprimir = () => {
    if (!catActual) return cat();
    const parametros = { ...cat().parametros };
    DATOS_EMPRESA.forEach(k => { parametros[k] = catActual.parametros[k]; });
    return { ...cat(), parametros };
  };
  const hoy = () => new Date().toISOString().slice(0, 10);
  const euros = n => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dec = (n, d = 2) => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const opt = (valor, texto, sel) => `<option value="${esc(valor)}"${sel ? ' selected' : ''}>${esc(texto)}</option>`;
  const copia = o => JSON.parse(JSON.stringify(o));
  const nombreMueble = (mu, m) => mu.nombre || `Mueble ${m + 1}`;

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

  function muebleNuevo(nombre = '', familia) {
    const s = seccionNueva(familia || cat().familias[0]?.codigo);
    s.piezas.push(piezaNueva(s.familia));
    return { nombre, activo: true, secciones: [s], extras: [] };
  }

  function presupuestoVacio() {
    pres = {
      version: 5, numero: '', fecha: hoy(),
      cliente: { nombre: '', contacto: '' }, referencia: '', descripcion: '',
      descuento: { activo: false, porcentaje: catActual.parametros.descuentoCarpinteroPct },
      recargoActivo: true,
      muebles: [], precios: catActual
    };
    pres.muebles.push(muebleNuevo());
    return pres;
  }

  // Completa campos que pueden faltar en presupuestos guardados
  function prepararCargado(p) {
    p.cliente = p.cliente || { nombre: '', contacto: '' };
    p.descuento = p.descuento || { activo: false, porcentaje: catActual.parametros.descuentoCarpinteroPct };
    p.precios = p.precios || catActual;
    if (p.recargoActivo === undefined) p.recargoActivo = true;
    if (!p.muebles) {
      // Guardado antes de existir los apartados: todo va a un único mueble
      p.muebles = [{ nombre: '', secciones: p.secciones || [], extras: p.extras || [] }];
      delete p.secciones; delete p.extras;
    }
    p.muebles.forEach(mu => {
      mu.extras = mu.extras || [];
      if (mu.activo === undefined) mu.activo = true;
      mu.secciones.forEach(s => {
        s.excluir = s.excluir || {};
        s.piezas.forEach(pz => { pz.cantos = pz.cantos || [false, false, false, false]; });
      });
    });
    return p;
  }

  // --------------------------------------------------------------- pintado
  function pintarTodo() {
    document.querySelectorAll('.app [data-bind]').forEach(el => {
      if (el.closest('#muebles, #desglose, #generador')) return;
      const v = el.dataset.bind.split('.').reduce((o, k) => o?.[k], pres);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    });
    Mueble.rellenarMateriales(cat());
    pintarMuebles();
    avisoPrecios();
    recalcular();
  }

  function htmlSeccion(sec, m, i) {
    const c = cat();
    const fam = Catalogo.familia(c, sec.familia);
    const conCanto = fam?.canto === 'CANTO';
    const conAcabado = fam?.acabadoSuperficial;
    const tabs = Catalogo.tablerosDe(c, sec.familia);
    const tabActual = tabs.some(t => t.acabado === sec.acabado && t.grosor === sec.grosor);
    const acabados = conAcabado ? [SIN, ...Catalogo.acabadosDe(c, sec.familia).map(a => a.nombre)] : [];

    const filas = sec.piezas.map((pz, j) => `
      <tr data-p="${j}">
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
    <div class="seccion" data-s="${i}">
      <div class="seccion-cabecera">
        <h3>Material ${i + 1}</h3>
        <label>Material <select data-bind="sec.familia">${c.familias.map(f => opt(f.codigo, f.nombre, f.codigo === sec.familia)).join('')}</select></label>
        <label class="crece">Tablero <select data-bind="sec.tablero">
          ${tabActual ? '' : opt('', `⚠ ${sec.acabado} ${sec.grosor} mm (ya no está en el catálogo)`, true)}
          ${tabs.map(t => opt(`${t.acabado}|${t.grosor}`, Catalogo.textoTablero(t), t.acabado === sec.acabado && t.grosor === sec.grosor)).join('')}
        </select></label>
        <label>Medida tablero <select data-bind="sec.medida">${c.medidas.map(x => opt(x, x.replace('x', ' × ') + ' cm', x === sec.medida)).join('')}</select></label>
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
    </div>`;
  }

  function htmlExtras(mu) {
    const c = cat();
    return mu.extras.map((ex, e) => `
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
      </tr>`).join('');
  }

  function pintarMuebles() {
    const n = pres.muebles.length;
    $('#muebles').innerHTML = pres.muebles.map((mu, m) => `
      <section class="mueble${mu.activo === false ? ' inactivo' : ''}" data-m="${m}">
        <div class="mueble-cabecera">
          <label class="interruptor" title="Si lo desactivas, este mueble no sale en el presupuesto ni suma en el total">
            <input type="checkbox" data-bind="mu.activo"${mu.activo === false ? '' : ' checked'}><span>Incluir</span></label>
          <input type="text" class="mueble-nombre" data-bind="mu.nombre" value="${esc(mu.nombre)}"
            placeholder="Mueble ${m + 1} (ej: Armario dormitorio) — sale en el PDF del cliente">
          <span class="mueble-precio" data-out="mueble"></span>
          <div class="seccion-botones">
            <button class="mini" data-accion="subir-mueble" title="Subir"${m === 0 ? ' disabled' : ''}>↑</button>
            <button class="mini" data-accion="bajar-mueble" title="Bajar"${m === n - 1 ? ' disabled' : ''}>↓</button>
            <button class="mini" data-accion="duplicar-mueble" title="Duplicar este mueble">⧉</button>
            <button class="mini peligro" data-accion="borrar-mueble" title="Eliminar este mueble">✕</button>
          </div>
        </div>
        ${mu.secciones.map((sec, i) => htmlSeccion(sec, m, i)).join('')}
        <button class="anadir" data-accion="anadir-seccion">➕ Añadir material a este mueble</button>
        <div class="mueble-extras">
          <h3>Extras y herrajes</h3>
          ${mu.extras.length ? `<table class="tabla tabla-extras">
            <thead><tr><th>Producto</th><th>Descripción</th><th class="num">Precio €</th><th class="num">Cant.</th><th class="num">Total</th><th></th></tr></thead>
            <tbody>${htmlExtras(mu)}</tbody></table>` : ''}
          <button class="anadir" data-accion="anadir-extra">➕ Añadir extra</button>
        </div>
      </section>`).join('');
    Mueble.rellenarDestinos(pres.muebles.map(nombreMueble));
  }

  function pintarDesglose() {
    const c = cat();
    const celda = (clave, importe, excluido) =>
      `<td class="num"><label class="${excluido ? 'excluido' : ''}">${euros(importe)}
        <input type="checkbox" data-excl="${clave}"${excluido ? '' : ' checked'}></label></td>`;
    let html = `<table class="tabla tabla-desglose"><thead><tr><th>Material / extra</th>
      ${Calculo.CONCEPTOS.map(([, t]) => `<th class="num">${t}</th>`).join('')}<th class="num">Subtotal</th></tr></thead><tbody>`;
    pres.muebles.forEach((mu, m) => {
      const rm = res.muebles[m];
      if (pres.muebles.length > 1) {
        html += `<tr class="fila-mueble"><td colspan="${Calculo.CONCEPTOS.length + 2}">${esc(nombreMueble(mu, m))}${mu.activo === false ? ' — no incluido' : ''}</td></tr>`;
      }
      mu.secciones.forEach((sec, i) => {
        const r = rm.secciones[i];
        const fam = Catalogo.familia(c, sec.familia);
        html += `<tr><td>${i + 1}. ${esc(fam?.nombre || sec.familia)} – ${esc(sec.acabado)} ${sec.grosor} mm</td>
          ${Calculo.CONCEPTOS.map(([k]) => celda(`s|${m}|${i}|${k}`, r.costes[k], sec.excluir[k])).join('')}
          <td class="num"><strong>${euros(r.subtotal)}</strong></td></tr>`;
      });
      mu.extras.forEach((ex, e) => {
        html += `<tr><td>Extra: ${esc(ex.nombre || ex.producto || 'Extra')}</td>
          <td colspan="${Calculo.CONCEPTOS.length - 1}"></td>${celda(`e|${m}|${e}`, rm.extras[e], ex.excluir)}
          <td class="num"><strong>${euros(ex.excluir ? 0 : rm.extras[e])}</strong></td></tr>`;
      });
    });
    html += '</tbody></table>';
    $('#desglose').innerHTML = html;
  }

  function pintarResumen() {
    const p = cat().parametros;
    const fila = (t, v, cls = '') => `<div class="fila ${cls}"><span>${t}</span><span>${v}</span></div>`;
    let html = '';
    if (pres.muebles.length > 1) {
      html += '<div class="resumen-muebles">' + pres.muebles.map((mu, m) => mu.activo === false
        ? fila(`<s>${esc(nombreMueble(mu, m))}</s>`, 'no incluido', 'apagado')
        : fila(esc(nombreMueble(mu, m)), euros(res.muebles[m].precio))).join('') + '</div>';
    }
    html += fila('Materiales, mecanizado y extras', euros(res.base));
    if (pres.recargoActivo !== false) html += fila(`+ Recargo por escala (${dec(res.recargoPct, 0)} % s/ total)`, euros(res.recargoBase));
    if (pres.descuento.activo) html += fila(`− Descuento carpintero (${dec(res.descuentoPct, 1)} % s/ tablero y canto)`, '−' + euros(res.descuento), 'verde');
    html += fila('Subtotal', euros(res.subtotal), 'negrita');
    if (res.acabadoTotal > 0) html += fila('+ Acabado superficial (opcional)', euros(res.acabadoTotal));
    html += fila('Base imponible', euros(res.total), 'negrita separador');
    html += fila(`IVA (${dec(p.ivaPct, 0)} %)`, euros(res.iva));
    html += fila('TOTAL (IVA incluido)', euros(res.totalConIva), 'total');
    html += fila(`Pago inicial (${dec(res.pagoInicialPct, 0)} %)`, euros(res.pagoInicial), 'pequeno');
    const avisos = [];
    res.muebles.forEach((rm, m) => rm.secciones.forEach((r, i) => {
      if (r.aviso) avisos.push(`${nombreMueble(pres.muebles[m], m)}, material ${i + 1}: ${r.aviso}`);
    }));
    if (avisos.length) html += `<p class="error">⚠ ${avisos.map(esc).join('<br>⚠ ')}</p>`;
    html += `<div class="botones resumen-botones">
      <button class="principal" data-accion="guardar">💾 Guardar</button>
      <button class="principal" data-accion="pdf-cliente">🖨️ PDF cliente</button></div>`;
    $('#resumen').innerHTML = html;
  }

  function recalcular() {
    res = Calculo.calcular(pres, cat());
    const p = cat().parametros;
    document.querySelectorAll('#muebles section[data-m]').forEach(mEl => {
      const rm = res.muebles[+mEl.dataset.m];
      mEl.querySelector('[data-out=mueble]').innerHTML = euros(rm.precio) +
        (rm.acabadoTotal > 0 ? ` <small>+ ${euros(rm.acabadoTotal)} acabado opcional</small>` : '');
      mEl.querySelectorAll('.seccion[data-s]').forEach(sEl => {
        const r = rm.secciones[+sEl.dataset.s];
        sEl.querySelectorAll('tr[data-p]').forEach(tr => {
          const rp = r.piezas[+tr.dataset.p];
          tr.querySelector('[data-out=m2]').textContent = rp.m2 ? dec(rp.m2) : '';
          tr.querySelector('[data-out=coste]').textContent = rp.coste ? dec(rp.coste) : '';
        });
        sEl.querySelector('[data-out=seccion]').innerHTML = r.aviso ? `<span class="error">⚠ ${r.aviso}</span>` :
          `${dec(r.m2Piezas)} m² piezas · ${dec(r.m2Neto)} m² con merma ${dec(p.mermaPct, 0)} % · ` +
          `${dec(r.tableros, 1)} tablero(s) · ${dec(r.mlCorte)} ml corte · ${dec(r.mlCanteado)} ml canteado` +
          (r.rollos ? ` (${r.rollos} rollo${r.rollos > 1 ? 's' : ''})` : '') +
          ` · <strong>${euros(r.subtotal)}</strong>`;
      });
      mEl.querySelectorAll('tr[data-e]').forEach(tr => {
        tr.querySelector('[data-out=extra]').textContent = euros(rm.extras[+tr.dataset.e]);
      });
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

  // Mueble, sección, pieza y extra a los que pertenece un elemento de la pantalla
  function lugar(el) {
    const m = indice(el, 'm'), s = indice(el, 's'), p = indice(el, 'p'), e = indice(el, 'e');
    const mu = pres.muebles[m];
    const sec = mu?.secciones[s];
    return { m, s, p, e, mu, sec, pz: sec?.piezas[p], ex: mu?.extras[e] };
  }

  function repintar() { pintarMuebles(); recalcular(); }

  function alCambiarCampo(el) {
    const b = el.dataset.bind;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    const { mu, sec, pz, ex } = lugar(el);
    let estructura = false;

    if (b === 'pz.canto') pz.cantos[+el.dataset.k] = v;
    else if (b.startsWith('pz.')) pz[b.slice(3)] = v;
    else if (b === 'sec.familia') { cambiarFamilia(sec, v); estructura = true; }
    else if (b === 'sec.tablero') {
      if (!v) return;
      const [acabado, grosor] = v.split('|');
      Object.assign(sec, { acabado, grosor: Number(grosor) });
      estructura = true;
    }
    else if (b.startsWith('sec.')) sec[b.slice(4)] = v;
    else if (b === 'ex.producto') {
      const x = cat().extras.find(x => x.nombre === v);
      Object.assign(ex, { producto: v, nombre: x ? x.nombre : '', precio: x ? x.precio : '' });
      estructura = true;
    }
    else if (b.startsWith('ex.')) ex[b.slice(3)] = v;
    else if (b === 'mu.nombre') { mu.nombre = v; Mueble.rellenarDestinos(pres.muebles.map(nombreMueble)); }
    else if (b === 'mu.activo') { mu.activo = v; el.closest('.mueble').classList.toggle('inactivo', !v); }
    else {
      const ruta = b.split('.');
      const ultimo = ruta.pop();
      ruta.reduce((o, k) => o[k], pres)[ultimo] = v;
    }
    marcarCambios();
    if (estructura) pintarMuebles();
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
    'anadir-mueble'() {
      pres.muebles.push(muebleNuevo());
      marcarCambios(); repintar();
      const ultimo = document.querySelector(`#muebles section[data-m="${pres.muebles.length - 1}"]`);
      ultimo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ultimo?.querySelector('.mueble-nombre')?.focus({ preventScroll: true });
    },
    'borrar-mueble'(el) {
      const { m, mu } = lugar(el);
      const conPiezas = mu.secciones.some(s => s.piezas.some(p => p.largo || p.ancho)) || mu.extras.length;
      if (conPiezas && !confirm(`¿Eliminar «${nombreMueble(mu, m)}» con todas sus piezas y extras?`)) return;
      pres.muebles.splice(m, 1);
      if (!pres.muebles.length) pres.muebles.push(muebleNuevo());
      marcarCambios(); repintar();
    },
    'duplicar-mueble'(el) {
      const { m, mu } = lugar(el);
      const nuevo = copia(mu);
      nuevo.nombre = mu.nombre ? `${mu.nombre} (copia)` : '';
      pres.muebles.splice(m + 1, 0, nuevo);
      marcarCambios(); repintar();
    },
    'subir-mueble'(el) { moverMueble(lugar(el).m, -1); },
    'bajar-mueble'(el) { moverMueble(lugar(el).m, 1); },
    'anadir-seccion'(el) {
      const { m, mu } = lugar(el);
      const ultima = mu.secciones[mu.secciones.length - 1];
      const s = seccionNueva(ultima?.familia || cat().familias[0].codigo);
      s.piezas.push(piezaNueva(s.familia));
      mu.secciones.push(s);
      marcarCambios(); repintar();
      enfocar(m, mu.secciones.length - 1, 0);
    },
    'borrar-seccion'(el) {
      const { s, mu } = lugar(el);
      const n = mu.secciones[s].piezas.filter(p => p.largo || p.ancho).length;
      if (n > 1 && !confirm(`¿Eliminar el material ${s + 1} con sus ${n} piezas?`)) return;
      mu.secciones.splice(s, 1);
      marcarCambios(); repintar();
    },
    'duplicar-seccion'(el) {
      const { s, mu } = lugar(el);
      mu.secciones.splice(s + 1, 0, copia(mu.secciones[s]));
      marcarCambios(); repintar();
    },
    'anadir-pieza'(el) { const { m, s } = lugar(el); anadirPieza(m, s); },
    'duplicar-pieza'(el) {
      const { m, s, p, sec } = lugar(el);
      sec.piezas.splice(p + 1, 0, copia(sec.piezas[p]));
      marcarCambios(); repintar();
      enfocar(m, s, p + 1);
    },
    'borrar-pieza'(el) {
      const { p, sec } = lugar(el);
      sec.piezas.splice(p, 1);
      marcarCambios(); repintar();
    },
    'cantos-todos'(el) {
      const { pz } = lugar(el);
      const marcar = !pz.cantos.every(Boolean);
      pz.cantos = [marcar, marcar, marcar, marcar];
      marcarCambios(); repintar();
    },
    'anadir-extra'(el) {
      const { m, mu } = lugar(el);
      const x = cat().extras[0];
      mu.extras.push({ producto: x?.nombre || '', nombre: x?.nombre || '', precio: x?.precio ?? '', cantidad: 1 });
      marcarCambios(); repintar();
      document.querySelector(`#muebles section[data-m="${m}"] tr[data-e="${mu.extras.length - 1}"] select`)?.focus();
    },
    'borrar-extra'(el) {
      const { e, mu } = lugar(el);
      mu.extras.splice(e, 1);
      marcarCambios(); repintar();
    },
    'actualizar-precios'() {
      if (!confirm('Se recalculará el presupuesto con los precios actuales del catálogo. ¿Continuar?')) return;
      pres.precios = catActual;
      pres.muebles.forEach(mu => mu.extras.forEach(ex => {
        const x = catActual.extras.find(x => x.nombre === ex.producto);
        if (x) ex.precio = x.precio;
      }));
      marcarCambios(); pintarTodo();
      notificar('Precios actualizados. Recuerda guardar.');
    },
    nuevo() {
      if (cambios && !confirm('Hay cambios sin guardar. ¿Empezar un presupuesto nuevo igualmente?')) return;
      presupuestoVacio(); fechaArchivo = null; cambios = false; borrarBorrador();
      pintarTodo();
    },
    duplicar() {
      pres = copia(pres);
      Object.assign(pres, { numero: '', fecha: hoy(), precios: catActual });
      delete pres.resumen;
      fechaArchivo = null;
      marcarCambios(); pintarTodo();
      notificar('Copia creada con los precios actuales. Al guardar tendrá un número nuevo.');
    },
    guardar,
    abrir,
    async 'pdf-cliente'() { if (await guardarAntesDeImprimir()) Imprimir.cliente(pres, res, catImprimir()); },
    async 'pdf-completo'() { if (await guardarAntesDeImprimir()) Imprimir.completo(pres, res, catImprimir()); },
    async 'recargar-catalogo'() {
      cerrarMenu();
      try {
        await cargarCatalogo();
        if (!pres.numero && !hayPiezas()) pres.precios = catActual;
        pintarTodo();
        notificar('Catálogo recargado.');
      } catch (e) { alert('No se ha podido leer el catálogo: ' + e.message); }
    },
    'descargar-plantilla'() {
      cerrarMenu();
      XLSX.writeFile(Plantilla.crear(cat()), 'plantilla_presupuesto.xlsx');
    },
    'importar-plantilla'() { cerrarMenu(); $('#archivo-plantilla').click(); },
    'importar-csv'() { cerrarMenu(); $('#archivo-csv').click(); },
    async 'cambiar-carpeta'() {
      cerrarMenu();
      if (!Almacen.soportado) return alert('Este navegador no permite elegir carpetas. Usa Chrome o Edge.');
      try { await Almacen.elegirCarpeta(); await cargarCatalogo(); notificar('Carpeta: ' + Almacen.nombreCarpeta()); }
      catch (e) { if (e.name !== 'AbortError') alert(e.message); }
    }
  };

  const cerrarMenu = () => { $('.menu').open = false; };
  const hayPiezas = () => pres.muebles.some(mu => mu.extras.length || mu.secciones.some(s => s.piezas.some(p => p.largo || p.ancho)));

  function moverMueble(m, d) {
    const destino = m + d;
    if (destino < 0 || destino >= pres.muebles.length) return;
    const [mu] = pres.muebles.splice(m, 1);
    pres.muebles.splice(destino, 0, mu);
    marcarCambios(); repintar();
  }

  function anadirPieza(m, s) {
    const sec = pres.muebles[m].secciones[s];
    sec.piezas.push(piezaNueva(sec.familia));
    marcarCambios(); repintar();
    enfocar(m, s, sec.piezas.length - 1);
  }

  function enfocar(m, s, p, campo = 'pz.largo') {
    const tr = document.querySelector(`#muebles section[data-m="${m}"] .seccion[data-s="${s}"] tr[data-p="${p}"]`);
    tr?.querySelector(`[data-bind="${campo}"]`)?.focus();
  }

  // Añade las piezas del generador a un mueble, agrupadas por material
  function anadirPiezasMueble(lista, destino, nombre) {
    let m = destino;
    if (m === 'nuevo' || pres.muebles[m] === undefined) {
      // Si el único mueble está vacío se reaprovecha
      const vacio = pres.muebles.length === 1 && !hayPiezas() && !pres.muebles[0].nombre;
      if (vacio) pres.muebles[0].nombre = nombre;
      else pres.muebles.push({ nombre, secciones: [], extras: [] });
      m = vacio ? 0 : pres.muebles.length - 1;
    }
    const mu = pres.muebles[m];
    lista.forEach(pz => {
      let sec = mu.secciones.find(x => x.familia === pz.familia && x.acabado === pz.acabado && x.grosor === pz.grosor);
      if (!sec) {
        // Quita el material inicial si está vacío
        mu.secciones = mu.secciones.filter(x => x.piezas.some(p => p.largo || p.ancho));
        sec = seccionNueva(pz.familia, pz.acabado, pz.grosor);
        mu.secciones.push(sec);
      }
      sec.piezas = sec.piezas.filter(p => p.largo || p.ancho);
      sec.piezas.push(piezaNueva(sec.familia, { nombre: pz.nombre, largo: Math.round(pz.largo), ancho: Math.round(pz.ancho), cantidad: pz.cantidad }));
    });
    marcarCambios(); repintar();
    notificar(`${lista.reduce((n, p) => n + p.cantidad, 0)} piezas añadidas a «${nombreMueble(mu, m)}».`);
    document.querySelector(`#muebles section[data-m="${m}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          ${vis.map(it => `<tr class="clicable" data-k="${items.indexOf(it)}">
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

  // Plantilla Excel rellenada a mano: crea un presupuesto nuevo
  function importarPlantilla(buffer) {
    const r = Plantilla.leer(buffer, cat());
    if (!r.muebles.length) throw new Error('La plantilla no tiene piezas ni extras.' + (r.errores.length ? '\n\n' + r.errores.join('\n') : ''));
    presupuestoVacio();
    Object.assign(pres.cliente, r.cliente);
    if (r.referencia) pres.referencia = r.referencia;
    if (r.descripcion) pres.descripcion = r.descripcion;
    if (r.descuento !== null) pres.descuento.activo = r.descuento;
    pres.muebles = r.muebles.map(mu => ({
      nombre: mu.nombre,
      extras: mu.extras,
      secciones: mu.secciones.map(s => {
        const sec = seccionNueva(s.familia, s.acabado, s.grosor);
        sec.piezas = s.piezas.map(pz => piezaNueva(sec.familia, {
          ...pz, acabado: pz.acabado === null ? acabadoPorDefecto(sec.familia) : pz.acabado
        }));
        return sec;
      })
    }));
    pres.muebles.forEach(mu => { if (!mu.secciones.length) mu.secciones.push(muebleNuevo().secciones[0]); });
    fechaArchivo = null;
    marcarCambios(); pintarTodo();
    const piezas = r.muebles.reduce((n, mu) => n + mu.secciones.reduce((k, s) => k + s.piezas.length, 0), 0);
    let msg = `Importados ${r.muebles.length} mueble(s) con ${piezas} filas de piezas.`;
    if (r.errores.length) msg += `\n\nFilas que no se han podido importar:\n${r.errores.join('\n')}`;
    alert(msg);
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
    const mu = pres.muebles[0];
    mu.secciones = [];
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
          mu.secciones.push(actual);
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
        mu.extras.push({ producto: x ? x.nombre : '', nombre: f.nombre_extra || 'Extra', precio: f.precio_unitario || 0, cantidad: f.cantidad_extra || 1 });
      }
    });
    if (!mu.secciones.length) mu.secciones = muebleNuevo().secciones;
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
        const [tipo, m, a, k] = el.dataset.excl.split('|');
        const mu = pres.muebles[+m];
        if (tipo === 's') mu.secciones[+a].excluir[k] = !el.checked;
        else mu.extras[+a].excluir = !el.checked;
        marcarCambios(); recalcular();
        return;
      }
      if (el.dataset?.bind && (el.tagName === 'SELECT' || el.type === 'checkbox')) alCambiarCampo(el);
    });
    // Intro en la tabla de piezas: baja a la fila siguiente o crea una nueva
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); return; }
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      const tr = e.target.closest('#muebles tr[data-p]');
      if (!tr) return;
      e.preventDefault();
      const { m, s, p, sec } = lugar(e.target);
      if (p < sec.piezas.length - 1) enfocar(m, s, p + 1, e.target.dataset.bind);
      else anadirPieza(m, s);
    });
    window.addEventListener('beforeunload', e => { if (cambios) { guardarBorrador(); e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('pagehide', guardarBorrador);

    const alElegir = (id, fn) => $(id).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { await fn(f); } catch (err) { alert('No se ha podido importar: ' + err.message); }
    });
    alElegir('#archivo-csv', async f => {
      if (cambios && !confirm('Hay cambios sin guardar. ¿Importar igualmente?')) return;
      importarCsv(await f.text());
    });
    alElegir('#archivo-plantilla', async f => {
      if (cambios && !confirm('Hay cambios sin guardar. ¿Importar igualmente?')) return;
      importarPlantilla(await f.arrayBuffer());
    });
    alElegir('#archivo-json', async f => {
      pres = prepararCargado(JSON.parse(await f.text())); fechaArchivo = null; cambios = false; pintarTodo();
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
