// Componente de vista dividida: previsualización del documento + resultado del análisis.
// Muestra los dos paneles en pantalla al mismo tiempo para que el usuario pueda
// comparar visualmente el documento original con el análisis generado por la IA.
//
// Manejo del objectURL:
//   - Se crea con URL.createObjectURL() solo cuando el componente monta y hay archivo.
//   - Se revoca en el cleanup del useEffect para liberar memoria del navegador.
//   - Esto garantiza que el archivo en RAM no quede referenciado indefinidamente.

import React, { useEffect, useState } from 'react';
import ResultadoAnalisis from './ResultadoAnalisis';

/**
 * VistaDividida
 * Props:
 *   - archivo: objeto File del documento seleccionado por el usuario
 *   - resultado: datos del análisis devueltos por el backend
 *   - onConfirmar: función del padre que maneja la confirmación HITL
 *   - cargando: boolean para deshabilitar acciones durante peticiones
 */
const VistaDividida = ({ archivo, resultado, onConfirmar, cargando, tiempoAnalisis }) => {
  // URL temporal en memoria del navegador para previsualizar el archivo
  const [urlPreview, setUrlPreview] = useState(null);

  // Determina si el tipo de archivo puede mostrarse en el navegador
  const esPDF = archivo?.type === 'application/pdf';
  const esImagen = archivo?.type?.startsWith('image/') && archivo?.type !== 'image/tiff';
  const esTIFF = archivo?.type === 'image/tiff';

  useEffect(() => {
    // Generar la URL de previsualización solo si el archivo existe
    if (!archivo) return;

    const url = URL.createObjectURL(archivo);
    setUrlPreview(url);

    // Cleanup: revocar la URL cuando el componente se desmonte o el archivo cambie.
    // Esto libera la referencia en memoria del navegador.
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [archivo]);

  return (
    <div className="vista-dividida-contenedor">

      {/* ── Panel izquierdo: previsualización del documento ── */}
      <div className="panel-documento">
        <div className="panel-cabecera">
          <span className="panel-etiqueta">📄 Documento original</span>
          {archivo && (
            <span className="panel-nombre-archivo" title={archivo.name}>
              {archivo.name}
            </span>
          )}
        </div>

        <div className="panel-preview">
          {/* PDF — se muestra en un iframe nativo del navegador */}
          {esPDF && urlPreview && (
            <iframe
              src={urlPreview}
              title={`Previsualización: ${archivo.name}`}
              className="preview-iframe"
              aria-label="Previsualización del documento PDF"
            />
          )}

          {/* Imágenes (PNG, JPEG) — se muestran directamente */}
          {esImagen && urlPreview && (
            <div className="preview-imagen-contenedor">
              <img
                src={urlPreview}
                alt={`Previsualización: ${archivo.name}`}
                className="preview-imagen"
              />
            </div>
          )}

          {/* TIFF — el navegador no puede renderizarlo; mostrar aviso informativo */}
          {esTIFF && (
            <div className="preview-no-disponible">
              <span className="preview-no-disponible-icono">🖼️</span>
              <p>
                Los archivos <strong>TIFF</strong> no pueden previsualizarse
                directamente en el navegador.
              </p>
              <p>El análisis se realizó correctamente. Puedes revisar el resultado a la derecha.</p>
            </div>
          )}

          {/* Caso genérico — no debería ocurrir dado el validador del formulario */}
          {!esPDF && !esImagen && !esTIFF && (
            <div className="preview-no-disponible">
              <span className="preview-no-disponible-icono">❓</span>
              <p>No hay previsualización disponible para este tipo de archivo.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: resultado del análisis de la IA ── */}
      <div className="panel-analisis">
        <div className="panel-cabecera">
          <span className="panel-etiqueta">✨ Análisis de la IA</span>
        </div>
        <div className="panel-analisis-contenido">
          <ResultadoAnalisis
            datos={resultado}
            onConfirmar={onConfirmar}
            cargando={cargando}
            tiempoAnalisis={tiempoAnalisis}
          />
        </div>
      </div>

    </div>
  );
};

export default VistaDividida;
