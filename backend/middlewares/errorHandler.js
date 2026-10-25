// Middleware de errores global de Express.
// Captura cualquier error propagado con next(error) desde controladores o middlewares.
// Centralizar el manejo de errores aquí evita duplicar lógica de respuesta de error
// en cada controlador y garantiza respuestas consistentes al cliente.
//
// IMPORTANTE: Express identifica este middleware como manejador de errores
// por la firma de CUATRO parámetros (err, req, res, next). No omitir ninguno.

const errorHandler = (err, req, res, next) => {
  // Si la respuesta ya empezó a enviarse, Express debe cerrar la conexión por defecto
  if (res.headersSent) return next(err);

  // Si el código de estado ya fue definido en el error, usarlo;
  // de lo contrario, asumir error interno del servidor (500)
  const estado = err.status || err.statusCode || 500;
  const esProduccion = process.env.NODE_ENV === 'production';

  // Los fallos del servidor (5xx) se registran siempre, también en producción:
  // sin este log un error de Supabase o de IA sería invisible en Railway.
  // Nunca se registra el contenido de documentos, solo mensaje y causa técnica.
  if (estado >= 500 || !esProduccion) {
    console.error(`[Error ${estado}]${err.codigo ? ` (${err.codigo})` : ''}`, err.message);
    if (err.causa) console.error('  Causa:', err.causa.message || err.causa);
    if (!esProduccion && err.stack) console.error(err.stack);
  }

  // En producción, un 5xx no controlado (sin `expose`) podría revelar detalles internos
  // (rutas, proyectos de GCP, mensajes de librerías): se responde un mensaje genérico.
  const ocultarDetalle = esProduccion && estado >= 500 && !err.expose;
  const mensaje = ocultarDetalle
    ? 'Ocurrió un error interno en el servidor.'
    : err.message || 'Ocurrió un error interno en el servidor.';

  const cuerpo = { error: mensaje };
  if (err.codigo) cuerpo.codigo = err.codigo;

  res.status(estado).json(cuerpo);
};

module.exports = errorHandler;
