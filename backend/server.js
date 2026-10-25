// Archivo de arranque del servidor.
// Se separa de app.js para poder importar la app en tests unitarios
// sin que el servidor quede escuchando durante las pruebas.

const app = require('./app');

// Puerto configurable por variable de entorno para flexibilidad entre
// entornos de desarrollo, staging y producción
const PUERTO = process.env.PORT || 3001;

app.listen(PUERTO, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PUERTO}`);
});
