// Servicio de análisis usando Google Gemini API (AI Studio).
// Responsabilidad única: recibir texto plano extraído por OCR y devolver un
// análisis estructurado en JSON, adaptado al tipo de documento detectado.
//
// ESTRATEGIA DE ANÁLISIS EN DOS FASES:
// 1. Clasificación: Gemini identifica la categoría del documento (contrato, factura, etc.)
// 2. Extracción especializada: según la categoría, se aplica un prompt con campos
//    específicos que realmente importan para ese tipo de documento.
//
// Esto garantiza que un contrato de 30 páginas no reciba el mismo tratamiento
// superficial que una factura de 1 página. Cada tipo tiene sus campos propios.

require('dotenv').config();

const { GoogleGenAI } = require('@google/genai');

// Inicializar el cliente de Gemini con la API key del entorno.
// Se instancia a nivel módulo para reutilizar la conexión en cada petición.
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELO = 'gemini-2.5-flash';

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS DE DOCUMENTOS SOPORTADAS
// Cada categoría tiene un extractor especializado con campos propios.
// 'otro' es el fallback para documentos que no encajan en ninguna categoría.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIAS = ['contrato', 'factura', 'pqrs', 'documento_judicial', 'carta', 'cotizacion', 'otro'];

// ─────────────────────────────────────────────────────────────────────────────
// PROMPTS ESPECIALIZADOS POR TIPO DE DOCUMENTO
// Cada prompt instruye a Gemini para extraer EXACTAMENTE los campos que
// una Mipyme necesita para ese tipo específico de documento.
// El JSON resultante puede tener estructura distinta según el tipo,
// pero el frontend lo renderiza dinámicamente (ver ResultadoAnalisis.jsx).
// ─────────────────────────────────────────────────────────────────────────────
const PROMPTS_POR_TIPO = {

  // ── CONTRATOS ──────────────────────────────────────────────────────────────
  // Para contratos lo crítico es: quiénes son las partes, qué se contrata,
  // cuánto vale, cuándo vence y qué obliga a cada parte. Las cláusulas de
  // riesgo (penalidades, resolución anticipada) son las más ignoradas por
  // Mipymes y las más costosas si no se detectan a tiempo.
  contrato: (texto) => `Eres un asistente experto en análisis de contratos para Mipymes colombianas.

Analiza el siguiente contrato y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "Contrato — [subtipo: prestación de servicios / compraventa / arrendamiento / otro]",
  "resumen": "descripción del objeto del contrato en 3-4 oraciones, mencionando qué se contrata y para qué",
  "datosRelevantes": {
    "partes": "contratante y contratista con nombres, NIT/CC y roles",
    "objetoContrato": "descripción precisa de qué se compra, vende o presta",
    "valorYPago": "valor total, forma de pago, anticipos, plazos de facturación",
    "vigencia": "fecha de inicio, fecha de vencimiento y posibilidad de prórroga",
    "obligacionesClaves": "lista de las 3-5 obligaciones más importantes de cada parte",
    "clausulasDeRiesgo": "penalidades, cláusula de resolución, garantías, confidencialidad — menciona solo las que aparezcan",
    "jurisdiccion": "ciudad y juzgado competente para controversias, si se menciona"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un texto de acuse de recibo, aceptación, contraoferta o recomendación de acción concreta para la Mipyme en relación a este contrato. Nunca uses null.",
  "alertas": "advertencias importantes para la Mipyme: fechas próximas, cláusulas desfavorables, obligaciones de difícil cumplimiento. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto del contrato:
${texto}`,

  // ── FACTURAS ───────────────────────────────────────────────────────────────
  // Para facturas lo crítico es: montos, impuestos, vencimiento y estado de pago.
  factura: (texto) => `Eres un asistente experto en gestión contable para Mipymes colombianas.

Analiza la siguiente factura y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "Factura",
  "resumen": "descripción breve de qué se factura, entre quiénes y por qué monto total",
  "datosRelevantes": {
    "numeroFactura": "número o código de la factura",
    "emisor": "nombre/razón social y NIT del emisor",
    "receptor": "nombre/razón social y NIT del receptor",
    "fechaEmision": "fecha en que se emitió la factura",
    "fechaVencimiento": "fecha límite de pago",
    "subtotal": "valor antes de impuestos",
    "impuestos": "IVA u otros impuestos aplicados",
    "total": "valor total a pagar",
    "conceptos": "descripción de los bienes o servicios facturados",
    "estadoPago": "pagada / pendiente / vencida — según la información del documento"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un mensaje profesional de acuse de recibo, confirmación de pago o próximos pasos según el estado de la factura. Nunca uses null.",
  "alertas": "si la factura está vencida o próxima a vencer, indicarlo. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto de la factura:
${texto}`,

  // ── PQRS ───────────────────────────────────────────────────────────────────
  // Para PQRS lo crítico es: qué pide el ciudadano/cliente, cuáles son los
  // plazos legales de respuesta y qué acción debe tomar la empresa.
  pqrs: (texto) => `Eres un asistente experto en atención al cliente y gestión de PQRS para Mipymes colombianas.

Analiza el siguiente documento de PQRS (Petición, Queja, Reclamo o Sugerencia) y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "PQRS — [subtipo: Petición / Queja / Reclamo / Sugerencia]",
  "resumen": "descripción del motivo de la PQRS y lo que solicita el remitente en 2-3 oraciones",
  "datosRelevantes": {
    "remitente": "nombre, documento de identidad y datos de contacto del solicitante",
    "fechaRadicacion": "fecha en que se presentó la PQRS",
    "motivoPrincipal": "qué originó la PQRS (ej: incumplimiento, cobro indebido, solicitud de información)",
    "solicitudConcreta": "qué acción específica espera el remitente de la empresa",
    "plazoLegalRespuesta": "15 días hábiles para peticiones / 10 días hábiles para quejas y reclamos (Ley 1755 de 2015)",
    "fechaLimiteRespuesta": "calcular a partir de la fecha de radicación si es posible"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un borrador de respuesta formal en español acusando recibo, explicando el proceso de atención y comprometiéndote con el plazo legal. Adapta el tono según el subtipo (conciliador para quejas, informativo para peticiones). Nunca uses null.",
  "alertas": "si la PQRS ya está próxima a su plazo legal de respuesta o lo ha superado, indicarlo. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto del PQRS:
${texto}`,

  // ── DOCUMENTOS JUDICIALES ─────────────────────────────────────────────────
  // Para documentos judiciales lo crítico es: qué ordena el documento, a quién,
  // en qué plazo y qué pasa si no se cumple. La Mipyme necesita saber si
  // tiene que comparecer o realizar alguna acción urgente.
  documento_judicial: (texto) => `Eres un asistente experto en lectura de documentos judiciales y administrativos para Mipymes colombianas.

Analiza el siguiente documento judicial/administrativo y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "Documento Judicial — [subtipo: auto, sentencia, notificación, medida de protección, requerimiento, otro]",
  "resumen": "descripción de qué ordena o notifica el documento, a quién va dirigido y cuál es el contexto del caso en 3-4 oraciones",
  "datosRelevantes": {
    "autoridad": "juzgado, comisaría, superintendencia u entidad que emite el documento",
    "expediente": "número de expediente, radicado o número de caso",
    "partesInvolucradas": "demandante/víctima y demandado/agresor con nombres y documentos de identidad",
    "ordenPrincipal": "qué ordena o notifica el documento de forma concreta",
    "plazos": "fechas de audiencias, términos para contestar o cumplir la orden",
    "consecuencias": "qué ocurre si no se cumple la orden o no se comparece"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un texto con las acciones que debe tomar la empresa o persona: contestar, comparecer, aportar documentos, o cualquier recomendación pertinente al caso. Nunca uses null.",
  "alertas": "audiencias próximas, plazos inminentes o consecuencias graves que la Mipyme debe atender con urgencia. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto del documento:
${texto}`,

  // ── CARTAS ─────────────────────────────────────────────────────────────────
  carta: (texto) => `Eres un asistente experto en comunicación empresarial para Mipymes colombianas.

Analiza la siguiente carta o comunicación y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "Carta — [subtipo: cobro, comercial, informativa, autorización, otro]",
  "resumen": "descripción del propósito de la carta y lo que solicita o informa el remitente en 2-3 oraciones",
  "datosRelevantes": {
    "remitente": "nombre, empresa y cargo del remitente",
    "destinatario": "nombre, empresa y cargo del destinatario",
    "fecha": "fecha de la carta",
    "asunto": "asunto o referencia de la carta",
    "solicitudOAccion": "qué acción concreta se solicita o informa"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un borrador de respuesta profesional adaptada al propósito y tono de la carta. Nunca uses null.",
  "alertas": "si hay plazos, compromisos económicos o implicaciones legales relevantes. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto de la carta:
${texto}`,

  // ── COTIZACIONES ───────────────────────────────────────────────────────────
  cotizacion: (texto) => `Eres un asistente experto en gestión comercial para Mipymes colombianas.

Analiza la siguiente cotización y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "Cotización",
  "resumen": "descripción de qué se cotiza, quién cotiza y a quién, con el monto total en 2-3 oraciones",
  "datosRelevantes": {
    "proveedor": "nombre/razón social y NIT del proveedor que cotiza",
    "cliente": "nombre/razón social del cliente",
    "fechaCotizacion": "fecha de emisión",
    "validezOferta": "hasta cuándo es válida la cotización",
    "itemsCotizados": "cadena de texto con cada ítem en formato 'Descripción: X | Cantidad: Y | Precio unitario: Z' separados por punto y coma. NUNCA uses un array JSON, siempre texto plano.",
    "totalCotizacion": "valor total de la cotización con impuestos",
    "condicionesPago": "forma de pago propuesta (anticipo, crédito, contado)",
    "tiempoEntrega": "plazo de entrega o ejecución prometido"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un borrador de respuesta: aceptación, contraoferta o solicitud de ajuste de condiciones según convenga a la Mipyme. Nunca uses null.",
  "alertas": "si la cotización está próxima a vencer o hay condiciones desfavorables, indicarlo. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto de la cotización:
${texto}`,

  // ── FALLBACK: OTRO ─────────────────────────────────────────────────────────
  // Para documentos que no encajan en ninguna categoría definida.
  otro: (texto) => `Eres un asistente experto en gestión documental para Mipymes colombianas.

Analiza el siguiente documento y devuelve ÚNICAMENTE un objeto JSON válido sin bloques de código ni texto adicional:

{
  "tipo": "descripción del tipo de documento tal como lo identifies",
  "resumen": "descripción del contenido del documento en 3-4 oraciones",
  "datosRelevantes": {
    "descripcion": "datos clave identificados: fechas, partes involucradas, montos, obligaciones o cualquier información relevante para la empresa"
  },
  "sugerenciaRespuesta": "OBLIGATORIO. Redacta siempre un borrador de respuesta o recomendación de acción concreta para la Mipyme en relación a este documento. Nunca uses null.",
  "alertas": "cualquier aspecto urgente o importante que la empresa deba atender. Si no hay alertas, usa exactamente el valor JSON null (sin comillas)."
}

Texto del documento:
${texto}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN AUXILIAR: limpiarJSON
// Gemini a veces envuelve la respuesta en bloques de código markdown
// (```json ... ```) a pesar de que el prompt lo prohíbe explícitamente.
// Esta función elimina esos bloques antes de parsear el JSON.
// ─────────────────────────────────────────────────────────────────────────────
const limpiarJSON = (textoRespuesta) => {
  return textoRespuesta
    .replace(/^```(?:json)?\s*/i, '') // Eliminar apertura de bloque markdown
    .replace(/\s*```$/i, '')          // Eliminar cierre de bloque markdown
    .trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1: clasificarDocumento
// Primera llamada a Gemini: identificar a qué categoría pertenece el documento.
// Se hace en una llamada separada y liviana para no confundir el modelo
// mezclando clasificación y extracción en un mismo prompt complejo.
// ─────────────────────────────────────────────────────────────────────────────
const clasificarDocumento = async (texto) => {
  // Para clasificar correctamente, tomamos una muestra representativa del documento:
  // - Los primeros 2500 caracteres (encabezado, título, objeto principal)
  // - Los caracteres del punto medio (cuerpo del documento)
  // Esto evita que un comprobante de pago en la página 2 de un documento más amplio
  // contamine la clasificación del tipo de documento real.
  const inicio = texto.substring(0, 2500);
  const mitad = texto.substring(Math.floor(texto.length / 2), Math.floor(texto.length / 2) + 1500);
  const fragmento = `[INICIO DEL DOCUMENTO]\n${inicio}\n\n[FRAGMENTO DEL CUERPO]\n${mitad}`;

  const promptClasificacion = `Eres un clasificador experto de documentos empresariales. Tu tarea es determinar el TIPO PRINCIPAL del documento.

IMPORTANTE: Clasifica según el PROPÓSITO PREDOMINANTE del documento completo, no por elementos secundarios o adjuntos.
Ejemplo: una propuesta académica que incluye un comprobante de pago es "otro", no "factura".
Ejemplo: un contrato que adjunta una cotización es "contrato", no "cotizacion".

Categorías disponibles:
- contrato: acuerdo legal bilateral entre partes (compraventa, arrendamiento, servicios, laboral)
- factura: documento de cobro por bienes o servicios prestados
- pqrs: petición, queja, reclamo o solicitud de un cliente o ciudadano
- documento_judicial: notificación, auto, resolución, demanda o documento de un juzgado o entidad judicial
- carta: comunicación formal entre personas u organizaciones
- cotizacion: oferta de precios por productos o servicios
- otro: cualquier documento que no encaje claramente en las categorías anteriores (propuestas académicas, informes, actas, formularios institucionales, etc.)

Reglas de respuesta:
- Responde ÚNICAMENTE con una palabra de la lista anterior, en minúsculas y sin puntuación.
- Ante la duda entre dos categorías, elige la más específica al propósito principal del documento.
- Si el documento es de naturaleza académica, institucional o no empresarial, responde: otro

Fragmento del documento a clasificar:
${fragmento}`;

  const resultado = await genai.models.generateContent({
    model: MODELO,
    contents: promptClasificacion,
  });

  // Normalizar la respuesta: minúsculas y sin espacios extra
  const categoria = resultado.text.trim().toLowerCase().replace(/\s+/g, '_');

  // Verificar que la categoría devuelta es una de las válidas.
  // Si Gemini devuelve algo inesperado, usar el fallback 'otro'.
  return CATEGORIAS.includes(categoria) ? categoria : 'otro';
};

/**
 * analizarTexto — punto de entrada público del servicio.
 *
 * Flujo:
 * 1. Clasifica el documento con una llamada liviana a Gemini (primeros 3000 chars)
 * 2. Selecciona el prompt especializado para esa categoría
 * 3. Llama a Gemini con el texto completo y el prompt especializado
 * 4. Parsea y retorna el JSON estructurado al controlador
 *
 * @param {string} texto - Texto completo extraído por el servicio OCR
 * @returns {Promise<Object>} - Análisis estructurado con campos específicos al tipo
 */
const analizarTexto = async (texto) => {
  // Verificar que la API key está configurada antes de intentar cualquier llamada
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }

  // Obtener la fecha actual del servidor para inyectarla en el prompt.
  // Esto evita que Gemini interprete fechas recientes como "futuras" porque
  // el modelo no conoce la fecha del momento en que se ejecuta el análisis.
  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const contextoFecha = `CONTEXTO IMPORTANTE: La fecha actual del sistema es ${fechaHoy}. Usa esta fecha como referencia para evaluar si las fechas del documento son pasadas, presentes o futuras.\n\n`;

  // FASE 1: Clasificar el documento para saber qué prompt especializado usar
  const categoria = await clasificarDocumento(texto);

  // FASE 2: Aplicar el prompt especializado para esa categoría.
  // Se antepone el contexto de fecha a cada prompt para que Gemini no
  // genere falsas alertas sobre fechas que en realidad son pasadas o recientes.
  const promptEspecializado = contextoFecha + PROMPTS_POR_TIPO[categoria](texto);

  // temperature: 0 elimina la aleatoriedad del modelo.
  // Sin esto, Gemini puede dar respuestas distintas al mismo documento
  // (a veces genera sugerenciaRespuesta, a veces no) porque su temperatura
  // por defecto introduce variabilidad. Con 0 la respuesta es determinista.
  const resultado = await genai.models.generateContent({
    model: MODELO,
    contents: promptEspecializado,
    config: { temperature: 0 },
  });

  // Limpiar y parsear la respuesta JSON de Gemini
  const textoLimpio = limpiarJSON(resultado.text);

  // Si el JSON no es válido, JSON.parse lanzará un error que el controlador
  // capturará en su try/catch y delegará al middleware de errores global
  const analisisJSON = JSON.parse(textoLimpio);

  // Agregar la categoría interna al objeto para que el frontend pueda
  // adaptar el renderizado si lo necesita en el futuro
  analisisJSON._categoria = categoria;

  return analisisJSON;
};

module.exports = { analizarTexto };
