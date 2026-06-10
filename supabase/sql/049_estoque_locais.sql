-- Locais físicos de estoque (estante · prateleira · divisória) por loja.
-- Execute após 048.

create table if not exists public.estoque_locais (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  estante integer not null,
  prateleira text not null,
  divisoria integer not null,
  codigo text not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint estoque_locais_estante_positive check (estante > 0),
  constraint estoque_locais_divisoria_positive check (divisoria > 0),
  constraint estoque_locais_prateleira_not_empty
    check (char_length(trim(prateleira)) > 0 and char_length(trim(prateleira)) <= 32)
);

create unique index if not exists idx_estoque_locais_unique_posicao
  on public.estoque_locais (company_id, store_id, estante, upper(prateleira), divisoria);

create index if not exists idx_estoque_locais_company_store
  on public.estoque_locais (company_id, store_id, ativo);

create index if not exists idx_estoque_locais_codigo
  on public.estoque_locais (company_id, store_id, codigo);

alter table public.estoque_itens
  add column if not exists local_id uuid references public.estoque_locais (id) on delete set null;

create index if not exists idx_estoque_itens_local
  on public.estoque_itens (company_id, local_id);

create or replace function public.estoque_local_format_codigo(
  p_estante integer,
  p_prateleira text,
  p_divisoria integer
)
returns text
language sql
immutable
as $$
  select p_estante::text || '-' || trim(p_prateleira) || '-' || lpad(p_divisoria::text, 2, '0');
$$;

create or replace function public.estoque_local_format_nome(
  p_estante integer,
  p_prateleira text,
  p_divisoria integer
)
returns text
language sql
immutable
as $$
  select
    'Estante ' || p_estante::text
    || ' · Prateleira ' || trim(p_prateleira)
    || ' · Divisória ' || p_divisoria::text;
$$;

create or replace function public.set_estoque_locais_derived_fields()
returns trigger
language plpgsql
as $$
begin
  new.prateleira := trim(new.prateleira);
  new.codigo := public.estoque_local_format_codigo(new.estante, new.prateleira, new.divisoria);
  new.nome := public.estoque_local_format_nome(new.estante, new.prateleira, new.divisoria);
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_locais_derived on public.estoque_locais;
create trigger trg_estoque_locais_derived
before insert or update of estante, prateleira, divisoria on public.estoque_locais
for each row
execute function public.set_estoque_locais_derived_fields();

create or replace function public.set_estoque_locais_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_locais_updated_at on public.estoque_locais;
create trigger trg_estoque_locais_updated_at
before update on public.estoque_locais
for each row
execute function public.set_estoque_locais_updated_at();

create or replace function public.validate_item_local_company()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
  v_store_id uuid;
begin
  if new.local_id is null then
    return new;
  end if;

  select l.company_id, l.store_id
    into v_company_id, v_store_id
  from public.estoque_locais l
  where l.id = new.local_id;

  if not found then
    raise exception 'Local de estoque não encontrado.';
  end if;

  if v_company_id <> new.company_id then
    raise exception 'Local de estoque não pertence à mesma empresa do item.';
  end if;

  if new.store_id is not null and v_store_id is not null and new.store_id <> v_store_id then
    raise exception 'Local de estoque não pertence à mesma loja do item.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_item_local on public.estoque_itens;
create trigger trg_validate_item_local
before insert or update of company_id, store_id, local_id on public.estoque_itens
for each row
execute function public.validate_item_local_company();

alter table public.estoque_locais enable row level security;

drop policy if exists "estoque_locais_select_member_company" on public.estoque_locais;
create policy "estoque_locais_select_member_company"
  on public.estoque_locais
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_locais_insert_member_company" on public.estoque_locais;
create policy "estoque_locais_insert_member_company"
  on public.estoque_locais
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_locais_update_member_company" on public.estoque_locais;
create policy "estoque_locais_update_member_company"
  on public.estoque_locais
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_locais_delete_member_company" on public.estoque_locais;
create policy "estoque_locais_delete_member_company"
  on public.estoque_locais
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));
