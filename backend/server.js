// Archivo de arranque del servidor.
// Se separa de app.js para poder importar la app en tests unitarios
// sin que el servidor quede escuchando durante las pruebas.

const { createServer } = require('node:http');
const app = require('./app');
const { HOST_LOCAL } = require('./config/entorno');

// Puerto configurable por variable de entorno para flexibilidad entre
// entornos de desarrollo, staging y producción
const puerto = Number(process.env.PORT || 3001);
const host = process.env.HOST || HOST_LOCAL;

const servidor = createServer({ headersTimeout: 15_000, requestTimeout: 60_000 }, app);
servidor.listen(puerto, host, () => {
  const { address, port } = servidor.address();
  console.log(`Servidor backend escuchando en ${address} (puerto ${port})`);
});
