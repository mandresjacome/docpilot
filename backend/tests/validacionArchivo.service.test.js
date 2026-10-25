const {
  validarContenidoArchivo,
  detectarTipoReal,
  TAMANO_MAXIMO,
  MAX_PAGINAS_PDF,
} = require('../services/validacionArchivo.service');
const zlib = require('zlib');
const { crearPNG, crearJPEG, crearTIFF, crearPDF, crc32 } = require('./helpers/archivos');

// Atajo: valida y devuelve el código del error (o 'OK' si el archivo fue aceptado)
const resultado = async (archivo) => {
  try {
    await validarContenidoArchivo(archivo);
    return 'OK';
  } catch (error) {
    return error.codigo;
  }
};

describe('validarContenidoArchivo — límites de PDF', () => {
  const pdf = (b) => ({ buffer: b, mimetype: 'application/pdf', originalname: 'a.pdf' });

  test(`acepta un PDF con exactamente ${MAX_PAGINAS_PDF} páginas`, async () => {
    expect(await resultado(pdf(await crearPDF(MAX_PAGINAS_PDF)))).toBe('OK');
  });

  test(`rechaza un PDF con más de ${MAX_PAGINAS_PDF} páginas (control de costo)`, async () => {
    const error = await validarContenidoArchivo(pdf(await crearPDF(MAX_PAGINAS_PDF + 1))).catch((e) => e);
    expect(error).toMatchObject({ status: 400, codigo: 'PDF_DEMASIADO_EXTENSO' });
    expect(error.message).toMatch(/101 páginas/);
  });

  test('rechaza una bomba de descompresión (PDF de < 1 MB que se infla a 120 MB)', async () => {
    const comprimido = zlib.deflateSync(Buffer.alloc(120 * 1024 * 1024), { level: 9 });
    const buffer = Buffer.concat([
      Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
      Buffer.from(`4 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Filter /FlateDecode /Length ${comprimido.length} >>\nstream\n`),
      comprimido,
      Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
    ]);
    expect(buffer.length).toBeLessThan(1024 * 1024);

    const error = await validarContenidoArchivo(pdf(buffer)).catch((e) => e);
    expect(error).toMatchObject({ status: 400, codigo: 'ARCHIVO_DANADO' });
    expect(error.message).toMatch(/desproporcionada/);
  }, 30000);
});

describe('validarContenidoArchivo — archivos válidos', () => {
  test('acepta un PDF real', async () => {
    const buffer = await crearPDF(2);
    await expect(
      validarContenidoArchivo({ buffer, mimetype: 'application/pdf', originalname: 'contrato.pdf' })
    ).resolves.toEqual({ tipo: 'application/pdf' });
  });

  test.each([
    ['PNG', 'image/png', 'foto.png', crearPNG],
    ['JPEG (.jpg)', 'image/jpeg', 'foto.jpg', crearJPEG],
    ['JPEG (.jpeg)', 'image/jpeg', 'foto.JPEG', crearJPEG],
    ['TIFF (.tif)', 'image/tiff', 'scan.tif', crearTIFF],
    ['TIFF (.tiff)', 'image/tiff', 'scan.tiff', crearTIFF],
  ])('acepta una imagen %s real', async (_nombre, mimetype, originalname, crear) => {
    await expect(validarContenidoArchivo({ buffer: crear(), mimetype, originalname })).resolves.toEqual({
      tipo: mimetype,
    });
  });
});

describe('validarContenidoArchivo — rechazos por metadatos', () => {
  test('rechaza un archivo vacío', async () => {
    expect(await resultado({ buffer: Buffer.alloc(0), mimetype: 'application/pdf', originalname: 'a.pdf' }))
      .toBe('ARCHIVO_VACIO');
  });

  test('rechaza un archivo sin buffer', async () => {
    expect(await resultado({ mimetype: 'application/pdf', originalname: 'a.pdf' })).toBe('ARCHIVO_VACIO');
  });

  test('rechaza archivos que superan los 10 MB', async () => {
    const buffer = Buffer.alloc(TAMANO_MAXIMO + 1);
    expect(await resultado({ buffer, mimetype: 'application/pdf', originalname: 'a.pdf' }))
      .toBe('ARCHIVO_DEMASIADO_GRANDE');
  });

  test('rechaza un MIME no permitido', async () => {
    expect(await resultado({ buffer: Buffer.from('hola'), mimetype: 'text/plain', originalname: 'a.pdf' }))
      .toBe('TIPO_NO_PERMITIDO');
  });

  test.each(['virus.exe', 'script.js', 'doc.pdf.exe', 'sin_extension', 'imagen.gif'])(
    'rechaza la extensión no permitida de "%s"',
    async (nombre) => {
      expect(await resultado({ buffer: crearPNG(), mimetype: 'image/png', originalname: nombre }))
        .toBe('EXTENSION_NO_PERMITIDA');
    }
  );
});

describe('validarContenidoArchivo — contenido manipulado', () => {
  test('rechaza texto o ejecutables disfrazados de PDF', async () => {
    const buffer = Buffer.from('MZ\x90\x00 esto es un ejecutable, no un PDF');
    expect(await resultado({ buffer, mimetype: 'application/pdf', originalname: 'factura.pdf' }))
      .toBe('CONTENIDO_NO_RECONOCIDO');
  });

  test('rechaza un PNG que declara ser PDF (MIME falsificado)', async () => {
    expect(await resultado({ buffer: crearPNG(), mimetype: 'application/pdf', originalname: 'a.pdf' }))
      .toBe('CONTENIDO_NO_COINCIDE');
  });

  test('rechaza un PDF que declara ser imagen JPEG', async () => {
    const buffer = await crearPDF(1);
    expect(await resultado({ buffer, mimetype: 'image/jpeg', originalname: 'a.jpg' }))
      .toBe('CONTENIDO_NO_COINCIDE');
  });

  test('rechaza una extensión que no corresponde al contenido real', async () => {
    expect(await resultado({ buffer: crearPNG(), mimetype: 'image/png', originalname: 'foto.jpg' }))
      .toBe('EXTENSION_NO_COINCIDE');
  });
});

describe('validarContenidoArchivo — archivos dañados', () => {
  const pdf = (b) => ({ buffer: b, mimetype: 'application/pdf', originalname: 'a.pdf' });
  const png = (b) => ({ buffer: b, mimetype: 'image/png', originalname: 'a.png' });
  const jpg = (b) => ({ buffer: b, mimetype: 'image/jpeg', originalname: 'a.jpg' });
  const tif = (b) => ({ buffer: b, mimetype: 'image/tiff', originalname: 'a.tif' });

  test('rechaza un PDF con firma correcta pero contenido basura', async () => {
    expect(await resultado(pdf(Buffer.from('%PDF-1.7\nesto no es un pdf real\n%%EOF')))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un PDF truncado (sin %%EOF)', async () => {
    const completo = await crearPDF(3);
    expect(await resultado(pdf(completo.subarray(0, Math.floor(completo.length / 2))))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un PNG truncado', async () => {
    const completo = crearPNG();
    expect(await resultado(png(completo.subarray(0, completo.length - 20)))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un PNG con un chunk alterado (CRC inválido)', async () => {
    const alterado = Buffer.from(crearPNG());
    alterado[20] ^= 0xff; // modifica un byte del IHDR
    expect(await resultado(png(alterado))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un PNG con datos añadidos tras IEND', async () => {
    const conExtra = Buffer.concat([crearPNG(), Buffer.from('<?php echo 1; ?>')]);
    expect(await resultado(png(conExtra))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un PNG con dimensiones cero', async () => {
    const buffer = Buffer.from(crearPNG());
    buffer.writeUInt32BE(0, 16); // ancho = 0
    // se recalcula el CRC del IHDR para que el fallo sea las dimensiones y no el CRC
    buffer.writeUInt32BE(crc32(buffer.subarray(12, 29)), 29);
    expect(await resultado(png(buffer))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un JPEG truncado', async () => {
    const completo = crearJPEG();
    expect(await resultado(jpg(completo.subarray(0, 20)))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un JPEG sin marcador de fin', async () => {
    const completo = crearJPEG();
    expect(await resultado(jpg(completo.subarray(0, completo.length - 2)))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un JPEG con dimensiones cero', async () => {
    const buffer = Buffer.from(crearJPEG());
    const posSOF = buffer.indexOf(Buffer.from([0xff, 0xc0]));
    buffer.writeUInt16BE(0, posSOF + 5); // alto = 0
    expect(await resultado(jpg(buffer))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un TIFF truncado', async () => {
    expect(await resultado(tif(crearTIFF().subarray(0, 30)))).toBe('ARCHIVO_DANADO');
  });

  test('rechaza un TIFF cuyos datos de imagen quedan fuera del archivo', async () => {
    const completo = crearTIFF();
    expect(await resultado(tif(completo.subarray(0, completo.length - 1)))).toBe('ARCHIVO_DANADO');
  });
});

describe('detectarTipoReal', () => {
  test('identifica cada formato por su firma', async () => {
    expect(detectarTipoReal(await crearPDF())).toBe('application/pdf');
    expect(detectarTipoReal(crearPNG())).toBe('image/png');
    expect(detectarTipoReal(crearJPEG())).toBe('image/jpeg');
    expect(detectarTipoReal(crearTIFF())).toBe('image/tiff');
  });

  test('devuelve null para contenido desconocido', () => {
    expect(detectarTipoReal(Buffer.from('GIF89a...'))).toBeNull();
    expect(detectarTipoReal(Buffer.from('hola'))).toBeNull();
  });
});
