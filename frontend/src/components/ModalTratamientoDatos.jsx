// Modal de Tratamiento de Datos.
// Aparece la primera vez que el usuario accede al aplicativo.
// Propósito: informar sobre el tratamiento de datos personales conforme a la
// Ley 1581 de 2012 (Colombia) y recoger el consentimiento explícito.
//
// IMPORTANTE — Zero Storage: el correo NO se guarda en ninguna base de datos
// ni archivo. Solo se envía al backend para que quede registrado en los logs
// del servidor de despliegue. En el cliente se guarda únicamente una bandera
// booleana en localStorage ('docpilot_consentimiento_v1') para no mostrar el modal
// en cada visita posterior del mismo navegador.

import React, { useState } from 'react';

/**
 * ModalTratamientoDatos
 * Props:
 *   - onAceptar(correo): función del padre que se llama cuando el usuario
 *     acepta el tratamiento de datos. Recibe el correo como argumento.
 *   - onCerrar: función del padre que se llama si el usuario decide saltar el formulario.
 */
const ModalTratamientoDatos = ({ onAceptar, onCerrar }) => {
  // Correo electrónico ingresado por el usuario
  const [correo, setCorreo] = useState('');

  // Control del checkbox de aceptación de la política de tratamiento
  const [aceptado, setAceptado] = useState(false);

  // Estado de carga mientras se envía el registro al backend
  const [enviando, setEnviando] = useState(false);

  // Mensaje de error visible al usuario si algo falla en la validación
  const [error, setError] = useState(null);

  /**
   * manejarEnvio — valida los campos y envía el registro al backend.
   * El backend solo genera un log en consola, no almacena datos.
   */
  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    setError(null);

    // Validación del correo en el cliente antes de hacer la petición
    const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correo.trim() || !regexCorreo.test(correo.trim())) {
      setError('Por favor ingresa un correo electrónico válido.');
      return;
    }

    // El checkbox de aceptación es obligatorio por política de tratamiento de datos
    if (!aceptado) {
      setError('Debes aceptar la política de tratamiento de datos para continuar.');
      return;
    }

    setEnviando(true);

    try {
      // Determinar la URL del backend según el entorno de ejecución
      const baseUrl = import.meta.env.VITE_API_URL || '';

      // Enviar el registro al backend — solo genera un log, no guarda datos
      const respuesta = await fetch(`${baseUrl}/api/visitas/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correo: correo.trim(),
          marcaTiempo: new Date().toISOString(),
        }),
      });

      if (!respuesta.ok) {
        // Si el servidor falla, no bloqueamos al usuario — el registro es opcional
        console.warn('[ModalTratamiento] El backend no pudo registrar la visita, continuando de todas formas.');
      }
    } catch (err) {
      // Error de red: no bloqueamos al usuario, el registro es un extra
      console.warn('[ModalTratamiento] Error de red al registrar visita:', err.message);
    } finally {
      setEnviando(false);
      // Notificar al componente padre con el correo ingresado
      onAceptar(correo.trim());
    }
  };

  return (
    // Fondo oscuro semitransparente que cubre toda la pantalla
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">

      <div className="modal-contenido">
        {/* Ícono y encabezado del modal */}
        <div className="modal-encabezado">
          <span className="modal-icono">🔐</span>
          <h2 id="modal-titulo">Autorización de Tratamiento de Datos</h2>
          <p className="modal-subtitulo">
            Antes de usar el aplicativo, necesitamos tu consentimiento conforme a la
            <strong> Ley 1581 de 2012</strong> de Protección de Datos Personales de Colombia.
          </p>
        </div>

        {/* Texto de la política de tratamiento de datos */}
        <div className="modal-politica">
          <p>
            La información ingresada en esta plataforma se procesa temporalmente para realizar
            la extracción de texto y el análisis con inteligencia artificial. El archivo original,
            el texto extraído y el resultado del análisis <strong>no se almacenan de forma
            persistente en la infraestructura de DocPilot.</strong>
          </p>
          <p style={{ marginTop: '0.6rem' }}>
            Con tu autorización, el correo electrónico y determinados metadatos de uso se
            registran únicamente para medir el uso y mejorar la aplicación.
            No recibirás comunicaciones comerciales.
          </p>
          <p style={{ marginTop: '0.6rem' }}>
            Responsable del tratamiento: <strong>Mario Andrés Jácome</strong>, autor de DocPilot.
          </p>
        </div>

        {/* Formulario de registro */}
        <form onSubmit={manejarEnvio} noValidate>

          {/* Campo de correo electrónico */}
          <div className="modal-campo">
            <label htmlFor="modal-correo" className="modal-label">
              Correo electrónico
            </label>
            <input
              id="modal-correo"
              type="email"
              className="modal-input"
              placeholder="tu.correo@ejemplo.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              disabled={enviando}
              autoComplete="email"
            />
          </div>

          {/* Checkbox de aceptación — obligatorio */}
          <label className="modal-checkbox-label">
            <input
              type="checkbox"
              className="modal-checkbox"
              checked={aceptado}
              onChange={(e) => setAceptado(e.target.checked)}
              disabled={enviando}
            />
            <span>
              He leído la información anterior, conozco la finalidad del tratamiento
              y autorizo el uso de mi correo electrónico y los metadatos de uso para
              medir el uso y mejorar la aplicación.
            </span>
          </label>

          {/* Mensaje de error de validación */}
          {error && (
            <p className="alerta-error" role="alert" style={{ marginTop: '0.75rem' }}>
              {error}
            </p>
          )}

          {/* Botones de acción */}
          <div className="modal-botones">
            <button
              type="submit"
              className="btn-primario"
              disabled={enviando}
            >
              {enviando ? 'Registrando...' : '✓ He leído, acepto y continúo'}
            </button>

            {/* Opción de saltar — el usuario puede acceder sin registrarse,
                pero el modal aparecerá de nuevo en la próxima visita */}
            <button
              type="button"
              className="btn-modal-saltar"
              onClick={onCerrar}
              disabled={enviando}
            >
              Saltar por ahora
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default ModalTratamientoDatos;
