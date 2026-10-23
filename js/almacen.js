// almacen.js
// Lectura y escritura en la carpeta del NAS (Chrome / Edge).
// Estructura de la carpeta elegida:
//   catalogo.xlsx
//   Presupuestos/2026/2026-045 - Cliente/presupuesto.json

const Almacen = (() => {
  const ARCHIVO_CATALOGO = 'catalogo.xlsx';
  const CARPETA = 'Presupuestos';
  const ARCHIVO = 'presupuesto.json';
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

  async function leerCatalogo() {
    const fh = await raiz.getFileHandle(ARCHIVO_CATALOGO);
    const f = await fh.getFile();
    return { buffer: await f.arrayBuffer(), fecha: f.lastModified };
  }

  // --- Presupuestos ---
  async function carpetaAnyo(anyo, crear) {
    const base = await raiz.getDirectoryHandle(CARPETA, { create: crear });
    return base.getDirectoryHandle(String(anyo), { create: crear });
  }

  async function listar() {
    const lista = [];
    let base;
    try { base = await raiz.getDirectoryHandle(CARPETA); } catch (e) { return lista; }
    for await (const [anyo, dirAnyo] of base.entries()) {
      if (dirAnyo.kind !== 'directory') continue;
      for await (const [carpeta, dir] of dirAnyo.entries()) {
        if (dir.kind !== 'directory') continue;
        try {
          const f = await (await dir.getFileHandle(ARCHIVO)).getFile();
          const d = JSON.parse(await f.text());
          lista.push({
            numero: d.numero, cliente: d.cliente?.nombre || '', referencia: d.referencia || '',
            fecha: d.fecha || '', total: d.resumen?.total ?? null, anyo, carpeta
          });
        } catch (e) { /* carpeta sin presupuesto válido: se ignora */ }
      }
    }
    lista.sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
    return lista;
  }

  async function siguienteNumero(anyo) {
    const dir = await carpetaAnyo(anyo, true);
    let max = 0;
    for await (const [nombre] of dir.entries()) {
      const m = nombre.match(/^(\d{4})-(\d+)/);
      if (m && m[1] === String(anyo)) max = Math.max(max, parseInt(m[2], 10));
    }
    return `${anyo}-${String(max + 1).padStart(3, '0')}`;
  }

  // Nombre de carpeta sin acentos ni símbolos, para evitar problemas con el NAS
  function limpiarNombre(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w .,&()'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  async function buscarCarpeta(numero) {
    const dir = await carpetaAnyo(numero.slice(0, 4), true);
    for await (const [nombre, h] of dir.entries()) {
      if (h.kind === 'directory' && (nombre === numero || nombre.startsWith(numero + ' '))) return h;
    }
    return null;
  }

  // Guarda el presupuesto. Si no tiene número, le asigna el siguiente libre.
  // `fechaAbierto` es la fecha del archivo cuando se abrió: si ha cambiado,
  // otro ordenador lo ha modificado y se devuelve { conflicto: true }.
  async function guardar(pres, fechaAbierto, forzar = false) {
    let dir;
    if (!pres.numero) {
      const anyo = new Date().getFullYear();
      pres.numero = await siguienteNumero(anyo);
      const cliente = limpiarNombre(pres.cliente?.nombre);
      dir = await (await carpetaAnyo(anyo, true))
        .getDirectoryHandle(cliente ? `${pres.numero} - ${cliente}` : pres.numero, { create: true });
    } else {
      dir = await buscarCarpeta(pres.numero);
      if (!dir) {
        const cliente = limpiarNombre(pres.cliente?.nombre);
        dir = await (await carpetaAnyo(pres.numero.slice(0, 4), true))
          .getDirectoryHandle(cliente ? `${pres.numero} - ${cliente}` : pres.numero, { create: true });
      }
    }
    const fh = await dir.getFileHandle(ARCHIVO, { create: true });
    if (!forzar && fechaAbierto) {
      const actual = (await fh.getFile()).lastModified;
      if (actual && actual !== fechaAbierto) return { conflicto: true };
    }
    const w = await fh.createWritable();
    await w.write(JSON.stringify(pres, null, 2));
    await w.close();
    return { fecha: (await fh.getFile()).lastModified, carpeta: dir.name };
  }

  async function abrir(anyo, carpeta) {
    const dir = await (await carpetaAnyo(anyo, false)).getDirectoryHandle(carpeta);
    const f = await (await dir.getFileHandle(ARCHIVO)).getFile();
    return { pres: JSON.parse(await f.text()), fecha: f.lastModified };
  }

  return {
    soportado, recuperarCarpeta, pedirPermiso, elegirCarpeta, nombreCarpeta,
    leerCatalogo, listar, guardar, abrir, ARCHIVO_CATALOGO
  };
})();
