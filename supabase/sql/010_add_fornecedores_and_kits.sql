-- Fornecedores + composição de kits para o módulo de estoque.
-- Execute após o script 009.

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  nome text not null,
  contato text,
  telefone text,
  email text,
  prazo_medio_dias integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fornecedores_prazo_non_negative check (prazo_medio_dias >= 0),
  constraint fornecedores_nome_unique_per_company unique (company_id, nome)
);

alter table public.estoque_itens
  add column if not exists fornecedor_id uuid references public.fornecedores (id) on delete set null;

create index if not exists idx_fornecedores_company_nome
  on public.fornecedores (company_id, nome);

create index if not exists idx_estoque_itens_fornecedor
  on public.estoque_itens (company_id, fornecedor_id);

create table if not exists public.estoque_kits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sku text not null,
  nome text not null,
  item_resultante_id uuid references public.estoque_itens (id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint estoque_kits_unique_per_company unique (company_id, sku)
);

create table if not exists public.estoque_kit_componentes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kit_id uuid not null references public.estoque_kits (id) on delete cascade,
  componente_item_id uuid not null references public.estoque_itens (id) on delete restrict,
  quantidade numeric(12,3) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint estoque_kit_componentes_qtd_positive check (quantidade > 0),
  constraint estoque_kit_componentes_unique unique (kit_id, componente_item_id)
);

create index if not exists idx_estoque_kits_company
  on public.estoque_kits (company_id, nome);

create index if not exists idx_estoque_kit_componentes_company
  on public.estoque_kit_componentes (company_id, kit_id);

create or replace function public.set_fornecedores_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_fornecedores_updated_at on public.fornecedores;
create trigger trg_fornecedores_updated_at
before update on public.fornecedores
for each row
execute function public.set_fornecedores_updated_at();

create or replace function public.set_estoque_kits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_kits_updated_at on public.estoque_kits;
create trigger trg_estoque_kits_updated_at
before update on public.estoque_kits
for each row
execute function public.set_estoque_kits_updated_at();

create or replace function public.validate_item_fornecedor_company()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
begin
  if new.fornecedor_id is null then
    return new;
  end if;

  select f.company_id
    into v_company_id
  from public.fornecedores f
  where f.id = new.fornecedor_id;

  if not found then
    raise exception 'Fornecedor não encontrado.';
  end if;

  if v_company_id <> new.company_id then
    raise exception 'Fornecedor não pertence à mesma empresa do item.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_item_fornecedor_company on public.estoque_itens;
create trigger trg_validate_item_fornecedor_company
before insert or update of fornecedor_id, company_id on public.estoque_itens
for each row
execute function public.validate_item_fornecedor_company();

create or replace function public.registrar_montagem_kit(
  p_company_id uuid,
  p_kit_id uuid,
  p_quantidade numeric,
  p_origem text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.estoque_kits%rowtype;
  v_comp record;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade de montagem deve ser maior que zero.';
  end if;

  select *
    into v_kit
  from public.estoque_kits k
  where k.id = p_kit_id
    and k.company_id = p_company_id
    and k.ativo = true;

  if not found then
    raise exception 'Kit não encontrado para esta empresa.';
  end if;

  if v_kit.item_resultante_id is null then
    raise exception 'Kit sem item resultante vinculado.';
  end if;

  for v_comp in
    select c.componente_item_id, c.quantidade
    from public.estoque_kit_componentes c
    where c.kit_id = v_kit.id
      and c.company_id = p_company_id
  loop
    insert into public.estoque_movimentacoes (
      company_id,
      item_id,
      tipo,
      quantidade,
      origem,
      observacao
    )
    values (
      p_company_id,
      v_comp.componente_item_id,
      'saida',
      v_comp.quantidade * p_quantidade,
      coalesce(p_origem, 'montagem de kit'),
      format('Baixa por montagem do kit: %s', v_kit.nome)
    );
  end loop;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    tipo,
    quantidade,
    origem,
    observacao
  )
  values (
    p_company_id,
    v_kit.item_resultante_id,
    'entrada',
    p_quantidade,
    coalesce(p_origem, 'montagem de kit'),
    format('Entrada por montagem do kit: %s', v_kit.nome)
  );
end;
$$;

grant execute on function public.registrar_montagem_kit(uuid, uuid, numeric, text) to authenticated;

alter table public.fornecedores enable row level security;
alter table public.estoque_kits enable row level security;
alter table public.estoque_kit_componentes enable row level security;

drop policy if exists "fornecedores_select_member_company" on public.fornecedores;
create policy "fornecedores_select_member_company"
  on public.fornecedores
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "fornecedores_insert_member_company" on public.fornecedores;
create policy "fornecedores_insert_member_company"
  on public.fornecedores
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "fornecedores_update_member_company" on public.fornecedores;
create policy "fornecedores_update_member_company"
  on public.fornecedores
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "fornecedores_delete_member_company" on public.fornecedores;
create policy "fornecedores_delete_member_company"
  on public.fornecedores
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kits_select_member_company" on public.estoque_kits;
create policy "estoque_kits_select_member_company"
  on public.estoque_kits
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kits_insert_member_company" on public.estoque_kits;
create policy "estoque_kits_insert_member_company"
  on public.estoque_kits
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kits_update_member_company" on public.estoque_kits;
create policy "estoque_kits_update_member_company"
  on public.estoque_kits
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kits_delete_member_company" on public.estoque_kits;
create policy "estoque_kits_delete_member_company"
  on public.estoque_kits
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_componentes_select_member_company" on public.estoque_kit_componentes;
create policy "estoque_kit_componentes_select_member_company"
  on public.estoque_kit_componentes
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_componentes_insert_member_company" on public.estoque_kit_componentes;
create policy "estoque_kit_componentes_insert_member_company"
  on public.estoque_kit_componentes
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_componentes_update_member_company" on public.estoque_kit_componentes;
create policy "estoque_kit_componentes_update_member_company"
  on public.estoque_kit_componentes
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_componentes_delete_member_company" on public.estoque_kit_componentes;
create policy "estoque_kit_componentes_delete_member_company"
  on public.estoque_kit_componentes
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));
