const { promisify } = require('node:util');
const { ErrorApp } = require('../utils/errores');

const VENTANA_MS = 60_000;

const limitarPeticiones = (maximo) => {
  let usadas = 0;
  let finVentana = 0;

  return (req, res, next) => {
    const ahora = Date.now();
    if (ahora >= finVentana) {
      usadas = 0;
      finVentana = ahora + VENTANA_MS;
    }
    if (usadas >= maximo) {
      res.set('Retry-After', String(Math.ceil((finVentana - ahora) / 1000)));
      return next(new ErrorApp('Demasiadas solicitudes. Intenta de nuevo en unos minutos.', {
        status: 429,
        codigo: 'LIMITE_PETICIONES',
      }));
    }
    usadas += 1;
    next();
  };
};

// La plaza cubre la lectura, la validación y el trabajo asíncrono del análisis.
const limitarAnalisisConcurrentes = (maximo, validarArchivo, analizar) => {
  const validar = promisify(validarArchivo);
  let activos = 0;

  return async (req, res, next) => {
    if (activos >= maximo) {
      res.set('Retry-After', '10');
      return next(new ErrorApp('Hay otros documentos en proceso. Intenta de nuevo en unos segundos.', {
        status: 429,
        codigo: 'ANALISIS_OCUPADO',
      }));
    }
    activos += 1;

    try {
      await validar(req, res);
      if (!res.destroyed) await analizar(req, res, next);
    } catch (error) {
      if (!res.destroyed) next(error);
    } finally {
      activos -= 1;
    }
  };
};

module.exports = { limitarPeticiones, limitarAnalisisConcurrentes };
