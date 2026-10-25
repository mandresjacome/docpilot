// Middleware de errores global de Express.
// Captura cualquier error propagado con next(error) desde controladores o middlewares.
// Centralizar el manejo de errores aquí evita duplicar lógica de respuesta de error
// en cada controlador y garantiza respuestas consistentes al cliente.
//
// IMPORTANTE: Express identifica este middleware como manejador de errores
// por la firma de CUATRO parámetros (err, req, res, next). No omitir ninguno.

const errorHandler = (err, req, res, next) => {
  // Si el código de estado ya fue definido en el error, usarlo;
  // de lo contrario, asumir error interno del servidor (500)
  const estado = err.status || 500;

  // En desarrollo, mostrar el stack trace ayuda a depurar más rápido
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[Error ${estado}]`, err.message);
    console.error(err.stack);
  }

  res.status(estado).json({
    error: err.message || 'Ocurrió un error interno en el servidor.',
  });
};

module.exports = errorHandler;
