-- Catálogo de serviços da oficina (preço sugerido + vínculo opcional em os_itens).
-- Execute após 011_ordens_servico_oficina.sql

create extension if not exists "pgcrypto";

create table if not exists public.catalogo_servicos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  nome text not null,
  descricao text,
  preco_sugerido numeric(12, 2) not null default 0,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalogo_servicos_nome_nao_vazio check (length(trim(nome)) > 0),
  constraint catalogo_servicos_preco_non_negative check (preco_sugerido >= 0),
  constraint catalogo_servicos_nome_unique_per_company unique (company_id, nome)
);

create index if not exists idx_catalogo_servicos_company_ativo_ordem
  on public.catalogo_servicos (company_id, ativo, ordem, nome);

create or replace function public.set_catalogo_servicos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_catalogo_servicos_updated_at on public.catalogo_servicos;
create trigger trg_catalogo_servicos_updated_at
before update on public.catalogo_servicos
for each row
execute function public.set_catalogo_servicos_updated_at();

alter table public.catalogo_servicos enable row level security;

drop policy if exists "catalogo_servicos_select_member" on public.catalogo_servicos;
create policy "catalogo_servicos_select_member"
  on public.catalogo_servicos
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "catalogo_servicos_insert_member" on public.catalogo_servicos;
create policy "catalogo_servicos_insert_member"
  on public.catalogo_servicos
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "catalogo_servicos_update_member" on public.catalogo_servicos;
create policy "catalogo_servicos_update_member"
  on public.catalogo_servicos
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "catalogo_servicos_delete_member" on public.catalogo_servicos;
create policy "catalogo_servicos_delete_member"
  on public.catalogo_servicos
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

-- Item da OS: referência opcional ao catálogo (somente tipo servico).
alter table public.os_itens
  add column if not exists servico_catalogo_id uuid references public.catalogo_servicos (id) on delete set null;

create or replace function public.validate_os_item_company()
returns trigger
language plpgsql
as $$
declare
  v_os_company uuid;
  v_item_company uuid;
begin
  select company_id into v_os_company from public.ordens_servico where id = new.os_id;
  if v_os_company is null then
    raise exception 'Ordem de serviço inválida.';
  end if;
  if new.company_id is distinct from v_os_company then
    raise exception 'company_id do item diverge da OS.';
  end if;

  if new.tipo = 'peca' and new.servico_catalogo_id is not null then
    raise exception 'Itens de peça não podem referenciar o catálogo de serviços.';
  end if;

  if new.servico_catalogo_id is not null then
    if new.tipo is distinct from 'servico' then
      raise exception 'Catálogo de serviços só pode ser usado em itens do tipo serviço.';
    end if;
    select company_id into v_item_company from public.catalogo_servicos where id = new.servico_catalogo_id;
    if v_item_company is distinct from v_os_company then
      raise exception 'Serviço do catálogo não pertence à mesma empresa da OS.';
    end if;
  end if;

  if new.estoque_item_id is not null then
    select company_id into v_item_company from public.estoque_itens where id = new.estoque_item_id;
    if v_item_company is distinct from v_os_company then
      raise exception 'Item de estoque não pertence à mesma empresa da OS.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_os_itens_company on public.os_itens;
create trigger trg_os_itens_company
before insert or update of company_id, os_id, estoque_item_id, servico_catalogo_id, tipo
on public.os_itens
for each row
execute function public.validate_os_item_company();
