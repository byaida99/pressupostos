# Presupuestos (v4)

App para hacer presupuestos de mobiliario a medida. Funciona abriendo `index.html` con **Chrome o Edge** desde la carpeta compartida del NAS. No necesita servidor ni instalación.

## Carpetas en el NAS

```
CARPETA COMPARTIDA/
  00_PROGRAMA/             ← esta app (index.html, catalogo.xlsx, LOGO.JPG…)
    Presupuestos.bat       ← abre la app en su propia ventana de Edge
    Piezas sin precios.bat ← abre index_piezas.html igual
  01_PENDENTS_ACCEPTACIO/
    1234/              ← un cliente con código (vale también «1234 - Nombre»)
      1234_Cocina_20261024.json
      1234_Cocina_20261024.pdf
      1234_Cocina_20261024_plano1.pdf    ← copia de los planos adjuntos
      1234_Cocina_20261024_V2.json       ← otro presupuesto con el mismo nombre
    1000/              ← clientes sin código
      Nombre - 600123456/
        1000_DGT_20261025.json
        1000_DGT_20261025.pdf
```

Los archivos se llaman **códigocliente_Referencia_fecha** (sin código: 1000; sin referencia: el nombre del cliente).

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La app. Se abre con doble clic. |
| `index_piezas.html` | La misma app **sin precios ni totales**, para introducir piezas, herrajes y planos. Guarda en la misma carpeta del NAS y con el mismo nombre más «_temp» (`1234_Cocina_20261024_temp.json`); el presupuesto se abre después en `index.html` con «Abrir» para completar precios y sacar el PDF: al guardarlo allí pierde el «_temp». `index_piezas.html` solo abre presupuestos «_temp». Sin NAS, el `.json` descargado se carga en `index.html` con **⋯ → Importar presupuesto (.json)**. |
| `catalogo.xlsx` | Precios: tableros, cantos, acabados, herrajes, extras, recargo y parámetros. **Se edita con Excel.** |
| `plantilla_presupuesto.xlsx` | Plantilla para preparar un presupuesto en Excel e importarlo. |
| `LOGO.JPG` | Logo que sale en los PDF de cliente e interno. La empresa y sus datos de contacto también aparecen en los PDF; se configuran en `catalogo.xlsx`, pestaña Parámetros. |
| `js/`, `lib/`, `styles.css` | Código de la app. No hace falta tocarlos. `lib/` lleva SheetJS, html2canvas, jsPDF y pdf-lib para funcionar sin internet. |

## Uso

1. La primera vez en cada ordenador, la app pide elegir la carpeta del NAS que contiene `00_PROGRAMA` y `01_PENDENTS_ACCEPTACIO`. Al pedir permiso, elegir «Permitir en cada visita» para que no vuelva a preguntar.
   - Para abrirla como una aplicación, usar `Presupuestos.bat` (o un acceso directo en el escritorio a ese archivo).
2. **Guardar** (o Ctrl+S) guarda el `.json` como `códigocliente_Referencia_fecha` en la carpeta del cliente según su **código**. Si la carpeta no existe, se crea. Sin código (o con 1000) va a `1000/Nombre - Teléfono`. El presupuesto lleva además un número interno (`2026-001`…) que sale en el PDF.
   - Si ya hay **otro** presupuesto con ese nombre, no se sobrescribe: se guarda como `…_V2`, `…_V3`… Volver a guardar el presupuesto abierto sí actualiza su propio archivo.
   - Si luego se cambia el código, la referencia o la fecha, el presupuesto, su PDF y sus planos se mueven o renombran solos.
3. **Abrir** muestra todos los presupuestos con un buscador (número, código, cliente o referencia). **Duplicar** crea uno nuevo a partir del abierto (al guardarlo, si coincide el nombre, queda como `_V2`).
4. **PDF cliente** genera el PDF y lo guarda junto al `.json`, con el mismo nombre. Si ese presupuesto ya tenía PDF, no se sobrescribe nada: se guarda una **versión nueva**, `…_V2.json` + `…_V2.pdf` (y sus planos), y se sigue trabajando sobre ella. La versión anterior queda tal como se envió al cliente. Las versiones conservan el mismo número interno. Si el presupuesto no estaba guardado (o tenía cambios), se guarda antes automáticamente. **PDF completo** (interno) abre el diálogo de impresión.
5. **Planos**: en «Cliente y proyecto», «Adjuntar plano» admite PDF o imágenes. Se añaden al final del PDF del cliente (los PDF tal cual; cada imagen en una página A4) y al guardar se copia cada plano junto al `.json` como `…_plano1.pdf`, `…_plano2.jpg`…
6. En la tabla de piezas, **Intro** baja a la fila siguiente o crea una nueva. El nombre de la pieza tiene un desplegable con los nombres habituales (pestaña «Piezas» del catálogo) y los ya usados; también se puede escribir uno nuevo. Al elegir un nombre habitual se marcan sus cantos (en MDF, los lados a pulir).
   - El **generador de muebles** pone los cantos solo: frontales y estantes móviles los 4 lados; laterales, sobre, base, estantes fijos y divisorias el delantero. Se cambian en la pestaña «Piezas».
7. Cada presupuesto se divide en **muebles** (apartados): cada uno con su nombre, sus materiales, piezas, **herrajes** y extras. El PDF del cliente muestra el precio de cada mueble y, debajo, los herrajes que lleva (por ejemplo «8 × Bisagra amortiguada · 2 × Cajón Blum»).
   - **Herrajes**: se elige el tipo (Bisagras, Cajones, Colgadores…) y después el modelo, con la cantidad.
   - **Extras**: el resto de accesorios y trabajos por unidad.
8. La casilla **Incluir** de cada mueble lo quita del presupuesto (no suma ni sale en el PDF) sin borrarlo.
9. El PDF del cliente muestra el resumen enmarcado a la derecha y, debajo, las condiciones de pago, con el IBAN y la referencia para el ingreso (`código cliente_referencia del proyecto`) en la misma fila. Los datos de la empresa aparecen discretamente en el pie de cada página. En «Cliente y proyecto», los conceptos se marcan en las listas «Valorado» o «No Valorado»; un concepto no puede estar marcado en ambas, y se pueden añadir conceptos nuevos. Las listas también aparecen en los PDF y se pueden rellenar en la pestaña «Datos» de la plantilla Excel.

## Plantilla Excel

`plantilla_presupuesto.xlsx` permite preparar un presupuesto en Excel: una fila por pieza, con la columna «Mueble» para separar apartados, y pestañas de herrajes y extras. Se importa con **⋯ → Importar plantilla Excel**. Desde **⋯ → Descargar plantilla Excel** se obtiene una plantilla nueva con los materiales del catálogo actual.

## Cambiar precios o añadir productos

Abrir `catalogo.xlsx`, cambiar o añadir filas, guardar y pulsar **⋯ → Recargar catálogo** en la app. La pestaña «Instrucciones» del Excel explica cada columna.

Los presupuestos guardados conservan los precios con los que se hicieron. Para pasarlos a precios nuevos: abrirlos y pulsar «Actualizar a precios actuales» (los extras que ahora estén en la pestaña «Herrajes» pasan también a herrajes).

Los herrajes van en la pestaña «Herrajes»: la columna **Categoría** (Bisagras, Cajones…) agrupa los modelos. Una categoría nueva se crea solo con escribirla en una fila.

## Cálculo

- El tablero se cobra por tableros enteros o por m² de pieza más la merma.
- El corte y el CNC se cobran por el perímetro de las piezas, y el canteado por los cantos marcados.
- En las familias «Pulido» (MDF) no se pone canto: los lados marcados se pulen y se cobran al mismo precio que el canteado, sin material de canto.
- En Rechapado, las caras barnizadas se lijan antes: se cobra el lijado de la pestaña Familias (10 €/m² por cara) por 1 o 2 caras, según el acabado. Va junto al acabado superficial.
- El acabado superficial (lacado, barnizado, y el lijado) se suma primero, y después el recargo por escala, que se aplica sobre materiales + acabado. Su porcentaje se decide con ese mismo importe. Se puede desactivar con la casilla «Aplicar recargo por escala» del resumen. El acabado se presenta como opcional.
- El descuento de carpintero se aplica sobre el tablero y el material de canto.
- El porcentaje de recargo se decide con el total del presupuesto y se aplica igual a cada mueble, así la suma de los precios de los muebles es el total.
