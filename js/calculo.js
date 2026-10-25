// calculo.js
// Único sitio donde se calculan los importes. La pantalla, el PDF del cliente
// y el PDF completo usan este mismo resultado, así que siempre coinciden.

const Calculo = (() => {
  // Conceptos de una sección que se pueden marcar o desmarcar en el desglose
  const CONCEPTOS = [
    ['tablero', 'Tablero'],
    ['acabado', 'Acabado sup.'],
    ['lijado', 'Lijado'],
    ['canto', 'Canto material'],
    ['corte', 'Corte'],
    ['canteado', 'Canteado / pulido'],
    ['cnc', 'CNC']
  ];

  // Conceptos que forman el acabado superficial (opcional)
  const DE_ACABADO = ['acabado', 'lijado'];

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
      costes: { tablero: 0, acabado: 0, lijado: 0, canto: 0, corte: 0, canteado: 0, cnc: 0 },
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
    // Canto: se cobra el material y el canteado de los lados marcados.
    // Pulido (MDF): los lados marcados se pulen; se cobra igual que el canteado, sin material.
    const llevaCanto = fam.canto === 'CANTO';
    const marcaLados = llevaCanto || fam.canto === 'PULIDO';
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
        if (marcaLados) {
          const c = pz.cantos || [];
          cantoU = ((c[0] ? L : 0) + (c[1] ? L : 0) + (c[2] ? A : 0) + (c[3] ? A : 0)) / 1000;
        }
        let acabadoU = 0, lijadoU = 0;
        if (fam.acabadoSuperficial && pz.acabado && pz.acabado !== Catalogo.SIN_ACABADO) {
          const caras = pz.dosCaras ? 2 : 1;
          const ac = Catalogo.acabadosDe(cat, sec.familia).find(a => a.nombre === pz.acabado);
          if (ac) acabadoU = m2u * ac.costeM2 * caras;
          // Rechapado: antes de barnizar se lijan las caras que llevan acabado
          lijadoU = m2u * (fam.lijadoM2 || 0) * caras;
        }
        r.m2 = m2u * n;
        r.mlCorte = (2 * (L + A) / 1000) * n;
        const costeCanto = cantoU * precioCanto * n;
        const costeAcabado = acabadoU * n, costeLijado = lijadoU * n;
        r.coste = r.m2 * tab.precioM2 + costeCanto + costeAcabado + costeLijado;

        res.m2Piezas += r.m2;
        res.mlCorte += r.mlCorte;
        mlCanto += cantoU * n;
        res.costes.canto += costeCanto;
        res.costes.acabado += costeAcabado;
        res.costes.lijado += costeLijado;
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

    res.mlCanteado = mlCanto;
    res.rollos = llevaCanto && p.rolloCantoMl > 0 ? Math.ceil(mlCanto / p.rolloCantoMl) : 0;
    res.costes.corte = res.mlCorte * p.corteMl;
    res.costes.canteado = res.mlCanteado * p.canteadoMl;
    res.costes.cnc = res.mlCorte * p.cncMl;

    const excluir = sec.excluir || {};
    res.subtotal = CONCEPTOS.reduce((s, [k]) => s + (excluir[k] ? 0 : res.costes[k]), 0);
    return res;
  }

  // Un presupuesto se divide en muebles (apartados), cada uno con sus
  // materiales y extras. El recargo por escala se decide con el total y se
  // reparte en proporción, así la suma de los muebles es el total.
  function calcular(pres, cat) {
    const p = cat.parametros;
    const muebles = pres.muebles.map(mu => {
      const secciones = mu.secciones.map(s => calcularSeccion(s, cat));
      const extras = mu.extras.map(e => num(e.precio) * num(e.cantidad));
      const herrajes = (mu.herrajes || []).map(h => num(h.precio) * num(h.cantidad));
      let base = 0, acabado = 0, material = 0;
      secciones.forEach((r, i) => {
        const excl = mu.secciones[i].excluir || {};
        CONCEPTOS.forEach(([k]) => {
          if (excl[k]) return;
          if (DE_ACABADO.includes(k)) acabado += r.costes[k];
          else base += r.costes[k];
          if (k === 'tablero' || k === 'canto') material += r.costes[k];
        });
      });
      extras.forEach((coste, i) => { if (!mu.extras[i].excluir) base += coste; });
      herrajes.forEach((coste, i) => { if (!mu.herrajes[i].excluir) base += coste; });
      return { secciones, extras, herrajes, base, acabado, material };
    });

    // Los muebles desactivados se calculan (para verlos en pantalla) pero no suman
    muebles.forEach((m, i) => { m.activo = pres.muebles[i].activo !== false; });
    const suma = k => muebles.reduce((t, m) => t + (m.activo ? m[k] : 0), 0);
    const base = suma('base'), acabado = suma('acabado');

    // El recargo por escala se decide con el total del proyecto, acabado incluido,
    // y se aplica igual a cada mueble para que la suma de los muebles sea el total
    const recargoPct = pres.recargoActivo === false ? 0 : porcentajeRecargo(base + acabado, cat.recargo);
    const descuentoPct = pres.descuento?.activo ? num(pres.descuento.porcentaje) : 0;

    muebles.forEach(m => {
      m.recargo = m.base * recargoPct / 100;
      m.descuento = m.material * descuentoPct / 100;
      m.precio = m.base + m.recargo - m.descuento;
      // El acabado superficial se presenta aparte, como opcional
      m.acabadoTotal = m.acabado * (1 + recargoPct / 100);
      m.total = m.precio + m.acabadoTotal;
    });

    const recargoBase = suma('recargo');
    const descuento = suma('descuento');
    const subtotal = suma('precio');
    const acabadoTotal = suma('acabadoTotal');
    // El recargo se aplica después de sumar el acabado: sobre materiales + acabado
    const recargo = (base + acabado) * recargoPct / 100;
    const total = subtotal + acabadoTotal;
    const iva = total * (p.ivaPct || 0) / 100;
    const pagoInicialPct = p.pagoInicialPct ?? 50;

    return {
      muebles,
      base, recargoPct, recargo, recargoBase, descuentoPct, descuento, subtotal,
      acabado, acabadoTotal,
      total, iva, totalConIva: total + iva,
      pagoInicialPct, pagoInicial: (total + iva) * pagoInicialPct / 100
    };
  }

  return { CONCEPTOS, DE_ACABADO, calcular, porcentajeRecargo };
})();
