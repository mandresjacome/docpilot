// Controlador para el registro de aceptaciones del tratamiento de datos.
// Propósito: dejar en los logs del servidor una línea que indique que un usuario aceptó
// el aviso de tratamiento de datos. No guarda nada en base de datos ni en archivos y
// NO recibe ni registra datos personales (ni correo, ni IP propia de la aplicación).
// Los logs los conserva la plataforma de despliegue (p. ej. Railway) según su política.

/**
 * registrarVisita
 * Registra el evento de aceptación en consola y responde con confirmación.
 * El cuerpo de la petición se ignora a propósito: cualquier dato enviado por el cliente
 * (correo, marca de tiempo, etc.) no se lee ni se escribe en el log, lo que evita tanto
 * guardar datos personales como la inyección de líneas falsas en los logs.
 */
const registrarVisita = (req, res) => {
  // La hora la pone el servidor: la del cliente es manipulable
  console.log(`[VISITA] ${new Date().toISOString()} | Consentimiento de tratamiento de datos: ACEPTADO`);

  // Respuesta de confirmación al frontend — no se devuelven datos
  return res.status(200).json({
    mensaje: 'Registro de visita procesado correctamente.',
  });
};

module.exports = { registrarVisita };
