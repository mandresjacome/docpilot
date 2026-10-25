// Errores de aplicación con estado HTTP y código estable.
// Permiten que servicios y middlewares comuniquen QUÉ falló y con qué estado
// responder, sin que el controlador tenga que interpretar mensajes de texto.
// El errorHandler global usa `status`, `codigo` y `expose` para armar la respuesta.

class ErrorApp extends Error {
  /**
   * @param {string} mensaje - Mensaje seguro para mostrar al usuario (en español)
   * @param {Object} [opciones]
   * @param {number} [opciones.status=500] - Código HTTP de la respuesta
   * @param {string} [opciones.codigo]     - Código estable para el cliente y las pruebas
   * @param {Error}  [opciones.causa]      - Error original; solo se registra en logs
   */
  constructor(mensaje, { status = 500, codigo = 'ERROR_INTERNO', causa } = {}) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.status = status;
    this.codigo = codigo;
    this.causa = causa;
    // El mensaje fue redactado para el usuario, por lo que puede devolverse tal cual
    this.expose = true;
  }
}

// Expresión para validar UUID v1-v5 antes de usarlos como filtro en consultas
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const esUUID = (valor) => typeof valor === 'string' && REGEX_UUID.test(valor);

module.exports = { ErrorApp, esUUID };
