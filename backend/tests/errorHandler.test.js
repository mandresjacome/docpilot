// Pruebas del middleware global de errores: formato de respuesta, códigos y no filtración de detalles.

const express = require('express');
const request = require('supertest');
const errorHandler = require('../middlewares/errorHandler');
const { ErrorApp } = require('../utils/errores');

// App mínima cuyo único endpoint lanza el error que se le indique
const crearApp = (error) => {
  const app = express();
  app.get('/falla', (req, res, next) => next(error));
  app.use(errorHandler);
  return app;
};

const conEntorno = async (entorno, fn) => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = entorno;
  try {
    return await fn();
  } finally {
    process.env.NODE_ENV = original;
  }
};

describe('errorHandler', () => {
  test('usa el status y el código del ErrorApp', async () => {
    const res = await request(crearApp(new ErrorApp('Mensaje seguro', { status: 422, codigo: 'X_1' }))).get('/falla');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Mensaje seguro', codigo: 'X_1' });
  });

  test('un Error genérico responde 500', async () => {
    const res = await request(crearApp(new Error('fallo'))).get('/falla');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('fallo'); // fuera de producción se muestra el mensaje
  });

  test('respeta err.status y err.statusCode de librerías (p. ej. body-parser)', async () => {
    const a = Object.assign(new Error('JSON mal formado'), { status: 400 });
    const b = Object.assign(new Error('Demasiado grande'), { statusCode: 413 });
    expect((await request(crearApp(a)).get('/falla')).status).toBe(400);
    expect((await request(crearApp(b)).get('/falla')).status).toBe(413);
  });

  test('en producción oculta el detalle de errores 5xx no controlados', async () => {
    await conEntorno('production', async () => {
      const res = await request(crearApp(new Error('ECONNREFUSED 10.0.0.5:5432 proyecto-secreto'))).get('/falla');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Ocurrió un error interno en el servidor.');
    });
  });

  test('en producción mantiene el mensaje de errores controlados (ErrorApp) y de 4xx', async () => {
    await conEntorno('production', async () => {
      const controlado = new ErrorApp('La IA no está disponible.', { status: 502, codigo: 'IA_NO_DISPONIBLE' });
      const res1 = await request(crearApp(controlado)).get('/falla');
      expect(res1.body.error).toBe('La IA no está disponible.');

      const cliente = Object.assign(new Error('Petición inválida'), { status: 400 });
      const res2 = await request(crearApp(cliente)).get('/falla');
      expect(res2.body.error).toBe('Petición inválida');
    });
  });

  test('registra los 5xx también en producción, incluida la causa técnica', async () => {
    await conEntorno('production', async () => {
      console.error.mockClear();
      const error = new ErrorApp('No se pudo guardar.', {
        status: 502,
        codigo: 'PERSISTENCIA_FALLIDA',
        causa: new Error('duplicate key value'),
      });
      await request(crearApp(error)).get('/falla');
      const registrado = console.error.mock.calls.flat().join(' ');
      expect(registrado).toMatch(/502/);
      expect(registrado).toMatch(/duplicate key value/);
    });
  });
});
