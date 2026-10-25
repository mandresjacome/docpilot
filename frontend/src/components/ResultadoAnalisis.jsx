// Componente para mostrar el resultado del análisis de la IA.
// Responsabilidad: presentar de forma legible los datos estructurados
// devueltos por Gemini y ofrecer al usuario el botón de confirmación (HITL).
// NUNCA ejecuta acciones finales por sí solo — solo notifica al padre.
//
// RENDERIZADO DINÁMICO DE DATOS RELEVANTES:
// Gemini devuelve campos distintos según el tipo de documento (un contrato
// tiene 'partes', 'vigencia', etc.; una factura tiene 'total', 'vencimiento').
// En lugar de hardcodear cada campo, se itera sobre las claves del objeto
// datosRelevantes para renderizar automáticamente lo que venga del backend.

import React from 'react';

// Convierte una clave camelCase o snake_case en texto legible con espacios.
// Ejemplo: "valorYPago" → "Valor Y Pago" | "fecha_emision" → "Fecha Emision"
const formatearEtiqueta = (clave) => {
  return clave
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Convierte cualquier valor a string seguro para renderizar en React.
// Con temperature:0, Gemini puede devolver arrays u objetos en campos como
// "itemsCotizados". Renderizar un objeto directamente causa pantalla en blanco.
const valorATexto = (valor) => {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  // Si el array contiene objetos, serializar cada elemento para evitar [object Object]
  if (Array.isArray(valor)) {
    return valor
      .map((item) =>
        item !== null && typeof item === 'object'
          ? Object.entries(item)
              .map(([k, v]) => `${formatearEtiqueta(k)}: ${v}`)
              .join(' | ')
          : String(item)
      )
      .join(' · ');
  }
  if (typeof valor === 'object') return JSON.stringify(valor, null, 2);
  return String(valor);
};

/**
 * ResultadoAnalisis
 * Props:
 *   - datos: objeto del backend con forma { mensaje, datos: { tipo, resumen, datosRelevantes, sugerenciaRespuesta, alertas } }
 *   - onConfirmar: función del componente padre que ejecuta la acción final tras revisión del usuario
 *   - cargando: boolean que deshabilita el botón mientras hay una petición en curso
 */
const ResultadoAnalisis = ({ datos, onConfirmar, cargando, tiempoAnalisis }) => {
  // Extraer el análisis de Gemini del objeto de respuesta del backend
  const analisis = datos.datos || {};

  // Determinar si el tipo de documento requiere una respuesta hacia alguien
  // o si es solo una recomendación de acción interna para la Mipyme.
  // Contratos, PQRS, cartas y documentos judiciales tienen destinatario;
  // facturas, cotizaciones y tipos desconocidos son de gestión interna.
  const TIPOS_CON_RESPUESTA = ['contrato', 'pqrs', 'carta', 'documento_judicial'];
  const tipoNormalizado = (analisis.tipo || '').toLowerCase();
  const requiereRespuesta = TIPOS_CON_RESPUESTA.some((t) => tipoNormalizado.includes(t));

  // Textos que cambian según si hay destinatario o no
  const etiquetaSugerencia = requiereRespuesta
    ? 'Sugerencia de respuesta'
    : 'Recomendación de acción';

  const textoBtnConfirmar = requiereRespuesta
    ? '📋 Copiar sugerencia de respuesta y finalizar'
    : '✅ Entendido, finalizar análisis';

  // Copia la sugerencia de respuesta al portapapeles y luego finaliza el flujo.
  // El try/catch garantiza que si el navegador bloquea el acceso al portapapeles
  // (por ejemplo en contexto no seguro), el flujo igual termina correctamente.
  const copiarYFinalizar = async () => {
    try {
      const texto = analisis.sugerenciaRespuesta || '';
      if (texto) await navigator.clipboard.writeText(texto);
    } catch (e) {
      // No bloquear el flujo si el portapapeles falla
    }
    onConfirmar();
  };

  // Obtener las claves de datosRelevantes, excluyendo claves internas del backend
  // (_categoria es metadata interna que no se muestra al usuario)
  const camposDatosRelevantes = analisis.datosRelevantes
    ? Object.entries(analisis.datosRelevantes).filter(([clave]) => !clave.startsWith('_'))
    : [];

  return (
    <section className="card" aria-label="Resultado del análisis">
      <h2>Resultado del Análisis</h2>

      {/* Tiempo de procesamiento — se muestra solo cuando está disponible */}
      {tiempoAnalisis && (
        <p className="tiempo-analisis">
          ⏱ Procesado en <strong>{tiempoAnalisis} s</strong>
        </p>
      )}

      {/* Tipo de documento detectado por Gemini */}
      {analisis.tipo && (
        <div className="ficha-resultado">
          <h3>Tipo de documento</h3>
          <span className="badge-tipo">{analisis.tipo}</span>
        </div>
      )}

      {/* Resumen del contenido del documento */}
      {analisis.resumen && (
        <div className="ficha-resultado">
          <h3>Resumen</h3>
          <p>{analisis.resumen}</p>
        </div>
      )}

      {/* Alertas — se muestran con énfasis visual antes de los datos,
          porque representan información urgente que la Mipyme debe atender */}
      {analisis.alertas && analisis.alertas !== 'null' && (
        <div className="ficha-resultado ficha-alerta">
          <h3>⚠ Alertas</h3>
          <p>{analisis.alertas}</p>
        </div>
      )}

      {/* Datos relevantes — renderizado dinámico.
          Cada tipo de documento tiene campos distintos (partes, valor, vigencia, etc.).
          Se itera sobre las claves del objeto para renderizar lo que venga del backend,
          sin necesidad de actualizar el frontend cuando se agrega un nuevo tipo. */}
      {camposDatosRelevantes.length > 0 && (
        <div className="ficha-resultado">
          <h3>Datos relevantes</h3>
          <dl className="lista-datos">
            {camposDatosRelevantes.map(([clave, valor]) => {
              // Convertir el valor a texto seguro antes de renderizar.
              // Gemini puede devolver arrays u objetos en campos como "itemsCotizados".
              const textoValor = valorATexto(valor);
              if (!textoValor || textoValor === 'null') return null;
              return (
                <div key={clave} className="dato-item">
                  <dt>{formatearEtiqueta(clave)}</dt>
                  <dd>{textoValor}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/* Sugerencia de respuesta o recomendación de acción según el tipo de documento.
          La etiqueta cambia dinámicamente para reflejar si hay un destinatario o no.
          Este es el insumo principal del flujo HITL: el usuario lee la sugerencia
          y decide si la aprueba antes de ejecutar cualquier acción. */}
      {analisis.sugerenciaRespuesta && analisis.sugerenciaRespuesta !== 'null' && (
        <div className="ficha-resultado">
          <h3>{etiquetaSugerencia} <span className="badge-ia">(IA — revise antes de confirmar)</span></h3>
          <p>{analisis.sugerenciaRespuesta}</p>
        </div>
      )}

      {/* Botón de confirmación HITL:
          Solo el usuario puede disparar la acción final.
          El texto es explícito sobre lo que ocurrirá al confirmar. */}
      <button
        className="btn-confirmar"
        onClick={copiarYFinalizar}
        disabled={cargando}
      >
        {textoBtnConfirmar}
      </button>
    </section>
  );
};

export default ResultadoAnalisis;
