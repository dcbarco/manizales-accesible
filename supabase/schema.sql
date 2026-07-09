-- ==============================================================
-- MANIZALES ACCESIBLE — Esquema completo de Supabase
-- Ejecutar UNA VEZ en el SQL Editor del dashboard de Supabase.
-- Incluye: tablas, seed de insignias, funciones y triggers de
-- gamificación, políticas RLS, buckets de Storage y Realtime.
-- ==============================================================

-- ==============================================================
-- 1. TABLAS
-- ==============================================================

-- Perfil público del usuario, vinculado a Supabase Auth
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  nombre_usuario text unique not null,
  avatar_url text,
  puntos int not null default 0,
  nivel int not null default 1,
  reportes_total int not null default 0,
  votos_total int not null default 0,
  comentarios_total int not null default 0,
  -- Capa de administración (ver sección 7 y supabase/migracion_admin.sql)
  es_admin boolean not null default false,
  baneado boolean not null default false
);

-- Reportes ciudadanos: barreras y espacios de bienestar
create table if not exists public.reportes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  tipo text not null default 'barrera' check (tipo in ('barrera', 'bienestar')),
  descripcion text not null,
  foto_url text not null,
  latitud double precision not null,
  longitud double precision not null,
  direccion_texto text,
  -- true = se muestra como "Anónimo" públicamente (sigue vinculado al
  -- usuario internamente para puntos e insignias)
  anonimo boolean not null default false,
  -- barreras: pendiente | confirmado | persiste | resuelto
  -- bienestar: pendiente | confirmado | recomendado | cerrado
  estado text not null default 'pendiente',
  conteo_confirmado int not null default 0,
  conteo_persiste int not null default 0,  -- barrera: "sigue ahí" / bienestar: "lo recomiendo"
  conteo_resuelto int not null default 0   -- barrera: "resuelto"   / bienestar: "ya no está"
);

create index if not exists reportes_usuario_idx on public.reportes (usuario_id);
create index if not exists reportes_creado_idx on public.reportes (creado_en desc);

-- Corroboración estilo Waze: un voto por usuario por reporte
create table if not exists public.votos_reporte (
  id uuid primary key default gen_random_uuid(),
  reporte_id uuid not null references public.reportes(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  -- barreras: confirmado | persiste | resuelto
  -- bienestar: confirmado | recomendado | cerrado
  tipo text not null check (tipo in ('confirmado', 'persiste', 'resuelto', 'recomendado', 'cerrado')),
  creado_en timestamptz not null default now(),
  unique (reporte_id, usuario_id)
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  reporte_id uuid not null references public.reportes(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  texto text not null,
  creado_en timestamptz not null default now()
);

create index if not exists comentarios_reporte_idx on public.comentarios (reporte_id, creado_en);

-- Catálogo maestro de insignias
create table if not exists public.insignias (
  id text primary key,
  nombre text not null,
  descripcion text,
  icono text
);

create table if not exists public.insignias_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  insignia_id text not null references public.insignias(id),
  otorgada_en timestamptz not null default now(),
  unique (usuario_id, insignia_id)
);

-- Seed del catálogo de insignias
insert into public.insignias (id, nombre, descripcion, icono) values
  ('primer_reporte',      'Primer Reporte',        'Creaste tu primer reporte',                                      '🥇'),
  ('reportero_10',        'Reportero Activo',      'Llegaste a 10 reportes',                                         '📸'),
  ('explorador_5_zonas',  'Explorador',            'Reportaste en 5 zonas distintas de la ciudad',                   '🧭'),
  ('verificador_20',      'Verificador',           'Corroboraste 20 reportes de otros ciudadanos',                   '✅'),
  ('comentarista_15',     'Voz de la Comunidad',   'Escribiste 15 comentarios',                                      '💬'),
  ('solucionador',        'Solucionador',          '3 de tus barreras reportadas fueron marcadas como resueltas',    '🛠️'),
  ('promotor_bienestar',  'Promotor del Bienestar','Compartiste 5 espacios de bienestar',                            '💚'),
  ('guia_ciudad',         'Guía de la Ciudad',     '3 de tus espacios de bienestar tienen 5+ recomendaciones',       '🌟')
on conflict (id) do nothing;

-- ==============================================================
-- 2. FUNCIONES DE GAMIFICACIÓN
-- Las funciones son SECURITY DEFINER: los triggers actualizan
-- puntos/conteos aunque el usuario no tenga permiso directo (RLS).
-- ==============================================================

-- Nivel según puntos: 1 Observador (0), 2 Caminante (30),
-- 3 Vigía (100), 4 Guardián (250), 5 Héroe Ciudadano (500)
create or replace function public.calcular_nivel(pts int)
returns int language sql immutable as $$
  select case
    when pts >= 500 then 5
    when pts >= 250 then 4
    when pts >= 100 then 3
    when pts >= 30  then 2
    else 1
  end;
$$;

create or replace function public.sumar_puntos(uid uuid, pts int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update perfiles
  set puntos = puntos + pts,
      nivel = calcular_nivel(puntos + pts)
  where id = uid;
end;
$$;

create or replace function public.otorgar_insignia(uid uuid, iid text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into insignias_usuario (usuario_id, insignia_id)
  values (uid, iid)
  on conflict (usuario_id, insignia_id) do nothing;
end;
$$;

-- Revisa todos los criterios de insignias para un usuario
create or replace function public.chequear_insignias(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p perfiles%rowtype;
  zonas int;
  barreras_resueltas int;
  reportes_bienestar int;
  bienestar_recomendados int;
begin
  select * into p from perfiles where id = uid;
  if not found then return; end if;

  if p.reportes_total >= 1  then perform otorgar_insignia(uid, 'primer_reporte'); end if;
  if p.reportes_total >= 10 then perform otorgar_insignia(uid, 'reportero_10'); end if;
  if p.votos_total >= 20 then perform otorgar_insignia(uid, 'verificador_20'); end if;
  if p.comentarios_total >= 15 then perform otorgar_insignia(uid, 'comentarista_15'); end if;

  -- Zonas distintas: cuadrículas de ~500 m (0.005 grados aprox.)
  select count(distinct (floor(latitud / 0.005)::text || ':' || floor(longitud / 0.005)::text))
  into zonas from reportes where usuario_id = uid;
  if zonas >= 5 then perform otorgar_insignia(uid, 'explorador_5_zonas'); end if;

  select count(*) into barreras_resueltas
  from reportes where usuario_id = uid and tipo = 'barrera' and estado = 'resuelto';
  if barreras_resueltas >= 3 then perform otorgar_insignia(uid, 'solucionador'); end if;

  select count(*) into reportes_bienestar
  from reportes where usuario_id = uid and tipo = 'bienestar';
  if reportes_bienestar >= 5 then perform otorgar_insignia(uid, 'promotor_bienestar'); end if;

  select count(*) into bienestar_recomendados
  from reportes where usuario_id = uid and tipo = 'bienestar' and conteo_persiste >= 5;
  if bienestar_recomendados >= 3 then perform otorgar_insignia(uid, 'guia_ciudad'); end if;
end;
$$;

-- ==============================================================
-- 3. TRIGGERS
-- ==============================================================

-- 3.1 Crear perfil automáticamente al registrarse un usuario
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre_usuario)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre_usuario', ''),
      'ciudadano_' || substr(new.id::text, 1, 8)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists t_crear_perfil on auth.users;
create trigger t_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- 3.2 Al crear un reporte: +10 puntos, contador e insignias
create or replace function public.al_crear_reporte()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update perfiles set reportes_total = reportes_total + 1 where id = new.usuario_id;
  perform sumar_puntos(new.usuario_id, 10);
  perform chequear_insignias(new.usuario_id);
  return new;
end;
$$;

drop trigger if exists t_al_crear_reporte on public.reportes;
create trigger t_al_crear_reporte
  after insert on public.reportes
  for each row execute function public.al_crear_reporte();

-- 3.3 Al votar: +2 al votante, conteos del reporte, estado,
--     +3 al autor si "Confirmo", +5 al autor si queda "resuelto"
create or replace function public.al_votar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r reportes%rowtype;
  nuevo_estado text;
begin
  update perfiles set votos_total = votos_total + 1 where id = new.usuario_id;
  perform sumar_puntos(new.usuario_id, 2);

  if new.tipo = 'confirmado' then
    update reportes set conteo_confirmado = conteo_confirmado + 1 where id = new.reporte_id;
  elsif new.tipo in ('persiste', 'recomendado') then
    update reportes set conteo_persiste = conteo_persiste + 1 where id = new.reporte_id;
  else -- resuelto | cerrado
    update reportes set conteo_resuelto = conteo_resuelto + 1 where id = new.reporte_id;
  end if;

  select * into r from reportes where id = new.reporte_id;

  -- Puntos al autor cuando le confirman un reporte
  if new.tipo = 'confirmado' and r.usuario_id <> new.usuario_id then
    perform sumar_puntos(r.usuario_id, 3);
  end if;

  -- Recalcular estado según los conteos acumulados
  if r.conteo_resuelto >= 2 and r.conteo_resuelto >= r.conteo_persiste then
    nuevo_estado := case when r.tipo = 'barrera' then 'resuelto' else 'cerrado' end;
  elsif r.conteo_persiste > 0 then
    nuevo_estado := case when r.tipo = 'barrera' then 'persiste' else 'recomendado' end;
  elsif r.conteo_confirmado > 0 then
    nuevo_estado := 'confirmado';
  else
    nuevo_estado := 'pendiente';
  end if;

  if nuevo_estado <> r.estado then
    update reportes set estado = nuevo_estado where id = r.id;
    -- El autor gana +5 cuando su barrera queda resuelta
    if nuevo_estado = 'resuelto' then
      perform sumar_puntos(r.usuario_id, 5);
    end if;
  end if;

  perform chequear_insignias(new.usuario_id);
  perform chequear_insignias(r.usuario_id);
  return new;
end;
$$;

drop trigger if exists t_al_votar on public.votos_reporte;
create trigger t_al_votar
  after insert on public.votos_reporte
  for each row execute function public.al_votar();

-- 3.4 Al comentar: +2 puntos y contador
create or replace function public.al_comentar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update perfiles set comentarios_total = comentarios_total + 1 where id = new.usuario_id;
  perform sumar_puntos(new.usuario_id, 2);
  perform chequear_insignias(new.usuario_id);
  return new;
end;
$$;

drop trigger if exists t_al_comentar on public.comentarios;
create trigger t_al_comentar
  after insert on public.comentarios
  for each row execute function public.al_comentar();

-- ==============================================================
-- 4. ROW LEVEL SECURITY
-- Lecturas públicas; escrituras solo del usuario autenticado y
-- sobre sus propios datos. Los conteos/puntos/insignias se
-- actualizan únicamente vía triggers SECURITY DEFINER.
-- ==============================================================

alter table public.perfiles enable row level security;
alter table public.reportes enable row level security;
alter table public.votos_reporte enable row level security;
alter table public.comentarios enable row level security;
alter table public.insignias enable row level security;
alter table public.insignias_usuario enable row level security;

-- perfiles
create policy "perfiles lectura publica" on public.perfiles
  for select using (true);
create policy "perfiles actualizar propio" on public.perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- reportes
create policy "reportes lectura publica" on public.reportes
  for select using (true);
create policy "reportes insertar propio" on public.reportes
  for insert to authenticated with check (usuario_id = auth.uid());

-- votos_reporte
create policy "votos lectura publica" on public.votos_reporte
  for select using (true);
create policy "votos insertar propio" on public.votos_reporte
  for insert to authenticated with check (usuario_id = auth.uid());

-- comentarios
create policy "comentarios lectura publica" on public.comentarios
  for select using (true);
create policy "comentarios insertar propio" on public.comentarios
  for insert to authenticated with check (usuario_id = auth.uid());

-- insignias (catálogo) e insignias_usuario: solo lectura pública;
-- la inserción ocurre solo desde funciones SECURITY DEFINER
create policy "insignias lectura publica" on public.insignias
  for select using (true);
create policy "insignias_usuario lectura publica" on public.insignias_usuario
  for select using (true);

-- ==============================================================
-- 5. STORAGE (buckets y políticas)
-- ==============================================================

insert into storage.buckets (id, name, public) values
  ('fotos-reportes', 'fotos-reportes', true),
  ('avatares', 'avatares', true)
on conflict (id) do nothing;

create policy "fotos lectura publica" on storage.objects
  for select using (bucket_id in ('fotos-reportes', 'avatares'));

create policy "fotos subir autenticado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-reportes');

-- Avatares: cada usuario escribe solo en su carpeta (avatares/<uid>/...)
create policy "avatar subir propio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar actualizar propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==============================================================
-- 6. REALTIME
-- Publica cambios de estas tablas para actualizaciones en vivo
-- ==============================================================

alter publication supabase_realtime add table public.reportes;
alter publication supabase_realtime add table public.comentarios;
alter publication supabase_realtime add table public.insignias_usuario;
alter publication supabase_realtime add table public.perfiles;

-- ==============================================================
-- 7. CAPA DE ADMINISTRACIÓN (rol admin + baneo + moderación)
-- Ver detalle y asignación de admins en supabase/migracion_admin.sql
-- ==============================================================

create or replace function public.es_admin(uid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select es_admin from perfiles where id = uid), false);
$$;

create or replace function public.esta_baneado(uid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select baneado from perfiles where id = uid), false);
$$;

-- Un usuario normal no puede cambiarse a sí mismo baneado/es_admin
-- auth.uid() NULL (SQL Editor / service-role) puede asignar el primer admin
create or replace function public.proteger_flags_perfil()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.baneado is distinct from old.baneado
      or new.es_admin is distinct from old.es_admin)
     and auth.uid() is not null
     and not public.es_admin(auth.uid()) then
    new.baneado := old.baneado;
    new.es_admin := old.es_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists t_proteger_flags on public.perfiles;
create trigger t_proteger_flags
  before update on public.perfiles
  for each row execute function public.proteger_flags_perfil();

-- Un usuario baneado no puede reportar, votar ni comentar (restrictivas)
create policy "reportes no baneado" on public.reportes as restrictive
  for insert to authenticated with check (not public.esta_baneado(auth.uid()));
create policy "votos no baneado" on public.votos_reporte as restrictive
  for insert to authenticated with check (not public.esta_baneado(auth.uid()));
create policy "comentarios no baneado" on public.comentarios as restrictive
  for insert to authenticated with check (not public.esta_baneado(auth.uid()));

-- Moderación de admins
create policy "reportes admin actualizar" on public.reportes
  for update to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));
create policy "reportes admin eliminar" on public.reportes
  for delete to authenticated using (public.es_admin(auth.uid()));
create policy "perfiles admin actualizar" on public.perfiles
  for update to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));
create policy "perfiles admin eliminar" on public.perfiles
  for delete to authenticated using (public.es_admin(auth.uid()));
