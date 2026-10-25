// Configuración de Vite para el frontend React.
// Se usa el plugin oficial de React para habilitar JSX y Fast Refresh
// (recarga en caliente sin perder el estado del componente durante el desarrollo).

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173, // Puerto del servidor de desarrollo

    // Proxy para redirigir las llamadas /api al backend Express en desarrollo.
    // Esto evita problemas de CORS durante el desarrollo local:
    // el navegador cree que habla con el mismo origen (5173),
    // pero Vite reenvía la petición al backend (3001) de forma transparente.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
