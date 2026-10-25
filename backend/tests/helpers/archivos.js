// Generadores de archivos de prueba en memoria (nunca se escriben en disco).
// Producen contenido estructuralmente válido para cada formato admitido, más utilidades
// para corromperlo, de modo que las pruebas no dependan de archivos binarios versionados.

const zlib = require('zlib');
const { PDFDocument } = require('pdf-lib');

// ── CRC-32 (mismo algoritmo que PNG) ─────────────────────────────────────────
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunkPNG = (tipo, datos) => {
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([longitud, cuerpo, crc]);
};

/** PNG válido de 1x1 píxel (RGB). */
const crearPNG = () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // ancho
  ihdr.writeUInt32BE(1, 4); // alto
  ihdr[8] = 8;              // profundidad de bits
  ihdr[9] = 2;              // tipo de color RGB
  const pixel = zlib.deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00])); // filtro 0 + 1 píxel rojo
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPNG('IHDR', ihdr),
    chunkPNG('IDAT', pixel),
    chunkPNG('IEND', Buffer.alloc(0)),
  ]);
};

/** JPEG mínimo con SOI, APP0, SOF0 (1x1), SOS, datos y EOI. */
const crearJPEG = () => Buffer.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x12, 0x34, 0x56,
  0xff, 0xd9,
]);

/** TIFF little-endian de 1x1 con una sola franja de datos. */
const crearTIFF = () => {
  const entradas = [
    [256, 3, 1, 1],  // ImageWidth
    [257, 3, 1, 1],  // ImageLength
    [273, 4, 1, 62], // StripOffsets → los datos empiezan en el byte 62
    [279, 4, 1, 1],  // StripByteCounts
  ];
  const cabecera = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const ifd = Buffer.alloc(2 + entradas.length * 12 + 4);
  ifd.writeUInt16LE(entradas.length, 0);
  entradas.forEach(([tag, tipo, cantidad, valor], i) => {
    const o = 2 + i * 12;
    ifd.writeUInt16LE(tag, o);
    ifd.writeUInt16LE(tipo, o + 2);
    ifd.writeUInt32LE(cantidad, o + 4);
    ifd.writeUInt32LE(valor, o + 8);
  });
  return Buffer.concat([cabecera, ifd, Buffer.from([0x7f])]);
};

/** PDF válido generado con pdf-lib con el número de páginas indicado. */
const crearPDF = async (paginas = 1) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
};

module.exports = { crearPNG, crearJPEG, crearTIFF, crearPDF, crc32 };
