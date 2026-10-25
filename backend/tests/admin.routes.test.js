// Pruebas de protección y comportamiento de las rutas administrativas (/api/admin).

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./helpers/supabaseMock').cliente,
}));

const request = require('supertest');
const app = require('../app');
const supabaseMock = require('./helpers/supabaseMock');

const TOKEN = process.env.ADMIN_TOKEN;
const ID = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34';

beforeEach(() => supabaseMock.reiniciar());

const REGISTROS = [
  { id: 'a', fecha_hora: '2026-05-03', tipo_documento: 'factura', confirmado: true, estrellas: 5, tiempo_ahorrado: '10-30 min', tiempo_ms: 2000, comentario: 'ok' },
  { id: 'b', fecha_hora: '2026-05-02', tipo_documento: 'factura', confirmado: false, estrellas: 3, tiempo_ahorrado: '10-30 min', tiempo_ms: 4000, comentario: null },
  { id: 'c', fecha_hora: '2026-05-01', tipo_documento: 'contrato', confirmado: true, estrellas: null, tiempo_ahorrado: null, tiempo_ms: null, comentario: null },
];

describe('autorización de /api/admin', () => {
  const rutas = [
    ['GET', '/api/admin/dashboard'],
    ['DELETE', `/api/admin/registros/${ID}`],
    ['DELETE', '/api/admin/registros'],
  ];

  test.each(rutas)('%s %s sin token → 401 y no toca la base de datos', async (metodo, ruta) => {
    const res = await request(app)[metodo.toLowerCase()](ruta);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Acceso no autorizado.' });
    expect(supabaseMock.llamadas).toHaveLength(0);
  });

  test.each(rutas)('%s %s con token incorrecto → 401', async (metodo, ruta) => {
    const res = await request(app)[metodo.toLowerCase()](ruta).set('x-admin-token', 'token-incorrecto');
    expect(res.status).toBe(401);
    expect(supabaseMock.llamadas).toHaveLength(0);
  });

  test('un token que solo comparte el prefijo se rechaza', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', TOKEN.slice(0, -1));
    expect(res.status).toBe(401);
  });

  test('un token vacío se rechaza', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', '');
    expect(res.status).toBe(401);
  });

  test('el token en la query string NO autentica', async () => {
    const res = await request(app).get(`/api/admin/dashboard?x-admin-token=${TOKEN}`);
    expect(res.status).toBe(401);
  });

  test('si ADMIN_TOKEN no está configurado el panel queda inaccesible (503), aun con header', async () => {
    delete process.env.ADMIN_TOKEN;
    try {
      const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', 'cualquiera');
      expect(res.status).toBe(503);
      expect(supabaseMock.llamadas).toHaveLength(0);
    } finally {
      process.env.ADMIN_TOKEN = TOKEN;
    }
  });

  test('la respuesta 401 no revela el token esperado', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', 'mal');
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });
});

describe('GET /api/admin/dashboard', () => {
  test('con token válido calcula las métricas agregadas', async () => {
    supabaseMock.responder({ data: REGISTROS });

    const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.metricas).toEqual({
      totalProcesados: 3,
      totalConfirmados: 2,
      porTipo: { factura: 2, contrato: 1 },
      promedioEstrellas: '4.0',
      tiempoAhorradoDist: { '10-30 min': 2 },
      promedioTiempoMs: 3000,
      totalEncuestados: 2,
    });
    expect(res.body.actividadReciente).toHaveLength(3);
  });

  test('sin registros devuelve métricas en cero (no un error)', async () => {
    supabaseMock.responder({ data: [] });
    const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.metricas).toMatchObject({ totalProcesados: 0, promedioEstrellas: null, promedioTiempoMs: null });
  });

  test('si Supabase falla responde 502 en lugar de mostrar un panel vacío', async () => {
    supabaseMock.responder({ error: { message: 'down' } });
    const res = await request(app).get('/api/admin/dashboard').set('x-admin-token', TOKEN);
    expect(res.status).toBe(502);
    expect(res.body.codigo).toBe('PERSISTENCIA_FALLIDA');
    expect(res.body.metricas).toBeUndefined();
  });
});

describe('DELETE /api/admin/registros', () => {
  test('elimina un registro por id', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    const res = await request(app).delete(`/api/admin/registros/${ID}`).set('x-admin-token', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/eliminado/);
    expect(supabaseMock.llamo('eq')[0].args).toEqual(['id', ID]);
  });

  test('rechaza ids que no son UUID sin consultar la base de datos', async () => {
    const res = await request(app).delete('/api/admin/registros/123').set('x-admin-token', TOKEN);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('REGISTRO_ID_INVALIDO');
    expect(supabaseMock.llamo('delete')).toHaveLength(0);
  });

  test('responde 404 si el registro no existe', async () => {
    supabaseMock.responder({ data: [] });
    const res = await request(app).delete(`/api/admin/registros/${ID}`).set('x-admin-token', TOKEN);
    expect(res.status).toBe(404);
  });

  test('responde 502 si el borrado falla (no declara éxito)', async () => {
    supabaseMock.responder({ error: { message: 'x' } });
    const res = await request(app).delete(`/api/admin/registros/${ID}`).set('x-admin-token', TOKEN);
    expect(res.status).toBe(502);
    expect(res.body.mensaje).toBeUndefined();
  });

  test('DELETE /registros limpia todos los registros', async () => {
    supabaseMock.responder({ data: null });
    const res = await request(app).delete('/api/admin/registros').set('x-admin-token', TOKEN);
    expect(res.status).toBe(200);
    expect(supabaseMock.llamo('not')[0].args).toEqual(['id', 'is', null]);
  });

  test('DELETE /registros responde 502 si falla el borrado masivo', async () => {
    supabaseMock.lanzar(new Error('red'));
    const res = await request(app).delete('/api/admin/registros').set('x-admin-token', TOKEN);
    expect(res.status).toBe(502);
  });
});
