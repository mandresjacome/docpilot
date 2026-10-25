// Pruebas de integración de las rutas de documentos (carga → OCR → IA → Supabase → HITL).
// Se prueba la aplicación Express completa con supertest; OCR, Gemini y Supabase están simulados.

jest.mock('../services/ocr.service', () => ({ extraerTexto: jest.fn() }));
jest.mock('../services/gemini.service', () => ({ analizarTexto: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./helpers/supabaseMock').cliente,
}));

const request = require('supertest');
const zlib = require('zlib');
const app = require('../app');
const ocr = require('../services/ocr.service');
const gemini = require('../services/gemini.service');
const { ErrorApp } = require('../utils/errores');
const supabaseMock = require('./helpers/supabaseMock');
const { crearPNG, crearPDF } = require('./helpers/archivos');

const ID = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34';
const ANALISIS = { tipo: 'Factura de venta', resumen: 'Cobro', _categoria: 'factura' };

// Envía un archivo válido por defecto
const subir = (buffer = crearPNG(), opciones = { filename: 'foto.png', contentType: 'image/png' }) =>
  request(app).post('/api/documentos/analizar').attach('documento', buffer, opciones);

beforeEach(() => {
  supabaseMock.reiniciar();
  ocr.extraerTexto.mockReset().mockResolvedValue('texto extraído');
  gemini.analizarTexto.mockReset().mockResolvedValue(ANALISIS);
});

describe('POST /api/documentos/analizar — carga y validación de archivos', () => {
  test('acepta un archivo válido y entrega el buffer al OCR en memoria', async () => {
    supabaseMock.responder({ data: { id: ID } });
    const png = crearPNG();

    const res = await subir(png);

    expect(res.status).toBe(200);
    const [bufferRecibido, mime] = ocr.extraerTexto.mock.calls[0];
    expect(Buffer.isBuffer(bufferRecibido)).toBe(true);
    expect(bufferRecibido.equals(png)).toBe(true);
    expect(mime).toBe('image/png');
  });

  test('acepta un PDF válido', async () => {
    supabaseMock.responder({ data: { id: ID } });
    const res = await subir(await crearPDF(2), { filename: 'contrato.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
  });

  test('rechaza una petición sin archivo', async () => {
    const res = await request(app).post('/api/documentos/analizar');
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ARCHIVO_REQUERIDO');
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('rechaza un archivo enviado en un campo con otro nombre', async () => {
    const res = await request(app)
      .post('/api/documentos/analizar')
      .attach('archivo', crearPNG(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('CAMPO_ARCHIVO_INVALIDO');
  });

  test('rechaza más de un archivo', async () => {
    const res = await request(app)
      .post('/api/documentos/analizar')
      .attach('documento', crearPNG(), { filename: 'a.png', contentType: 'image/png' })
      .attach('documento', crearPNG(), { filename: 'b.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('rechaza un MIME no permitido', async () => {
    const res = await subir(Buffer.from('hola'), { filename: 'nota.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('TIPO_NO_PERMITIDO');
    expect(res.body.error).toMatch(/PDF, PNG, JPEG o TIFF/);
  });

  test('rechaza un archivo de más de 10 MB con mensaje en español', async () => {
    const enorme = Buffer.alloc(10 * 1024 * 1024 + 1024);
    const res = await subir(enorme, { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(res.body.error).toMatch(/10 MB/);
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('rechaza un archivo vacío', async () => {
    const res = await subir(Buffer.alloc(0), { filename: 'vacio.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ARCHIVO_VACIO');
  });

  test('rechaza contenido manipulado: ejecutable con MIME y extensión de PDF', async () => {
    const res = await subir(Buffer.from('MZ\x90\x00 binario'), { filename: 'factura.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('CONTENIDO_NO_RECONOCIDO');
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('rechaza un PNG declarado como PDF', async () => {
    const res = await subir(crearPNG(), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('CONTENIDO_NO_COINCIDE');
  });

  test('rechaza una imagen dañada (truncada)', async () => {
    const png = crearPNG();
    const res = await subir(png.subarray(0, png.length - 15));
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ARCHIVO_DANADO');
  });

  test('rechaza una bomba de descompresión sin llegar al OCR', async () => {
    const comprimido = zlib.deflateSync(Buffer.alloc(120 * 1024 * 1024), { level: 9 });
    const bomba = Buffer.concat([
      Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
      Buffer.from(`4 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Filter /FlateDecode /Length ${comprimido.length} >>\nstream\n`),
      comprimido,
      Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
    ]);
    const res = await subir(bomba, { filename: 'bomba.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ARCHIVO_DANADO');
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  }, 30000);

  test('rechaza un PDF con más de 100 páginas sin llegar al OCR', async () => {
    const res = await subir(await crearPDF(101), { filename: 'enorme.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('PDF_DEMASIADO_EXTENSO');
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('rechaza una extensión no permitida', async () => {
    const res = await subir(crearPNG(), { filename: 'foto.exe', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('EXTENSION_NO_PERMITIDA');
  });
});

describe('POST /api/documentos/analizar — procesamiento y registro', () => {
  test('respuesta completa: análisis + registroId + registro.guardado=true', async () => {
    supabaseMock.responder({ data: { id: ID } });

    const res = await subir();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      datos: ANALISIS,
      registroId: ID,
      registro: { guardado: true },
    });
    expect(res.body.mensaje).toMatch(/analizado correctamente/);
    expect(gemini.analizarTexto).toHaveBeenCalledWith('texto extraído');

    const insertado = supabaseMock.llamo('insert')[0].args[0][0];
    expect(insertado).toMatchObject({ tipo_documento: 'Factura de venta', confirmado: false });
    // tiempo_ms es null cuando el procesamiento simulado dura 0 ms (el servicio guarda `|| null`)
    expect(insertado.tiempo_ms === null || typeof insertado.tiempo_ms === 'number').toBe(true);
  });

  test('NUNCA envía el contenido del documento ni el texto extraído a Supabase', async () => {
    supabaseMock.responder({ data: { id: ID } });
    await subir();
    const insertado = JSON.stringify(supabaseMock.llamo('insert')[0].args);
    expect(insertado).not.toMatch(/texto extraído|resumen|Cobro/);
  });

  test('no guarda datos de contacto: ignora el header x-correo-usuario', async () => {
    supabaseMock.responder({ data: { id: ID } });
    await subir().set('x-correo-usuario', 'ana@example.com');
    const insertado = supabaseMock.llamo('insert')[0].args[0][0];
    expect(insertado).not.toHaveProperty('correo_usuario');
    expect(JSON.stringify(insertado)).not.toContain('ana@example.com');
  });

  test('si el guardado en Supabase falla: análisis entregado pero con guardado=false y advertencia explícita', async () => {
    supabaseMock.responder({ error: { message: 'connection refused' } });

    const res = await subir();

    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual(ANALISIS);
    expect(res.body.registroId).toBeNull();
    expect(res.body.registro.guardado).toBe(false);
    expect(res.body.registro.advertencia).toMatch(/No se pudo registrar/);
    // el mensaje no puede afirmar un éxito completo ni filtrar el error de la BD
    expect(res.body.mensaje).toMatch(/no se guardó/);
    expect(JSON.stringify(res.body)).not.toMatch(/connection refused/);
  });

  test('si Supabase lanza una excepción de red, ocurre lo mismo', async () => {
    supabaseMock.lanzar(new Error('fetch failed'));
    const res = await subir();
    expect(res.status).toBe(200);
    expect(res.body.registro.guardado).toBe(false);
    expect(res.body.registroId).toBeNull();
  });

  test('un fallo del OCR responde 502 y no registra nada en Supabase', async () => {
    ocr.extraerTexto.mockRejectedValue(
      new ErrorApp('El servicio de OCR no pudo procesar el documento. Intenta de nuevo.', { status: 502, codigo: 'OCR_FALLIDO' })
    );

    const res = await subir();

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'El servicio de OCR no pudo procesar el documento. Intenta de nuevo.',
      codigo: 'OCR_FALLIDO',
    });
    expect(gemini.analizarTexto).not.toHaveBeenCalled();
    expect(supabaseMock.llamo('insert')).toHaveLength(0);
  });

  test('un fallo de Gemini responde 502 y no registra nada en Supabase', async () => {
    gemini.analizarTexto.mockRejectedValue(
      new ErrorApp('La IA devolvió una respuesta que no pudo interpretarse. Intenta de nuevo.', {
        status: 502,
        codigo: 'IA_RESPUESTA_INVALIDA',
      })
    );

    const res = await subir();

    expect(res.status).toBe(502);
    expect(res.body.codigo).toBe('IA_RESPUESTA_INVALIDA');
    expect(supabaseMock.llamo('insert')).toHaveLength(0);
  });

  test('un error inesperado (sin estado) responde 500', async () => {
    ocr.extraerTexto.mockRejectedValue(new Error('algo raro'));
    const res = await subir();
    expect(res.status).toBe(500);
  });
});

describe('POST /api/documentos/confirmar (cierre Human-in-the-Loop)', () => {
  const confirmar = (cuerpo) => request(app).post('/api/documentos/confirmar').send(cuerpo);

  test('confirma y marca el registro como confirmado en Supabase', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });

    const res = await confirmar({ datos: ANALISIS, registroId: ID });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ datosConfirmados: ANALISIS, registroActualizado: true });
    expect(supabaseMock.llamo('update')[0].args[0]).toEqual({ confirmado: true });
  });

  test('sin registroId (guardado inicial fallido) confirma pero informa registroActualizado=false', async () => {
    const res = await confirmar({ datos: ANALISIS, registroId: null });
    expect(res.status).toBe(200);
    expect(res.body.registroActualizado).toBe(false);
    expect(supabaseMock.llamo('update')).toHaveLength(0);
  });

  test('si falla el guardado de la confirmación responde 502 (no un éxito falso)', async () => {
    supabaseMock.responder({ error: { message: 'timeout' } });

    const res = await confirmar({ datos: ANALISIS, registroId: ID });

    expect(res.status).toBe(502);
    expect(res.body.codigo).toBe('PERSISTENCIA_FALLIDA');
    expect(res.body.datosConfirmados).toBeUndefined();
  });

  test('responde 404 si el registro ya no existe', async () => {
    supabaseMock.responder({ data: [] });
    const res = await confirmar({ datos: ANALISIS, registroId: ID });
    expect(res.status).toBe(404);
  });

  test('no escribe en el log datos controlados por el cliente (evita falsear líneas)', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    const inyeccion = 'factura\n[Error 500] (PERSISTENCIA_FALLIDA) línea falsa';

    await confirmar({ datos: { tipo: inyeccion }, registroId: ID });

    const log = console.log.mock.calls.flat().join('\n');
    expect(log).toMatch(/\[HITL\]/);
    expect(log).not.toContain('línea falsa');
  });

  test('un JSON mal formado con saltos de línea no puede falsear el log de errores', async () => {
    console.error.mockClear();
    const res = await request(app)
      .post('/api/documentos/confirmar')
      .set('Content-Type', 'application/json')
      .send('{"datos": "a\n[Error 500] (X) falsa"');

    expect(res.status).toBe(400);
    // ninguna línea de log puede contener un salto de línea provocado por el cliente
    for (const argumentos of console.error.mock.calls) {
      for (const argumento of argumentos) expect(String(argumento)).not.toMatch(/[\r\n]/);
    }
  });

  test('responde 400 si no se envían datos o si el registroId no es un UUID', async () => {
    expect((await confirmar({ registroId: ID })).status).toBe(400);
    expect((await request(app).post('/api/documentos/confirmar')).status).toBe(400);

    const res = await confirmar({ datos: ANALISIS, registroId: "1'; drop table registros_uso;--" });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('REGISTRO_ID_INVALIDO');
    expect(supabaseMock.llamo('update')).toHaveLength(0);
  });
});

describe('POST /api/documentos/encuesta', () => {
  const encuesta = (cuerpo) => request(app).post('/api/documentos/encuesta').send(cuerpo);
  const valida = { registroId: ID, estrellas: 5, tiempo_ahorrado: '10-30 min', comentario: 'Muy útil' };

  test('guarda la valoración', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    const res = await encuesta(valida);
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/registrada correctamente/);
    expect(supabaseMock.llamo('update')[0].args[0]).toMatchObject({ estrellas: 5, comentario: 'Muy útil' });
  });

  test('responde 502 si la valoración no se pudo guardar', async () => {
    supabaseMock.responder({ error: { message: 'x' } });
    const res = await encuesta(valida);
    expect(res.status).toBe(502);
    expect(res.body.mensaje).toBeUndefined();
  });

  test.each([
    ['sin registroId', { ...valida, registroId: undefined }, 'REGISTRO_ID_REQUERIDO'],
    ['registroId inválido', { ...valida, registroId: 'abc' }, 'REGISTRO_ID_INVALIDO'],
    ['estrellas 0', { ...valida, estrellas: 0 }, 'ESTRELLAS_INVALIDAS'],
    ['estrellas 6', { ...valida, estrellas: 6 }, 'ESTRELLAS_INVALIDAS'],
    ['estrellas decimal', { ...valida, estrellas: 2.5 }, 'ESTRELLAS_INVALIDAS'],
    ['estrellas texto', { ...valida, estrellas: '5' }, 'ESTRELLAS_INVALIDAS'],
    ['comentario no texto', { ...valida, comentario: { x: 1 } }, 'ENCUESTA_INVALIDA'],
  ])('responde 400: %s', async (_caso, cuerpo, codigo) => {
    const res = await encuesta(cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
    expect(supabaseMock.llamo('update')).toHaveLength(0);
  });
});
