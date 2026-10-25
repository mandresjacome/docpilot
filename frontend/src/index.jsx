// Punto de entrada de la aplicación React.
// Se monta el componente raíz <App /> en el div#root del index.html.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // StrictMode activa advertencias adicionales en desarrollo
  // que ayudan a detectar efectos secundarios no deseados
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
