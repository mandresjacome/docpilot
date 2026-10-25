// Controlador para el registro de visitas al aplicativo.
// Propósito: registrar en los logs del servidor que un usuario aceptó el
// tratamiento de datos y accedió al sistema. No guarda nada en base de datos
// ni en archivos — solo emite un console.log para que quede en el historial
// de la plataforma de despliegue (Railway). Esto es coherente con la regla
// Zero Storage del proyecto.

/**
 * registrarVisita
 * Recibe el correo del usuario y la marca de tiempo desde el frontend.
 * Registra el evento en consola y responde con confirmación.
 * En ningún caso se escribe a disco, base de datos o servicio externo.
 */
const registrarVisita = (req, res) => {
  try {
    // Extraer datos del cuerpo de la solicitud
    const { correo, marcaTiempo } = req.body;

    // Validación mínima en la frontera del sistema
    if (!correo || typeof correo !== 'string') {
      return res.status(400).json({ error: 'El campo correo es requerido y debe ser texto.' });
    }

    // Registro del evento en consola del servidor — único mecanismo de "almacenamiento"
    // permitido bajo la política Zero Storage del proyecto.
    // Este log queda capturado en el historial de Railway o cualquier servicio de hosting.
    console.log(`[VISITA] ${marcaTiempo || new Date().toISOString()} | Correo: ${correo} | Consentimiento de tratamiento de datos: ACEPTADO`);

    // Respuesta de confirmación al frontend — no se devuelven datos del usuario
    return res.status(200).json({
      mensaje: 'Registro de visita procesado correctamente.',
    });
  } catch (error) {
    // En caso de error inesperado, propagarlo al middleware global de errores
    const err = new Error('Error interno al procesar el registro de visita.');
    err.statusCode = 500;
    throw err;
  }
};

module.exports = { registrarVisita };
