// calculo.js (cocinas)
// Precio de cada módulo con el método del Excel de cocinas:
//   casco (laterales, base, sobre y trasera) + puertas + cajones + estantes + herrajes + montaje,
//   todo con los precios de la tarifa elegida (estándar o carpintero) y su recargo.

const Calculo = (() => {
  const r2 = n => Math.round(n * 100) / 100;

  // Corte, CNC y canteado de unos ml. `pctCnc` = parte del CNC que se cobra (frentes y estantes: 50 %)
  function proceso(P, mlCorte, mlCanto, pctCnc = 100) {
    const minCnc = mlCorte * P.cncMinMl * pctCnc / 100;
    return mlCorte * P.corteMl + minCnc * P.cncHora / 60 + mlCanto * P.canteadoMl + mlCanto * P.cantoMl;
  }

  // Una pieza rectangular con canto en los 4 lados (puerta, frente, estante, lateral visto…)
  function pieza(P, ancho, alto, precioM2, conCnc = true) {
    if (!(ancho > 0 && alto > 0)) return 0;
    const ml = 2 * (ancho + alto) / 1000;
    return ancho * alto / 1e6 * (1 + P.mermaPct / 100) * precioM2 + proceso(P, ml, ml, conCnc ? P.cncFrentesPct : 0);
  }

  const precioDe = (obj, tar) => obj ? (tar.carpintero ? obj.carpintero : obj.estandar) : 0;

  // Acabado exterior de una línea (el suyo o el general del presupuesto)
  function acabadoLinea(linea, pres, cat) {
    const ac = linea.acabado || pres.acabado;
    return { ...ac, fila: Catalogo.acabado(cat, ac) };
  }

  // Altos de los frentes de cajón: los del catálogo, reducidos a la vez si no caben en el módulo (sin el hueco)
  function altosCajon(mod, alto) {
    const suma = mod.cajones.reduce((s, c) => s + (c.altoFrente || 0), 0);
    const libre = Math.max(0, alto - (mod.hueco || 0));
    const k = suma > libre && suma > 0 ? libre / suma : 1;
    return mod.cajones.map(c => (c.altoFrente || 0) * k);
  }

  // Puertas: ocupan el alto del módulo menos los frentes de cajón y el hueco.
  // «auto»: 1 puerta hasta 600 mm de ancho, 2 a partir de ahí, una al lado de otra.
  // Un número: puertas una encima de otra (columnas).
  // Ancho de puerta fijo (rinconero en L): cada puerta lo lleva. Negativo (rinconero ciego):
  // las puertas cubren el ancho del módulo menos esa medida.
  function puertasDe(mod, ancho, alto) {
    const frentesCajon = altosCajon(mod, alto).reduce((s, h) => s + h, 0);
    const altoLibre = Math.max(0, alto - frentesCajon - (mod.hueco || 0));
    if (!altoLibre || !ancho || mod.puertas === 0) return [];
    const varias = (n, w, h) => Array.from({ length: n }, () => ({ ancho: w, alto: h }));
    if (mod.anchoPuerta > 0) return varias(mod.puertas === 'auto' ? 1 : mod.puertas, mod.anchoPuerta, altoLibre);
    const anchoTotal = mod.anchoPuerta < 0 ? Math.max(0, ancho + mod.anchoPuerta) : ancho;
    if (mod.puertas === 'auto' || mod.anchoPuerta < 0) {
      const n = mod.puertas === 'auto' ? (anchoTotal > 600 ? 2 : 1) : mod.puertas;
      return varias(n, anchoTotal / n, altoLibre);
    }
    return varias(mod.puertas, anchoTotal, altoLibre / mod.puertas);
  }

  // Casco: fórmulas del Excel (MODULS BASICS y MODULS_ESPECIFICS)
  function casco(P, cat, tar, mod, W, H, D, precioAcabado) {
    if (mod.carcasa === 'ninguna') return { material: 0, proceso: 0, herrajes: 0, montaje: 0, total: 0 };
    let m2Lados = (2 * W * D + 2 * H * D) / 1e6;
    let m2Trasera = W * H / 1e6;
    let mlCanto = ((W + 40) + (H + 40) + (D + 40)) * 4 / 1000;
    let mlCorte = (6 * W + 6 * H + 8 * D) / 1000;
    const trav = 2 * W * P.travesano / 1e6;
    switch (mod.carcasa) {
      case 'fregadero': // sin trasera, con 2 travesaños arriba
        m2Lados += trav; m2Trasera = 0; mlCanto += 4 * W / 1000;
        mlCorte = (8 * W + 4 * H + 8 * D + 4 * P.travesano) / 1000;
        break;
      case 'nevera':
        m2Lados += trav; m2Trasera = 0; mlCanto += 4 * W / 1000;
        break;
      case 'rinconero': m2Lados += W * H / 2e6; break;
      case 'campana': m2Lados += W * 400 / 1e6; break;
      case 'horno': mlCanto += 4 * W / 1000; break;
    }
    const merma = 1 + P.mermaPct / 100;
    const abierto = mod.carcasa === 'abierto'; // hornacina vista: con el acabado exterior
    const material = m2Lados * merma * (abierto ? precioAcabado : precioDe(cat.tableros.casco, tar)) +
      m2Trasera * merma * (abierto ? precioAcabado : precioDe(cat.tableros.trasera, tar));
    const proc = proceso(P, mlCorte, mlCanto);
    const herrajes = mod.tipo === 'Alto' ? P.herrajeAlto : P.herrajeBajo;
    const montaje = tar.montaje + (tar.montajeEspecial ? mod.montajeExtra : 0);
    return { material, proceso: proc, herrajes, montaje, total: material + proc + herrajes + montaje };
  }

  // Caja de cajón de 16 mm (fondo + trasera), su guía, montaje y refuerzo
  function cajonCaja(P, cat, tar, caj, W, marca) {
    const fondo = P.fondoCajon;
    const m2 = (W * fondo + W * caj.altoCaja) / 1e6;
    const material = m2 * (1 + P.mermaPct / 100) * precioDe(cat.tableros.cajon, tar);
    const proc = proceso(P, (4 * W + 2 * fondo + 2 * caj.altoCaja) / 1000, W / 1000);
    const g = Catalogo.guia(cat, caj.guias[marca]);
    return {
      caja: material + proc + P.montajeCajon + (W >= 1000 ? P.refuerzoCajon : 0),
      guia: g ? g.precio : 0, nombreGuia: g ? g.nombre : ''
    };
  }

  // Detalle de una línea de módulo. Devuelve los importes sin recargo y el precio por unidad con recargo.
  function modulo(linea, pres, cat) {
    const P = cat.parametros;
    const tar = Catalogo.tarifa(cat, pres.tarifa);
    const def = Catalogo.modulo(cat, linea.codigo);
    if (!def) return { error: `Módulo «${linea.codigo}» no está en el catálogo`, unidad: 0, total: 0 };
    const W = Catalogo.numero(linea.ancho), H = Catalogo.numero(linea.alto), D = Catalogo.numero(linea.fondo);
    const ac = acabadoLinea(linea, pres, cat);
    const precioAc = precioDe(ac.fila, tar);
    const mod = { ...def, cajones: def.cajones.map(c => Catalogo.cajon(cat, c)).filter(Boolean) };

    const c = casco(P, cat, tar, mod, W, H, D, precioAc);
    const puertas = puertasDe(mod, W, H);
    const puertasPieza = puertas.reduce((s, p) => s + pieza(P, p.ancho, p.alto, precioAc), 0);
    const bisagras = puertas.reduce((s, p) => s + P.bisagrasPuerta * (p.alto > 1500 ? 2 : 1), 0);
    let frentesCajon = 0, cajas = 0, guias = 0;
    const nombresGuia = [];
    const altos = altosCajon(mod, H);
    mod.cajones.forEach((caj, i) => {
      frentesCajon += pieza(P, W, altos[i], precioAc);
      const r = cajonCaja(P, cat, tar, caj, W, pres.guias);
      cajas += r.caja; guias += r.guia;
      if (r.nombreGuia) nombresGuia.push(r.nombreGuia);
    });
    const nEst = Math.max(0, Math.round(Catalogo.numero(linea.estantes)));
    const estantes = nEst * pieza(P, W, Math.max(100, D - 20), precioDe(cat.tableros.estante, tar));
    const extra = def.extra || 0;

    const conceptos = {
      casco: c.material + c.proceso,
      frentes: puertasPieza + frentesCajon,
      cajones: cajas,
      estantes,
      herrajes: c.herrajes + bisagras + guias,
      montaje: c.montaje,
      extra
    };
    const base = Object.values(conceptos).reduce((s, v) => s + v, 0);
    const recargo = base * tar.recargoPct / 100;
    const unidad = r2(base + recargo);
    const cantidad = Math.max(0, Catalogo.numero(linea.cantidad));
    return {
      conceptos, base, recargo, unidad, cantidad, total: r2(unidad * cantidad),
      puertas, cajones: mod.cajones, nEstantes: nEst, nombresGuia, acabado: ac,
      error: !ac.fila ? `Acabado «${ac.acabado} ${ac.tipo}» no está en el catálogo` : ''
    };
  }

  // Pieza suelta: con medidas → con el acabado exterior; con precio fijo → ese precio
  function piezaSuelta(linea, pres, cat) {
    const P = cat.parametros;
    const tar = Catalogo.tarifa(cat, pres.tarifa);
    const def = Catalogo.pieza(cat, linea.codigo);
    if (!def) return { error: `Pieza «${linea.codigo}» no está en el catálogo`, unidad: 0, total: 0 };
    const ac = acabadoLinea(linea, pres, cat);
    let base;
    if (def.precioFijo) base = def.precioFijo;
    else base = pieza(P, Catalogo.numero(linea.ancho), Catalogo.numero(linea.alto), precioDe(ac.fila, tar), def.cnc) + def.montaje;
    const recargo = base * tar.recargoPct / 100;
    const unidad = r2(base + recargo);
    const cantidad = Math.max(0, Catalogo.numero(linea.cantidad));
    return {
      base, recargo, unidad, cantidad, total: r2(unidad * cantidad), acabado: ac, fijo: !!def.precioFijo,
      error: !def.precioFijo && !ac.fila ? `Acabado «${ac.acabado} ${ac.tipo}» no está en el catálogo` : ''
    };
  }

  function linea(l, pres, cat) {
    return l.clase === 'pieza' ? piezaSuelta(l, pres, cat) : modulo(l, pres, cat);
  }

  function presupuesto(pres, cat) {
    const P = cat.parametros;
    const tar = Catalogo.tarifa(cat, pres.tarifa);
    const lineas = pres.lineas.map(l => linea(l, pres, cat));
    const porTipo = {};
    pres.lineas.forEach((l, i) => {
      const clave = l.clase === 'pieza' ? 'Piezas' : (Catalogo.modulo(cat, l.codigo)?.tipo || 'Otros');
      porTipo[clave] = (porTipo[clave] || 0) + lineas[i].total;
    });
    const extras = (pres.extras || []).map(e => r2(Catalogo.numero(e.precio) * Catalogo.numero(e.cantidad)));
    const totalExtras = extras.reduce((s, v) => s + v, 0);
    const recargo = lineas.reduce((s, r) => s + (r.recargo || 0) * (r.cantidad || 0), 0);
    const total = r2(lineas.reduce((s, r) => s + r.total, 0) + totalExtras);
    const iva = r2(total * P.ivaPct / 100);
    const totalConIva = r2(total + iva);
    const pagoInicialPct = P.pagoInicialPct;
    return {
      tarifa: tar, lineas, porTipo, extras, totalExtras, recargo, total, iva, totalConIva,
      pagoInicialPct, pagoInicial: r2(totalConIva * pagoInicialPct / 100),
      modulos: pres.lineas.filter(l => l.clase !== 'pieza').reduce((s, l) => s + Catalogo.numero(l.cantidad), 0)
    };
  }

  const CONCEPTOS = [
    ['casco', 'Casco'], ['frentes', 'Puertas y frentes'], ['cajones', 'Cajas de cajón'], ['estantes', 'Estantes'],
    ['herrajes', 'Herrajes y guías'], ['montaje', 'Montaje'], ['extra', 'Extra']
  ];

  return { presupuesto, linea, puertasDe, altosCajon, CONCEPTOS };
})();
