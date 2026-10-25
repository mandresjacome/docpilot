// Capa de servicios para el panel de administración.
// Centraliza las llamadas HTTP al endpoint admin del backend.
// El token de acceso se pasa como header en cada petición — nunca en la URL
// para evitar que quede en logs de servidores proxy.

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * obtenerDashboard — llama al endpoint admin/dashboard con el token de acceso.
 *
 * @param {string} token - Token de administrador ingresado por la profe
 * @returns {Promise<Object>} - { metricas, actividadReciente }
 * @throws {Error} si el token es inválido (401) o hay error de red
 */
const obtenerDashboard = async (token) => {
  const respuesta = await fetch(`${API_BASE}/admin/dashboard`, {
    method: 'GET',
    headers: {
      // El token va en header personalizado, no en query param ni en el body
      'x-admin-token': token,
    },
  });

  if (respuesta.status === 401) {
    throw new Error('Token de acceso incorrecto. Verifica la clave e intenta de nuevo.');
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error del servidor: ${respuesta.status}`);
  }

  return respuesta.json();
};

/**
 * eliminarRegistro — borra un registro individual por su UUID.
 *
 * @param {string} token - Token de administrador
 * @param {string} id    - UUID del registro a eliminar
 * @returns {Promise<void>}
 */
const eliminarRegistro = async (token, id) => {
  const respuesta = await fetch(`${API_BASE}/admin/registros/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': token },
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error al eliminar: ${respuesta.status}`);
  }
};

/**
 * limpiarRegistros — elimina todos los registros de la tabla.
 *
 * @param {string} token - Token de administrador
 * @returns {Promise<void>}
 */
const limpiarRegistros = async (token) => {
  const respuesta = await fetch(`${API_BASE}/admin/registros`, {
    method: 'DELETE',
    headers: { 'x-admin-token': token },
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error al limpiar: ${respuesta.status}`);
  }
};

export default { obtenerDashboard, eliminarRegistro, limpiarRegistros };
