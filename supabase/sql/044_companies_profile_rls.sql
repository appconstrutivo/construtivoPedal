-- Dados cadastrais da empresa + RLS para membros autenticados.
-- Execute após 007 (is_member_of_company).

alter table public.companies
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text;

comment on column public.companies.legal_name is 'Razão social (nome jurídico)';
comment on column public.companies.cnpj is 'CNPJ apenas dígitos ou formatado';
comment on column public.companies.email is 'E-mail comercial da empresa';
comment on column public.companies.phone is 'Telefone comercial';
comment on column public.companies.address is 'Endereço da matriz / sede';

alter table public.companies enable row level security;

drop policy if exists dev_select_companies on public.companies;

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
  on public.companies
  for select
  to authenticated
  using (public.is_member_of_company(id));

drop policy if exists companies_update_member on public.companies;
create policy companies_update_member
  on public.companies
  for update
  to authenticated
  using (public.is_member_of_company(id))
  with check (public.is_member_of_company(id));
