// Punto de entrada y configuración central de Express.
// Se centraliza aquí la inicialización del servidor, middlewares globales
// y el registro de rutas, para mantener el código modular y fácil de escalar.

const express = require('express');
const cors = require('cors');
const path = require('path');
const { opcionesCors } = require('./config/cors');

// Importar las rutas del módulo de documentos
const documentoRoutes = require('./routes/documento.routes');

// Importar las rutas del módulo de registro de visitas
const visitaRoutes = require('./routes/visita.routes');

// Importar las rutas del panel de administración (protegidas por token)
const adminRoutes = require('./routes/admin.routes');

// Importar el middleware de errores global (debe registrarse al final)
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// --- Middlewares globales ---

// CORS: solo se habilita en desarrollo local.
// En producción, Express sirve el frontend desde el mismo origen,
// por lo que no hay solicitudes cross-origin y CORS no es necesario.
// La configuración (orígenes, métodos y headers) vive en config/cors.js.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors(opcionesCors));
}

// Parsear el cuerpo de las solicitudes JSON
app.use(express.json());

// --- Registro de rutas API ---

// Todas las rutas relacionadas a documentos bajo el prefijo /api/documentos
app.use('/api/documentos', documentoRoutes);

// Rutas del registro de visitas (consentimiento de tratamiento de datos)
app.use('/api/visitas', visitaRoutes);

// Rutas del panel admin (requieren header x-admin-token)
app.use('/api/admin', adminRoutes);

// --- Archivos estáticos del frontend (solo en producción) ---
// En producción, Express sirve el build de React generado por Vite.
// La carpeta frontend/dist queda un nivel arriba del backend.
if (process.env.NODE_ENV === 'production') {
  const rutaFrontend = path.join(__dirname, '..', 'frontend', 'dist');

  // Servir los archivos estáticos (JS, CSS, imágenes)
  app.use(express.static(rutaFrontend));

  // Para cualquier ruta que no sea /api, devolver el index.html de React.
  // Esto permite que React Router maneje la navegación en el cliente.
  app.get('*', (req, res) => {
    res.sendFile(path.join(rutaFrontend, 'index.html'));
  });
}

// --- Middleware de errores global ---
// IMPORTANTE: debe ir al final, después de todas las rutas,
// para capturar cualquier error propagado con next(error)
app.use(errorHandler);

module.exports = app;
