-- Tipos de evento customizados por loja (modal da agenda).
-- Relaxa o enum fixo em calendario_eventos.tipo para aceitar slugs padrão ou UUID do tipo custom.

create table if not exists public.calendario_tipos_evento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  nome text not null,
  cor text not null default 'blue',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint calendario_tipos_evento_nome_not_blank
    check (length(trim(nome)) > 0),
  constraint calendario_tipos_evento_cor_check
    check (cor in ('teal', 'amber', 'blue', 'violet', 'slate', 'rose'))
);

create unique index if not exists idx_calendario_tipos_evento_loja_nome
  on public.calendario_tipos_evento (store_id, lower(trim(nome)));

create index if not exists idx_calendario_tipos_evento_loja
  on public.calendario_tipos_evento (company_id, store_id, ativo);

alter table public.calendario_eventos
  drop constraint if exists calendario_eventos_tipo_check;

alter table public.calendario_eventos
  drop constraint if exists calendario_eventos_tipo_not_blank;

alter table public.calendario_eventos
  add constraint calendario_eventos_tipo_not_blank
    check (length(trim(tipo)) > 0);

alter table public.calendario_tipos_evento enable row level security;

drop policy if exists calendario_tipos_evento_select_member on public.calendario_tipos_evento;
create policy calendario_tipos_evento_select_member
  on public.calendario_tipos_evento for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists calendario_tipos_evento_insert_member on public.calendario_tipos_evento;
create policy calendario_tipos_evento_insert_member
  on public.calendario_tipos_evento for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists calendario_tipos_evento_update_member on public.calendario_tipos_evento;
create policy calendario_tipos_evento_update_member
  on public.calendario_tipos_evento for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists calendario_tipos_evento_delete_member on public.calendario_tipos_evento;
create policy calendario_tipos_evento_delete_member
  on public.calendario_tipos_evento for delete to authenticated
  using (public.is_member_of_company(company_id));
