// Pruebas del registro de visitas: solo escribe en el log del servidor, nunca en Supabase.

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./helpers/supabaseMock').cliente,
}));

const request = require('supertest');
const app = require('../app');
const supabaseMock = require('./helpers/supabaseMock');

beforeEach(() => supabaseMock.reiniciar());

describe('POST /api/visitas/registrar', () => {
  test('registra la visita en el log y no toca la base de datos', async () => {
    const res = await request(app)
      .post('/api/visitas/registrar')
      .send({ correo: 'ana@example.com', marcaTiempo: '2026-05-01T10:00:00Z' });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/procesado correctamente/);
    expect(console.log.mock.calls.flat().join(' ')).toContain('ana@example.com');
    expect(supabaseMock.llamadas).toHaveLength(0);
  });

  test.each([
    ['sin correo', {}],
    ['correo que no es texto', { correo: 123 }],
  ])('responde 400 %s', async (_caso, cuerpo) => {
    const res = await request(app).post('/api/visitas/registrar').send(cuerpo);
    expect(res.status).toBe(400);
  });
});
