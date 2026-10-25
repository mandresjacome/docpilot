// Defensa contra "bombas de descompresión" en PDF.
//
// Problema: el límite de 10 MB solo acota los bytes COMPRIMIDOS. Un PDF de menos de 1 MB puede
// contener un flujo deflate que se infla a cientos de MB (o GB) cuando pdf-lib lo decodifica al
// cargar el documento (los object streams y xref streams se inflan al parsear), agotando la memoria
// del servidor. Un límite de memoria en un worker no lo evita (los ArrayBuffer no cuentan en el heap).
//
// Solución: ANTES de que pdf-lib toque el archivo, se recorren todos los flujos `stream ... endstream`
// y se inflan en streaming (memoria constante) descartando la salida, solo para contar cuántos bytes
// producen. Si un flujo, o el total, supera el tope, se rechaza el archivo.
//
// Alcance: es una defensa en profundidad, no una garantía absoluta (un PDF diseñado para confundir
// a este recorrido podría evadirla). En una exposición pública combínala con límites de memoria del
// contenedor y limitación de peticiones.

const zlib = require('zlib');

// Un flujo legítimo muy grande (p. ej. un escaneo a 600 dpi casi en blanco) ronda los 100 MB inflado
const TOPE_POR_FLUJO = 100 * 1024 * 1024;
const TOPE_TOTAL = 200 * 1024 * 1024;
// Cota al número de flujos revisados: evita que un archivo con millones de palabras "stream" alargue el análisis
const MAX_FLUJOS = 20000;

const KW_STREAM = Buffer.from('stream');
const KW_ENDSTREAM = Buffer.from('endstream');

const esEspacioPDF = (b) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00;

/**
 * contarInflado — infla `datos` en streaming y devuelve cuántos bytes produce, sin conservarlos.
 * @returns {Promise<number|null>} bytes inflados; null si superó `tope` (se aborta de inmediato).
 *                                Si los datos no son zlib válido devuelve lo contado hasta el fallo:
 *                                decidir si el archivo es válido le corresponde a pdf-lib.
 */
const contarInflado = (datos, tope) => new Promise((resolve) => {
  const inflador = zlib.createInflate();
  let total = 0;
  let terminado = false;

  const terminar = (valor) => {
    if (terminado) return;
    terminado = true;
    inflador.destroy();
    resolve(valor);
  };

  inflador.on('data', (trozo) => {
    total += trozo.length;
    if (total > tope) terminar(null);
  });
  inflador.on('end', () => terminar(total));
  inflador.on('error', () => terminar(total));
  inflador.end(datos);
});

/**
 * longitudDirecta — lee el valor numérico directo de `/Length` del diccionario que precede a `stream`.
 * Igual que pdf-lib, ignora longitudes indirectas ("12 0 R"). Se mira como máximo 4 KB hacia atrás.
 */
const longitudDirecta = (buffer, posStream) => {
  // La búsqueda hacia atrás se limita a la ventana de 4 KB para que el costo no dependa del tamaño del archivo
  const ventana = buffer.subarray(Math.max(0, posStream - 4096), posStream);
  const dic = ventana.toString('latin1', Math.max(ventana.lastIndexOf('obj'), 0));
  const m = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dic);
  return m ? Number(m[1]) : null;
};

/**
 * verificarExpansionPDF — recorre los flujos del PDF y comprueba que no se expandan de forma desproporcionada.
 * @param {Buffer} buffer - Contenido completo del PDF
 * @returns {Promise<string|null>} motivo del rechazo, o null si no se detectó expansión excesiva
 */
const verificarExpansionPDF = async (buffer) => {
  const MOTIVO = 'contiene datos comprimidos que se expanden de forma desproporcionada';
  let pos = 0;
  let acumulado = 0;
  let revisados = 0;

  while (true) {
    const i = buffer.indexOf(KW_STREAM, pos);
    if (i === -1) break;
    pos = i + KW_STREAM.length;

    // "endstream" también contiene la palabra "stream": no es el inicio de un flujo
    if (i >= 3 && buffer.toString('latin1', i - 3, i) === 'end') continue;

    if (++revisados > MAX_FLUJOS) return 'tiene una cantidad de flujos de datos anormalmente alta';

    // Los datos empiezan tras el salto de línea que sigue a la palabra "stream"
    let inicio = i + KW_STREAM.length;
    if (buffer[inicio] === 0x0d) inicio++;
    if (buffer[inicio] === 0x0a) inicio++;

    // Final del flujo con el mismo criterio que pdf-lib: /Length directo si va seguido de
    // "endstream"; en caso contrario, la búsqueda de "endstream"
    let fin = -1;
    const longitud = longitudDirecta(buffer, i);
    if (longitud !== null && inicio + longitud <= buffer.length) {
      let p = inicio + longitud;
      while (p < buffer.length && esEspacioPDF(buffer[p])) p++;
      if (buffer.toString('latin1', p, p + KW_ENDSTREAM.length) === 'endstream') fin = inicio + longitud;
    }
    if (fin === -1) fin = buffer.indexOf(KW_ENDSTREAM, inicio);
    if (fin === -1) break; // no quedan flujos cerrados

    pos = Math.max(pos, fin);
    const datos = buffer.subarray(inicio, fin);
    if (datos.length < 2) continue;

    // Solo los flujos con cabecera zlib válida (Flate) pueden expandirse; el resto se omite sin costo
    if ((datos[0] & 0x0f) !== 8 || ((datos[0] << 8) | datos[1]) % 31 !== 0) continue;

    const restante = Math.min(TOPE_POR_FLUJO, TOPE_TOTAL - acumulado);
    const inflado = await contarInflado(datos, restante);
    if (inflado === null) return MOTIVO;
    acumulado += inflado;
  }
  return null;
};

module.exports = { verificarExpansionPDF, TOPE_POR_FLUJO, TOPE_TOTAL, MAX_FLUJOS };
