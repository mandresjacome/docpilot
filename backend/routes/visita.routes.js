// Rutas para el módulo de registro de visitas.
// Esta capa SOLO mapea el verbo HTTP y la ruta al controlador correspondiente.
// No contiene lógica de negocio.

const express = require('express');
const router = express.Router();
const { registrarVisita } = require('../controllers/visita.controller');

// POST /api/visitas/registrar
// Endpoint que recibe el correo y la aceptación del tratamiento de datos.
// Solo genera un log en consola — nunca escribe a disco ni a base de datos.
router.post('/registrar', registrarVisita);

module.exports = router;
