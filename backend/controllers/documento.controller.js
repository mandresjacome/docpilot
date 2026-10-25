// Controlador del módulo de documentos.
// Responsabilidad: orquestar el flujo de una petición.
// Recibe req/res, delega la lógica pesada a los servicios,
// y devuelve la respuesta HTTP. No contiene lógica de negocio directa.

const ocrService       = require('../services/ocr.service');
const geminiService    = require('../services/gemini.service');
const supabaseService  = require('../services/supabase.service');
const { ErrorApp, esUUID } = require('../utils/errores');

// Atajo para cortar el flujo con un 400 y un código estable
const errorValidacion = (mensaje, codigo) => new ErrorApp(mensaje, { status: 400, codigo });

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
  try {
    // Marca de tiempo de inicio para calcular el tiempo total de procesamiento
    const tiempoInicio = Date.now();

    // El buffer llega en memoria gracias a multer.memoryStorage()
    // NUNCA se guarda en disco ni en almacenamiento externo
    const buffer   = req.file.buffer;
    const mimeType = req.file.mimetype;

    // Paso 1: Extraer texto del documento mediante OCR
    // El buffer se usa aquí y se descarta al salir del scope
    const textoExtraido = await ocrService.extraerTexto(buffer, mimeType);

    // Paso 2: Analizar el texto con Gemini para clasificar y sugerir respuesta
    const analisis = await geminiService.analizarTexto(textoExtraido);

    // Paso 3: Registrar metadatos de la sesión en Supabase (solo métricas, nunca contenido).
    // El procesamiento documental YA terminó con éxito: si el guardado falla no se
    // descarta el análisis, pero tampoco se oculta el fallo (ver `registro` en la respuesta).
    const tiempoMs = Date.now() - tiempoInicio;
    let registroId = null;
    let advertenciaGuardado = null;
    try {
      const { data } = await supabaseService.registrarUsoConRetorno({
        tipo_documento: analisis.tipo || 'desconocido',
        tiempo_ms:      tiempoMs,
        confirmado:     false, // se actualiza a true cuando el usuario confirme (HITL)
      });
      registroId = data.id;
    } catch (errorGuardado) {
      console.error('[Supabase] El análisis terminó pero no se pudo guardar el registro de uso:', errorGuardado.message);
      if (errorGuardado.causa) console.error('  Causa:', errorGuardado.causa.message || errorGuardado.causa);
      advertenciaGuardado = 'No se pudo registrar la métrica de uso de este análisis. ' +
        'Podrás revisar y confirmar el resultado, pero la confirmación y la valoración no quedarán registradas.';
    }

    // Paso 4: Devolver el resultado al frontend.
    // El usuario DEBE revisar este resultado antes de cualquier acción final (HITL)
    res.status(200).json({
      mensaje: advertenciaGuardado
        ? 'Documento analizado correctamente, pero el registro de uso no se guardó. Por favor revise el resultado.'
        : 'Documento analizado correctamente. Por favor revise el resultado.',
      datos:      analisis,
      registroId,
      registro: advertenciaGuardado
        ? { guardado: false, advertencia: advertenciaGuardado }
        : { guardado: true },
    });
  } catch (error) {
    // Propagar el error al middleware de errores global
    next(error);
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
    // Los datos del análisis aprobado llegan en el cuerpo de la petición.
    // registroId viene del frontend para actualizar el registro de Supabase.
    const { datos, registroId } = req.body || {};

    // Validar que se recibió el análisis a confirmar
    if (!datos) {
      return next(errorValidacion('No se recibieron datos del análisis para confirmar.', 'DATOS_REQUERIDOS'));
    }

    // registroId es opcional (no existe si el guardado inicial falló), pero si llega debe ser válido
    if (registroId && !esUUID(registroId)) {
      return next(errorValidacion('El identificador del registro no es válido.', 'REGISTRO_ID_INVALIDO'));
    }

    // Actualizar el registro en Supabase marcando confirmado = true.
    // Esto permite medir cuántos usuarios completaron el ciclo HITL completo.
    // Si falla, la excepción llega al errorHandler y el usuario puede reintentar.
    let registroActualizado = false;
    if (registroId) {
      await supabaseService.marcarConfirmado(registroId);
      registroActualizado = true;
    }

    console.log(`[HITL] Usuario confirmó análisis de documento tipo: ${datos.tipo || 'desconocido'}`);

    // Devolver confirmación al frontend con los datos aprobados.
    // `registroActualizado` indica si la confirmación quedó persistida.
    res.status(200).json({
      mensaje: 'Análisis confirmado correctamente por el usuario.',
      datosConfirmados: datos,
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
    const { registroId, estrellas, tiempo_ahorrado, comentario } = req.body || {};

    // Validar que se recibió un id de registro válido
    if (!registroId) {
      return next(errorValidacion('No se recibió el identificador del registro para la encuesta.', 'REGISTRO_ID_REQUERIDO'));
    }
    if (!esUUID(registroId)) {
      return next(errorValidacion('El identificador del registro no es válido.', 'REGISTRO_ID_INVALIDO'));
    }

    // Validar rango de estrellas si se envió (entero de 1 a 5)
    if (estrellas !== undefined && (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5)) {
      return next(errorValidacion('La valoración debe estar entre 1 y 5 estrellas.', 'ESTRELLAS_INVALIDAS'));
    }

    // Los campos de texto solo se aceptan como texto (o ausentes)
    const textoValido = (valor) => valor === undefined || valor === null || typeof valor === 'string';
    if (!textoValido(tiempo_ahorrado) || !textoValido(comentario)) {
      return next(errorValidacion('Los campos de la encuesta deben ser texto.', 'ENCUESTA_INVALIDA'));
    }

    // Persistir la valoración en Supabase (lanza ErrorPersistencia o 404 si no se pudo)
    await supabaseService.registrarEncuesta({ id: registroId, estrellas, tiempo_ahorrado, comentario });

    res.status(200).json({ mensaje: '¡Gracias por tu valoración! Ha sido registrada correctamente.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { analizar, confirmar, guardarEncuesta };
