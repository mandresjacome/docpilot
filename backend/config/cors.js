// Configuración de CORS para desarrollo local.
// En producción Express sirve el frontend desde el mismo origen, por lo que CORS no se habilita
// (ver app.js). En desarrollo, el proxy de Vite evita CORS; esta configuración solo se usa si el
// frontend apunta directamente al backend (VITE_API_URL=http://127.0.0.1:3001/api).

// Únicos orígenes permitidos: servidor de desarrollo de Vite y vista previa del build
const ORIGENES_PERMITIDOS = [
  'http://localhost:5173', 'http://localhost:4173',
  'http://127.0.0.1:5173', 'http://127.0.0.1:4173',
];

const opcionesCors = {
  origin: ORIGENES_PERMITIDOS,

  // GET (dashboard), POST (análisis, confirmación, encuesta, visitas) y
  // DELETE (el panel de administración elimina registros). Sin DELETE el preflight
  // de esas solicitudes se rechaza en el navegador.
  methods: ['GET', 'POST', 'DELETE'],

  // Cabeceras de los cuerpos JSON, el panel de administración y la carga de análisis.
  allowedHeaders: ['Content-Type', 'x-admin-token', 'x-docpilot-analysis'],

  // El navegador puede cachear el resultado del preflight 10 minutos
  maxAge: 600,
};

module.exports = { opcionesCors, ORIGENES_PERMITIDOS };
