// Pruebas del servicio OCR (Google Document AI) con autenticación y HTTPS simulados.
// No se realiza ninguna llamada de red real ni se usan credenciales de GCP.

const { EventEmitter } = require('events');
const { PDFDocument } = require('pdf-lib');

const mockGetAccessToken = jest.fn();
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn(() => ({ getAccessToken: mockGetAccessToken })),
}));
jest.mock('https');

const https = require('https');
const { extraerTexto } = require('../services/ocr.service');
const { crearPNG, crearPDF } = require('./helpers/archivos');

// Simula una respuesta HTTP de Document AI; devuelve los cuerpos enviados para inspeccionarlos.
// `cuerpo` puede ser un objeto/string fijo o una función (indice) => objeto para variar por petición.
const simularDocumentAI = ({ estado = 200, cuerpo = { document: { text: 'texto' } }, errorRed } = {}) => {
  const enviados = [];
  https.request.mockImplementation((opciones, alResponder) => {
    const indice = enviados.length;
    const req = new EventEmitter();
    req.write = (contenido) => enviados.push({ opciones, contenido });
    req.end = () => {
      if (errorRed) return process.nextTick(() => req.emit('error', errorRed));
      const res = new EventEmitter();
      res.statusCode = estado;
      alResponder(res);
      const valor = typeof cuerpo === 'function' ? cuerpo(indice) : cuerpo;
      process.nextTick(() => {
        res.emit('data', typeof valor === 'string' ? valor : JSON.stringify(valor));
        res.emit('end');
      });
    };
    return req;
  });
  return enviados;
};

beforeEach(() => {
  mockGetAccessToken.mockResolvedValue('token-falso');
});

describe('extraerTexto — flujo normal', () => {
  test('envía una imagen directamente y devuelve el texto', async () => {
    const enviados = simularDocumentAI({ cuerpo: { document: { text: 'Factura 001' } } });

    const texto = await extraerTexto(crearPNG(), 'image/png');

    expect(texto).toBe('Factura 001');
    expect(enviados).toHaveLength(1);
    const { opciones, contenido } = enviados[0];
    expect(opciones.hostname).toBe('us-documentai.googleapis.com');
    expect(opciones.path).toBe('/v1/projects/proyecto-prueba/locations/us/processors/procesador-prueba:process');
    expect(opciones.method).toBe('POST');
    // El documento viaja en base64 dentro del cuerpo JSON, con su MIME
    const cuerpo = JSON.parse(contenido);
    expect(cuerpo.rawDocument.mimeType).toBe('image/png');
    expect(Buffer.from(cuerpo.rawDocument.content, 'base64').equals(crearPNG())).toBe(true);
  });

  test('un PDF dentro del límite se envía en una sola petición', async () => {
    const enviados = simularDocumentAI({ cuerpo: { document: { text: 'Contrato' } } });
    const texto = await extraerTexto(await crearPDF(3), 'application/pdf');
    expect(texto).toBe('Contrato');
    expect(enviados).toHaveLength(1);
  });

  test('un PDF de 30 páginas se divide en trozos de 14, 14 y 2 páginas y se concatena el texto', async () => {
    // Cada petición responde con un texto distinto para comprobar el orden de concatenación
    const enviados = simularDocumentAI({ cuerpo: (i) => ({ document: { text: `parte${i + 1}` } }) });

    const texto = await extraerTexto(await crearPDF(30), 'application/pdf');

    expect(texto).toBe('parte1\nparte2\nparte3');
    expect(enviados).toHaveLength(3);
    const paginas = [];
    for (const { contenido } of enviados) {
      const pdf = await PDFDocument.load(Buffer.from(JSON.parse(contenido).rawDocument.content, 'base64'));
      paginas.push(pdf.getPageCount());
    }
    expect(paginas).toEqual([14, 14, 2]);
  });
});

describe('extraerTexto — errores', () => {
  test('falla con 422 si el documento no contiene texto', async () => {
    simularDocumentAI({ cuerpo: { document: { text: '   ' } } });
    await expect(extraerTexto(crearPNG(), 'image/png')).rejects.toMatchObject({
      status: 422,
      codigo: 'OCR_SIN_TEXTO',
    });
  });

  test('falla con 422 si el PDF no se puede leer (y no llama a Document AI)', async () => {
    const enviados = simularDocumentAI();
    await expect(extraerTexto(Buffer.from('%PDF-1.4 basura'), 'application/pdf')).rejects.toMatchObject({
      status: 422,
      codigo: 'PDF_ILEGIBLE',
    });
    expect(enviados).toHaveLength(0);
  });

  test('traduce un error HTTP de Document AI a 502 sin exponer su detalle interno', async () => {
    simularDocumentAI({ estado: 403, cuerpo: { error: { message: 'Permission denied on projects/secreto' } } });
    const error = await extraerTexto(crearPNG(), 'image/png').catch((e) => e);
    expect(error).toMatchObject({ status: 502, codigo: 'OCR_FALLIDO' });
    expect(error.message).not.toMatch(/secreto|Permission/);
    expect(error.causa.message).toMatch(/Permission denied/); // el detalle queda solo para logs
  });

  test('traduce una respuesta no JSON a 502', async () => {
    simularDocumentAI({ cuerpo: '<html>Bad gateway</html>' });
    await expect(extraerTexto(crearPNG(), 'image/png')).rejects.toMatchObject({
      status: 502,
      codigo: 'OCR_RESPUESTA_INVALIDA',
    });
  });

  test('traduce un fallo de red a 502', async () => {
    simularDocumentAI({ errorRed: new Error('ECONNRESET') });
    await expect(extraerTexto(crearPNG(), 'image/png')).rejects.toMatchObject({
      status: 502,
      codigo: 'OCR_NO_DISPONIBLE',
    });
  });

  test('traduce un fallo de autenticación con GCP a 502', async () => {
    mockGetAccessToken.mockRejectedValue(new Error('invalid_grant'));
    simularDocumentAI();
    await expect(extraerTexto(crearPNG(), 'image/png')).rejects.toMatchObject({
      status: 502,
      codigo: 'OCR_AUTENTICACION_FALLIDA',
    });
  });

  test('falla si las variables de Document AI no están configuradas', async () => {
    const original = process.env.DOCUMENT_AI_PROCESSOR_ID;
    delete process.env.DOCUMENT_AI_PROCESSOR_ID;
    try {
      await expect(extraerTexto(crearPNG(), 'image/png')).rejects.toThrow(/Document AI/);
    } finally {
      process.env.DOCUMENT_AI_PROCESSOR_ID = original;
    }
  });
});
