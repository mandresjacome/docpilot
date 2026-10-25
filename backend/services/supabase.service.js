// Servicio de conexión y escritura a Supabase.
// Responsabilidad única: proveer el cliente de Supabase y las funciones
// que insertan metadatos de uso. NUNCA almacena el contenido de documentos,
// texto OCR ni información personal extraída — solo métricas de sesión.
// Esto mantiene la política Zero Storage del proyecto: los documentos
// se procesan en RAM y se descartan; solo los metadatos de la interacción persisten.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Validar que las variables de entorno estén definidas antes de crear el cliente.
// Si faltan, el error explota en el arranque del servidor (fail-fast),
// no de forma silenciosa durante una petición de usuario.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_KEY. ' +
    'Revisa el archivo .env o las variables de entorno del servidor.'
  );
}

// Se usa la service_role key (no la anon key) para que el cliente tenga
// permisos de escritura/lectura aunque el Row Level Security (RLS) esté activo.
// Esta key NUNCA debe exponerse en el frontend.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * registrarUso — inserta un registro de metadatos de sesión en Supabase.
 * Se llama desde el controlador de documentos al completar un análisis.
 *
 * @param {Object} datos
 * @param {string}  datos.tipo_documento   - Tipo detectado por Gemini (contrato, factura, etc.)
 * @param {number}  datos.tiempo_ms        - Milisegundos que tardó el ciclo OCR + Gemini
 * @param {boolean} datos.confirmado       - true si el usuario aprobó el resultado (HITL)
 * @param {string}  [datos.correo_usuario] - Correo registrado en el modal de consentimiento
 *
 * @returns {Promise<void>} — los errores se loguean en consola sin propagar
 *                            para que un fallo de BD no interrumpa el flujo del usuario
 */
const registrarUso = async ({ tipo_documento, tiempo_ms, confirmado, correo_usuario }) => {
  try {
    const { error } = await supabase
      .from('registros_uso')
      .insert([{
        tipo_documento: tipo_documento || 'desconocido',
        tiempo_ms:      tiempo_ms      || null,
        confirmado:     confirmado     || false,
        correo_usuario: correo_usuario || null,
      }]);

    if (error) {
      // Registrar el error en consola sin lanzar excepción.
      // Un fallo en la BD no debe interrumpir la experiencia del usuario.
      console.error('[Supabase] Error al registrar uso:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] Error inesperado en registrarUso:', err.message);
  }
};

/**
 * registrarEncuesta — actualiza el registro de uso con la valoración del usuario.
 * Se llama desde el controlador cuando el usuario envía la encuesta post-confirmación.
 *
 * @param {Object} datos
 * @param {string}  datos.id             - UUID del registro a actualizar
 * @param {number}  datos.estrellas      - Valoración del 1 al 5
 * @param {string}  datos.tiempo_ahorrado - Rango de tiempo ahorrado seleccionado
 * @param {string}  [datos.comentario]   - Comentario opcional (máx 200 caracteres)
 *
 * @returns {Promise<void>}
 */
const registrarEncuesta = async ({ id, estrellas, tiempo_ahorrado, comentario }) => {
  try {
    const { error } = await supabase
      .from('registros_uso')
      .update({
        estrellas:       estrellas      || null,
        tiempo_ahorrado: tiempo_ahorrado || null,
        // Truncar a 200 caracteres como segunda capa de defensa (la BD ya tiene el CHECK)
        comentario: comentario ? comentario.slice(0, 200) : null,
      })
      .eq('id', id);

    if (error) {
      console.error('[Supabase] Error al registrar encuesta:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] Error inesperado en registrarEncuesta:', err.message);
  }
};

/**
 * obtenerEstadisticas — consulta los metadatos de uso para el panel admin.
 * Devuelve los registros ordenados por fecha descendente con un límite de 500
 * para evitar transferencias masivas de datos.
 *
 * @returns {Promise<Array>} - Array de registros o array vacío si hay error
 */
const obtenerEstadisticas = async () => {
  try {
    const { data, error } = await supabase
      .from('registros_uso')
      .select('*')
      .order('fecha_hora', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[Supabase] Error al obtener estadísticas:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Error inesperado en obtenerEstadisticas:', err.message);
    return [];
  }
};

/**
 * registrarUsoConRetorno — igual que registrarUso pero devuelve el registro insertado.
 * Se usa en el controlador de documentos para obtener el id y pasarlo al frontend,
 * permitiendo actualizar el mismo registro con la encuesta y la confirmación.
 *
 * @param {Object} datos - Mismos campos que registrarUso
 * @returns {Promise<{data: Object|null}>} - El registro insertado o null si hay error
 */
const registrarUsoConRetorno = async ({ tipo_documento, tiempo_ms, confirmado, correo_usuario }) => {
  try {
    const { data, error } = await supabase
      .from('registros_uso')
      .insert([{
        tipo_documento: tipo_documento || 'desconocido',
        tiempo_ms:      tiempo_ms      || null,
        confirmado:     confirmado     || false,
        correo_usuario: correo_usuario || null,
      }])
      .select('id') // Solo necesitamos el id del registro creado
      .single();

    if (error) {
      console.error('[Supabase] Error al insertar registro con retorno:', error.message);
      return { data: null };
    }

    return { data };
  } catch (err) {
    console.error('[Supabase] Error inesperado en registrarUsoConRetorno:', err.message);
    return { data: null };
  }
};

/**
 * marcarConfirmado — actualiza el campo confirmado a true en un registro existente.
 * Se llama cuando el usuario completa el ciclo HITL (aprueba el resultado de la IA).
 *
 * @param {string} id - UUID del registro a actualizar
 * @returns {Promise<void>}
 */
const marcarConfirmado = async (id) => {
  try {
    const { error } = await supabase
      .from('registros_uso')
      .update({ confirmado: true })
      .eq('id', id);

    if (error) {
      console.error('[Supabase] Error al marcar confirmado:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] Error inesperado en marcarConfirmado:', err.message);
  }
};

/**
 * eliminarRegistro — borra un registro individual por su UUID.
 * Se usa desde el panel admin para quitar registros de prueba erróneos.
 *
 * @param {string} id - UUID del registro a eliminar
 * @returns {Promise<void>}
 */
const eliminarRegistro = async (id) => {
  try {
    const { error } = await supabase
      .from('registros_uso')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Supabase] Error al eliminar registro:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] Error inesperado en eliminarRegistro:', err.message);
  }
};

/**
 * limpiarTodosLosRegistros — borra todos los registros de la tabla.
 * Uso exclusivo del panel admin para limpiar datos de prueba antes del piloto real.
 * Utiliza .not('id', 'is', null) para coincidir con todas las filas (RLS activo).
 *
 * @returns {Promise<void>}
 */
const limpiarTodosLosRegistros = async () => {
  try {
    const { error } = await supabase
      .from('registros_uso')
      .delete()
      .not('id', 'is', null); // Coincide con todas las filas existentes

    if (error) {
      console.error('[Supabase] Error al limpiar registros:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] Error inesperado en limpiarTodosLosRegistros:', err.message);
  }
};

module.exports = { registrarUso, registrarUsoConRetorno, marcarConfirmado, registrarEncuesta, obtenerEstadisticas, eliminarRegistro, limpiarTodosLosRegistros };
