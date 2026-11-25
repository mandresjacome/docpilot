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
const { crearPermisoAnalisis } = require('../utils/permisoAnalisis');
const supabaseMock = require('./helpers/supabaseMock');
const { crearPNG, crearPDF } = require('./helpers/archivos');

const ID = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34';
const OTRO_ID = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b35';
const ANALISIS = { tipo: 'Factura de venta', resumen: 'Cobro', _categoria: 'factura' };

const peticionAnalisis = () => request(app).post('/api/documentos/analizar').set('x-docpilot-analysis', '1');

// Envía un archivo válido por defecto
const subir = (buffer = crearPNG(), opciones = { filename: 'foto.png', contentType: 'image/png' }) =>
  peticionAnalisis().attach('documento', buffer, opciones);

let ahora = Date.now();
beforeEach(() => {
  ahora += 61_000;
  jest.spyOn(Date, 'now').mockImplementation(() => ahora);
  supabaseMock.reiniciar();
  ocr.extraerTexto.mockReset().mockResolvedValue('texto extraído');
  gemini.analizarTexto.mockReset().mockResolvedValue(ANALISIS);
});
afterEach(() => Date.now.mockRestore());

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
    const res = await peticionAnalisis();
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ARCHIVO_REQUERIDO');
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('rechaza un archivo enviado en un campo con otro nombre', async () => {
    const res = await peticionAnalisis()
      .attach('archivo', crearPNG(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('CAMPO_ARCHIVO_INVALIDO');
  });

  test('rechaza más de un archivo', async () => {
    const res = await peticionAnalisis()
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

  test('rechaza campos multipart adicionales sin llamar a OCR', async () => {
    const res = await subir().field('comentario', 'texto sintético');
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('CAMPO_ARCHIVO_INVALIDO');
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
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
      permisoAnalisis: expect.any(String),
      registro: { guardado: true },
    });
    expect(res.body.mensaje).toMatch(/analizado correctamente/);
    expect(gemini.analizarTexto).toHaveBeenCalledWith('texto extraído', expect.any(AbortSignal));
    expect(res.headers['cache-control']).toBe('no-store');

    const insertado = supabaseMock.llamo('insert')[0].args[0][0];
    expect(insertado).toMatchObject({ tipo_documento: 'factura', confirmado: false });
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

describe('POST /api/documentos/analizar — protección de recursos', () => {
  test('rechaza orígenes ajenos y solicitudes de navegador sin la cabecera esperada', async () => {
    const respuestas = await Promise.all([
      request(app).post('/api/documentos/analizar'),
      peticionAnalisis().set('Origin', 'https://ejemplo.invalid'),
      peticionAnalisis().set('Host', 'ejemplo.invalid'),
    ]);
    for (const res of respuestas) {
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('SOLICITUD_ANALISIS_NO_AUTORIZADA');
    }
    expect(ocr.extraerTexto).not.toHaveBeenCalled();
  });

  test('limita la frecuencia antes de Multer y permite reintentar en la siguiente ventana', async () => {
    supabaseMock.responder({ data: { id: ID } });
    for (let i = 0; i < 5; i++) expect((await subir()).status).toBe(200);
    const bloqueada = await peticionAnalisis();
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.codigo).toBe('LIMITE_PETICIONES');
    expect(bloqueada.headers['retry-after']).toBe('60');
    expect(ocr.extraerTexto).toHaveBeenCalledTimes(5);

    ahora += 60_000;
    expect((await subir()).status).toBe(200);
  });

  test('mantiene dos plazas y libera una tras terminar el trabajo', async () => {
    supabaseMock.responder({ data: { id: ID } });
    const terminar = [];
    let avisar;
    const dosEnCurso = new Promise((resolve) => { avisar = resolve; });
    const esperar = () => new Promise((resolve) => {
      terminar.push(resolve);
      if (terminar.length === 2) avisar();
    });
    ocr.extraerTexto.mockImplementationOnce(esperar).mockImplementationOnce(esperar);
    const enCurso = Promise.all([subir().then(), subir().then()]);
    try {
      await dosEnCurso;
      const bloqueada = await peticionAnalisis();
      expect(bloqueada.status).toBe(429);
      expect(bloqueada.body.codigo).toBe('ANALISIS_OCUPADO');
      expect(ocr.extraerTexto).toHaveBeenCalledTimes(2);
    } finally {
      terminar.forEach((resolve) => resolve('texto extraído'));
      await enCurso;
    }
    expect((await subir()).status).toBe(200);
  });

  test('desconectar el cliente cancela el análisis antes de Gemini', async () => {
    const servidor = await new Promise((resolve) => {
      const instancia = app.listen(0, '127.0.0.1', () => resolve(instancia));
    });
    const cliente = new AbortController();
    let avisarInicio;
    let avisarCancelacion;
    const iniciada = new Promise((resolve) => { avisarInicio = resolve; });
    const cancelada = new Promise((resolve) => { avisarCancelacion = resolve; });
    ocr.extraerTexto.mockImplementationOnce((_buffer, _mime, signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        resolve('texto sintético');
        avisarCancelacion();
      }, { once: true });
      avisarInicio();
    }));
    const formulario = new FormData();
    formulario.append('documento', new Blob([crearPNG()], { type: 'image/png' }), 'imagen.png');
    const solicitud = fetch(`http://127.0.0.1:${servidor.address().port}/api/documentos/analizar`, {
      method: 'POST',
      headers: { 'x-docpilot-analysis': '1' },
      body: formulario,
      signal: cliente.signal,
    }).catch((error) => error);

    try {
      await iniciada;
      cliente.abort();
      expect(await solicitud).toMatchObject({ name: 'AbortError' });
      await cancelada;
      expect(gemini.analizarTexto).not.toHaveBeenCalled();
      expect(supabaseMock.llamadas).toHaveLength(0);
    } finally {
      cliente.abort();
      servidor.closeAllConnections();
      await new Promise((resolve) => servidor.close(resolve));
    }
  });
});

describe('POST /api/documentos/confirmar (cierre Human-in-the-Loop)', () => {
  const confirmar = (cuerpo) => request(app).post('/api/documentos/confirmar').send(cuerpo);

  test('usa el permiso del análisis para confirmar y guardar una encuesta', async () => {
    supabaseMock.responder({ data: { id: ID } });
    const analisis = await subir();
    const cuerpo = { registroId: ID, permisoAnalisis: analisis.body.permisoAnalisis };
    supabaseMock.responder({ data: [{ id: ID }] });

    const res = await confirmar(cuerpo);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ registroActualizado: true });
    expect(supabaseMock.llamo('update')[0].args[0]).toEqual({ confirmado: true });

    const valoracion = await request(app).post('/api/documentos/encuesta').send({ ...cuerpo, estrellas: 5 });
    expect(valoracion.status).toBe(200);
  });

  test('sin registroId (guardado inicial fallido) confirma pero informa registroActualizado=false', async () => {
    const analisis = await subir();
    const res = await confirmar({ registroId: null, permisoAnalisis: analisis.body.permisoAnalisis });
    expect(res.status).toBe(200);
    expect(res.body.registroActualizado).toBe(false);
    expect(supabaseMock.llamo('update')).toHaveLength(0);
  });

  test('si falla el guardado de la confirmación responde 502 (no un éxito falso)', async () => {
    supabaseMock.responder({ error: { message: 'timeout' } });

    const res = await confirmar({ registroId: ID, permisoAnalisis: crearPermisoAnalisis(ID) });

    expect(res.status).toBe(502);
    expect(res.body.codigo).toBe('PERSISTENCIA_FALLIDA');
    expect(res.body.datosConfirmados).toBeUndefined();
  });

  test('responde 404 si el registro ya no existe', async () => {
    supabaseMock.responder({ data: [] });
    const res = await confirmar({ registroId: ID, permisoAnalisis: crearPermisoAnalisis(ID) });
    expect(res.status).toBe(404);
  });

  test('ni la confirmación ni la encuesta aceptan permisos ajenos, ausentes o vencidos', async () => {
    const vencido = crearPermisoAnalisis(OTRO_ID);
    ahora += 60 * 60_000;
    const ajeno = crearPermisoAnalisis(ID);
    const vigente = crearPermisoAnalisis(OTRO_ID);
    const alterado = vigente.slice(0, -1) + (vigente.endsWith('A') ? 'B' : 'A');

    for (const ruta of ['confirmar', 'encuesta']) {
      for (const permisoAnalisis of [undefined, ajeno, vencido, alterado]) {
        const res = await request(app).post(`/api/documentos/${ruta}`).send({
          registroId: OTRO_ID, permisoAnalisis, estrellas: 5,
        });
        expect(res.status).toBe(403);
        expect(res.body.codigo).toBe('PERMISO_ANALISIS_INVALIDO');
      }
    }
    expect(supabaseMock.llamadas).toHaveLength(0);
  });

  test('un JSON mal formado con saltos de línea no puede falsear el log de errores', async () => {
    console.error.mockClear();
    const res = await request(app)
      .post('/api/documentos/confirmar')
      .set('Content-Type', 'application/json')
      .send('{"datos": "a\n[Error 500] (X) falsa"');

    expect(res.status).toBe(400);
    expect(res.body.error).not.toContain('falsa');
    expect(console.error).not.toHaveBeenCalled();
  });

  test('responde 400 si el registroId no es un UUID', async () => {
    const res = await confirmar({ registroId: 'id inválido' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('REGISTRO_ID_INVALIDO');
    expect(supabaseMock.llamo('update')).toHaveLength(0);
  });
});

describe('POST /api/documentos/encuesta', () => {
  const encuesta = (cuerpo) => request(app).post('/api/documentos/encuesta').send(cuerpo);
  const valida = { registroId: ID, estrellas: 5, tiempo_ahorrado: '5_15min', comentario: 'Muy útil' };
  const enviarValida = () => encuesta({ ...valida, permisoAnalisis: crearPermisoAnalisis(ID) });

  test('guarda la valoración', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    const res = await enviarValida();
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/registrada correctamente/);
    expect(supabaseMock.llamo('update')[0].args[0]).toMatchObject({ estrellas: 5, comentario: 'Muy útil' });
  });

  test('responde 502 si la valoración no se pudo guardar', async () => {
    supabaseMock.responder({ error: { message: 'x' } });
    const res = await enviarValida();
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
    ['estrellas ausentes', { ...valida, estrellas: undefined }, 'ESTRELLAS_INVALIDAS'],
    ['tiempo inválido', { ...valida, tiempo_ahorrado: 'una hora' }, 'ENCUESTA_INVALIDA'],
    ['comentario no texto', { ...valida, comentario: { x: 1 } }, 'ENCUESTA_INVALIDA'],
    ['comentario demasiado largo', { ...valida, comentario: 'x'.repeat(201) }, 'ENCUESTA_INVALIDA'],
  ])('responde 400: %s', async (_caso, cuerpo, codigo) => {
    const res = await encuesta({ ...cuerpo, permisoAnalisis: crearPermisoAnalisis(ID) });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
    expect(supabaseMock.llamo('update')).toHaveLength(0);
  });

  test.each([
    [{ confirmado: false }, 'ANALISIS_NO_CONFIRMADO'],
    [{ confirmado: true, estrellas: 4 }, 'ENCUESTA_YA_REGISTRADA'],
    [{ confirmado: true, comentario: 'Valoración anterior' }, 'ENCUESTA_YA_REGISTRADA'],
    [{ confirmado: true }, 'ESTADO_REGISTRO_CAMBIO'],
  ])('rechaza una encuesta en estado incompatible (%j)', async (estado, codigo) => {
    supabaseMock.responderEnOrden({ data: [] }, { data: [estado] });
    const res = await enviarValida();
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe(codigo);
  });
});
