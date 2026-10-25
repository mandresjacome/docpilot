// Pruebas del registro de aceptación del tratamiento de datos.
// Solo escribe una línea en el log del servidor: sin datos personales y sin tocar Supabase.

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./helpers/supabaseMock').cliente,
}));

const request = require('supertest');
const app = require('../app');
const supabaseMock = require('./helpers/supabaseMock');

beforeEach(() => supabaseMock.reiniciar());

const lineasDeLog = () => console.log.mock.calls.flat().join('\n');

describe('POST /api/visitas/registrar', () => {
  test('registra la aceptación en el log y no toca la base de datos', async () => {
    const res = await request(app).post('/api/visitas/registrar').send({});

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/procesado correctamente/);
    expect(lineasDeLog()).toMatch(/\[VISITA\].*ACEPTADO/);
    expect(supabaseMock.llamadas).toHaveLength(0);
  });

  test('funciona aunque la petición no lleve cuerpo', async () => {
    const res = await request(app).post('/api/visitas/registrar');
    expect(res.status).toBe(200);
  });

  test('ignora cualquier dato personal enviado: no lo registra en el log ni lo devuelve', async () => {
    const res = await request(app)
      .post('/api/visitas/registrar')
      .send({ correo: 'ana@example.com', nombre: 'Ana Pérez' });

    expect(res.status).toBe(200);
    expect(lineasDeLog()).not.toContain('ana@example.com');
    expect(lineasDeLog()).not.toContain('Ana');
    expect(JSON.stringify(res.body)).not.toContain('ana@example.com');
  });

  test('usa la hora del servidor: una marca de tiempo con saltos de línea no puede falsear el log', async () => {
    await request(app)
      .post('/api/visitas/registrar')
      .send({ marcaTiempo: '2020-01-01\n[ERROR] línea falsa inyectada' });

    expect(lineasDeLog()).not.toContain('línea falsa inyectada');
    expect(lineasDeLog()).toMatch(/\[VISITA\] \d{4}-\d{2}-\d{2}T/);
  });
});
