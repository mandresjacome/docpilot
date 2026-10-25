// Controlador del panel de administración.
// Responsabilidad: exponer los datos de uso del sistema a la persona administradora
// de forma protegida mediante un token secreto en los headers.
//
// SEGURIDAD:
// Todos los endpoints de este controlador requieren que el header
// 'x-admin-token' coincida con la variable de entorno ADMIN_TOKEN.
// Si no coincide, se devuelve 401 sin revelar si el token existe o no.
// Nunca se expone este controlador sin el token — los datos de uso
// son información sensible de la operación.

const crypto = require('crypto');
const { obtenerEstadisticas, eliminarRegistro, limpiarTodosLosRegistros } = require('../services/supabase.service');
const { ErrorApp, esUUID } = require('../utils/errores');

/**
 * tokensCoinciden — compara dos tokens en tiempo constante.
 * Comparar con `!==` revela, por la duración de la respuesta, cuántos caracteres
 * iniciales coinciden; timingSafeEqual evita ese canal lateral. Se comparan los
 * hashes SHA-256 porque timingSafeEqual exige buffers de igual longitud.
 */
const tokensCoinciden = (recibido, esperado) => {
  const hashRecibido = crypto.createHash('sha256').update(String(recibido)).digest();
  const hashEsperado = crypto.createHash('sha256').update(String(esperado)).digest();
  return crypto.timingSafeEqual(hashRecibido, hashEsperado);
};

/**
 * verificarToken — middleware interno que valida el token de administrador.
 * Se reutiliza en cada endpoint del panel para no duplicar la validación.
 */
const verificarToken = (req, res, next) => {
  const tokenRecibido  = req.headers['x-admin-token'];
  const tokenEsperado = process.env.ADMIN_TOKEN;

  // Si la variable de entorno no está configurada, el panel no debe estar accesible
  if (!tokenEsperado) {
    return res.status(503).json({ error: 'Panel administrativo no configurado en este entorno.' });
  }

  // Comparación en tiempo constante — no se expone cuál es el valor correcto
  if (!tokenRecibido || !tokensCoinciden(tokenRecibido, tokenEsperado)) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }

  next();
};

/**
 * obtenerDashboard — GET /api/admin/dashboard
 * Devuelve los registros de uso y calcula métricas agregadas en el servidor
 * para que el frontend solo tenga que renderizar, no calcular.
 *
 * Métricas calculadas:
 * - Total de documentos procesados
 * - Total confirmados (HITL completado)
 * - Distribución por tipo de documento
 * - Calificación promedio de las encuestas
 * - Distribución de tiempo ahorrado
 * - Últimos 10 registros para la tabla de actividad reciente
 */
const obtenerDashboard = async (req, res, next) => {
  try {
    // Obtener todos los registros desde Supabase
    const registros = await obtenerEstadisticas();

    // ── Cálculo de métricas agregadas ──────────────────────────────────────

    const totalProcesados = registros.length;

    // Documentos donde el usuario completó el ciclo HITL (confirmó el análisis)
    const totalConfirmados = registros.filter((r) => r.confirmado).length;

    // Distribución por tipo de documento: { contrato: 5, factura: 3, ... }
    const porTipo = registros.reduce((acc, r) => {
      const tipo = r.tipo_documento || 'desconocido';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});

    // Promedio de estrellas — solo considera registros con valoración
    const conEstrellas = registros.filter((r) => r.estrellas !== null && r.estrellas !== undefined);
    const promedioEstrellas = conEstrellas.length > 0
      ? (conEstrellas.reduce((sum, r) => sum + r.estrellas, 0) / conEstrellas.length).toFixed(1)
      : null;

    // Distribución de tiempo ahorrado declarado por el usuario en la encuesta
    const tiempoAhorradoDist = registros.reduce((acc, r) => {
      if (r.tiempo_ahorrado) {
        acc[r.tiempo_ahorrado] = (acc[r.tiempo_ahorrado] || 0) + 1;
      }
      return acc;
    }, {});

    // Tiempo promedio de procesamiento OCR + Gemini en milisegundos
    const conTiempo = registros.filter((r) => r.tiempo_ms);
    const promedioTiempoMs = conTiempo.length > 0
      ? Math.round(conTiempo.reduce((sum, r) => sum + r.tiempo_ms, 0) / conTiempo.length)
      : null;

    // Últimos 10 registros para la tabla de actividad reciente en el dashboard
    const actividadReciente = registros.slice(0, 10).map((r) => ({
      id:              r.id,
      fecha_hora:      r.fecha_hora,
      tipo_documento:  r.tipo_documento,
      confirmado:      r.confirmado,
      estrellas:       r.estrellas,
      tiempo_ahorrado: r.tiempo_ahorrado,
      comentario:      r.comentario,
    }));

    res.status(200).json({
      metricas: {
        totalProcesados,
        totalConfirmados,
        porTipo,
        promedioEstrellas,
        tiempoAhorradoDist,
        promedioTiempoMs,
        totalEncuestados: conEstrellas.length,
      },
      actividadReciente,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * eliminarRegistro — DELETE /api/admin/registros/:id
 * Borra un registro individual por su UUID.
 * Protegido por verificarToken (aplicado a nivel de router).
 */
const eliminarRegistroAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar el formato antes de consultar la base de datos
    if (!esUUID(id)) {
      return next(new ErrorApp('El identificador del registro no es válido.', {
        status: 400,
        codigo: 'REGISTRO_ID_INVALIDO',
      }));
    }

    // Lanza 404 si no existe y 502 si falla Supabase; ambos llegan al errorHandler
    await eliminarRegistro(id);
    res.status(200).json({ mensaje: 'Registro eliminado correctamente.' });
  } catch (error) {
    next(error);
  }
};

/**
 * limpiarRegistrosAdmin — DELETE /api/admin/registros
 * Borra todos los registros de la tabla.
 * Uso exclusivo para limpiar datos de prueba.
 * Protegido por verificarToken (aplicado a nivel de router).
 */
const limpiarRegistrosAdmin = async (req, res, next) => {
  try {
    await limpiarTodosLosRegistros();
    res.status(200).json({ mensaje: 'Todos los registros han sido eliminados.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { verificarToken, obtenerDashboard, eliminarRegistroAdmin, limpiarRegistrosAdmin };
