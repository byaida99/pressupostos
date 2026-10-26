// dibujo.js (cocinas)
// Alzado esquemático de un módulo en SVG: puertas, frentes de cajón, hueco del electrodoméstico y estantes.
// De arriba abajo: puertas, hueco y cajones.

const Dibujo = (() => {
  function svg(mod, ancho, alto, estantes, caja = 64) {
    const W = Math.max(1, ancho), H = Math.max(1, alto);
    const k = caja / Math.max(W, H);
    const w = W * k, h = H * k, pad = 2;
    const partes = [];
    const rect = (x, y, rw, rh, clase) => partes.push(`<rect x="${(pad + x).toFixed(1)}" y="${(pad + y).toFixed(1)}" width="${Math.max(0, rw).toFixed(1)}" height="${Math.max(0, rh).toFixed(1)}" class="${clase}"/>`);
    const linea = (x1, y1, x2, y2, clase) => partes.push(`<line x1="${(pad + x1).toFixed(1)}" y1="${(pad + y1).toFixed(1)}" x2="${(pad + x2).toFixed(1)}" y2="${(pad + y2).toFixed(1)}" class="${clase}"/>`);

    rect(0, 0, w, h, mod.carcasa === 'abierto' ? 'd-casco d-abierto' : 'd-casco');
    const puertas = Calculo.puertasDe(mod, W, H);
    const apiladas = puertas.length > 1 && puertas[0].ancho >= W * 0.99;
    const altoP = apiladas ? puertas.reduce((s, p) => s + p.alto, 0) : (puertas[0]?.alto || 0);
    let y = 0;

    // Estantes (línea discontinua) en la zona de puertas o en todo el módulo abierto
    const zonaEst = mod.carcasa === 'abierto' ? h : altoP * k;
    for (let i = 1; i <= estantes; i++) linea(1, zonaEst * i / (estantes + 1), w - 1, zonaEst * i / (estantes + 1), 'd-estante');

    // Puertas
    if (puertas.length) {
      if (apiladas) {
        puertas.forEach(p => {
          rect(0.8, y + 0.8, w - 1.6, p.alto * k - 1.6, 'd-frente');
          linea(w - 4, y + 3, w - 4, y + Math.min(10, p.alto * k - 3), 'd-tirador');
          y += p.alto * k;
        });
      } else {
        let x = mod.anchoPuerta < 0 ? (W - puertas.reduce((s, p) => s + p.ancho, 0)) * k : 0;
        puertas.forEach((p, i) => {
          rect(x + 0.8, 0.8, p.ancho * k - 1.6, p.alto * k - 1.6, 'd-frente');
          const tx = i % 2 === 0 && puertas.length > 1 ? x + p.ancho * k - 3 : x + 3;
          linea(tx, 4, tx, Math.min(12, p.alto * k - 4), 'd-tirador');
          x += p.ancho * k;
        });
        y = altoP * k;
      }
    }

    // Hueco del electrodoméstico
    if (mod.hueco) {
      rect(1.5, y + 1.5, w - 3, mod.hueco * k - 3, 'd-hueco');
      y += mod.hueco * k;
    }

    // Cajones, desde abajo hacia arriba en el orden contrario al escrito (1P+2G: el pequeño arriba)
    let yc = h;
    Calculo.altosCajon(mod, H).reverse().forEach(alto => {
      const ch = alto * k;
      yc -= ch;
      rect(0.8, yc + 0.8, w - 1.6, ch - 1.6, 'd-frente');
      linea(w / 2 - Math.min(8, w / 5), yc + Math.min(4, ch / 3), w / 2 + Math.min(8, w / 5), yc + Math.min(4, ch / 3), 'd-tirador');
    });

    return `<svg class="dibujo" width="${(w + 2 * pad).toFixed(0)}" height="${(h + 2 * pad).toFixed(0)}" viewBox="0 0 ${(w + 2 * pad).toFixed(1)} ${(h + 2 * pad).toFixed(1)}" aria-hidden="true">${partes.join('')}</svg>`;
  }

  return { svg };
})();
