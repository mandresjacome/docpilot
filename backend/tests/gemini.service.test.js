// Pruebas del servicio Gemini con el SDK simulado: no se consume la API real.

const mockGenerar = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ models: { generateContent: mockGenerar } })),
}));

const { analizarTexto } = require('../services/gemini.service');

const ANALISIS = {
  tipo: 'Factura de venta',
  resumen: 'Cobro por servicios',
  alertas: [],
  sugerenciaRespuesta: 'Acusar recibo',
};

// Encola la respuesta de clasificación (1ª llamada) y la del análisis (2ª llamada)
const encolar = (clasificacion, analisis) => {
  mockGenerar.mockResolvedValueOnce({ text: clasificacion });
  if (analisis !== undefined) mockGenerar.mockResolvedValueOnce({ text: analisis });
};

beforeEach(() => mockGenerar.mockReset());

describe('analizarTexto — flujo normal', () => {
  test('clasifica, aplica el prompt especializado y devuelve el JSON con su categoría', async () => {
    encolar('factura', JSON.stringify(ANALISIS));

    const resultado = await analizarTexto('FACTURA No. 123 total $500.000');

    expect(resultado).toEqual({ ...ANALISIS, _categoria: 'factura' });
    expect(mockGenerar).toHaveBeenCalledTimes(2);

    // 1ª llamada: clasificación sobre un fragmento del texto
    expect(mockGenerar.mock.calls[0][0].contents).toContain('FACTURA No. 123');
    // 2ª llamada: prompt de factura con el texto completo, fecha actual y temperatura 0
    const segunda = mockGenerar.mock.calls[1][0];
    expect(segunda.contents).toContain('FACTURA No. 123 total $500.000');
    expect(segunda.contents).toContain('La fecha actual del sistema es');
    expect(segunda.config).toEqual({ temperature: 0 });
  });

  test('normaliza la categoría (mayúsculas y espacios) devuelta por Gemini', async () => {
    encolar('  Documento Judicial \n', JSON.stringify(ANALISIS));
    const resultado = await analizarTexto('Auto del juzgado');
    expect(resultado._categoria).toBe('documento_judicial');
  });

  test('usa la categoría "otro" cuando Gemini devuelve una categoría desconocida', async () => {
    encolar('receta de cocina', JSON.stringify(ANALISIS));
    const resultado = await analizarTexto('Mezclar harina y agua');
    expect(resultado._categoria).toBe('otro');
  });

  test('usa "otro" si la clasificación llega vacía', async () => {
    encolar('', JSON.stringify(ANALISIS));
    const resultado = await analizarTexto('texto');
    expect(resultado._categoria).toBe('otro');
  });

  test('elimina los bloques de código markdown que a veces envuelve Gemini', async () => {
    encolar('carta', '```json\n' + JSON.stringify(ANALISIS) + '\n```');
    const resultado = await analizarTexto('Estimados señores...');
    expect(resultado.resumen).toBe('Cobro por servicios');
  });

  test.each(['contrato', 'factura', 'pqrs', 'documento_judicial', 'carta', 'cotizacion', 'otro'])(
    'existe un prompt especializado para la categoría %s',
    async (categoria) => {
      encolar(categoria, JSON.stringify(ANALISIS));
      const resultado = await analizarTexto('contenido');
      expect(resultado._categoria).toBe(categoria);
    }
  );
});

describe('analizarTexto — errores de la IA', () => {
  test('traduce un fallo de la API (cuota, red, clave) a 502 sin exponer el detalle', async () => {
    mockGenerar.mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED clave AIza...'));

    const error = await analizarTexto('texto').catch((e) => e);

    expect(error).toMatchObject({ status: 502, codigo: 'IA_NO_DISPONIBLE' });
    expect(error.message).not.toMatch(/RESOURCE_EXHAUSTED|AIza/);
    expect(error.causa.message).toMatch(/RESOURCE_EXHAUSTED/); // solo para logs
  });

  test('traduce un fallo en la fase de análisis (no solo en la clasificación)', async () => {
    mockGenerar.mockResolvedValueOnce({ text: 'contrato' });
    mockGenerar.mockRejectedValueOnce(new Error('503'));
    await expect(analizarTexto('texto')).rejects.toMatchObject({ status: 502, codigo: 'IA_NO_DISPONIBLE' });
  });

  test('devuelve 502 si el análisis llega vacío', async () => {
    encolar('factura', '   ');
    await expect(analizarTexto('texto')).rejects.toMatchObject({ status: 502, codigo: 'IA_RESPUESTA_VACIA' });
  });

  test('devuelve 502 si el análisis no es JSON válido', async () => {
    encolar('factura', 'Lo siento, no puedo ayudarte con eso.');
    const error = await analizarTexto('texto').catch((e) => e);
    expect(error).toMatchObject({ status: 502, codigo: 'IA_RESPUESTA_INVALIDA' });
    expect(error.message).not.toMatch(/JSON|Unexpected token/);
  });

  test.each(['[1,2,3]', 'null', '"texto"', '42'])(
    'devuelve 502 si el JSON no es un objeto (%s)',
    async (cuerpo) => {
      encolar('factura', cuerpo);
      await expect(analizarTexto('texto')).rejects.toMatchObject({ status: 502, codigo: 'IA_RESPUESTA_INVALIDA' });
    }
  );

  test('falla si GEMINI_API_KEY no está configurada y no llama a la API', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(analizarTexto('texto')).rejects.toThrow(/GEMINI_API_KEY/);
      expect(mockGenerar).not.toHaveBeenCalled();
    } finally {
      process.env.GEMINI_API_KEY = original;
    }
  });
});
