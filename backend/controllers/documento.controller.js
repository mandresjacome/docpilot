// Controlador del módulo de documentos.
// Responsabilidad: orquestar el flujo de una petición.
// Recibe req/res, delega la lógica pesada a los servicios,
// y devuelve la respuesta HTTP. No contiene lógica de negocio directa.

const ocrService       = require('../services/ocr.service');
const geminiService    = require('../services/gemini.service');
const supabaseService  = require('../services/supabase.service');
const { ErrorApp, esUUID } = require('../utils/errores');
const { crearPermisoAnalisis, permisoAnalisisValido } = require('../utils/permisoAnalisis');

// Atajo para cortar el flujo con un 400 y un código estable
const errorValidacion = (mensaje, codigo) => new ErrorApp(mensaje, { status: 400, codigo });
const tiemposEncuesta = new Set(['menos_5min', '5_15min', '15_30min', 'mas_30min']);

const verificarPermiso = (registroId, permiso) => {
  if (!permisoAnalisisValido(registroId, permiso)) {
    throw new ErrorApp('El permiso de este análisis no es válido o venció. Vuelve a analizar el documento.', {
      status: 403,
      codigo: 'PERMISO_ANALISIS_INVALIDO',
    });
  }
};

/**
 * analizar — POST /api/documentos/analizar
 * Flujo:
 * 1. Toma el buffer del archivo desde req.file (multer memoryStorage)
 * 2. Extrae el texto usando el servicio OCR (Google Document AI)
 * 3. Envía el texto al servicio Gemini para análisis y clasificación
 * 4. Registra métricas en Supabase (si falla, el análisis se entrega igualmente pero
 *    la respuesta lo indica explícitamente en `registro.guardado`)
 * 5. Devuelve el resultado al frontend para revisión del usuario (HITL)
 */
const analizar = async (req, res, next) => {
  const cancelacion = new AbortController();
  const cancelar = () => cancelacion.abort();
  res.once('close', cancelar);
  try {
    // Marca de tiempo de inicio para calcular el tiempo total de procesamiento
    const tiempoInicio = Date.now();

    // El buffer llega en memoria gracias a multer.memoryStorage()
    // NUNCA se guarda en disco ni en almacenamiento externo
    const buffer   = req.file.buffer;
    const mimeType = req.file.mimetype;

    // Paso 1: Extraer texto del documento mediante OCR
    // El buffer se usa aquí y se descarta al salir del scope
    const textoExtraido = await ocrService.extraerTexto(buffer, mimeType, cancelacion.signal);
    if (cancelacion.signal.aborted) return;

    // Paso 2: Analizar el texto con Gemini para clasificar y sugerir respuesta
    const analisis = await geminiService.analizarTexto(textoExtraido, cancelacion.signal);
    if (cancelacion.signal.aborted) return;

    // Paso 3: Registrar metadatos de la sesión en Supabase (solo métricas, nunca contenido).
    // El procesamiento documental YA terminó con éxito: si el guardado falla no se
    // descarta el análisis, pero tampoco se oculta el fallo (ver `registro` en la respuesta).
    const tiempoMs = Date.now() - tiempoInicio;
    let registroId = null;
    let advertenciaGuardado = null;
    try {
      const { data } = await supabaseService.registrarUsoConRetorno({
        tipo_documento: analisis._categoria,
        tiempo_ms:      tiempoMs,
        confirmado:     false, // se actualiza a true cuando el usuario confirme (HITL)
      });
      registroId = data.id;
    } catch {
      console.error('[Error 502] (PERSISTENCIA_FALLIDA)');
      advertenciaGuardado = 'No se pudo registrar la métrica de uso de este análisis. ' +
        'Podrás revisar y confirmar el resultado, pero la confirmación y la valoración no quedarán registradas.';
    }

    // Paso 4: Devolver el resultado al frontend.
    // El usuario DEBE revisar este resultado antes de cualquier acción final (HITL)
    res.set('Cache-Control', 'no-store').status(200).json({
      mensaje: advertenciaGuardado
        ? 'Documento analizado correctamente, pero el registro de uso no se guardó. Por favor revise el resultado.'
        : 'Documento analizado correctamente. Por favor revise el resultado.',
      datos:      analisis,
      registroId,
      permisoAnalisis: crearPermisoAnalisis(registroId),
      registro: advertenciaGuardado
        ? { guardado: false, advertencia: advertenciaGuardado }
        : { guardado: true },
    });
  } catch (error) {
    if (!cancelacion.signal.aborted) next(error);
  } finally {
    res.off('close', cancelar);
  }
};

/**
 * confirmar — POST /api/documentos/confirmar
 * Se ejecuta SOLO cuando el usuario aprueba explícitamente el resultado desde el frontend.
 * Representa el cierre del ciclo Human-in-the-Loop: el usuario leyó el análisis de la IA,
 * tomó una decisión informada y autorizó la acción final.
 *
 * Si el análisis tiene registroId, la confirmación DEBE quedar guardada en Supabase:
 * si el guardado falla, responde con error (502) en lugar de declarar un éxito falso.
 */
const confirmar = async (req, res, next) => {
  try {
    const { registroId = null, permisoAnalisis } = req.body || {};

    // registroId es opcional (no existe si el guardado inicial falló), pero si llega debe ser válido
    if (registroId !== null && !esUUID(registroId)) {
      return next(errorValidacion('El identificador del registro no es válido.', 'REGISTRO_ID_INVALIDO'));
    }
    verificarPermiso(registroId, permisoAnalisis);

    // Actualizar el registro en Supabase marcando confirmado = true.
    // Esto permite medir cuántos usuarios completaron el ciclo HITL completo.
    // Si falla, la excepción llega al errorHandler y el usuario puede reintentar.
    let registroActualizado = false;
    if (registroId) {
      await supabaseService.marcarConfirmado(registroId);
      registroActualizado = true;
    }

    res.status(200).json({
      mensaje: 'Análisis confirmado correctamente por el usuario.',
      registroActualizado,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * guardarEncuesta — POST /api/documentos/encuesta
 * Recibe la valoración del usuario tras confirmar el análisis (post-HITL).
 * Actualiza el registro existente en Supabase con los datos de la encuesta.
 * No crea un nuevo registro — enriquece el que ya existe.
 * Solo responde éxito si la valoración quedó realmente guardada.
 */
const guardarEncuesta = async (req, res, next) => {
  try {
    const { registroId, permisoAnalisis, estrellas, tiempo_ahorrado, comentario } = req.body || {};

    // Validar que se recibió un id de registro válido
    if (!registroId) {
      return next(errorValidacion('No se recibió el identificador del registro para la encuesta.', 'REGISTRO_ID_REQUERIDO'));
    }
    if (!esUUID(registroId)) {
      return next(errorValidacion('El identificador del registro no es válido.', 'REGISTRO_ID_INVALIDO'));
    }
    verificarPermiso(registroId, permisoAnalisis);

    if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
      return next(errorValidacion('La valoración debe estar entre 1 y 5 estrellas.', 'ESTRELLAS_INVALIDAS'));
    }

    if (tiempo_ahorrado != null && !tiemposEncuesta.has(tiempo_ahorrado)) {
      return next(errorValidacion('El rango de tiempo ahorrado no es válido.', 'ENCUESTA_INVALIDA'));
    }
    if (comentario != null && (typeof comentario !== 'string' || comentario.length > 200)) {
      return next(errorValidacion('El comentario debe ser texto de hasta 200 caracteres.', 'ENCUESTA_INVALIDA'));
    }

    // Persistir la valoración en Supabase (lanza ErrorPersistencia o 404 si no se pudo)
    await supabaseService.registrarEncuesta({ id: registroId, estrellas, tiempo_ahorrado, comentario });

    res.status(200).json({ mensaje: '¡Gracias por tu valoración! Ha sido registrada correctamente.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { analizar, confirmar, guardarEncuesta };
