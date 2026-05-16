-- Lojas (stores): estrutura e RLS multi-tenant para cadastro pelo app.
-- Execute após os scripts 001..009 (is_member_of_company).

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint stores_nome_unique_per_company unique (company_id, name)
);

create index if not exists idx_stores_company_name
  on public.stores (company_id, name);

do $$
begin
  alter table public.stores
    add constraint stores_nome_unique_per_company unique (company_id, name);
exception
  when duplicate_object then null;
end $$;

alter table public.stores enable row level security;

drop policy if exists dev_select_stores on public.stores;

drop policy if exists stores_select_member_company on public.stores;
create policy stores_select_member_company
  on public.stores
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists stores_insert_member_company on public.stores;
create policy stores_insert_member_company
  on public.stores
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists stores_update_member_company on public.stores;
create policy stores_update_member_company
  on public.stores
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists stores_delete_member_company on public.stores;
create policy stores_delete_member_company
  on public.stores
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));
