// Modal de Tratamiento de Datos.
// Aparece la primera vez que el usuario accede al aplicativo.
// Propósito: informar sobre el tratamiento de datos conforme a la Ley 1581 de 2012
// (Colombia) y recoger la aceptación explícita.
//
// PRIVACIDAD: el modal NO pide ni recoge datos personales (ni correo ni nombre).
// Solo registra que se aceptó el tratamiento: el backend deja una línea de log sin
// datos personales y el cliente guarda únicamente una bandera booleana en localStorage
// ('docpilot_consentimiento_v1') para no mostrar el modal en cada visita del mismo navegador.

import React, { useState } from 'react';

/**
 * ModalTratamientoDatos
 * Props:
 *   - onAceptar: función del padre que se llama cuando el usuario acepta el tratamiento.
 *   - onCerrar: función del padre que se llama si el usuario decide saltar el formulario.
 */
const ModalTratamientoDatos = ({ onAceptar, onCerrar }) => {
  // Control del checkbox de aceptación de la política de tratamiento
  const [aceptado, setAceptado] = useState(false);

  // Estado de carga mientras se envía el registro al backend
  const [enviando, setEnviando] = useState(false);

  // Mensaje de error visible al usuario si algo falla en la validación
  const [error, setError] = useState(null);

  /**
   * manejarEnvio — valida la aceptación y notifica al backend.
   * El backend solo genera un log sin datos personales, no almacena nada.
   */
  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    setError(null);

    // El checkbox de aceptación es obligatorio por política de tratamiento de datos
    if (!aceptado) {
      setError('Debes aceptar la política de tratamiento de datos para continuar.');
      return;
    }

    setEnviando(true);

    try {
      // Determinar la URL del backend según el entorno de ejecución
      const baseUrl = import.meta.env.VITE_API_URL || '';

      // Registrar la aceptación — el cuerpo va vacío porque no se envían datos personales
      const respuesta = await fetch(`${baseUrl}/api/visitas/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
      // Notificar al componente padre que el usuario aceptó
      onAceptar();
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
            Los documentos que cargues se procesan en la memoria del servidor de DocPilot y
            <strong> no se guardan en archivos ni en base de datos</strong>. Para analizarlos, el
            archivo se envía a Google Cloud Document AI (extracción de texto) y el texto extraído
            a Google Gemini (análisis con IA); ambos son servicios de terceros con sus propias
            condiciones de tratamiento.
          </p>
          <p style={{ marginTop: '0.6rem' }}>
            Con tu autorización se registran únicamente metadatos de uso: tipo de documento,
            tiempo de procesamiento, si confirmaste el análisis y, si la completas, tu valoración
            y comentario. No se solicita tu correo ni se registra el contenido del documento.
            Evita incluir datos personales en el comentario. La plataforma de despliegue puede
            conservar registros técnicos de acceso.
          </p>
          <p style={{ marginTop: '0.6rem' }}>
            Responsable del tratamiento: <strong>Mario Andrés Jácome</strong>, autor de DocPilot.
          </p>
        </div>

        {/* Formulario de aceptación */}
        <form onSubmit={manejarEnvio} noValidate>

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
              y autorizo el registro de los metadatos de uso para medir el uso y
              mejorar la aplicación.
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
