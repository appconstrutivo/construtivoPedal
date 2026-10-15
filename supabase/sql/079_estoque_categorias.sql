-- Categorias personalizadas de itens de estoque (compartilhadas entre as lojas da empresa).
-- estoque_itens.categoria continua sendo o TIPO do item (peca/bike/acessorio), usado por PDV/Oficina.
-- Execute após 078.

create table if not exists public.estoque_categorias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint estoque_categorias_nome_len
    check (char_length(trim(nome)) between 1 and 60)
);

create unique index if not exists idx_estoque_categorias_nome_unico
  on public.estoque_categorias (company_id, lower(nome))
  where ativo = true;

create index if not exists idx_estoque_categorias_company
  on public.estoque_categorias (company_id, ativo);

create or replace function public.set_estoque_categorias_fields()
returns trigger
language plpgsql
as $$
begin
  new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_categorias_fields on public.estoque_categorias;
create trigger trg_estoque_categorias_fields
before insert or update on public.estoque_categorias
for each row
execute function public.set_estoque_categorias_fields();

alter table public.estoque_itens
  add column if not exists categoria_id uuid
    references public.estoque_categorias (id) on delete set null;

create index if not exists idx_estoque_itens_categoria_id
  on public.estoque_itens (company_id, categoria_id);

create or replace function public.validate_item_categoria_company()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
  v_ativo boolean;
begin
  if new.categoria_id is null then
    return new;
  end if;

  select c.company_id, c.ativo
    into v_company_id, v_ativo
  from public.estoque_categorias c
  where c.id = new.categoria_id;

  if not found then
    raise exception 'Categoria de estoque não encontrada.';
  end if;

  if not v_ativo then
    raise exception 'Categoria de estoque inativa.';
  end if;

  if v_company_id <> new.company_id then
    raise exception 'Categoria de estoque não pertence à mesma empresa do item.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_item_categoria on public.estoque_itens;
create trigger trg_validate_item_categoria
before insert or update of company_id, categoria_id on public.estoque_itens
for each row
execute function public.validate_item_categoria_company();

-- Ao desativar (soft delete) a categoria, os itens ficam "Sem categoria".
create or replace function public.unlink_itens_categoria_inativa()
returns trigger
language plpgsql
as $$
begin
  if old.ativo and not new.ativo then
    update public.estoque_itens
      set categoria_id = null
    where categoria_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_unlink_itens_categoria_inativa on public.estoque_categorias;
create trigger trg_unlink_itens_categoria_inativa
after update of ativo on public.estoque_categorias
for each row
execute function public.unlink_itens_categoria_inativa();

alter table public.estoque_categorias enable row level security;

drop policy if exists "estoque_categorias_select_member_company" on public.estoque_categorias;
create policy "estoque_categorias_select_member_company"
  on public.estoque_categorias
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_categorias_insert_member_company" on public.estoque_categorias;
create policy "estoque_categorias_insert_member_company"
  on public.estoque_categorias
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_categorias_update_member_company" on public.estoque_categorias;
create policy "estoque_categorias_update_member_company"
  on public.estoque_categorias
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));
