-- Foto do item de estoque (caminho no Storage) + bucket privado.
-- Execute após 009/016.

alter table public.estoque_itens
  add column if not exists imagem_url text;

insert into storage.buckets (id, name, public)
values ('estoque-fotos', 'estoque-fotos', false)
on conflict (id) do nothing;

drop policy if exists estoque_fotos_select_members on storage.objects;
create policy estoque_fotos_select_members
  on storage.objects for select to authenticated
  using (
    bucket_id = 'estoque-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );

drop policy if exists estoque_fotos_insert_members on storage.objects;
create policy estoque_fotos_insert_members
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'estoque-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );

drop policy if exists estoque_fotos_update_members on storage.objects;
create policy estoque_fotos_update_members
  on storage.objects for update to authenticated
  using (
    bucket_id = 'estoque-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'estoque-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );

drop policy if exists estoque_fotos_delete_members on storage.objects;
create policy estoque_fotos_delete_members
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'estoque-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );
