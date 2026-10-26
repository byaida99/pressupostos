// almacen.js (cocinas)
// Lectura y escritura en la carpeta del NAS (Chrome / Edge). Es la misma carpeta que la app de muebles:
//   00_PROGRAMA/cocinas/index.html, catalogo_cocinas.xlsx   (el logo, en 00_PROGRAMA/LOGO.JPG)
//   01_PENDENTS_ACCEPTACIO/1234/1234_Cocina_20261026.json  (+ .pdf con el mismo nombre)
//   01_PENDENTS_ACCEPTACIO/1000/Cliente - 600000000/1000_Cocina_20261026.json   (clientes sin código)
// Los presupuestos de cocina llevan «tipo: cocina» y su propio número (C2026-001…), así cada app
// solo lista los suyos. Si ya existe otro presupuesto con el mismo nombre, se guarda como …_V2, …_V3…

const Almacen = (() => {
  const ARCHIVO_CATALOGO = 'catalogo_cocinas.xlsx';
  const PROGRAMA = '00_PROGRAMA';
  const CARPETA_APP = 'cocinas';
  const PRESUPUESTOS = '01_PENDENTS_ACCEPTACIO';
  const SIN_CODIGO = '1000';
  const PREFIJO = 'C';
  const ES_JSON = /\.json$/i;
  const soportado = typeof window.showDirectoryPicker === 'function';
  let raiz = null;

  // --- Recordar la carpeta entre sesiones (IndexedDB, compartida con la app de muebles) ---
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
    const app = await (await carpetaPrograma()).getDirectoryHandle(CARPETA_APP);
    const f = await (await app.getFileHandle(ARCHIVO_CATALOGO)).getFile();
    return { buffer: await f.arrayBuffer(), fecha: f.lastModified };
  }

  // Devuelve un archivo de 00_PROGRAMA (el logo) como data URL, o '' si no existe
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

  // Nombre de carpeta o archivo sin acentos ni símbolos, para evitar problemas con el NAS
  function limpiarNombre(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w .,&()'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  async function carpetaPresupuestos(crear) {
    for await (const [nombre, h] of raiz.entries()) {
      if (h.kind === 'directory' && nombre.toUpperCase() === PRESUPUESTOS) return h;
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

  // Recorre 01_PENDENTS_ACCEPTACIO hasta 3 niveles y llama a fn(datos, ruta, nombre) por cada presupuesto de cocina
  async function recorrer(fn) {
    let base;
    try { base = await carpetaPresupuestos(false); } catch (e) { return; }
    const visitar = async (dir, ruta) => {
      for await (const [nombre, h] of dir.entries()) {
        if (h.kind === 'file' && ES_JSON.test(nombre)) {
          let d = null;
          try { d = JSON.parse(await (await h.getFile()).text()); } catch (e) { /* no es un presupuesto válido: se ignora */ }
          if (d && d.tipo === 'cocina' && Array.isArray(d.lineas)) await fn(d, ruta, nombre);
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

  // Número interno propio de las cocinas: C2026-001…
  async function siguienteNumero(anyo) {
    let max = 0;
    const patron = new RegExp(`^${PREFIJO}(\\d{4})-(\\d+)`);
    await recorrer(async d => {
      const m = String(d.numero || '').match(patron);
      if (m && m[1] === String(anyo)) max = Math.max(max, parseInt(m[2], 10));
    });
    return `${PREFIJO}${anyo}-${String(max + 1).padStart(3, '0')}`;
  }

  // Nombre de los archivos: códigocliente_Referencia_fecha (ej: 1000_Cocina Garcia_20261026)
  const parteNombre = t => limpiarNombre(t).replace(/_/g, ' ').trim();
  function nombreBase(pres) {
    const codigo = parteNombre(pres.cliente?.codigo) || SIN_CODIGO;
    const referencia = parteNombre(pres.referencia) || parteNombre(pres.cliente?.nombre) || 'Cocina';
    const fecha = String(pres.fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    return `${codigo}_${referencia}_${fecha}`;
  }
  const escRegex = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mismaCarpeta = (a, b) => a && b && a.ruta.join('/') === b.ruta.join('/');
  const mismaUbicacion = (a, b) => mismaCarpeta(a, b) && a.base === b.base;
  const textoRuta = u => [PRESUPUESTOS, ...u.ruta, u.base].join('/');

  async function archivoSiExiste(dir, nombre) {
    try { return await dir.getFileHandle(nombre); } catch (e) { return null; }
  }

  // Nombre libre en la carpeta: el deseado, o _V2, _V3… si ya lo usa otro presupuesto (de cocina o de muebles).
  // Si este presupuesto ya está guardado con ese nombre (o una de sus versiones), lo conserva.
  async function nombreLibre(dir, ruta, deseado, antes) {
    const m = antes && mismaCarpeta(antes, { ruta }) && antes.base.match(new RegExp(`^${escRegex(deseado)}(_V\\d+)?$`, 'i'));
    if (m) return antes.base;
    const ocupado = async b => {
      for (const n of [b + '.json', b + '.pdf', b + '_temp.json']) if (await archivoSiExiste(dir, n)) return true;
      return false;
    };
    for (let v = 1; ; v++) {
      const base = v === 1 ? deseado : `${deseado}_V${v}`;
      if (!(await ocupado(base))) return base;
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
  // Si cambian el código, la referencia o la fecha, el .json y el .pdf se mueven o renombran.
  // Con `nuevaVersion` se guarda con un nombre libre (…_V2) sin tocar los archivos anteriores.
  async function guardar(pres, fechaAbierto, forzar = false, nuevaVersion = false) {
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
    const fh = await escribir(dir, ahora.base + '.json', JSON.stringify(pres, null, 2));

    if (dirAntes && !mismaUbicacion(antes, ahora)) {
      const pdf = await archivoSiExiste(dirAntes, antes.base + '.pdf');
      if (pdf) {
        await escribir(dir, ahora.base + '.pdf', await pdf.getFile());
        await dirAntes.removeEntry(antes.base + '.pdf');
      }
      if (await archivoSiExiste(dirAntes, antes.base + '.json')) await dirAntes.removeEntry(antes.base + '.json');
      if (antes.ruta.length > 1 && !(await dirAntes.entries().next()).value) {
        try { await (await dirDeRuta(antes.ruta.slice(0, -1))).removeEntry(antes.ruta.at(-1)); } catch (e) { /* no pasa nada */ }
      }
    }
    return { fecha: (await fh.getFile()).lastModified, ruta: textoRuta(ahora) };
  }

  async function tienePdf(pres) {
    if (!pres.ubicacion) return false;
    try { return !!(await archivoSiExiste(await dirDeRuta(pres.ubicacion.ruta), pres.ubicacion.base + '.pdf')); }
    catch (e) { return false; }
  }

  async function guardarPdf(pres, blob) {
    const dir = await dirDeRuta(pres.ubicacion.ruta);
    await escribir(dir, pres.ubicacion.base + '.pdf', blob);
    return textoRuta(pres.ubicacion) + '.pdf';
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
    leerCatalogo, leerComoDataUrl, listar, guardar, guardarPdf, tienePdf, abrir, nombreBase,
    ARCHIVO_CATALOGO, PROGRAMA, CARPETA_APP, PRESUPUESTOS, SIN_CODIGO
  };
})();
