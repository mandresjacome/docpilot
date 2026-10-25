// Definición de rutas para el módulo de documentos.
// Esta capa SOLO mapea verbos HTTP + rutas a sus controladores.
// Ninguna lógica de negocio debe vivir aquí.

const express = require('express');
const router = express.Router();
const documentoController = require('../controllers/documento.controller');

// Importar el middleware de validación de archivos
const { validarArchivo } = require('../middlewares/validarArchivo');

// POST /api/documentos/analizar
// Recibe el documento del cliente, lo valida y lo envía al controlador para su análisis.
// El middleware validarArchivo actúa como guardián: si el archivo no cumple,
// rechaza la petición antes de que llegue al controlador.
router.post('/analizar', validarArchivo, documentoController.analizar);

// POST /api/documentos/confirmar
// Endpoint de confirmación HITL (Human-in-the-Loop).
// Solo se llama cuando el usuario, desde el frontend, aprueba explícitamente
// la acción sugerida por la IA. Nunca se ejecuta de forma automática.
router.post('/confirmar', documentoController.confirmar);

// POST /api/documentos/encuesta
// Recibe la valoración post-HITL del usuario (estrellas, tiempo ahorrado, comentario).
// Enriquece el registro de Supabase existente sin crear uno nuevo.
router.post('/encuesta', documentoController.guardarEncuesta);

module.exports = router;
