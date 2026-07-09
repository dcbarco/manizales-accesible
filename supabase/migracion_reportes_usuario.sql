-- ==============================================================
-- MANIZALES ACCESIBLE — Migración: editar/eliminar reportes propios
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
-- Permite que cada usuario edite o borre SUS PROPIOS reportes.
-- (Los conteos/estado los siguen manejando solo los triggers de votación,
--  que corren como SECURITY DEFINER y omiten RLS; la app solo edita la
--  descripción, así que estos permisos no exponen la corroboración.)
-- ==============================================================

create policy "reportes actualizar propio" on public.reportes
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "reportes eliminar propio" on public.reportes
  for delete to authenticated
  using (usuario_id = auth.uid());
