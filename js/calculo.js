// calculo.js
// Único sitio donde se calculan los importes. La pantalla, el PDF del cliente
// y el PDF completo usan este mismo resultado, así que siempre coinciden.

const Calculo = (() => {
  // Conceptos de una sección que se pueden marcar o desmarcar en el desglose
  const CONCEPTOS = [
    ['tablero', 'Tablero'],
    ['acabado', 'Acabado sup.'],
    ['canto', 'Canto material'],
    ['corte', 'Corte'],
    ['canteado', 'Canteado / pulido'],
    ['cnc', 'CNC']
  ];

  const num = Catalogo.numero;

  function porcentajeRecargo(importe, tramos) {
    if (importe <= 0) return 0;
    let pct = 0;
    for (const t of tramos) if (importe > t.desde) pct = t.porcentaje;
    return pct;
  }

  function calcularSeccion(sec, cat) {
    const p = cat.parametros;
    const res = {
      piezas: [], m2Piezas: 0, m2Neto: 0, tableros: 0, m2Bruto: 0,
      mlCorte: 0, mlCanteado: 0, rollos: 0,
      costes: { tablero: 0, acabado: 0, canto: 0, corte: 0, canteado: 0, cnc: 0 },
      subtotal: 0, aviso: null
    };
    const fam = Catalogo.familia(cat, sec.familia);
    const tab = fam && Catalogo.tablero(cat, sec.familia, sec.acabado, sec.grosor);
    if (!fam || !tab) {
      res.aviso = 'Este material no está en los precios del presupuesto';
      sec.piezas.forEach(() => res.piezas.push({ m2: 0, mlCorte: 0, coste: 0 }));
      return res;
    }

    const [anchoCm, altoCm] = String(sec.medida || '').split('x').map(Number);
    const m2Tablero = (anchoCm * altoCm) / 10000 || 0;
    const llevaCanto = fam.canto === 'CANTO';
    const precioCanto = llevaCanto
      ? (tab.grosor >= p.cantoGruesoDesdeMm ? tab.cantoGrueso : tab.cantoFino)
      : 0;
    let mlCanto = 0;

    sec.piezas.forEach(pz => {
      const L = num(pz.largo), A = num(pz.ancho);
      const n = Math.max(1, Math.round(num(pz.cantidad) || 1));
      const r = { m2: 0, mlCorte: 0, coste: 0 };
      if (L > 0 && A > 0) {
        const m2u = (L * A) / 1e6;
        let cantoU = 0;
        if (llevaCanto) {
          const c = pz.cantos || [];
          cantoU = ((c[0] ? L : 0) + (c[1] ? L : 0) + (c[2] ? A : 0) + (c[3] ? A : 0)) / 1000;
        }
        let acabadoU = 0;
        if (fam.acabadoSuperficial && pz.acabado && pz.acabado !== Catalogo.SIN_ACABADO) {
          const ac = Catalogo.acabadosDe(cat, sec.familia).find(a => a.nombre === pz.acabado);
          if (ac) acabadoU = m2u * ac.costeM2 * (pz.dosCaras ? 2 : 1);
        }
        r.m2 = m2u * n;
        r.mlCorte = (2 * (L + A) / 1000) * n;
        const costeCanto = cantoU * precioCanto * n;
        const costeAcabado = acabadoU * n;
        r.coste = r.m2 * tab.precioM2 + costeCanto + costeAcabado;

        res.m2Piezas += r.m2;
        res.mlCorte += r.mlCorte;
        mlCanto += cantoU * n;
        res.costes.canto += costeCanto;
        res.costes.acabado += costeAcabado;
      }
      res.piezas.push(r);
    });

    res.m2Neto = res.m2Piezas * (1 + p.mermaPct / 100);
    if (sec.modo === 'M2_MERMA') {
      res.costes.tablero = res.m2Neto * tab.precioM2;
      res.tableros = m2Tablero > 0 ? res.m2Neto / m2Tablero : 0;
    } else {
      res.tableros = m2Tablero > 0 ? Math.ceil(res.m2Neto / m2Tablero) : 0;
      res.costes.tablero = res.tableros * m2Tablero * tab.precioM2;
    }
    res.m2Bruto = res.tableros * m2Tablero;

    // Pulido: se cobra el canteado de todo el perímetro, sin material de canto
    res.mlCanteado = fam.canto === 'PULIDO' ? res.mlCorte : fam.canto === 'CANTO' ? mlCanto : 0;
    res.rollos = llevaCanto && p.rolloCantoMl > 0 ? Math.ceil(mlCanto / p.rolloCantoMl) : 0;
    res.costes.corte = res.mlCorte * p.corteMl;
    res.costes.canteado = res.mlCanteado * p.canteadoMl;
    res.costes.cnc = res.mlCorte * p.cncMl;

    const excluir = sec.excluir || {};
    res.subtotal = CONCEPTOS.reduce((s, [k]) => s + (excluir[k] ? 0 : res.costes[k]), 0);
    return res;
  }

  function calcular(pres, cat) {
    const p = cat.parametros;
    const secciones = pres.secciones.map(s => calcularSeccion(s, cat));
    const extras = pres.extras.map(e => num(e.precio) * num(e.cantidad));

    let base = 0, acabado = 0, materialDescontable = 0;
    secciones.forEach((r, i) => {
      const excl = pres.secciones[i].excluir || {};
      CONCEPTOS.forEach(([k]) => {
        if (excl[k]) return;
        if (k === 'acabado') acabado += r.costes[k];
        else base += r.costes[k];
        if (k === 'tablero' || k === 'canto') materialDescontable += r.costes[k];
      });
    });
    extras.forEach((coste, i) => { if (!pres.extras[i].excluir) base += coste; });

    const recargoBasePct = porcentajeRecargo(base, cat.recargo);
    const recargoBase = base * recargoBasePct / 100;
    const descuentoPct = pres.descuento?.activo ? num(pres.descuento.porcentaje) : 0;
    const descuento = materialDescontable * descuentoPct / 100;
    const subtotal = base + recargoBase - descuento;

    // El acabado superficial se presenta como opcional: lleva su propio recargo
    const recargoAcabadoPct = porcentajeRecargo(acabado, cat.recargo);
    const acabadoTotal = acabado + acabado * recargoAcabadoPct / 100;

    const total = subtotal + acabadoTotal;
    const iva = total * (p.ivaPct || 0) / 100;

    return {
      secciones, extras,
      base, recargoBasePct, recargoBase, descuentoPct, descuento, subtotal,
      acabado, recargoAcabadoPct, acabadoTotal,
      total, iva, totalConIva: total + iva
    };
  }

  return { CONCEPTOS, calcular, porcentajeRecargo };
})();
