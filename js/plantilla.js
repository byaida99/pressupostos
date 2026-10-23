// plantilla.js
// Plantilla Excel para preparar un presupuesto fuera de la app e importarlo.
// La plantilla se genera con el catálogo actual, que se incluye en la pestaña
// «Materiales» para saber qué escribir en cada columna.

const Plantilla = (() => {
  const norm = Catalogo.normalizar;
  const num = Catalogo.numero;

  const CAB_PIEZAS = ['Mueble', 'Material', 'Tablero', 'Grosor (mm)', 'Pieza', 'Largo (mm)', 'Ancho (mm)', 'Cantidad', 'Cantos', 'Acabado', '2 caras'];
  const CAB_EXTRAS = ['Mueble', 'Producto', 'Precio (€/ud)', 'Cantidad'];

  function hoja(filas, anchos) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = anchos.map(wch => ({ wch }));
    return ws;
  }

  function crear(cat) {
    const libro = XLSX.utils.book_new();
    const ejemplo = cat.tableros.find(t => t.familia === cat.familias[0].codigo && t.grosor === 19) || cat.tableros[0];
    const famEj = Catalogo.familia(cat, ejemplo.familia);
    const trasera = cat.tableros.find(t => t.familia === ejemplo.familia && t.grosor === 10) || ejemplo;

    XLSX.utils.book_append_sheet(libro, hoja([
      ['PLANTILLA DE PRESUPUESTO'],
      [''],
      ['1. Rellena «Datos» con el cliente.'],
      ['2. En «Piezas» pon una fila por pieza. Todas las filas con el mismo nombre en la columna Mueble van al mismo mueble.'],
      ['3. En «Extras» pon los herrajes y accesorios de cada mueble.'],
      ['4. En la app: ⋯ → Importar plantilla Excel.'],
      [''],
      ['Columnas de «Piezas»:'],
      ['• Material: código o nombre de la familia (MEL, Melamina, MDF…). Mira la pestaña «Materiales».'],
      ['• Tablero: código o color (W1100, Blanc Alpino, Hidrofugo…). Grosor en mm.'],
      ['• Cantos: L1 L2 A1 A2 (separados por espacios), «todos», «largos» o «anchos». Vacío = sin canto.'],
      ['• Acabado: solo para materiales que lo admiten (Lacado, Barnizado). Vacío = el de por defecto; escribe «Sin acabado» si no lleva.'],
      ['• 2 caras: «Sí» si el acabado va por las dos caras.'],
      ['• Si en Material, Tablero y Grosor dejas una celda vacía, se usa lo de la fila de arriba.'],
      [''],
      ['En «Extras», si dejas el precio vacío se usa el del catálogo.'],
      ['Las filas de ejemplo se pueden borrar o sobrescribir.']
    ], [110]), 'Instrucciones');

    XLSX.utils.book_append_sheet(libro, hoja([
      ['Campo', 'Valor'],
      ['Cliente', ''],
      ['Contacto', ''],
      ['Referencia', ''],
      ['Descripción', ''],
      ['Descuento carpintero (Sí / No)', 'No']
    ], [32, 60]), 'Datos');

    XLSX.utils.book_append_sheet(libro, hoja([
      CAB_PIEZAS,
      ['Armario dormitorio', famEj.codigo, ejemplo.codigo || ejemplo.acabado, ejemplo.grosor, 'Lateral', 2100, 580, 2, 'L1', '', ''],
      ['Armario dormitorio', '', '', '', 'Estante', 760, 560, 3, 'L1', '', ''],
      ['Armario dormitorio', famEj.codigo, trasera.codigo || trasera.acabado, trasera.grosor, 'Trasera', 2100, 800, 1, '', '', '']
    ], [22, 12, 18, 11, 22, 11, 11, 9, 16, 14, 8]), 'Piezas');

    const extraEj = cat.extras[0];
    XLSX.utils.book_append_sheet(libro, hoja([
      CAB_EXTRAS,
      ['Armario dormitorio', extraEj ? extraEj.nombre : '', '', 4]
    ], [22, 30, 14, 10]), 'Extras');

    const mats = [['Material', 'Nombre', 'Tablero (código)', 'Color / acabado', 'Grosor (mm)', 'Precio (€/m²)', 'Acabados posibles']];
    cat.tableros.forEach(t => {
      const fam = Catalogo.familia(cat, t.familia);
      mats.push([t.familia, fam?.nombre || '', t.codigo, t.acabado, t.grosor, t.precioM2,
        fam?.acabadoSuperficial ? Catalogo.acabadosDe(cat, t.familia).map(a => a.nombre).join(', ') : '—']);
    });
    mats.push([], ['Extras del catálogo', 'Precio (€/ud)']);
    cat.extras.forEach(x => mats.push([x.nombre, x.precio]));
    XLSX.utils.book_append_sheet(libro, hoja(mats, [22, 34, 16, 20, 11, 13, 24]), 'Materiales');

    return libro;
  }

  // ---------------------------------------------------------------- lectura
  function filasDe(libro, nombre) {
    const hojaNombre = libro.SheetNames.find(n => norm(n) === norm(nombre));
    if (!hojaNombre) return null;
    const datos = XLSX.utils.sheet_to_json(libro.Sheets[hojaNombre], { header: 1, defval: '' });
    const cab = (datos[0] || []).map(norm);
    return datos.slice(1).map((celdas, i) => ({
      fila: i + 2,
      vacia: !celdas.some(v => String(v).trim() !== ''),
      col: inicio => { const k = cab.findIndex(c => c.startsWith(norm(inicio))); return k === -1 ? '' : celdas[k]; }
    }));
  }

  function siNo(v) {
    const t = norm(v);
    if (!t) return null;
    return ['si', 's', 'x', '1', 'yes', 'true'].includes(t);
  }

  function leerCantos(v) {
    const t = norm(v).replace(/[,;+]/g, ' ');
    if (!t) return [false, false, false, false];
    if (t.startsWith('tod') || t === '4') return [true, true, true, true];
    if (t.startsWith('larg')) return [true, true, false, false];
    if (t.startsWith('anch')) return [false, false, true, true];
    const partes = t.split(/\s+/);
    return ['l1', 'l2', 'a1', 'a2'].map(k => partes.includes(k));
  }

  function buscarFamilia(cat, texto) {
    const t = norm(texto);
    return cat.familias.find(f => norm(f.codigo) === t || norm(f.nombre) === t);
  }

  function buscarTablero(cat, familia, texto, grosor) {
    const t = norm(texto);
    return cat.tableros.find(tb =>
      (!familia || tb.familia === familia) && tb.grosor === grosor &&
      [tb.codigo, tb.acabado, `${tb.codigo} ${tb.acabado}`].some(x => x && norm(x) === t));
  }

  function leer(buffer, cat) {
    const libro = XLSX.read(buffer, { type: 'array' });
    const errores = [];
    const r = { cliente: { nombre: '', contacto: '' }, referencia: '', descripcion: '', descuento: null, muebles: [], errores };

    (filasDe(libro, 'Datos') || []).forEach(f => {
      const campo = norm(f.col('campo')), valor = String(f.col('valor') ?? '').trim();
      if (campo.startsWith('cliente')) r.cliente.nombre = valor;
      else if (campo.startsWith('contacto')) r.cliente.contacto = valor;
      else if (campo.startsWith('referencia')) r.referencia = valor;
      else if (campo.startsWith('descripcion')) r.descripcion = valor;
      else if (campo.startsWith('descuento')) r.descuento = siNo(valor);
    });

    const mueble = nombre => {
      const n = String(nombre || '').trim() || 'Mueble 1';
      let mu = r.muebles.find(x => x.nombre === n);
      if (!mu) { mu = { nombre: n, secciones: [], extras: [] }; r.muebles.push(mu); }
      return mu;
    };

    const piezas = filasDe(libro, 'Piezas');
    if (!piezas) throw new Error('El Excel no tiene la pestaña «Piezas». ¿Es la plantilla de presupuestos?');
    let anterior = { material: '', tablero: '', grosor: '' };
    piezas.forEach(f => {
      if (f.vacia) return;
      const material = String(f.col('material')).trim() || anterior.material;
      const tablero = String(f.col('tablero')).trim() || anterior.tablero;
      const grosor = num(f.col('grosor')) || anterior.grosor;
      anterior = { material, tablero, grosor };
      const largo = num(f.col('largo')), ancho = num(f.col('ancho'));
      if (!largo || !ancho) { errores.push(`Piezas, fila ${f.fila}: falta el largo o el ancho`); return; }

      const fam = material ? buscarFamilia(cat, material) : null;
      if (material && !fam) { errores.push(`Piezas, fila ${f.fila}: no conozco el material «${material}»`); return; }
      const tab = buscarTablero(cat, fam?.codigo, tablero, grosor);
      if (!tab) { errores.push(`Piezas, fila ${f.fila}: no encuentro el tablero «${tablero}» de ${grosor} mm${fam ? ` en ${fam.nombre}` : ''}`); return; }
      const famTab = Catalogo.familia(cat, tab.familia);

      let acabado = null;
      const textoAcabado = String(f.col('acabado')).trim();
      if (!famTab.acabadoSuperficial) acabado = Catalogo.SIN_ACABADO;
      else if (textoAcabado) {
        const a = norm(textoAcabado);
        if (a.startsWith('sin') || a === 'no') acabado = Catalogo.SIN_ACABADO;
        else {
          const ac = Catalogo.acabadosDe(cat, tab.familia).find(x => norm(x.nombre) === a);
          if (!ac) errores.push(`Piezas, fila ${f.fila}: acabado «${textoAcabado}» desconocido, se usa el de por defecto`);
          else acabado = ac.nombre;
        }
      }

      const mu = mueble(f.col('mueble'));
      let sec = mu.secciones.find(s => s.familia === tab.familia && s.acabado === tab.acabado && s.grosor === tab.grosor);
      if (!sec) { sec = { familia: tab.familia, acabado: tab.acabado, grosor: tab.grosor, piezas: [] }; mu.secciones.push(sec); }
      sec.piezas.push({
        nombre: String(f.col('pieza')).trim(),
        largo, ancho,
        cantidad: Math.max(1, Math.round(num(f.col('cantidad')) || 1)),
        cantos: famTab.canto === 'CANTO' ? leerCantos(f.col('cantos')) : [false, false, false, false],
        acabado,
        dosCaras: !!siNo(f.col('2 caras')) && famTab.acabadoSuperficial
      });
    });

    (filasDe(libro, 'Extras') || []).forEach(f => {
      if (f.vacia) return;
      const nombre = String(f.col('producto')).trim();
      if (!nombre) return;
      const x = cat.extras.find(e => norm(e.nombre) === norm(nombre));
      const precioCelda = f.col('precio');
      const precio = String(precioCelda).trim() !== '' ? num(precioCelda) : x?.precio;
      if (precio === undefined) { errores.push(`Extras, fila ${f.fila}: «${nombre}» no está en el catálogo y no tiene precio`); return; }
      mueble(f.col('mueble')).extras.push({
        producto: x ? x.nombre : '', nombre: x ? x.nombre : nombre, precio, cantidad: num(f.col('cantidad')) || 1
      });
    });

    return r;
  }

  return { crear, leer };
})();
