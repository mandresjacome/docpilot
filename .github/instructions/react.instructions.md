---
description: "Usa cuando: escribas o revises componentes React del frontend (páginas, formularios, hooks personalizados, consumo de API). Cubre: componentes funcionales, prohibición de clases, manejo de estados de carga y error, subida de archivos, consumo de la API backend y principio Human-in-the-Loop en la UI."
applyTo: ["frontend/**", "client/**", "src/frontend/**", "src/client/**", "**/*.jsx", "**/*.tsx"]
---

# Reglas del Frontend React — DocPilot

## Componentes: Solo Funcionales (Obligatorio)

- **PROHIBIDO** usar `class` para definir componentes. Siempre funciones con Hooks.
- Usar `const` + función flecha para definir componentes.

```jsx
// CORRECTO
const MiComponente = () => {
  return <div>Contenido</div>;
};

// PROHIBIDO
class MiComponente extends React.Component { ... }
```

## Estructura de Carpetas Recomendada

```
frontend/
├── components/    # Componentes reutilizables (botones, tarjetas, etc.)
├── pages/         # Vistas completas (una por ruta principal)
├── hooks/         # Custom hooks (lógica reutilizable extraída de componentes)
├── services/      # Funciones para llamadas al backend (fetch/axios)
└── App.jsx        # Enrutamiento principal
```

## Subida de Archivos — Validación en Cliente

Antes de enviar al backend, validar en el componente:

- **Tipos permitidos:** PDF, PNG, JPEG, TIFF.
- **Tamaño máximo:** 10 MB.
- Mostrar mensaje de error claro al usuario si no cumple, sin llegar a hacer la petición.

```jsx
// Validación antes de llamar al servicio
const validarArchivo = (archivo) => {
  const tiposPermitidos = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
  const pesoMaximo = 10 * 1024 * 1024; // 10 MB en bytes

  if (!tiposPermitidos.includes(archivo.type)) {
    return 'Tipo de archivo no permitido. Solo PDF, PNG, JPEG o TIFF.';
  }
  if (archivo.size > pesoMaximo) {
    return 'El archivo supera el tamaño máximo de 10 MB.';
  }
  return null; // null significa que es válido
};
```

## Manejo de Estados de UI (Obligatorio)

Todo componente que consuma la API debe manejar tres estados explícitos:

| Estado | Variable | Descripción |
|--------|----------|-------------|
| Cargando | `cargando` (`boolean`) | Petición en curso — mostrar spinner o deshabilitar botón |
| Error | `error` (`string \| null`) | Mensaje de error visible para el usuario |
| Resultado | `resultado` (`object \| null`) | Datos devueltos por el backend |

```jsx
// Patrón base para consumo de API
const [cargando, setCargando] = useState(false);
const [error, setError] = useState(null);
const [resultado, setResultado] = useState(null);

const procesarDocumento = async (archivo) => {
  setCargando(true);
  setError(null);
  try {
    const datos = await documentoService.analizar(archivo);
    setResultado(datos);
  } catch (err) {
    // Mostrar el mensaje de error al usuario, nunca swallowear el error
    setError(err.message || 'Ocurrió un error al procesar el documento.');
  } finally {
    // Siempre detener el indicador de carga, ocurra lo que ocurra
    setCargando(false);
  }
};
```

## Capa de Servicios — Separación de Responsabilidades

- Las llamadas `fetch` o `axios` van en archivos dentro de `services/`, nunca directamente en el componente.
- Los componentes solo llaman a funciones del servicio y gestionan el estado.

```js
// services/documento.service.js
const analizarDocumento = async (archivo) => {
  // Construir el FormData para enviar el archivo como multipart
  const formData = new FormData();
  formData.append('documento', archivo);

  const respuesta = await fetch('/api/documentos/analizar', {
    method: 'POST',
    body: formData,
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json();
    throw new Error(cuerpo.error || 'Error en el servidor');
  }

  return respuesta.json();
};

export default { analizarDocumento };
```

## Human-in-the-Loop — Flujo de Confirmación (Obligatorio)

El frontend es la barrera de control del sistema. El flujo siempre es:

1. Usuario sube documento → backend analiza → **frontend muestra resultado de la IA**.
2. Usuario **revisa y confirma** la acción sugerida (ej: aprobar respuesta).
3. Solo tras confirmar, el frontend llama al endpoint de acción final.

- Nunca disparar acciones finales automáticamente al recibir la respuesta de la IA.
- El botón de confirmación debe ser explícito y visible, con el texto de la acción que se va a ejecutar.

```jsx
{/* Mostrar resultado de la IA primero */}
{resultado && (
  <div>
    <h3>Análisis del documento</h3>
    <p>{resultado.resumen}</p>
    {/* El usuario debe confirmar antes de cualquier acción final */}
    <button onClick={confirmarRespuesta} disabled={cargando}>
      Confirmar y enviar respuesta
    </button>
  </div>
)}
```

## Comentarios en Código

- Todos los hooks, handlers y funciones deben tener comentarios en **español** explicando el *por qué* de la lógica.
- Documentar especialmente los flujos de validación y confirmación HITL.
