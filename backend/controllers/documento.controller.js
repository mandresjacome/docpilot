// Controlador del módulo de documentos.
// Responsabilidad: orquestar el flujo de una petición.
// Recibe req/res, delega la lógica pesada a los servicios,
// y devuelve la respuesta HTTP. No contiene lógica de negocio directa.

const ocrService       = require('../services/ocr.service');
const geminiService    = require('../services/gemini.service');
const supabaseService  = require('../services/supabase.service');

/**
 * analizar — POST /api/documentos/analizar
 * Flujo:
 * 1. Toma el buffer del archivo desde req.file (multer memoryStorage)
 * 2. Extrae el texto usando el servicio OCR (Google Document AI)
 * 3. Envía el texto al servicio Gemini para análisis y clasificación
 * 4. Devuelve el resultado al frontend para revisión del usuario (HITL)
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

    // Paso 3: Registrar metadatos de la sesión en Supabase (Zero Storage: solo métricas)
    // Se calcula el tiempo de procesamiento para la métrica de rendimiento del sistema.
    // El correo viene del header opcional que el frontend puede enviar tras el consentimiento.
    const tiempoMs = Date.now() - tiempoInicio;
    const { data: registroInsertado } = await supabaseService.registrarUsoConRetorno({
      tipo_documento: analisis.tipo || 'desconocido',
      tiempo_ms:      tiempoMs,
      confirmado:     false, // se actualiza a true cuando el usuario confirme (HITL)
      correo_usuario: req.headers['x-correo-usuario'] || null,
    });

    // Paso 4: Devolver el resultado al frontend
    // Se incluye el id del registro para poder actualizarlo con la encuesta y confirmación.
    // El usuario DEBE revisar este resultado antes de cualquier acción final (HITL)
    res.status(200).json({
      mensaje:    'Documento analizado correctamente. Por favor revise el resultado.',
      datos:      analisis,
      registroId: registroInsertado ? registroInsertado.id : null,
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
 * Por ahora registra la confirmación y devuelve los datos aprobados.
 * En iteraciones futuras este endpoint puede extenderse para:
 * - Guardar el registro de confirmación en base de datos
 * - Generar un PDF con la respuesta aprobada
 * - Notificar a otros sistemas internos (nunca de forma autónoma hacia clientes)
 */
const confirmar = async (req, res, next) => {
  try {
    // Los datos del análisis aprobado llegan en el cuerpo de la petición.
    // registroId viene del frontend para actualizar el registro de Supabase.
    const { datos, mensaje, registroId } = req.body;

    // Validar que se recibió el análisis a confirmar
    if (!datos) {
      const error = new Error('No se recibieron datos del análisis para confirmar.');
      error.status = 400;
      return next(error);
    }

    // Registrar en consola la confirmación
    console.log(`[HITL] Usuario confirmó análisis de documento tipo: ${datos.tipo || 'desconocido'}`);

    // Actualizar el registro en Supabase marcando confirmado = true.
    // Esto permite medir cuántos usuarios completaron el ciclo HITL completo.
    if (registroId) {
      await supabaseService.marcarConfirmado(registroId);
    }

    // Devolver confirmación al frontend con los datos aprobados
    res.status(200).json({
      mensaje: 'Análisis confirmado correctamente por el usuario.',
      datosConfirmados: datos,
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
 */
const guardarEncuesta = async (req, res, next) => {
  try {
    const { registroId, estrellas, tiempo_ahorrado, comentario } = req.body;

    // Validar que se recibió el id del registro a actualizar
    if (!registroId) {
      const error = new Error('No se recibió el identificador del registro para la encuesta.');
      error.status = 400;
      return next(error);
    }

    // Validar rango de estrellas si se envió
    if (estrellas !== undefined && (estrellas < 1 || estrellas > 5)) {
      const error = new Error('La valoración debe estar entre 1 y 5 estrellas.');
      error.status = 400;
      return next(error);
    }

    // Persistir la valoración en Supabase
    await supabaseService.registrarEncuesta({ id: registroId, estrellas, tiempo_ahorrado, comentario });

    res.status(200).json({ mensaje: '¡Gracias por tu valoración! Ha sido registrada correctamente.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { analizar, confirmar, guardarEncuesta };
