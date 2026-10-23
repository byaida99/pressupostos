// mueble.js
// Generador rápido: a partir de las medidas de un mueble crea sus piezas.

const Mueble = (() => {
  const $ = id => document.getElementById(id);
  const ZONAS = ['int', 'tra', 'ext'];
  let obtenerCatalogo = null;

  const valor = id => parseFloat($(id).value) || 0;
  const entero = id => parseInt($(id).value, 10) || 0;

  function opciones(lista, seleccionado) {
    return lista.map(([v, t]) => `<option value="${String(v).replace(/"/g, '&quot;')}"${v === seleccionado ? ' selected' : ''}>${t}</option>`).join('');
  }

  function rellenarTableros(zona) {
    const cat = obtenerCatalogo();
    const fam = $(`gm-${zona}-fam`).value;
    const sel = $(`gm-${zona}-tab`);
    const anterior = sel.value;
    const tabs = Catalogo.tablerosDe(cat, fam);
    sel.innerHTML = opciones(tabs.map(t => [`${t.acabado}|${t.grosor}`, Catalogo.textoTablero(t)]), anterior);
    if (!tabs.some(t => `${t.acabado}|${t.grosor}` === anterior)) {
      // Trasera: 10 mm si existe; resto: 19 mm si existe
      const preferido = tabs.find(t => t.grosor === (zona === 'tra' ? 10 : 19)) || tabs[0];
      if (preferido) sel.value = `${preferido.acabado}|${preferido.grosor}`;
    }
  }

  function rellenarMateriales(cat) {
    ZONAS.forEach(z => {
      const sel = $(`gm-${z}-fam`);
      const anterior = sel.value;
      sel.innerHTML = opciones(cat.familias.map(f => [f.codigo, f.nombre]), anterior);
      rellenarTableros(z);
    });
  }

  function material(zona) {
    const [acabado, grosor] = $(`gm-${zona}-tab`).value.split('|');
    return { familia: $(`gm-${zona}-fam`).value, acabado, grosor: Number(grosor) };
  }

  function generar() {
    const ancho = valor('gm-ancho'), alto = valor('gm-alto'), fondo = valor('gm-fondo');
    if (!(ancho > 0 && alto > 0 && fondo > 0)) {
      alert('Introduce ancho, alto y fondo.');
      return;
    }
    const int = material('int'), tra = material('tra'), ext = material('ext');
    const piezas = [];
    const add = (nombre, largo, anchoPieza, mat, cantidad = 1) => {
      if (cantidad > 0) piezas.push({ ...mat, nombre, largo, ancho: anchoPieza, cantidad });
    };

    add('Lateral', alto, fondo, int, 2);
    add('Base', ancho, fondo, int);
    add('Tapa', ancho, fondo, int);
    add('Estante fijo', ancho, fondo, int, entero('gm-fijos'));
    add('Estante móvil', ancho, fondo, int, entero('gm-moviles'));
    add('División', alto, fondo, int, entero('gm-divisiones'));
    add('Trasera', ancho, alto, tra);
    const frontales = entero('gm-frontales');
    add('Frontal', alto, frontales ? ancho / frontales : 0, ext, frontales);
    add('Lateral visto', alto, fondo, ext, entero('gm-lat-vistos'));
    add('Regleta vertical', alto, 50, ext, entero('gm-reg-v'));
    add('Regleta horizontal', 50, ancho, ext, entero('gm-reg-h'));

    const destino = $('gm-destino').value;
    const nombre = $('gm-nombre').value.trim() || `Mueble ${ancho}×${alto}×${fondo}`;
    alAnadir(piezas, destino === 'nuevo' ? 'nuevo' : Number(destino), nombre);
    $('gm-nombre').value = '';
  }

  // Lista de muebles del presupuesto a los que se pueden añadir las piezas
  function rellenarDestinos(nombres) {
    const sel = $('gm-destino');
    const anterior = sel.value || 'nuevo';
    sel.innerHTML = '<option value="nuevo">Un mueble nuevo</option>' +
      nombres.map((n, i) => `<option value="${i}">${n.replace(/</g, '&lt;')}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === anterior) ? anterior : 'nuevo';
    $('gm-nombre').disabled = sel.value !== 'nuevo';
  }

  let alAnadir = () => {};

  function vistaPrevia() {
    const ancho = valor('gm-ancho'), alto = valor('gm-alto');
    const fijos = entero('gm-fijos'), moviles = entero('gm-moviles');
    const divisiones = entero('gm-divisiones'), frontales = entero('gm-frontales');
    const cont = $('gm-vista');
    if (ancho <= 0 || alto <= 0) { cont.innerHTML = '<em>Introduce medidas…</em>'; return; }
    const escala = Math.min(160 / ancho, 220 / alto);
    const W = ancho * escala, H = alto * escala;
    let svg = `<svg viewBox="-4 -4 ${W + 8} ${H + 8}" width="${W + 8}" height="${H + 8}"><rect width="${W}" height="${H}" fill="#fff" stroke="#333" stroke-width="2"/>`;
    for (let i = 1; i <= divisiones; i++) {
      const x = W / (divisiones + 1) * i;
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#870093" stroke-width="2"/>`;
    }
    const est = fijos + moviles;
    for (let i = 1; i <= est; i++) {
      const y = H / (est + 1) * i;
      svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${i <= fijos ? '#007a0a' : '#a8ab00'}" stroke-width="2" ${i > fijos ? 'stroke-dasharray="5 3"' : ''}/>`;
    }
    for (let i = 0; i < frontales; i++) {
      svg += `<rect x="${W / frontales * i}" y="0" width="${W / frontales}" height="${H}" fill="rgba(192,122,16,0.12)" stroke="#aaa"/>`;
    }
    cont.innerHTML = svg + '</svg><p class="leyenda"><span style="color:#007a0a">— fijo</span> <span style="color:#a8ab00">- - móvil</span> <span style="color:#870093">| división</span></p>';
  }

  function limpiar() {
    ['gm-ancho', 'gm-alto', 'gm-fondo'].forEach(id => { $(id).value = ''; });
    ['gm-fijos', 'gm-moviles', 'gm-divisiones', 'gm-frontales', 'gm-lat-vistos', 'gm-reg-v', 'gm-reg-h'].forEach(id => { $(id).value = 0; });
    vistaPrevia();
  }

  function iniciar(getCatalogo, callback) {
    obtenerCatalogo = getCatalogo;
    alAnadir = callback;
    ZONAS.forEach(z => $(`gm-${z}-fam`).addEventListener('change', () => rellenarTableros(z)));
    document.querySelectorAll('.generador-campos input').forEach(i => i.addEventListener('input', vistaPrevia));
    $('gm-anadir').addEventListener('click', generar);
    $('gm-destino').addEventListener('change', () => { $('gm-nombre').disabled = $('gm-destino').value !== 'nuevo'; });
    $('gm-limpiar').addEventListener('click', limpiar);
    vistaPrevia();
  }

  return { iniciar, rellenarMateriales, rellenarDestinos };
})();
