-- ==============================================================
-- MANIZALES ACCESIBLE — Migración: capa de administración
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (sobre el esquema ya creado).
-- Agrega: rol admin y baneo por perfil, funciones de apoyo, protección de
-- flags y políticas RLS para moderación (editar/eliminar reportes y usuarios).
-- ==============================================================

-- 1) Nuevas columnas en perfiles
alter table public.perfiles
  add column if not exists es_admin boolean not null default false,
  add column if not exists baneado boolean not null default false;

-- 2) Funciones de apoyo (SECURITY DEFINER: evitan recursión de RLS)
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

-- 3) Proteger flags sensibles: un usuario normal NO puede cambiarse a sí mismo
--    baneado/es_admin (revierte el cambio salvo que quien edita sea admin).
create or replace function public.proteger_flags_perfil()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.baneado is distinct from old.baneado
      or new.es_admin is distinct from old.es_admin)
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

-- 4) Bloqueo por baneo: políticas RESTRICTIVAS (se combinan con AND) que
--    impiden a un usuario baneado crear reportes, votos o comentarios.
drop policy if exists "reportes no baneado" on public.reportes;
create policy "reportes no baneado" on public.reportes as restrictive
  for insert to authenticated
  with check (not public.esta_baneado(auth.uid()));

drop policy if exists "votos no baneado" on public.votos_reporte;
create policy "votos no baneado" on public.votos_reporte as restrictive
  for insert to authenticated
  with check (not public.esta_baneado(auth.uid()));

drop policy if exists "comentarios no baneado" on public.comentarios;
create policy "comentarios no baneado" on public.comentarios as restrictive
  for insert to authenticated
  with check (not public.esta_baneado(auth.uid()));

-- 5) Moderación de admins (políticas permisivas adicionales)
drop policy if exists "reportes admin actualizar" on public.reportes;
create policy "reportes admin actualizar" on public.reportes
  for update to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));

drop policy if exists "reportes admin eliminar" on public.reportes;
create policy "reportes admin eliminar" on public.reportes
  for delete to authenticated
  using (public.es_admin(auth.uid()));

drop policy if exists "perfiles admin actualizar" on public.perfiles;
create policy "perfiles admin actualizar" on public.perfiles
  for update to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));

-- Eliminar un usuario borra su perfil (cascada: sus reportes/votos/comentarios)
drop policy if exists "perfiles admin eliminar" on public.perfiles;
create policy "perfiles admin eliminar" on public.perfiles
  for delete to authenticated
  using (public.es_admin(auth.uid()));

-- 6) Realtime: cambios de perfiles al panel admin (baneos, etc.)
alter publication supabase_realtime add table public.perfiles;

-- ==============================================================
-- 7) ASIGNAR ADMINS  ← EDITA ESTA LÍNEA con tus correos
-- ==============================================================
update public.perfiles set es_admin = true
where id in (
  select id from auth.users
  where email in ('castillodann@gmail.com')  -- agrega aquí más correos
);
