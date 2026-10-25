// almacen.js
// Lectura y escritura en la carpeta del NAS (Chrome / Edge).
// Estructura de la carpeta elegida:
//   0_PROGRAMA/index.html, catalogo.xlsx, LOGO.JPG…
//   1_PRESSUPOSTOS/1234/1234_Cocina_20261024.json  (+ .pdf y _plano1.pdf… con el mismo nombre)
//   1_PRESSUPOSTOS/1000/Cliente - 600000000/1000_Armario_20261025.json   (clientes sin código)
// Si ya existe otro presupuesto con el mismo nombre, se guarda como …_V2, …_V3…

const Almacen = (() => {
  const ARCHIVO_CATALOGO = 'catalogo.xlsx';
  const PROGRAMA = '0_PROGRAMA';
  const PRESUPUESTOS = '1_PRESSUPOSTOS';
  const SIN_CODIGO = '1000';
  const ES_JSON = /\.json$/i;
  const soportado = typeof window.showDirectoryPicker === 'function';
  let raiz = null;

  // --- Recordar la carpeta entre sesiones (IndexedDB) ---
  function idb(modo, accion) {
    return new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open('app-presupuestos', 1);
      peticion.onupgradeneeded = () => peticion.result.createObjectStore('ajustes');
      peticion.onerror = () => rechazar(peticion.error);
      peticion.onsuccess = () => {
        const tx = peticion.result.transaction('ajustes', modo);
        const r = accion(tx.objectStore('ajustes'));
        tx.oncomplete = () => resolver(r && r.result);
        tx.onerror = () => rechazar(tx.error);
      };
    });
  }

  async function recuperarCarpeta() {
    if (!soportado) return 'no-soportado';
    try {
      const h = await idb('readonly', s => s.get('raiz'));
      if (!h) return 'sin-carpeta';
      raiz = h;
      return (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'pedir-permiso';
    } catch (e) {
      return 'sin-carpeta';
    }
  }

  async function pedirPermiso() {
    return (await raiz.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  async function elegirCarpeta() {
    raiz = await window.showDirectoryPicker({ id: 'presupuestos', mode: 'readwrite' });
    await idb('readwrite', s => s.put(raiz, 'raiz'));
    return raiz.name;
  }

  const nombreCarpeta = () => raiz?.name || '';

  // --- Programa (catálogo y logo) ---
  async function carpetaPrograma() {
    try {
      return await raiz.getDirectoryHandle(PROGRAMA);
    } catch (e) {
      const err = new Error(`En la carpeta «${raiz.name}» no está ${PROGRAMA}. Elige la carpeta que contiene ${PROGRAMA} y ${PRESUPUESTOS}.`);
      err.name = 'CarpetaIncorrecta';
      throw err;
    }
  }

  async function leerCatalogo() {
    const f = await (await (await carpetaPrograma()).getFileHandle(ARCHIVO_CATALOGO)).getFile();
    return { buffer: await f.arrayBuffer(), fecha: f.lastModified };
  }

  // Devuelve un archivo de 0_PROGRAMA (el logo) como data URL, o '' si no existe
  async function leerComoDataUrl(nombre) {
    try {
      const f = await (await (await carpetaPrograma()).getFileHandle(nombre)).getFile();
      const ext = nombre.split('.').pop().toLowerCase();
      const tipo = f.type || { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'image/jpeg';
      return await new Promise((ok, mal) => {
        const lector = new FileReader();
        lector.onload = () => ok(lector.result);
        lector.onerror = () => mal(lector.error);
        lector.readAsDataURL(new Blob([f], { type: tipo }));
      });
    } catch (e) {
      return '';
    }
  }

  // --- Carpetas de presupuestos ---
  // Nombre de carpeta o archivo sin acentos ni símbolos, para evitar problemas con el NAS
  function limpiarNombre(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w .,&()'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  // 1_PRESSUPOSTOS (acepta otra grafía, como 1_PRESUPOSTOS, si ya existe así)
  async function carpetaPresupuestos(crear) {
    for await (const [nombre, h] of raiz.entries()) {
      if (h.kind === 'directory' && /^1_PRES/i.test(nombre)) return h;
    }
    return raiz.getDirectoryHandle(PRESUPUESTOS, { create: crear });
  }

  const telefonoDe = contacto => {
    const t = String(contacto || '');
    return !t.includes('@') && t.replace(/\D/g, '').length >= 6 ? t.replace(/[^\d+ ]/g, '').trim() : '';
  };

  // Carpeta del cliente: 1234 (o «1234 - Nombre» si ya existe así) o 1000/Nombre - Teléfono
  async function rutaCliente(pres, crear) {
    const base = await carpetaPresupuestos(crear);
    const codigo = limpiarNombre(pres.cliente?.codigo) || SIN_CODIGO;
    let dirCodigo = null;
    for await (const [nombre, h] of base.entries()) {
      if (h.kind === 'directory' && (nombre === codigo || new RegExp(`^${codigo.replace(/[.()]/g, '\\$&')}[ _-]`).test(nombre))) { dirCodigo = h; break; }
    }
    dirCodigo = dirCodigo || await base.getDirectoryHandle(codigo, { create: crear });
    if (codigo !== SIN_CODIGO) return { dir: dirCodigo, ruta: [dirCodigo.name] };
    const sub = [limpiarNombre(pres.cliente?.nombre) || 'Sin nombre', telefonoDe(pres.cliente?.contacto)].filter(Boolean).join(' - ');
    const dir = await dirCodigo.getDirectoryHandle(sub, { create: crear });
    return { dir, ruta: [dirCodigo.name, sub] };
  }

  async function dirDeRuta(ruta) {
    let dir = await carpetaPresupuestos(false);
    for (const parte of ruta) dir = await dir.getDirectoryHandle(parte);
    return dir;
  }

  // Recorre 1_PRESSUPOSTOS hasta 3 niveles y llama a fn(datos, ruta, nombre) por cada presupuesto .json
  async function recorrer(fn) {
    let base;
    try { base = await carpetaPresupuestos(false); } catch (e) { return; }
    const visitar = async (dir, ruta) => {
      for await (const [nombre, h] of dir.entries()) {
        if (h.kind === 'file' && ES_JSON.test(nombre)) {
          let d = null;
          try { d = JSON.parse(await (await h.getFile()).text()); } catch (e) { /* no es un presupuesto válido: se ignora */ }
          if (d && (d.muebles || d.secciones)) await fn(d, ruta, nombre);
        }
        else if (h.kind === 'directory' && ruta.length < 2) await visitar(h, [...ruta, nombre]);
      }
    };
    await visitar(base, []);
  }

  async function listar() {
    const lista = [];
    await recorrer(async (d, ruta, nombre) => {
      lista.push({
        numero: d.numero || '', cliente: d.cliente?.nombre || '', codigo: d.cliente?.codigo || '',
        referencia: d.referencia || '', fecha: d.fecha || '', total: d.resumen?.total ?? null,
        ruta, base: nombre.replace(ES_JSON, '')
      });
    });
    lista.sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
    return lista;
  }

  // El número interno (2026-001…) sigue saliendo en el PDF; se busca el mayor dentro de los .json
  async function siguienteNumero(anyo) {
    let max = 0;
    await recorrer(async d => {
      const m = String(d.numero || '').match(/^(\d{4})-(\d+)/);
      if (m && m[1] === String(anyo)) max = Math.max(max, parseInt(m[2], 10));
    });
    return `${anyo}-${String(max + 1).padStart(3, '0')}`;
  }

  // Nombre de los archivos: códigocliente_Referencia_fecha (ej: 1000_DGT_20261024)
  const parteNombre = t => limpiarNombre(t).replace(/_/g, ' ').trim();
  function nombreBase(pres) {
    const codigo = parteNombre(pres.cliente?.codigo) || SIN_CODIGO;
    const referencia = parteNombre(pres.referencia) || parteNombre(pres.cliente?.nombre) || 'Presupuesto';
    const fecha = String(pres.fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    return `${codigo}_${referencia}_${fecha}`;
  }
  const escRegex = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const extension = pl => (String(pl.nombre).match(/\.(\w+)$/)?.[1] || (pl.tipo === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
  const nombrePlano = (base, pl, i) => `${base}_plano${i + 1}.${extension(pl)}`;
  const mismaCarpeta = (a, b) => a && b && a.ruta.join('/') === b.ruta.join('/');
  const mismaUbicacion = (a, b) => mismaCarpeta(a, b) && a.base === b.base;
  const textoRuta = u => [PRESUPUESTOS, ...u.ruta, u.base].join('/');

  async function archivoSiExiste(dir, nombre) {
    try { return await dir.getFileHandle(nombre); } catch (e) { return null; }
  }

  // Nombre libre en la carpeta: el deseado, o _V2, _V3… si ya lo usa otro presupuesto.
  // Si este presupuesto ya está guardado con ese nombre (o una de sus versiones), lo conserva.
  async function nombreLibre(dir, ruta, deseado, antes) {
    if (antes && mismaCarpeta(antes, { ruta }) && new RegExp(`^${escRegex(deseado)}(_V\\d+)?$`).test(antes.base)) return antes.base;
    for (let v = 1; ; v++) {
      const base = v === 1 ? deseado : `${deseado}_V${v}`;
      if (!(await archivoSiExiste(dir, base + '.json')) && !(await archivoSiExiste(dir, base + '.pdf'))) return base;
    }
  }

  async function escribir(dir, nombre, contenido) {
    const fh = await dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(contenido);
    await w.close();
    return fh;
  }

  // Guarda el presupuesto. Si no tiene número, le asigna el siguiente libre.
  // `fechaAbierto` es la fecha del archivo cuando se abrió: si ha cambiado,
  // otro ordenador lo ha modificado y se devuelve { conflicto: true }.
  // Si cambian el código, la referencia o la fecha, el .json, el .pdf y los planos se mueven o renombran.
  // `planos` son los archivos de pres.planos (mismo orden); se guarda una copia junto al .json.
  // Con `nuevaVersion` se guarda con un nombre libre (…_V2, …_V3) sin tocar los archivos anteriores,
  // que se quedan como la versión ya enviada al cliente.
  async function guardar(pres, fechaAbierto, forzar = false, planos = [], nuevaVersion = false) {
    if (!pres.numero) pres.numero = await siguienteNumero(new Date().getFullYear());
    let antes = pres.ubicacion || null;
    let dirAntes = null;
    if (antes) { try { dirAntes = await dirDeRuta(antes.ruta); } catch (e) { /* ya no existe */ } }

    if (!forzar && fechaAbierto && dirAntes) {
      const fh = await archivoSiExiste(dirAntes, antes.base + '.json');
      const actual = fh && (await fh.getFile()).lastModified;
      if (actual && actual !== fechaAbierto) return { conflicto: true };
    }
    if (nuevaVersion) { antes = null; dirAntes = null; }

    const { dir, ruta } = await rutaCliente(pres, true);
    const ahora = { ruta, base: await nombreLibre(dir, ruta, nombreBase(pres), antes) };
    pres.ubicacion = ahora;

    // Planos: se escriben los nuevos o los que cambian de nombre; los que sobran se borran
    const usados = new Set();
    for (const [i, pl] of (pres.planos || []).entries()) {
      const nombre = nombrePlano(ahora.base, pl, i);
      if (!(mismaUbicacion(antes, ahora) && pl.archivo === nombre)) await escribir(dir, nombre, planos[i]);
      pl.archivo = nombre;
      usados.add(nombre);
    }
    if (dirAntes) {
      const sobra = new RegExp(`^${escRegex(antes.base)}_plano\\d+\\.\\w+$`, 'i');
      const borrar = [];
      for await (const [nombre, h] of dirAntes.entries()) {
        if (h.kind === 'file' && sobra.test(nombre) && !(mismaCarpeta(antes, ahora) && usados.has(nombre))) borrar.push(nombre);
      }
      for (const nombre of borrar) await dirAntes.removeEntry(nombre);
    }

    const fh = await escribir(dir, ahora.base + '.json', JSON.stringify(pres, null, 2));

    if (dirAntes && !mismaUbicacion(antes, ahora)) {
      const pdf = await archivoSiExiste(dirAntes, antes.base + '.pdf');
      if (pdf) {
        await escribir(dir, ahora.base + '.pdf', await pdf.getFile());
        await dirAntes.removeEntry(antes.base + '.pdf');
      }
      if (await archivoSiExiste(dirAntes, antes.base + '.json')) await dirAntes.removeEntry(antes.base + '.json');
      // La subcarpeta de 1000 (Nombre - Teléfono) se borra si se ha quedado vacía
      if (antes.ruta.length > 1 && !(await dirAntes.entries().next()).value) {
        try { await (await dirDeRuta(antes.ruta.slice(0, -1))).removeEntry(antes.ruta.at(-1)); } catch (e) { /* no pasa nada */ }
      }
    }
    return { fecha: (await fh.getFile()).lastModified, ruta: textoRuta(ahora) };
  }

  // ¿Ya hay un PDF con el nombre del presupuesto? Entonces el PDF nuevo será una versión nueva.
  async function tienePdf(pres) {
    if (!pres.ubicacion) return false;
    try { return !!(await archivoSiExiste(await dirDeRuta(pres.ubicacion.ruta), pres.ubicacion.base + '.pdf')); }
    catch (e) { return false; }
  }

  // Guarda el PDF del cliente junto al .json, con el mismo nombre
  async function guardarPdf(pres, blob) {
    const dir = await dirDeRuta(pres.ubicacion.ruta);
    await escribir(dir, pres.ubicacion.base + '.pdf', blob);
    return textoRuta(pres.ubicacion) + '.pdf';
  }

  // Archivo de un plano guardado junto al presupuesto, o null si no está
  async function leerPlano(pres, pl) {
    if (!pres.ubicacion || !pl.archivo) return null;
    try { return await (await (await dirDeRuta(pres.ubicacion.ruta)).getFileHandle(pl.archivo)).getFile(); }
    catch (e) { return null; }
  }

  async function abrir(item) {
    const dir = await dirDeRuta(item.ruta);
    const f = await (await dir.getFileHandle(item.base + '.json')).getFile();
    const pres = JSON.parse(await f.text());
    pres.ubicacion = { ruta: item.ruta, base: item.base };
    return { pres, fecha: f.lastModified };
  }

  return {
    soportado, recuperarCarpeta, pedirPermiso, elegirCarpeta, nombreCarpeta,
    leerCatalogo, leerComoDataUrl, listar, guardar, guardarPdf, tienePdf, leerPlano, abrir, nombreBase, nombrePlano,
    ARCHIVO_CATALOGO, PROGRAMA, PRESUPUESTOS, SIN_CODIGO
  };
})();
