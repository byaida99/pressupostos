// catalogo.js (cocinas)
// Lee catalogo_cocinas.xlsx y lo convierte en el objeto de precios que usa la app.
// Las columnas se buscan por el principio de su título, así que se pueden
// reordenar o añadir columnas nuevas en el Excel sin romper nada.

const Catalogo = (() => {
  const TIPOS = ['Bajo', 'Alto', 'Columna'];
  const CARCASAS = ['estandar', 'fregadero', 'rinconero', 'campana', 'horno', 'nevera', 'abierto', 'ninguna'];

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

  // Lista de medidas «600,300, 400» → [600, 300, 400]
  const medidas = valor => String(valor ?? '').split(/[,;\s]+/).map(numero).filter(n => n > 0);

  function filas(libro, nombreHoja, opcional = false) {
    const nombre = libro.SheetNames.find(n => normalizar(n) === normalizar(nombreHoja));
    if (!nombre && opcional) return [];
    if (!nombre) throw new Error(`Falta la pestaña «${nombreHoja}» en catalogo_cocinas.xlsx`);
    const datos = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: '' });
    const cabeceras = (datos[0] || []).map(normalizar);
    return datos.slice(1)
      .filter(f => f.some(v => String(v).trim() !== ''))
      .map(f => ({ celdas: f, cabeceras }));
  }

  function col(fila, inicio) {
    const i = fila.cabeceras.findIndex(c => c.startsWith(normalizar(inicio)));
    return i === -1 ? '' : fila.celdas[i];
  }
  const texto = (fila, inicio) => String(col(fila, inicio) ?? '').trim();

  // Cajones escritos como «1P+2G» → ['P', 'G', 'G']
  function leerCajones(valor) {
    const lista = [];
    String(valor || '').toUpperCase().split(/[+,\s]+/).filter(Boolean).forEach(parte => {
      const m = parte.match(/^(\d*)\s*([A-Z]+)$/);
      if (m) for (let i = 0; i < (parseInt(m[1], 10) || 1); i++) lista.push(m[2]);
    });
    return lista;
  }

  const PARAMETROS = [
    ['mermaPct', 'merma'],
    ['cantoMl', 'canto'],
    ['corteMl', 'corte'],
    ['canteadoMl', 'canteado'],
    ['cncHora', 'cnc (€/h'],
    ['cncMinMl', 'cnc (min'],
    ['cncFrentesPct', 'cnc frentes'],
    ['bisagrasPuerta', 'bisagras'],
    ['herrajeBajo', 'herrajes modulo bajo'],
    ['herrajeAlto', 'herrajes modulo alto'],
    ['montajeCajon', 'montaje por cajon'],
    ['refuerzoCajon', 'refuerzo cajon'],
    ['fondoCajon', 'fondo cajon'],
    ['travesano', 'travesano'],
    ['ivaPct', 'iva'],
    ['validezDias', 'validez'],
    ['logo', 'logo', 'texto'],
    ['empresa', 'nombre de la empresa', 'texto'],
    ['textoPie', 'texto al pie', 'texto'],
    ['pagoInicialPct', 'pago inicial', 'numero', 50],
    ['iban', 'numero de cuenta', 'texto', '']
  ];

  function desdeLibro(libro) {
    const avisos = [];

    const tarifas = filas(libro, 'Tarifas').map(f => ({
      numero: numero(col(f, 'n')),
      nombre: texto(f, 'tarifa'),
      carpintero: normalizar(col(f, 'precios')).startsWith('carp'),
      montaje: numero(col(f, 'montaje por')),
      recargoPct: numero(col(f, 'recargo')),
      montajeEspecial: siNo(col(f, 'montaje especial'))
    })).filter(t => t.numero && t.nombre).sort((a, b) => a.numero - b.numero);

    // Tableros del interior por uso: casco, trasera, cajon, estante
    const tableros = {};
    filas(libro, 'Tableros').forEach(f => {
      const uso = normalizar(col(f, 'uso')).replace(/[^a-z]/g, '');
      if (!uso) return;
      tableros[uso] = { descripcion: texto(f, 'descripcion'), estandar: numero(col(f, 'precio estandar')), carpintero: numero(col(f, 'precio carpintero')) };
    });
    ['casco', 'trasera', 'cajon', 'estante'].forEach(u => { if (!tableros[u]) avisos.push(`Falta el tablero «${u}» en la pestaña Tableros`); });

    const acabados = filas(libro, 'Acabados').map(f => ({
      acabado: texto(f, 'acabado'),
      tipo: texto(f, 'tipo'),
      estandar: numero(col(f, 'precio estandar')),
      carpintero: numero(col(f, 'precio carpintero'))
    })).filter(a => a.acabado && a.tipo);

    const guias = filas(libro, 'Guías').map(f => ({
      nombre: texto(f, 'guia'), marca: texto(f, 'marca'), precio: numero(col(f, 'precio'))
    })).filter(g => g.nombre);

    const marcas = [...new Set(guias.map(g => g.marca).filter(Boolean))];
    const cajones = filas(libro, 'Cajones').map(f => {
      const c = {
        codigo: texto(f, 'codigo').toUpperCase(), nombre: texto(f, 'nombre'),
        altoFrente: numero(col(f, 'alto frente')), altoCaja: numero(col(f, 'alto caja')), guias: {}
      };
      marcas.forEach(m => { c.guias[m] = texto(f, 'guia ' + m); });
      return c;
    }).filter(c => c.codigo);
    const codigosCajon = new Set(cajones.map(c => c.codigo));

    const modulos = filas(libro, 'Módulos').map(f => {
      const tipo = TIPOS.find(t => normalizar(col(f, 'tipo')).startsWith(normalizar(t)));
      const carcasa = normalizar(col(f, 'carcasa')) || 'estandar';
      const puertas = normalizar(col(f, 'puertas'));
      const m = {
        codigo: texto(f, 'codigo'), tipo, nombre: texto(f, 'nombre'),
        anchos: medidas(col(f, 'anchos')), altos: medidas(col(f, 'altos')), fondo: numero(col(f, 'fondo')),
        carcasa: CARCASAS.find(c => carcasa.startsWith(c.slice(0, 4))) || 'estandar',
        puertas: puertas === '' || puertas.startsWith('auto') ? 'auto' : numero(puertas),
        anchoPuerta: numero(col(f, 'ancho puerta')),
        cajones: leerCajones(col(f, 'cajones')),
        estantes: numero(col(f, 'estantes')),
        hueco: numero(col(f, 'hueco')),
        montajeExtra: numero(col(f, 'montaje extra')),
        extra: numero(col(f, 'extra ('))
      };
      return m;
    }).filter(m => {
      if (!m.codigo || !m.nombre) return false;
      if (!m.tipo) { avisos.push(`Módulo «${m.nombre}»: el tipo debe ser Bajo, Alto o Columna`); return false; }
      if (!m.anchos.length || !m.altos.length) { avisos.push(`Módulo «${m.nombre}»: faltan anchos o altos`); return false; }
      const malos = m.cajones.filter(c => !codigosCajon.has(c));
      if (malos.length) { avisos.push(`Módulo «${m.nombre}»: cajón desconocido ${malos.join(', ')}`); return false; }
      return true;
    });

    const piezas = filas(libro, 'Piezas').map(f => ({
      codigo: texto(f, 'codigo'), nombre: texto(f, 'nombre'),
      unidad: normalizar(col(f, 'unidad')).startsWith('ml') ? 'ml' : 'ud',
      ancho: numero(col(f, 'ancho')), alto: numero(col(f, 'alto')), precioFijo: numero(col(f, 'precio fijo')),
      cnc: !normalizar(col(f, 'cnc')).startsWith('n'), montaje: numero(col(f, 'montaje'))
    })).filter(p => p.codigo && p.nombre);

    const parametros = {};
    filas(libro, 'Parámetros').forEach(f => {
      const nombre = normalizar(f.celdas[0]);
      const valor = f.celdas[1];
      const def = PARAMETROS.find(([, inicio]) => nombre.startsWith(normalizar(inicio)));
      if (!def || def[0] in parametros) return;
      const [clave, , tipo] = def;
      parametros[clave] = tipo === 'texto' ? String(valor ?? '').trim() : numero(valor);
    });
    PARAMETROS.forEach(([clave, inicio, , porDefecto]) => {
      if (clave in parametros) return;
      if (porDefecto !== undefined) parametros[clave] = porDefecto;
      else avisos.push(`Falta el parámetro «${inicio}» en la pestaña Parámetros`);
    });

    if (!tarifas.length) throw new Error('El catálogo no tiene tarifas');
    if (!acabados.length) throw new Error('El catálogo no tiene acabados');
    if (!modulos.length) throw new Error('El catálogo no tiene módulos');

    return { tarifas, tableros, acabados, guias, marcas, cajones, modulos, piezas, parametros, avisos };
  }

  function desdeArchivo(buffer, fechaArchivo) {
    const cat = desdeLibro(XLSX.read(buffer, { type: 'array' }));
    cat.fecha = fechaArchivo || Date.now();
    return cat;
  }

  function mismosPrecios(a, b) {
    if (!a || !b) return false;
    const limpio = c => JSON.stringify({ ...c, fecha: 0, avisos: [] });
    return limpio(a) === limpio(b);
  }

  // ---- Consultas ----
  const tarifa = (cat, n) => cat.tarifas.find(t => t.numero === Number(n)) || cat.tarifas[0];
  const modulo = (cat, codigo) => cat.modulos.find(m => m.codigo === codigo);
  const pieza = (cat, codigo) => cat.piezas.find(p => p.codigo === codigo);
  const cajon = (cat, codigo) => cat.cajones.find(c => c.codigo === codigo);
  const guia = (cat, nombre) => cat.guias.find(g => normalizar(g.nombre) === normalizar(nombre));
  const nombresAcabado = cat => [...new Set(cat.acabados.map(a => a.acabado))];
  const tiposDe = (cat, acabado) => cat.acabados.filter(a => a.acabado === acabado).map(a => a.tipo);
  const acabado = (cat, ac) => cat.acabados.find(a => a.acabado === ac?.acabado && a.tipo === ac?.tipo);

  return {
    TIPOS, normalizar, numero, desdeArchivo, mismosPrecios,
    tarifa, modulo, pieza, cajon, guia, nombresAcabado, tiposDe, acabado
  };
})();
