// catalogo.js
// Lee catalogo.xlsx y lo convierte en el objeto de precios que usa la app.
// Las columnas se buscan por el principio de su título, así que se pueden
// reordenar o añadir columnas nuevas en el Excel sin romper nada.

const Catalogo = (() => {
  const SIN_ACABADO = 'Sin acabado';

  function normalizar(texto) {
    return String(texto ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return valor;
    const n = parseFloat(String(valor).replace(/\s|€|%/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function siNo(valor) {
    const v = normalizar(valor);
    return v === 'si' || v === 's' || v === 'yes' || v === 'x' || v === '1' || v === 'true';
  }

  // Devuelve las filas de una pestaña como objetos { cabecera: valor }
  function filas(libro, nombreHoja) {
    const nombre = libro.SheetNames.find(n => normalizar(n) === normalizar(nombreHoja));
    if (!nombre) throw new Error(`Falta la pestaña «${nombreHoja}» en catalogo.xlsx`);
    const datos = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: '' });
    const cabeceras = (datos[0] || []).map(normalizar);
    return datos.slice(1)
      .filter(f => f.some(v => String(v).trim() !== ''))
      .map(f => ({ celdas: f, cabeceras }));
  }

  // Valor de la columna cuyo título empieza por `inicio`
  function col(fila, inicio) {
    const i = fila.cabeceras.findIndex(c => c.startsWith(normalizar(inicio)));
    return i === -1 ? '' : fila.celdas[i];
  }

  const PARAMETROS = [
    ['mermaPct', 'merma'],
    ['corteMl', 'corte'],
    ['canteadoMl', 'canteado'],
    ['cncMl', 'cnc'],
    ['rolloCantoMl', 'rollo de canto'],
    ['cantoGruesoDesdeMm', 'canto 33'],
    ['descuentoCarpinteroPct', 'descuento carpintero'],
    ['ivaPct', 'iva'],
    ['mostrarIva', 'mostrar iva', 'siNo'],
    ['validezDias', 'validez'],
    ['logo', 'logo', 'texto'],
    ['empresa', 'nombre de la empresa', 'texto'],
    ['textoPie', 'texto al pie', 'texto']
  ];

  function desdeLibro(libro) {
    const avisos = [];

    const familias = filas(libro, 'Familias').map(f => {
      const canto = normalizar(col(f, 'canto'));
      return {
        codigo: String(col(f, 'codigo')).trim(),
        nombre: String(col(f, 'nombre')).trim(),
        canto: canto.startsWith('pul') ? 'PULIDO' : canto.startsWith('cant') ? 'CANTO' : 'NO',
        acabadoSuperficial: siNo(col(f, 'acabado')),
        medida: String(col(f, 'medida')).trim()
      };
    }).filter(f => f.codigo);
    const codigos = new Set(familias.map(f => f.codigo));

    const tableros = filas(libro, 'Tableros').map(f => ({
      familia: String(col(f, 'familia')).trim(),
      codigo: String(col(f, 'codigo')).trim(),
      acabado: String(col(f, 'acabado')).trim(),
      grosor: numero(col(f, 'grosor')),
      precioM2: numero(col(f, 'precio')),
      cantoFino: numero(col(f, 'canto 23')),
      cantoGrueso: numero(col(f, 'canto 33'))
    })).filter(t => {
      if (!t.acabado || !t.grosor) return false;
      if (!codigos.has(t.familia)) { avisos.push(`Tablero «${t.acabado}» con familia desconocida «${t.familia}»`); return false; }
      return true;
    });

    const acabados = filas(libro, 'Acabados').map(f => ({
      familia: String(col(f, 'familia')).trim(),
      nombre: String(col(f, 'acabado')).trim(),
      costeM2: numero(col(f, 'coste'))
    })).filter(a => a.nombre && codigos.has(a.familia));

    const extras = filas(libro, 'Extras').map(f => ({
      nombre: String(col(f, 'nombre')).trim(),
      precio: numero(col(f, 'precio'))
    })).filter(e => e.nombre);

    const medidas = filas(libro, 'Medidas')
      .map(f => String(f.celdas[0]).replace(/\s/g, '').replace(/[×X]/g, 'x'))
      .filter(m => /^\d+(\.\d+)?x\d+(\.\d+)?$/.test(m));

    const recargo = filas(libro, 'Recargo')
      .map(f => ({ desde: numero(f.celdas[0]), porcentaje: numero(f.celdas[1]) }))
      .sort((a, b) => a.desde - b.desde);

    const parametros = {};
    filas(libro, 'Parámetros').forEach(f => {
      const nombre = normalizar(f.celdas[0]);
      const valor = f.celdas[1];
      const def = PARAMETROS.find(([, inicio]) => nombre.startsWith(inicio));
      if (!def) return;
      const [clave, , tipo] = def;
      parametros[clave] = tipo === 'siNo' ? siNo(valor) : tipo === 'texto' ? String(valor).trim() : numero(valor);
    });
    PARAMETROS.forEach(([clave, inicio]) => {
      if (!(clave in parametros)) avisos.push(`Falta el parámetro «${inicio}» en la pestaña Parámetros`);
    });

    familias.forEach(fa => {
      if (fa.medida && !medidas.includes(fa.medida)) medidas.push(fa.medida);
    });

    return { familias, tableros, acabados, extras, medidas, recargo, parametros, avisos };
  }

  function desdeArchivo(buffer, fechaArchivo) {
    const libro = XLSX.read(buffer, { type: 'array' });
    const cat = desdeLibro(libro);
    cat.fecha = fechaArchivo || Date.now();
    return cat;
  }

  // Compara solo los precios, no la fecha ni los avisos
  function mismosPrecios(a, b) {
    if (!a || !b) return false;
    const limpio = c => JSON.stringify({ ...c, fecha: 0, avisos: [] });
    return limpio(a) === limpio(b);
  }

  // ---- Consultas usadas por el resto de la app ----
  const familia = (cat, codigo) => cat.familias.find(f => f.codigo === codigo);
  const tablerosDe = (cat, codigoFamilia) => cat.tableros.filter(t => t.familia === codigoFamilia);
  const tablero = (cat, codigoFamilia, acabado, grosor) =>
    cat.tableros.find(t => t.familia === codigoFamilia && t.acabado === acabado && t.grosor === grosor);
  const acabadosDe = (cat, codigoFamilia) => cat.acabados.filter(a => a.familia === codigoFamilia);
  const textoTablero = t =>
    `${t.codigo ? t.codigo + ' ' : ''}${t.acabado} · ${t.grosor} mm (${t.precioM2.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €/m²)`;

  return {
    SIN_ACABADO, normalizar, numero, desdeArchivo, mismosPrecios,
    familia, tablerosDe, tablero, acabadosDe, textoTablero
  };
})();
