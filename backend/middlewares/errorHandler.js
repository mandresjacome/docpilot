// Middleware de errores global de Express.
// Captura cualquier error propagado con next(error) desde controladores o middlewares.
// Centralizar el manejo de errores aquí evita duplicar lógica de respuesta de error
// en cada controlador y garantiza respuestas consistentes al cliente.
//
// IMPORTANTE: Express identifica este middleware como manejador de errores
// por la firma de CUATRO parámetros (err, req, res, next). No omitir ninguno.

const { ErrorApp } = require('../utils/errores');

const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) return res.destroy();

  const controlado = err instanceof ErrorApp;
  const estadoOriginal = err.status || err.statusCode;
  const estado = Number.isInteger(estadoOriginal) && estadoOriginal >= 400 && estadoOriginal <= 599
    ? estadoOriginal : 500;
  const codigo = controlado ? err.codigo : 'ERROR_SOLICITUD';

  // Los errores de bibliotecas y proveedores pueden incluir secretos o fragmentos de datos.
  if (estado >= 500) {
    console.error(`[Error ${estado}] (${controlado ? codigo : 'ERROR_INTERNO'})`);
  }

  if (controlado) return res.status(estado).json({ error: err.message, codigo });
  if (estado === 413) {
    return res.status(estado).json({ error: 'La solicitud es demasiado grande.', codigo: 'SOLICITUD_DEMASIADO_GRANDE' });
  }
  if (estado < 500) {
    return res.status(estado).json({ error: 'La solicitud no se pudo interpretar.', codigo });
  }
  res.status(estado).json({ error: 'Ocurrió un error interno en el servidor.', codigo: 'ERROR_INTERNO' });
};

module.exports = errorHandler;
