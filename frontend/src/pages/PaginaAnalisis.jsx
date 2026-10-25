// Página principal: Análisis de Documentos.
// Orquesta el flujo completo de la UI:
//   1. El usuario selecciona y sube un documento.
//   2. Se muestra el resultado del análisis de la IA (OCR + Gemini).
//   3. El usuario revisa y confirma la acción (Human-in-the-Loop).
//   4. Se muestra la encuesta de utilidad post-confirmación (voluntaria).
//   5. Pantalla de éxito con opción de analizar otro documento.

import React, { useState } from 'react';
import FormularioDocumento from '../components/FormularioDocumento';
import VistaDividida from '../components/VistaDividida';
import EncuestaUtilidad from '../components/EncuestaUtilidad';
import documentoService from '../services/documento.service';

const PaginaAnalisis = ({ onNuevaSesion }) => {
  // Estado de carga: controla el spinner y deshabilita botones durante peticiones
  const [cargando, setCargando] = useState(false);

  // Estado de error: mensaje visible al usuario si algo falla
  const [error, setError] = useState(null);

  // Aviso no bloqueante: el documento se analizó pero el registro de uso no pudo guardarse.
  // Se muestra para no dar por hecho que la confirmación y la encuesta quedarán registradas.
  const [advertencia, setAdvertencia] = useState(null);

  // Estado del resultado: datos devueltos por el backend tras el análisis
  const [resultado, setResultado] = useState(null);

  // Estado de confirmación: indica si el usuario ya aprobó el resultado
  const [confirmado, setConfirmado] = useState(false);

  // Controla si la encuesta de utilidad post-confirmación está visible.
  // Se activa DESPUÉS de que el usuario confirma (HITL) y ANTES de limpiar la sesión.
  const [mostrarEncuesta, setMostrarEncuesta] = useState(false);

  // ID del registro insertado en Supabase al analizar el documento.
  // Se usa para actualizar el mismo registro con la confirmación y la encuesta.
  const [registroId, setRegistroId] = useState(null);

  // Tiempo real de análisis medido en el cliente (en segundos).
  // Se calcula desde que el usuario envía el formulario hasta que llega el resultado.
  // Incluye tiempo de red + procesamiento en servidor — es el tiempo real de espera.
  const [tiempoAnalisis, setTiempoAnalisis] = useState(null);

  // Referencia al archivo seleccionado — necesario para la vista dividida.
  // Se guarda en estado para mantenerlo disponible mientras el usuario revisa el análisis.
  const [archivoActual, setArchivoActual] = useState(null);

  /**
   * manejarEnvio — se ejecuta cuando el usuario envía el formulario con su archivo.
   * Reinicia todos los estados y llama al servicio de análisis.
   */
  const manejarEnvio = async (archivo) => {
    // Limpiar estados previos antes de iniciar una nueva petición
    setError(null);
    setAdvertencia(null);
    setResultado(null);
    setConfirmado(false);
    setCargando(true);
    setTiempoAnalisis(null);
    // Guardar el archivo para mostrarlo en la vista dividida durante la revisión
    setArchivoActual(archivo);

    // Marca de tiempo de inicio para medir el tiempo total de espera del usuario
    const inicioAnalisis = Date.now();

    try {
      const datos = await documentoService.analizarDocumento(archivo);
      // Calcular y guardar el tiempo transcurrido desde el envío hasta recibir el resultado
      setTiempoAnalisis(((Date.now() - inicioAnalisis) / 1000).toFixed(1));
      // Guardar el resultado para que el usuario lo revise (HITL)
      setResultado(datos);
      // Guardar el ID del registro de Supabase para la encuesta y confirmación
      if (datos.registroId) setRegistroId(datos.registroId);
      // Si el análisis fue exitoso pero el registro de uso no se guardó, avisar al usuario
      if (datos.registro && datos.registro.guardado === false) {
        setAdvertencia(datos.registro.advertencia);
      }
    } catch (err) {
      setError(err.message || 'Ocurrió un error al analizar el documento.');
    } finally {
      // Siempre detener el indicador de carga, ocurra lo que ocurra
      setCargando(false);
    }
  };

  /**
   * manejarConfirmacion — se ejecuta SOLO si el usuario aprueba explícitamente el resultado.
   * Llama al endpoint de confirmación del backend y marca el flujo como completado.
   * Este es el punto de cierre del ciclo Human-in-the-Loop.
   */
  const manejarConfirmacion = async () => {
    setCargando(true);
    setError(null);

    try {
      // Enviar el análisis aprobado al backend para registrar la confirmación del usuario.
      // Se pasa el registroId para que el backend actualice confirmado=true en Supabase.
      await documentoService.confirmarAccion(resultado, registroId);
      // Sin registroId (el registro de uso inicial no se guardó) la valoración no tendría
      // dónde persistirse, así que se omite la encuesta en lugar de pedir datos que se perderían.
      if (registroId) {
        // Transición al paso de encuesta — no mostrar éxito aún, primero la valoración
        setMostrarEncuesta(true);
      } else {
        setConfirmado(true);
      }
    } catch (err) {
      setError(err.message || 'Ocurrió un error al confirmar la acción.');
    } finally {
      setCargando(false);
    }
  };

  /**
   * manejarFinalizarEncuesta — se ejecuta cuando el usuario envía o salta la encuesta.
   * Transición final: mostrar la pantalla de éxito y limpiar el estado de encuesta.
   */
  const manejarFinalizarEncuesta = () => {
    setMostrarEncuesta(false);
    setConfirmado(true);
  };

  /**
   * reiniciar — restablece todos los estados al valor inicial.
   * Permite al usuario analizar un nuevo documento sin recargar la página.
   * Se llama desde el botón "Analizar otro documento" en la pantalla de éxito.
   */
  const reiniciar = () => {
    setConfirmado(false);
    setMostrarEncuesta(false);
    setRegistroId(null);
    setResultado(null);
    setTiempoAnalisis(null);
    setError(null);
    setAdvertencia(null);
    setCargando(false);
    // Limpiar el archivo para liberar la referencia en memoria del navegador
    setArchivoActual(null);
    // Notificar al padre que comienza una nueva sesión de análisis.
    // Esto hace que el modal de tratamiento de datos vuelva a aparecer,
    // registrando un nuevo ciclo de consentimiento por cada documento procesado.
    if (onNuevaSesion) onNuevaSesion();
  };

  return (
    <main>
      {/* Encabezado y formulario — limitados a 720 px para legibilidad óptima */}
      <div className="analisis-form-area">
        {/* Título e introducción de la sección */}
        <h1>Análisis de Documentos</h1>
        <p className="subtitulo-pagina">
          Sube un documento y la IA extraerá y estructurará su información automáticamente.
        </p>

        {/* Formulario de carga: se oculta una vez confirmado o cuando la encuesta está activa */}
        {!confirmado && !mostrarEncuesta && (
          <FormularioDocumento onEnviar={manejarEnvio} cargando={cargando} />
        )}

        {/* Indicador de carga mientras el backend procesa el documento */}
        {cargando && (
          <p className="spinner-texto">Procesando documento, por favor espere...</p>
        )}

        {/* Mensaje de error visible para el usuario */}
        {error && (
          <p className="alerta-error" role="alert">{error}</p>
        )}

        {/* Aviso: análisis correcto, pero el registro de uso no se guardó */}
        {advertencia && !confirmado && (
          <p className="alerta-advertencia" role="status">{advertencia}</p>
        )}

        {/* Mensaje de éxito tras la confirmación del usuario */}
        {confirmado && (
          <div className="alerta-exito" role="status">
            <div className="alerta-exito-texto">
              <strong>✓ ¡Confirmado!</strong> El análisis fue revisado y aprobado correctamente.
            </div>
            <button className="btn-nuevo-documento" onClick={reiniciar}>
              Analizar otro documento
            </button>
          </div>
        )}
      </div>

      {/* Vista dividida: documento + análisis.
          Se muestra cuando hay resultado, no se ha confirmado y no está la encuesta. */}
      {resultado && !confirmado && !mostrarEncuesta && (
        <VistaDividida
          archivo={archivoActual}
          resultado={resultado}
          onConfirmar={manejarConfirmacion}
          cargando={cargando}
          tiempoAnalisis={tiempoAnalisis}
        />
      )}

      {/* Encuesta de utilidad — aparece después de confirmar, antes de limpiar la sesión.
          El registroId permite actualizar el mismo registro en Supabase (no crea uno nuevo). */}
      {mostrarEncuesta && (
        <div className="analisis-form-area">
          <EncuestaUtilidad
            registroId={registroId}
            tipoDocumento={resultado?._categoria}
            onFinalizar={manejarFinalizarEncuesta}
          />
        </div>
      )}
    </main>
  );
};

export default PaginaAnalisis;
