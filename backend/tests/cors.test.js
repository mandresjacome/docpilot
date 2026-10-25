// Pruebas de CORS en desarrollo local: preflight de DELETE (panel admin), orígenes y headers.

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./helpers/supabaseMock').cliente,
}));

const request = require('supertest');
const app = require('../app');
const { opcionesCors } = require('../config/cors');

const ORIGEN_VITE = 'http://localhost:5173';

// Construye una solicitud preflight como la enviaría el navegador
const preflight = (ruta, { origen = ORIGEN_VITE, metodo, headers }) =>
  request(app)
    .options(ruta)
    .set('Origin', origen)
    .set('Access-Control-Request-Method', metodo)
    .set('Access-Control-Request-Headers', headers);

describe('CORS — preflight', () => {
  test('DELETE del panel admin con x-admin-token queda permitido desde Vite (5173)', async () => {
    const res = await preflight('/api/admin/registros/abc', { metodo: 'DELETE', headers: 'x-admin-token' });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGEN_VITE);
    expect(res.headers['access-control-allow-methods'].split(',')).toContain('DELETE');
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('x-admin-token');
  });

  test('también se permite desde la vista previa de Vite (4173)', async () => {
    const res = await preflight('/api/admin/registros', {
      origen: 'http://localhost:4173',
      metodo: 'DELETE',
      headers: 'x-admin-token',
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4173');
  });

  test('POST JSON (confirmar / encuesta) con Content-Type queda permitido', async () => {
    const res = await preflight('/api/documentos/confirmar', { metodo: 'POST', headers: 'content-type' });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods'].split(',')).toContain('POST');
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('content-type');
  });

  test('GET del dashboard queda permitido', async () => {
    const res = await preflight('/api/admin/dashboard', { metodo: 'GET', headers: 'x-admin-token' });
    expect(res.headers['access-control-allow-methods'].split(',')).toContain('GET');
  });

  test('el preflight no exige token (el navegador no lo envía en OPTIONS)', async () => {
    const res = await preflight('/api/admin/dashboard', { metodo: 'DELETE', headers: 'x-admin-token' });
    expect(res.status).toBe(204);
  });
});

describe('CORS — restricciones (no es excesivamente permisivo)', () => {
  test('no anuncia métodos innecesarios como PUT o PATCH', async () => {
    const res = await preflight('/api/admin/registros', { metodo: 'DELETE', headers: 'x-admin-token' });
    const metodos = res.headers['access-control-allow-methods'].split(',');
    expect(metodos).not.toContain('PUT');
    expect(metodos).not.toContain('PATCH');
    expect(metodos.sort()).toEqual(['DELETE', 'GET', 'POST']);
  });

  test('un origen no autorizado no recibe Access-Control-Allow-Origin', async () => {
    const res = await preflight('/api/admin/registros', {
      origen: 'https://sitio-malicioso.example',
      metodo: 'DELETE',
      headers: 'x-admin-token',
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('no se usa "*" ni credenciales', () => {
    expect(opcionesCors.origin).not.toContain('*');
    expect(opcionesCors.credentials).toBeUndefined();
  });

  test('solo se permiten los headers que usa la aplicación', () => {
    expect(opcionesCors.allowedHeaders).toEqual(['Content-Type', 'x-admin-token']);
  });

  test('las respuestas reales a un origen permitido incluyen el header CORS', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Origin', ORIGEN_VITE);
    expect(res.status).toBe(401); // sin token, pero con CORS aplicado
    expect(res.headers['access-control-allow-origin']).toBe(ORIGEN_VITE);
  });
});

describe('CORS — producción', () => {
  test('en producción no se habilita CORS (mismo origen)', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let appProd;
    try {
      // app.js decide al cargarse si activa CORS, por eso se importa en un registro aislado
      jest.isolateModules(() => {
        appProd = require('../app');
      });
    } finally {
      process.env.NODE_ENV = original;
    }

    const res = await request(appProd)
      .options('/api/admin/registros')
      .set('Origin', ORIGEN_VITE)
      .set('Access-Control-Request-Method', 'DELETE');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
