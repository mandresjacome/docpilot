// Página "Acerca del Aplicativo" — Ficha Técnica del Desarrollo.
// Muestra la arquitectura, el stack tecnológico, el flujo de funcionamiento
// y los tipos de documentos soportados.

import React from 'react';

// ── Datos del stack tecnológico ──
const TECNOLOGIAS = [
  {
    categoria: 'Frontend',
    icono: '⚛️',
    items: [
      { nombre: 'React 18', descripcion: 'Biblioteca de interfaz de usuario — componentes funcionales y Hooks' },
      { nombre: 'Vite 6', descripcion: 'Herramienta de compilación y servidor de desarrollo ultrarrápido' },
      { nombre: 'CSS Custom Properties', descripcion: 'Sistema de diseño con variables CSS — identidad visual DocPilot' },
    ],
  },
  {
    categoria: 'Backend',
    icono: '🖥️',
    items: [
      { nombre: 'Node.js 18+', descripcion: 'Entorno de ejecución JavaScript del lado del servidor' },
      { nombre: 'Express 4', descripcion: 'Framework web minimalista para la API REST' },
      { nombre: 'Multer (memoryStorage)', descripcion: 'Recepción de archivos en buffer RAM — sin escritura en disco' },
      { nombre: 'pdf-lib', descripcion: 'Lectura de PDFs y división en bloques de 14 páginas, en memoria, para respetar el límite de Document AI' },
    ],
  },
  {
    categoria: 'Inteligencia Artificial',
    icono: '🤖',
    items: [
      { nombre: 'Google Cloud Document AI', descripcion: 'OCR de alta precisión para extracción de texto en documentos PDF e imágenes' },
      { nombre: 'Google Gemini 2.5 Flash', descripcion: 'Modelo de lenguaje para clasificación en dos fases, análisis profundo y sugerencias de respuesta' },
    ],
  },
  {
    categoria: 'Base de Datos',
    icono: '🗄️',
    items: [
      { nombre: 'Supabase (PostgreSQL)', descripcion: 'Almacena únicamente metadatos de uso: tipo de documento, tiempo de procesamiento, confirmación y, si el usuario la envía, su valoración y comentario. El contenido de los documentos no se guarda.' },
    ],
  },
  {
    categoria: 'Despliegue',
    icono: '🚀',
    items: [
      { nombre: 'Railway', descripcion: 'Plataforma de despliegue unificada — sirve el backend Node.js y el frontend React desde un único servicio' },
    ],
  },
];

// ── Pasos del flujo de procesamiento ──
const PASOS_FLUJO = [
  { num: '1', titulo: 'Selección', detalle: 'El usuario selecciona un documento (PDF, PNG, JPEG o TIFF) desde su dispositivo.' },
  { num: '2', titulo: 'Validación', detalle: 'El frontend valida tipo y tamaño antes de enviar. El backend vuelve a validar tamaño, tipo declarado, extensión, firma real y estructura del archivo.' },
  { num: '3', titulo: 'Buffer RAM', detalle: 'El archivo se carga en memoria RAM del servidor con Multer memoryStorage. Nunca toca el disco.' },
  { num: '4', titulo: 'OCR', detalle: 'Google Cloud Document AI procesa el buffer y extrae el texto con alta fidelidad. PDFs de más de 14 páginas se dividen automáticamente en memoria.' },
  { num: '5', titulo: 'Clasificación IA', detalle: 'Primera llamada liviana a Gemini: identifica la categoría del documento a partir de una muestra del inicio y del cuerpo del texto.' },
  { num: '6', titulo: 'Análisis IA', detalle: 'Segunda llamada a Gemini con el texto completo y un prompt especializado según la categoría detectada.' },
  { num: '7', titulo: 'Revisión HITL', detalle: 'El resultado llega al usuario. El sistema espera su revisión explícita antes de cualquier acción (Human-in-the-Loop).' },
  { num: '8', titulo: 'Confirmación', detalle: 'Solo tras la aprobación del usuario se registra la confirmación. Si el registro no puede guardarse, la aplicación lo indica en lugar de darlo por exitoso.' },
];

// ── Tipos de documentos soportados ──
const TIPOS_DOCUMENTOS = [
  { tipo: 'Contrato', icono: '📝', campos: 'Partes, objeto, valor, vigencia, obligaciones clave, cláusulas de riesgo, jurisdicción' },
  { tipo: 'Factura', icono: '🧾', campos: 'Emisor, receptor, número, fechas, subtotal, impuestos, total, conceptos, estado de pago' },
  { tipo: 'PQRS', icono: '📬', campos: 'Remitente, fecha radicación, motivo, solicitud concreta, plazo legal, fecha límite de respuesta' },
  { tipo: 'Documento Judicial', icono: '⚖️', campos: 'Autoridad, expediente, partes involucradas, orden principal, plazos, consecuencias' },
  { tipo: 'Carta', icono: '✉️', campos: 'Remitente, destinatario, fecha, asunto, solicitud o acción requerida' },
  { tipo: 'Cotización', icono: '💰', campos: 'Proveedor, cliente, vigencia oferta, ítems, total, condiciones de pago, tiempo de entrega' },
  { tipo: 'Otro', icono: '📄', campos: 'Análisis genérico para documentos institucionales, académicos o que no encajen en las categorías anteriores' },
];

const PaginaAcercaDe = () => {
  return (
    <main className="acerca-contenedor">

      {/* ── Encabezado ── */}
      <h1>Acerca del Aplicativo</h1>
      <p className="subtitulo-pagina">
        Ficha técnica del asistente de análisis documental con IA para Mipymes.
      </p>

      {/* ── Descripción general ── */}
      <section className="card">
        <h2>Descripción General</h2>
        <p className="acerca-parrafo">
          <strong>DocPilot</strong> es una aplicación web que integra{' '}
          <strong>Reconocimiento Óptico de Caracteres (OCR)</strong> e{' '}
          <strong>Inteligencia Artificial Generativa</strong> para apoyar a las micro,
          pequeñas y medianas empresas (mipymes) en la comprensión y
          respuesta de sus documentos. Los archivos se procesan temporalmente y no se
          almacenan de forma persistente en la infraestructura de DocPilot. Con
          autorización explícita, se registran únicamente metadatos de sesión para
          medir el uso y mejorar la aplicación.
        </p>
        <p className="acerca-parrafo">
          El sistema extrae automáticamente los datos relevantes de diferentes documentos
          empresariales, clasifica su contenido y genera sugerencias de respuesta o
          recomendaciones de acción que el usuario debe revisar y aprobar antes de
          utilizarlas. Además, incluye una <strong>encuesta voluntaria de utilidad</strong>{' '}
          posterior al análisis y un <strong>panel administrativo</strong> con métricas
          de uso.
        </p>
        <div className="acerca-datos-grid">
          <div className="acerca-dato-item">
            <span className="acerca-dato-label">Autor</span>
            <span className="acerca-dato-valor">Mario Andrés Jácome</span>
          </div>
          <div className="acerca-dato-item">
            <span className="acerca-dato-label">Año</span>
            <span className="acerca-dato-valor">2026</span>
          </div>
        </div>
      </section>

      {/* ── Tipos de documentos soportados ── */}
      <section className="card">
        <h2>Documentos que Analiza</h2>
        <p className="acerca-parrafo" style={{ marginBottom: '1.25rem' }}>
          El sistema reconoce diferentes categorías de documentos empresariales. Según
          el contenido identificado, extrae y organiza los campos relevantes que pueden
          apoyar la revisión y la toma de decisiones de una mipyme.
        </p>
        <div className="tipos-docs-lista">
          {TIPOS_DOCUMENTOS.map((t) => (
            <div key={t.tipo} className="tipo-doc-item">
              <span className="tipo-doc-icono">{t.icono}</span>
              <div className="tipo-doc-info">
                <strong className="tipo-doc-nombre">{t.tipo}</strong>
                <span className="tipo-doc-campos">{t.campos}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Arquitectura del sistema ── */}
      <section className="card">
        <h2>Arquitectura del Sistema</h2>
        <p className="acerca-parrafo" style={{ marginBottom: '1.5rem' }}>
          Arquitectura cliente-servidor de dos capas con integración a servicios externos
          de Google Cloud para OCR e IA.
        </p>
        <div className="diagrama-arquitectura">
          <div className="arq-nivel">
            <span className="arq-nivel-etiqueta">Cliente</span>
            <div className="arq-capa arq-capa-frontend">
              <span className="arq-icono">⚛️</span>
              <strong>Frontend React</strong>
              <small>Servido por Express · Railway</small>
            </div>
          </div>
          <div className="arq-flecha">
            <span className="arq-flecha-texto">HTTPS / REST</span>
            <span className="arq-flecha-linea">⟷</span>
          </div>
          <div className="arq-nivel">
            <span className="arq-nivel-etiqueta">Servidor</span>
            <div className="arq-capa arq-capa-backend">
              <span className="arq-icono">🖥️</span>
              <strong>Backend Node.js</strong>
              <small>Express · Railway</small>
            </div>
          </div>
          <div className="arq-flecha">
            <span className="arq-flecha-texto">Google APIs</span>
            <span className="arq-flecha-linea">⟷</span>
          </div>
          <div className="arq-nivel">
            <span className="arq-nivel-etiqueta">Servicios IA</span>
            <div className="arq-servicios-columna">
              <div className="arq-capa arq-capa-ocr">
                <span className="arq-icono">📄</span>
                <strong>Document AI</strong>
                <small>OCR · Google Cloud</small>
              </div>
              <div className="arq-capa arq-capa-gemini">
                <span className="arq-icono">✨</span>
                <strong>Gemini 2.5 Flash</strong>
                <small>IA Generativa · Google</small>
              </div>
            </div>
          </div>
        </div>
        <div className="arq-leyenda">
          <span className="arq-leyenda-icono">🔒</span>
          <span>
            <strong>Sin persistencia de documentos:</strong> los archivos se procesan en la memoria
            del servidor y no se guardan en disco ni en base de datos de DocPilot. Para analizarlos
            se envían a Google Document AI (archivo) y Gemini (texto extraído), servicios de terceros
            fuera del control de esta aplicación.
          </span>
        </div>
      </section>

      {/* ── Flujo de procesamiento ── */}
      <section className="card">
        <h2>Flujo de Procesamiento</h2>
        <p className="acerca-parrafo" style={{ marginBottom: '1.5rem' }}>
          Cada documento pasa por las siguientes etapas, aplicando el principio{' '}
          <strong>Human-in-the-Loop (HITL)</strong>: la IA sugiere, el usuario decide.
        </p>
        <div className="flujo-contenedor">
          {PASOS_FLUJO.map((paso, indice) => (
            <div key={paso.num} className="flujo-paso">
              <div className="flujo-numero">{paso.num}</div>
              <div className="flujo-linea-vertical">
                {indice < PASOS_FLUJO.length - 1 && <div className="flujo-conector" />}
              </div>
              <div className="flujo-info">
                <strong className="flujo-titulo">{paso.titulo}</strong>
                <p className="flujo-detalle">{paso.detalle}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stack tecnológico ── */}
      <section className="card">
        <h2>Stack Tecnológico</h2>
        <div className="stack-grid">
          {TECNOLOGIAS.map((grupo) => (
            <div key={grupo.categoria} className="stack-grupo">
              <div className="stack-grupo-titulo">
                <span>{grupo.icono}</span>
                <strong>{grupo.categoria}</strong>
              </div>
              <ul className="stack-lista">
                {grupo.items.map((item) => (
                  <li key={item.nombre} className="stack-item">
                    <span className="stack-nombre">{item.nombre}</span>
                    <span className="stack-descripcion">{item.descripcion}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Principios de diseño ── */}
      <section className="card">
        <h2>Principios de Diseño</h2>
        <div className="principios-grid">
          <div className="principio-item">
            <span className="principio-icono">🔒</span>
            <strong>Sin persistencia de documentos</strong>
            <p>Los documentos se procesan en la memoria del servidor y no se guardan en disco ni en base de datos de DocPilot. Para el análisis se envían a Google Document AI y Gemini, que son servicios de terceros.</p>
          </div>
          <div className="principio-item">
            <span className="principio-icono">👤</span>
            <strong>Human-in-the-Loop</strong>
            <p>El sistema no actúa de forma autónoma. Siempre requiere revisión y aprobación explícita del usuario.</p>
          </div>
          <div className="principio-item">
            <span className="principio-icono">🛡️</span>
            <strong>Privacidad por Diseño</strong>
            <p>No se solicita correo ni datos de contacto. Los metadatos de uso se registran únicamente con consentimiento explícito, a través del aviso de tratamiento de datos (Ley 1581 de 2012).</p>
          </div>
          <div className="principio-item">
            <span className="principio-icono">📊</span>
            <strong>Métricas de Uso</strong>
            <p>Solo se guardan metadatos: tipo de documento, tiempo de análisis, confirmación y, si el usuario lo decide, su valoración y comentario. El contenido de los documentos no se guarda.</p>
          </div>
        </div>
      </section>

    </main>
  );
};

export default PaginaAcercaDe;

