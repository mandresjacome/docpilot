-- Esquema de Supabase (PostgreSQL) que espera DocPilot.
-- Se deduce del código de backend/services/supabase.service.js y backend/controllers/admin.controller.js;
-- ejecútalo en el SQL Editor de tu proyecto. Ajusta lo que necesites.
--
-- La tabla guarda SOLO metadatos de uso. Nunca debe almacenar el contenido de los documentos,
-- el texto extraído por OCR ni el análisis de la IA.

create table if not exists public.registros_uso (
  id              uuid        primary key default gen_random_uuid(),
  fecha_hora      timestamptz not null default now(),

  -- Etiqueta de tipo que devuelve Gemini (p. ej. "Factura de venta"). Es texto generado por la IA.
  tipo_documento  text        not null default 'desconocido',

  -- Milisegundos que tardó el ciclo OCR + análisis
  tiempo_ms       integer,

  -- true cuando el usuario confirma el análisis (cierre del ciclo Human-in-the-Loop)
  confirmado      boolean     not null default false,

  -- Encuesta voluntaria posterior a la confirmación
  estrellas       smallint    check (estrellas between 1 and 5),
  tiempo_ahorrado text        check (tiempo_ahorrado in ('menos_5min', '5_15min', '15_30min', 'mas_30min')),
  comentario      text        check (char_length(comentario) <= 200)
);

create index if not exists registros_uso_fecha_hora_idx on public.registros_uso (fecha_hora desc);

-- El backend usa la clave service_role, que omite RLS. Activar RLS sin políticas
-- impide que cualquier otra clave (anon/authenticated) lea o escriba la tabla.
alter table public.registros_uso enable row level security;

-- Nota: versiones anteriores de la aplicación tenían una columna `correo_usuario`.
-- Esta versión no la usa ni la escribe; si tu tabla la conserva puedes eliminarla:
--   alter table public.registros_uso drop column if exists correo_usuario;
