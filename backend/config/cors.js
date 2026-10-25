// Configuración de CORS para desarrollo local.
// En producción Express sirve el frontend desde el mismo origen, por lo que CORS no se habilita
// (ver app.js). En desarrollo, el proxy de Vite evita CORS; esta configuración solo se usa si el
// frontend apunta directamente al backend (VITE_API_URL=http://localhost:3001/api).

// Únicos orígenes permitidos: servidor de desarrollo de Vite y vista previa del build
const ORIGENES_PERMITIDOS = ['http://localhost:5173', 'http://localhost:4173'];

const opcionesCors = {
  origin: ORIGENES_PERMITIDOS,

  // GET (dashboard), POST (análisis, confirmación, encuesta, visitas) y
  // DELETE (el panel de administración elimina registros). Sin DELETE el preflight
  // de esas solicitudes se rechaza en el navegador.
  methods: ['GET', 'POST', 'DELETE'],

  // Se listan solo los headers que usa la aplicación en lugar de reflejar cualquiera:
  // 'x-admin-token' (panel admin) y 'Content-Type' (necesario para los JSON, que provocan preflight).
  allowedHeaders: ['Content-Type', 'x-admin-token'],

  // El navegador puede cachear el resultado del preflight 10 minutos
  maxAge: 600,
};

module.exports = { opcionesCors, ORIGENES_PERMITIDOS };
