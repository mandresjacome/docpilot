// Servicio de validación del contenido real de los archivos cargados.
// Responsabilidad: comprobar que lo que el cliente DICE haber enviado (MIME y extensión)
// coincide con lo que el archivo REALMENTE es, y que su estructura es coherente
// (no está vacío, truncado ni corrupto). Trabaja solo sobre el Buffer en memoria:
// no escribe en disco ni descodifica píxeles, solo verifica firmas y estructura.
//
// LÍMITE CONOCIDO: la validación es estructural. Detecta archivos falsificados, truncados
// o dañados, pero no garantiza que cada píxel o cada objeto interno sea decodificable;
// esa última comprobación la realiza Google Document AI durante el OCR.

const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { ErrorApp } = require('../utils/errores');

// Tamaño máximo permitido: 10 MB (límite vigente del sistema)
const TAMANO_MAXIMO = 10 * 1024 * 1024;

// Formatos admitidos: MIME → etiqueta legible y extensiones válidas
const TIPOS_PERMITIDOS = {
  'application/pdf': { etiqueta: 'PDF',  extensiones: ['.pdf'] },
  'image/png':       { etiqueta: 'PNG',  extensiones: ['.png'] },
  'image/jpeg':      { etiqueta: 'JPEG', extensiones: ['.jpg', '.jpeg'] },
  'image/tiff':      { etiqueta: 'TIFF', extensiones: ['.tif', '.tiff'] },
};

const EXTENSIONES_PERMITIDAS = Object.values(TIPOS_PERMITIDOS).flatMap((t) => t.extensiones);

const rechazar = (mensaje, codigo) => new ErrorApp(mensaje, { status: 400, codigo });

// ─────────────────────────────────────────────────────────────────────────────
// Detección por firma ("magic bytes")
// ─────────────────────────────────────────────────────────────────────────────

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * detectarTipoReal — identifica el formato por los primeros bytes del contenido.
 * @param {Buffer} buffer
 * @returns {string|null} MIME detectado o null si no es un formato admitido
 */
const detectarTipoReal = (buffer) => {
  // La especificación PDF permite basura antes de "%PDF-" dentro del primer KB
  if (buffer.subarray(0, 1024).includes('%PDF-')) return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(FIRMA_PNG)) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 4) {
    const cabecera = buffer.subarray(0, 4).toString('latin1');
    if (cabecera === 'II*\u0000' || cabecera === 'MM\u0000*') return 'image/tiff';
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Validación estructural por formato. Cada función devuelve un motivo (string)
// si el archivo está dañado, o null si la estructura es coherente.
// ─────────────────────────────────────────────────────────────────────────────

// Tabla CRC-32 (la que usa PNG) para detectar chunks alterados o corruptos
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = TABLA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const validarPNG = (buffer) => {
  let pos = 8; // después de la firma
  let idatVisto = false;
  let primerChunk = true;

  while (pos + 12 <= buffer.length) {
    const longitud = buffer.readUInt32BE(pos);
    const tipo = buffer.toString('latin1', pos + 4, pos + 8);
    const fin = pos + 12 + longitud; // longitud + tipo + datos + CRC

    if (fin > buffer.length) return 'el archivo PNG está truncado';

    if (primerChunk) {
      if (tipo !== 'IHDR' || longitud !== 13) return 'falta la cabecera IHDR del PNG';
      const ancho = buffer.readUInt32BE(pos + 8);
      const alto = buffer.readUInt32BE(pos + 12);
      if (ancho === 0 || alto === 0) return 'el PNG declara dimensiones inválidas';
      primerChunk = false;
    }

    // El CRC cubre tipo + datos; una diferencia indica corrupción o manipulación
    if (crc32(buffer.subarray(pos + 4, pos + 8 + longitud)) !== buffer.readUInt32BE(pos + 8 + longitud)) {
      return `el chunk ${tipo} del PNG está corrupto`;
    }

    if (tipo === 'IDAT') idatVisto = true;
    if (tipo === 'IEND') {
      if (!idatVisto) return 'el PNG no contiene datos de imagen';
      if (fin !== buffer.length) return 'el PNG contiene datos adicionales después del final de la imagen';
      return null;
    }
    pos = fin;
  }
  return 'el archivo PNG está incompleto (sin marcador de fin)';
};

const validarJPEG = (buffer) => {
  let pos = 2; // después de SOI (FF D8)
  let sofVisto = false;

  while (pos < buffer.length) {
    if (buffer[pos] !== 0xff) return 'la estructura del JPEG es inválida';
    while (buffer[pos] === 0xff) pos++; // bytes de relleno
    const marcador = buffer[pos];
    pos++;

    if (marcador === 0xd9) return 'el JPEG termina antes de contener imagen'; // EOI sin SOS
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) continue; // marcadores sin longitud

    if (pos + 2 > buffer.length) return 'el archivo JPEG está truncado';
    const longitud = buffer.readUInt16BE(pos);
    if (longitud < 2 || pos + longitud > buffer.length) return 'el archivo JPEG está truncado';

    // SOFn (excepto DHT=C4, JPG=C8, DAC=CC): contiene las dimensiones
    const esSOF = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
    if (esSOF) {
      if (longitud < 8) return 'la cabecera del JPEG es inválida';
      const alto = buffer.readUInt16BE(pos + 3);
      const ancho = buffer.readUInt16BE(pos + 5);
      if (alto === 0 || ancho === 0) return 'el JPEG declara dimensiones inválidas';
      sofVisto = true;
    }

    if (marcador === 0xda) {
      // SOS: a partir de aquí vienen datos comprimidos; basta con exigir cabecera y marcador de fin
      if (!sofVisto) return 'el JPEG no contiene cabecera de imagen';
      const posEOI = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
      return posEOI > pos ? null : 'el archivo JPEG está incompleto (sin marcador de fin)';
    }
    pos += longitud;
  }
  return 'el archivo JPEG está incompleto';
};

const validarTIFF = (buffer) => {
  const little = buffer[0] === 0x49;
  const leer16 = (o) => (little ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o));
  const leer32 = (o) => (little ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o));

  if (buffer.length < 8) return 'el archivo TIFF está incompleto';
  const offsetIFD = leer32(4);
  if (offsetIFD < 8 || offsetIFD + 2 > buffer.length) return 'el directorio del TIFF está fuera del archivo';

  const entradas = leer16(offsetIFD);
  if (entradas === 0 || offsetIFD + 2 + entradas * 12 > buffer.length) return 'el directorio del TIFF está truncado';

  // Recorrer las entradas buscando ancho, alto y la ubicación de los datos de imagen
  const tags = {};
  for (let i = 0; i < entradas; i++) {
    const o = offsetIFD + 2 + i * 12;
    const tag = leer16(o);
    const tipo = leer16(o + 2);
    const cantidad = leer32(o + 4);
    // Los valores SHORT/LONG individuales viven dentro de la propia entrada
    const valor = tipo === 3 ? leer16(o + 8) : leer32(o + 8);
    tags[tag] = { cantidad, valor };
  }

  if (!tags[256] || !tags[257] || tags[256].valor === 0 || tags[257].valor === 0) {
    return 'el TIFF no declara dimensiones válidas';
  }
  const datos = tags[273] || tags[324]; // StripOffsets o TileOffsets
  if (!datos) return 'el TIFF no contiene datos de imagen';

  // Con una sola franja es posible comprobar que sus datos caben en el archivo
  if (tags[273] && tags[273].cantidad === 1 && tags[279] && tags[279].cantidad === 1) {
    if (tags[273].valor + tags[279].valor > buffer.length) return 'el archivo TIFF está truncado';
  }
  return null;
};

const validarPDF = async (buffer) => {
  // Un PDF completo termina con %%EOF; si falta, casi siempre está truncado
  if (!buffer.subarray(Math.max(0, buffer.length - 2048)).includes('%%EOF')) {
    return 'el PDF está incompleto (sin marcador de fin de archivo)';
  }
  try {
    // pdf-lib falla con PDFs cifrados o cuya estructura no se puede interpretar
    const documento = await PDFDocument.load(buffer, { updateMetadata: false });
    if (documento.getPageCount() < 1) return 'el PDF no contiene páginas';
  } catch {
    return 'el PDF está protegido con contraseña o no se puede leer';
  }
  return null;
};

const VALIDADORES = {
  'application/pdf': validarPDF,
  'image/png': validarPNG,
  'image/jpeg': validarJPEG,
  'image/tiff': validarTIFF,
};

/**
 * validarContenidoArchivo — valida un archivo recibido por multer (memoryStorage).
 * Orden: vacío → tamaño → MIME declarado → extensión → firma real → coherencia → estructura.
 *
 * @param {{buffer: Buffer, mimetype: string, originalname: string}} archivo
 * @returns {Promise<{tipo: string}>} Tipo real verificado
 * @throws {ErrorApp} 400 con código estable si el archivo no es aceptable
 */
const validarContenidoArchivo = async (archivo) => {
  const { buffer, mimetype, originalname = '' } = archivo || {};

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw rechazar('El archivo está vacío.', 'ARCHIVO_VACIO');
  }
  if (buffer.length > TAMANO_MAXIMO) {
    throw rechazar('El archivo supera el tamaño máximo permitido de 10 MB.', 'ARCHIVO_DEMASIADO_GRANDE');
  }
  if (!TIPOS_PERMITIDOS[mimetype]) {
    throw rechazar(
      `Tipo de archivo no permitido: ${mimetype}. Solo se aceptan PDF, PNG, JPEG o TIFF.`,
      'TIPO_NO_PERMITIDO'
    );
  }

  const extension = path.extname(originalname).toLowerCase();
  if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
    throw rechazar(
      'La extensión del archivo no está permitida. Solo se aceptan .pdf, .png, .jpg, .jpeg, .tif o .tiff.',
      'EXTENSION_NO_PERMITIDA'
    );
  }

  const tipoReal = detectarTipoReal(buffer);
  if (!tipoReal) {
    throw rechazar(
      'El contenido del archivo no corresponde a un PDF, PNG, JPEG o TIFF válido.',
      'CONTENIDO_NO_RECONOCIDO'
    );
  }
  if (tipoReal !== mimetype) {
    throw rechazar(
      `El contenido real del archivo (${TIPOS_PERMITIDOS[tipoReal].etiqueta}) no coincide con el tipo declarado (${TIPOS_PERMITIDOS[mimetype].etiqueta}).`,
      'CONTENIDO_NO_COINCIDE'
    );
  }
  if (!TIPOS_PERMITIDOS[tipoReal].extensiones.includes(extension)) {
    throw rechazar(
      `La extensión ${extension} no corresponde a un archivo ${TIPOS_PERMITIDOS[tipoReal].etiqueta}.`,
      'EXTENSION_NO_COINCIDE'
    );
  }

  const motivoDanio = await VALIDADORES[tipoReal](buffer);
  if (motivoDanio) {
    throw rechazar(`El archivo está dañado o manipulado: ${motivoDanio}.`, 'ARCHIVO_DANADO');
  }

  return { tipo: tipoReal };
};

module.exports = {
  validarContenidoArchivo,
  detectarTipoReal,
  TIPOS_PERMITIDOS,
  TAMANO_MAXIMO,
};
