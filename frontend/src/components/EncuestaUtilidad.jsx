// Componente de encuesta de utilidad post-confirmación.
// Aparece DESPUÉS de que el usuario confirma el análisis (cierre del ciclo HITL),
// ANTES de limpiar la sesión. Recoge 3 datos clave para el producto de investigación:
//   1. Valoración de 1 a 5 estrellas (utilidad percibida)
//   2. Tiempo estimado ahorrado (ROI cuantificable)
//   3. Comentario libre opcional (evidencia cualitativa para el artículo)
//
// El componente notifica al padre cuando el usuario envía o salta la encuesta.
// En ningún caso bloquea el flujo — la encuesta es voluntaria.

import React, { useState } from 'react';

// Mapa de tipo de documento detectado → prefijo de código de validación.
// Permite pre-llenar el campo de código según la categoría que Gemini asignó,
// reduciendo errores de tipeo y estandarizando los códigos del banco documental.
const PREFIJOS_TIPO = {
  contrato:           'CON',
  factura:            'FAC',
  cotizacion:         'COT',
  pqrs:               'PQR',
  carta:              'CAR',
  documento_judicial: 'JUD',
  otro:               'OTR',
};

// Extrae el prefijo de código a partir del tipo detectado por Gemini.
// Gemini a veces devuelve descripciones largas (ej: "cotizacion — servicios de transporte"),
// por eso se compara con includes() en lugar de igualdad exacta.
const obtenerPrefijo = (tipo) => {
  if (!tipo) return '';
  const normalizado = tipo.toLowerCase();
  for (const [clave, prefijo] of Object.entries(PREFIJOS_TIPO)) {
    if (normalizado.includes(clave)) return prefijo;
  }
  return 'OTR';
};

// Opciones de tiempo ahorrado — valores fijos para facilitar la agregación en el dashboard.
// Se usan etiquetas descriptivas en lugar de números para que el usuario entienda
// sin necesidad de instrucciones adicionales.
const OPCIONES_TIEMPO = [
  { valor: 'menos_5min',  etiqueta: 'Menos de 5 min' },
  { valor: '5_15min',     etiqueta: '5 – 15 min' },
  { valor: '15_30min',    etiqueta: '15 – 30 min' },
  { valor: 'mas_30min',   etiqueta: 'Más de 30 min' },
];

/**
 * EncuestaUtilidad
 * Props:
 *   - registroId:     string UUID del registro en Supabase (para actualizar el mismo registro)
 *   - tipoDocumento:  string categoría detectada por Gemini (para pre-llenar el prefijo de código)
 *   - onFinalizar:    función del padre que se llama al enviar o saltar la encuesta
 */
const EncuestaUtilidad = ({ registroId, tipoDocumento, onFinalizar }) => {
  // Código de validación del documento — se pre-llena con el prefijo según el tipo detectado.
  // Formato esperado: COT-R-001 (prefijo-origen-número). El usuario completa R/S y el número.
  const [codigoDocumento, setCodigoDocumento] = useState(() => {
    const prefijo = obtenerPrefijo(tipoDocumento);
    // Si hay prefijo reconocido, pre-llenar con él para guiar al usuario
    return prefijo ? `${prefijo}-` : '';
  });

  // Valoración de 1 a 5 estrellas — null significa que el usuario no ha seleccionado aún
  const [estrellas, setEstrellas] = useState(null);

  // Estrella sobre la que el cursor está pasando — para el efecto hover visual
  const [estrellaHover, setEstrellaHover] = useState(null);

  // Opción de tiempo ahorrado seleccionada
  const [tiempoAhorrado, setTiempoAhorrado] = useState(null);

  // Comentario libre del usuario (máximo 200 caracteres)
  const [comentario, setComentario] = useState('');

  // Estado de envío para deshabilitar el botón y mostrar feedback
  const [enviando, setEnviando] = useState(false);

  // Mensaje de error si el envío falla
  const [error, setError] = useState(null);

  /**
   * manejarEnvio — envía la valoración al backend y luego llama a onFinalizar.
   * Si el envío falla por error de red, muestra el error pero no bloquea el flujo.
   */
  const manejarEnvio = async () => {
    // La encuesta requiere al menos las estrellas para ser válida
    if (!estrellas) {
      setError('Por favor selecciona una valoración de estrellas antes de enviar.');
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '/api';

      // Si el usuario ingresó un código de documento, se empaqueta al inicio del comentario
      // con el formato [COT-R-001] para poder identificar el registro en la ficha de validación.
      // Esto evita necesitar una columna nueva en Supabase mientras el panel no esté accesible.
      const codigoLimpio = codigoDocumento.trim().toUpperCase();
      const comentarioFinal = codigoLimpio
        ? `[${codigoLimpio}] ${comentario.trim()}`.trim().slice(0, 200)
        : comentario.trim().slice(0, 200) || null;

      const respuesta = await fetch(`${baseUrl}/documentos/encuesta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registroId,
          estrellas,
          tiempo_ahorrado: tiempoAhorrado,
          comentario: comentarioFinal,
        }),
      });

      if (!respuesta.ok) {
        // Si el backend falla, lo registramos pero no bloqueamos al usuario
        console.warn('[Encuesta] Error al enviar la valoración, continuando de todas formas.');
      }
    } catch (err) {
      // Error de red — no bloqueamos el flujo, la encuesta es opcional
      console.warn('[Encuesta] Error de red al enviar:', err.message);
    } finally {
      setEnviando(false);
      // Independientemente del resultado, finalizar la sesión
      onFinalizar();
    }
  };

  /**
   * manejarSaltar — permite al usuario omitir la encuesta sin enviar datos.
   * El registro en Supabase quedará sin valoración, lo que es válido.
   */
  const manejarSaltar = () => {
    onFinalizar();
  };

  // Determinar qué estrella mostrar como activa (hover tiene prioridad sobre selección)
  const estrellasActivas = estrellaHover || estrellas || 0;

  return (
    <section className="card encuesta-card" aria-label="Encuesta de utilidad">
      <h2>¿Qué tan útil fue este análisis?</h2>
      <p className="subtitulo-encuesta">
        Tu opinión ayuda a mejorar el sistema. La encuesta es completamente voluntaria.
      </p>

      {/* ── Código de documento (piloto de validación) ── */}
      {/* Campo opcional para identificar el documento en la ficha de evaluación del banco documental.
          Se pre-llena con el prefijo del tipo detectado. Formato: COT-R-001, FAC-S-002, etc.
          El código se guarda al inicio del comentario entre corchetes para no requerir
          cambios de esquema en Supabase mientras el panel administrativo no esté accesible. */}
      <div className="comentario-container">
        <label htmlFor="codigo-documento" className="pregunta-encuesta">
          Código del documento{' '}
          <span className="texto-opcional">(piloto — ej: COT-R-001, FAC-S-002)</span>
        </label>
        <input
          id="codigo-documento"
          type="text"
          className="input-codigo-documento"
          value={codigoDocumento}
          onChange={(e) => setCodigoDocumento(e.target.value.slice(0, 20))}
          placeholder="COT-R-001"
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="texto-opcional" style={{ fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
          Formato: PREFIJO-ORIGEN-NÚMERO &nbsp;·&nbsp; R = real &nbsp;·&nbsp; S = sintético
        </span>
      </div>

      {/* ── Selector de estrellas ── */}
      <div className="estrellas-container" role="group" aria-label="Valoración de 1 a 5 estrellas">
        {[1, 2, 3, 4, 5].map((numero) => (
          <button
            key={numero}
            type="button"
            className={`estrella-btn ${numero <= estrellasActivas ? 'estrella-activa' : ''}`}
            onClick={() => setEstrellas(numero)}
            onMouseEnter={() => setEstrellaHover(numero)}
            onMouseLeave={() => setEstrellaHover(null)}
            aria-label={`${numero} estrella${numero > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>
      {estrellas && (
        <p className="etiqueta-estrellas">
          {estrellas === 1 && 'Nada útil'}
          {estrellas === 2 && 'Poco útil'}
          {estrellas === 3 && 'Útil'}
          {estrellas === 4 && 'Muy útil'}
          {estrellas === 5 && '¡Excelente!'}
        </p>
      )}

      {/* ── Tiempo ahorrado ── */}
      <div className="tiempo-ahorrado-container">
        <p className="pregunta-encuesta">¿Cuánto tiempo te habría tomado analizar este documento manualmente, sin esta herramienta?</p>
        <div className="opciones-tiempo" role="group" aria-label="Opciones de tiempo ahorrado">
          {OPCIONES_TIEMPO.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              className={`opcion-tiempo-btn ${tiempoAhorrado === valor ? 'opcion-tiempo-activa' : ''}`}
              onClick={() => setTiempoAhorrado(valor)}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* ── Comentario opcional ── */}
      <div className="comentario-container">
        <label htmlFor="comentario-encuesta" className="pregunta-encuesta">
          ¿Tienes alguna sugerencia para mejorar la herramienta? <span className="texto-opcional">(opcional, máx. 200 caracteres)</span>
        </label>
        <textarea
          id="comentario-encuesta"
          className="textarea-comentario"
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, 200))}
          placeholder="¿Qué mejorarías? ¿En qué te ayudó más?"
          rows={3}
          maxLength={200}
        />
        <span className="contador-caracteres">{comentario.length}/200</span>
      </div>

      {/* ── Error de validación ── */}
      {error && <p className="error-encuesta" role="alert">{error}</p>}

      {/* ── Acciones ── */}
      <div className="acciones-encuesta">
        <button
          type="button"
          className="btn-primario"
          onClick={manejarEnvio}
          disabled={enviando}
        >
          {enviando ? 'Enviando...' : 'Enviar valoración'}
        </button>
        <button
          type="button"
          className="btn-secundario"
          onClick={manejarSaltar}
          disabled={enviando}
        >
          Saltar
        </button>
      </div>
    </section>
  );
};

export default EncuestaUtilidad;
