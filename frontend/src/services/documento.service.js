// Capa de servicios para el módulo de documentos.
// Centraliza todas las llamadas HTTP al backend en un único lugar.
// Los componentes React importan estas funciones en lugar de hacer fetch directamente,
// lo que facilita cambiar la URL base o el cliente HTTP sin tocar los componentes.

// URL base del backend.
// - Desarrollo: VITE_API_URL apunta a http://localhost:3001/api (o usa el proxy de Vite)
// - Producción: al estar frontend y backend en el mismo servidor Railway,
//   se usa una ruta relativa '/api' para no hardcodear ninguna URL.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * analizarDocumento — envía el archivo al backend para OCR + análisis con IA.
 * Construye un FormData para enviar el archivo como multipart/form-data.
 * El campo debe llamarse 'documento' (coincide con el middleware del backend).
 *
 * @param {File} archivo - El archivo seleccionado por el usuario en el formulario
 * @returns {Promise<Object>} - Los datos del análisis devueltos por el backend
 */
const analizarDocumento = async (archivo) => {
  // FormData permite enviar el archivo binario junto con otros campos de texto
  const formData = new FormData();
  formData.append('documento', archivo);

  const respuesta = await fetch(`${API_BASE}/documentos/analizar`, {
    method: 'POST',
    // No establecer Content-Type manualmente: el navegador lo hace automáticamente
    // con el boundary correcto para multipart/form-data
    body: formData,
  });

  // Si el servidor devolvió un código de error, leer el cuerpo y lanzar el error
  // para que el componente lo capture en su bloque catch
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error del servidor: ${respuesta.status}`);
  }

  return respuesta.json();
};

/**
 * confirmarAccion — llama al endpoint de confirmación tras la aprobación del usuario.
 * Solo debe invocarse desde el componente después de que el usuario haya revisado
 * el resultado de la IA (principio Human-in-the-Loop).
 *
 * @param {Object} datosConfirmacion - Datos del resultado aprobado por el usuario
 * @param {string|null} registroId   - ID del registro en Supabase para marcarlo como confirmado
 * @returns {Promise<Object>} - Respuesta del backend
 */
const confirmarAccion = async (datosConfirmacion, registroId = null) => {
  const respuesta = await fetch(`${API_BASE}/documentos/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Se incluye el registroId para que el backend actualice confirmado=true en Supabase
    body: JSON.stringify({ ...datosConfirmacion, registroId }),
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error del servidor: ${respuesta.status}`);
  }

  return respuesta.json();
};

export default { analizarDocumento, confirmarAccion };
