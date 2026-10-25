// Configuración global de las pruebas: se ejecuta antes de cargar cualquier módulo.
// Define variables de entorno FICTICIAS para que los servicios (que validan su entorno
// al importarse) se carguen sin credenciales reales. Ninguna prueba llama a servicios externos.

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio-falsa';
process.env.GEMINI_API_KEY = 'clave-gemini-falsa';
process.env.DOCUMENT_AI_PROJECT_ID = 'proyecto-prueba';
process.env.DOCUMENT_AI_LOCATION = 'us';
process.env.DOCUMENT_AI_PROCESSOR_ID = 'procesador-prueba';
process.env.ADMIN_TOKEN = 'token-admin-de-prueba';

// Silencia los console.error/log esperados (los tests verifican el comportamiento, no los logs)
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});
