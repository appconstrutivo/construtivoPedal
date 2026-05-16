-- Políticas RLS multi-tenant para o módulo de clientes (usuários autenticados).
-- Objetivo:
-- 1) Permitir CRUD somente dentro das empresas em que o usuário é membro ativo.
-- 2) Não exigir e-mail para cadastro de cliente (email já é nullable na tabela).

create or replace function public.is_member_of_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.is_active = true
  );
$$;

grant execute on function public.is_member_of_company(uuid) to authenticated;

alter table public.clientes enable row level security;
alter table public.bicicletas enable row level security;
alter table public.atividades enable row level security;

-- Remove políticas antigas de desenvolvimento (anon aberto).
drop policy if exists "dev_select_clientes" on public.clientes;
drop policy if exists "dev_insert_clientes" on public.clientes;
drop policy if exists "dev_update_clientes" on public.clientes;
drop policy if exists "dev_delete_clientes" on public.clientes;

drop policy if exists "dev_select_bicicletas" on public.bicicletas;
drop policy if exists "dev_insert_bicicletas" on public.bicicletas;
drop policy if exists "dev_update_bicicletas" on public.bicicletas;
drop policy if exists "dev_delete_bicicletas" on public.bicicletas;

drop policy if exists "dev_select_atividades" on public.atividades;
drop policy if exists "dev_insert_atividades" on public.atividades;
drop policy if exists "dev_update_atividades" on public.atividades;
drop policy if exists "dev_delete_atividades" on public.atividades;

-- CLIENTES
drop policy if exists "clientes_select_member_company" on public.clientes;
create policy "clientes_select_member_company"
  on public.clientes
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "clientes_insert_member_company" on public.clientes;
create policy "clientes_insert_member_company"
  on public.clientes
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "clientes_update_member_company" on public.clientes;
create policy "clientes_update_member_company"
  on public.clientes
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "clientes_delete_member_company" on public.clientes;
create policy "clientes_delete_member_company"
  on public.clientes
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

-- BICICLETAS
drop policy if exists "bicicletas_select_member_company" on public.bicicletas;
create policy "bicicletas_select_member_company"
  on public.bicicletas
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "bicicletas_insert_member_company" on public.bicicletas;
create policy "bicicletas_insert_member_company"
  on public.bicicletas
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "bicicletas_update_member_company" on public.bicicletas;
create policy "bicicletas_update_member_company"
  on public.bicicletas
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "bicicletas_delete_member_company" on public.bicicletas;
create policy "bicicletas_delete_member_company"
  on public.bicicletas
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

-- ATIVIDADES
drop policy if exists "atividades_select_member_company" on public.atividades;
create policy "atividades_select_member_company"
  on public.atividades
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "atividades_insert_member_company" on public.atividades;
create policy "atividades_insert_member_company"
  on public.atividades
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "atividades_update_member_company" on public.atividades;
create policy "atividades_update_member_company"
  on public.atividades
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "atividades_delete_member_company" on public.atividades;
create policy "atividades_delete_member_company"
  on public.atividades
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));
