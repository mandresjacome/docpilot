// Servicio de conexión y escritura a Supabase.
// Responsabilidad única: proveer el cliente de Supabase y las funciones
// que insertan metadatos de uso. NUNCA almacena el contenido de documentos
// ni el texto extraído por OCR — solo metadatos de la interacción
// (tipo de documento, tiempo, confirmación, valoración y, si el cliente lo envía, el correo).
//
// MANEJO DE ERRORES: toda operación que falle (error devuelto por Supabase o excepción
// de red) lanza un ErrorPersistencia. Ninguna función devuelve éxito si el dato no se
// guardó; es el controlador quien decide si el fallo es fatal o solo una advertencia.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ErrorApp } = require('../utils/errores');

// Error específico de la capa de persistencia (502: falla el servicio externo, no la petición)
class ErrorPersistencia extends ErrorApp {
  constructor(operacion, causa) {
    super(`No se pudo ${operacion} en la base de datos. Intenta de nuevo en unos minutos.`, {
      status: 502,
      codigo: 'PERSISTENCIA_FALLIDA',
      causa,
    });
    this.name = 'ErrorPersistencia';
  }
}

// El registro buscado no existe (id inexistente o ya eliminado)
class ErrorRegistroNoEncontrado extends ErrorApp {
  constructor() {
    super('El registro indicado no existe.', { status: 404, codigo: 'REGISTRO_NO_ENCONTRADO' });
    this.name = 'ErrorRegistroNoEncontrado';
  }
}

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
 * ejecutar — ejecuta una consulta de Supabase y unifica sus dos formas de fallo:
 * el `error` que devuelve el cliente y las excepciones (red, timeout, etc.).
 * Si algo falla lanza ErrorPersistencia; si no, devuelve el resultado ({ data }).
 *
 * @param {string}   operacion - Descripción en infinitivo para el mensaje (p. ej. 'registrar el uso')
 * @param {Function} consulta  - Función que devuelve la promesa de la consulta
 */
const ejecutar = async (operacion, consulta) => {
  let resultado;
  try {
    resultado = await consulta();
  } catch (err) {
    throw new ErrorPersistencia(operacion, err);
  }

  if (!resultado || resultado.error) {
    throw new ErrorPersistencia(operacion, resultado && resultado.error);
  }
  return resultado;
};

/**
 * registrarUso — inserta un registro de metadatos de sesión en Supabase.
 *
 * @param {Object} datos
 * @param {string}  datos.tipo_documento   - Tipo detectado por Gemini (contrato, factura, etc.)
 * @param {number}  datos.tiempo_ms        - Milisegundos que tardó el ciclo OCR + Gemini
 * @param {boolean} datos.confirmado       - true si el usuario aprobó el resultado (HITL)
 * @param {string}  [datos.correo_usuario] - Correo asociado a la sesión, si el cliente lo envía
 *
 * @returns {Promise<void>}
 * @throws {ErrorPersistencia} si el registro no pudo guardarse
 */
const registrarUso = async ({ tipo_documento, tiempo_ms, confirmado, correo_usuario }) => {
  await ejecutar('registrar el uso', () => supabase
    .from('registros_uso')
    .insert([{
      tipo_documento: tipo_documento || 'desconocido',
      tiempo_ms:      tiempo_ms      || null,
      confirmado:     confirmado     || false,
      correo_usuario: correo_usuario || null,
    }]));
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
 * @throws {ErrorPersistencia} si falla el guardado
 * @throws {ErrorRegistroNoEncontrado} si no existe un registro con ese id
 */
const registrarEncuesta = async ({ id, estrellas, tiempo_ahorrado, comentario }) => {
  // .select('id') permite saber cuántas filas se actualizaron: 0 filas = id inexistente
  const { data } = await ejecutar('registrar la valoración', () => supabase
    .from('registros_uso')
    .update({
      estrellas:       estrellas      || null,
      tiempo_ahorrado: tiempo_ahorrado || null,
      // Truncar a 200 caracteres como segunda capa de defensa (la BD ya tiene el CHECK)
      comentario: comentario ? comentario.slice(0, 200) : null,
    })
    .eq('id', id)
    .select('id'));

  if (!data || data.length === 0) throw new ErrorRegistroNoEncontrado();
};

/**
 * obtenerEstadisticas — consulta los metadatos de uso para el panel admin.
 * Devuelve los registros ordenados por fecha descendente con un límite de 500
 * para evitar transferencias masivas de datos.
 *
 * @returns {Promise<Array>} - Array de registros (vacío solo si realmente no hay datos)
 * @throws {ErrorPersistencia} si la consulta falla; así el panel no muestra "0 registros" por error
 */
const obtenerEstadisticas = async () => {
  const { data } = await ejecutar('consultar las estadísticas', () => supabase
    .from('registros_uso')
    .select('*')
    .order('fecha_hora', { ascending: false })
    .limit(500));

  return data || [];
};

/**
 * registrarUsoConRetorno — igual que registrarUso pero devuelve el registro insertado.
 * Se usa en el controlador de documentos para obtener el id y pasarlo al frontend,
 * permitiendo actualizar el mismo registro con la encuesta y la confirmación.
 *
 * @param {Object} datos - Mismos campos que registrarUso
 * @returns {Promise<{data: {id: string}}>} - El registro insertado (siempre con id)
 * @throws {ErrorPersistencia} si el registro no pudo guardarse
 */
const registrarUsoConRetorno = async ({ tipo_documento, tiempo_ms, confirmado, correo_usuario }) => {
  const { data } = await ejecutar('registrar el uso', () => supabase
    .from('registros_uso')
    .insert([{
      tipo_documento: tipo_documento || 'desconocido',
      tiempo_ms:      tiempo_ms      || null,
      confirmado:     confirmado     || false,
      correo_usuario: correo_usuario || null,
    }])
    .select('id') // Solo necesitamos el id del registro creado
    .single());

  // Un insert "exitoso" sin id no sirve para enlazar la confirmación ni la encuesta
  if (!data || !data.id) throw new ErrorPersistencia('registrar el uso', new Error('Respuesta sin id'));

  return { data };
};

/**
 * marcarConfirmado — actualiza el campo confirmado a true en un registro existente.
 * Se llama cuando el usuario completa el ciclo HITL (aprueba el resultado de la IA).
 *
 * @param {string} id - UUID del registro a actualizar
 * @returns {Promise<void>}
 * @throws {ErrorPersistencia} si falla el guardado
 * @throws {ErrorRegistroNoEncontrado} si no existe un registro con ese id
 */
const marcarConfirmado = async (id) => {
  const { data } = await ejecutar('registrar la confirmación', () => supabase
    .from('registros_uso')
    .update({ confirmado: true })
    .eq('id', id)
    .select('id'));

  if (!data || data.length === 0) throw new ErrorRegistroNoEncontrado();
};

/**
 * eliminarRegistro — borra un registro individual por su UUID.
 * Se usa desde el panel admin para quitar registros de prueba erróneos.
 *
 * @param {string} id - UUID del registro a eliminar
 * @returns {Promise<void>}
 * @throws {ErrorPersistencia} si falla el borrado
 * @throws {ErrorRegistroNoEncontrado} si no existe un registro con ese id
 */
const eliminarRegistro = async (id) => {
  const { data } = await ejecutar('eliminar el registro', () => supabase
    .from('registros_uso')
    .delete()
    .eq('id', id)
    .select('id'));

  if (!data || data.length === 0) throw new ErrorRegistroNoEncontrado();
};

/**
 * limpiarTodosLosRegistros — borra todos los registros de la tabla.
 * Uso exclusivo del panel admin para limpiar datos de prueba.
 * Utiliza .not('id', 'is', null) para coincidir con todas las filas (RLS activo).
 *
 * @returns {Promise<void>}
 * @throws {ErrorPersistencia} si falla el borrado
 */
const limpiarTodosLosRegistros = async () => {
  await ejecutar('limpiar los registros', () => supabase
    .from('registros_uso')
    .delete()
    .not('id', 'is', null)); // Coincide con todas las filas existentes
};

module.exports = {
  registrarUso,
  registrarUsoConRetorno,
  marcarConfirmado,
  registrarEncuesta,
  obtenerEstadisticas,
  eliminarRegistro,
  limpiarTodosLosRegistros,
  ErrorPersistencia,
  ErrorRegistroNoEncontrado,
};
