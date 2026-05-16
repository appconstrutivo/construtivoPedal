-- Módulo de estoque (itens + movimentações) com isolamento multi-tenant.
-- Execute após os scripts 001..008.

create extension if not exists "pgcrypto";

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

create table if not exists public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  sku text not null,
  nome text not null,
  categoria text not null default 'peca',
  unidade text not null default 'un',
  saldo_atual numeric(12,3) not null default 0,
  estoque_minimo numeric(12,3) not null default 0,
  custo_medio numeric(12,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint estoque_itens_categoria_check
    check (categoria in ('peca', 'bike', 'componente')),
  constraint estoque_itens_saldo_non_negative
    check (saldo_atual >= 0),
  constraint estoque_itens_minimo_non_negative
    check (estoque_minimo >= 0),
  constraint estoque_itens_custo_non_negative
    check (custo_medio >= 0),
  constraint estoque_itens_sku_unique_per_store
    unique (company_id, store_id, sku)
);

create index if not exists idx_estoque_itens_company_categoria
  on public.estoque_itens (company_id, categoria);

create index if not exists idx_estoque_itens_company_saldo
  on public.estoque_itens (company_id, saldo_atual, estoque_minimo);

create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  item_id uuid not null references public.estoque_itens (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  tipo text not null,
  quantidade numeric(12,3) not null,
  origem text,
  observacao text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint estoque_movimentacoes_tipo_check
    check (tipo in ('entrada', 'saida', 'ajuste')),
  constraint estoque_movimentacoes_qtd_non_zero
    check (quantidade <> 0)
);

create index if not exists idx_estoque_mov_company_created
  on public.estoque_movimentacoes (company_id, created_at desc);

create index if not exists idx_estoque_mov_item_created
  on public.estoque_movimentacoes (item_id, created_at desc);

create or replace function public.set_estoque_itens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_itens_updated_at on public.estoque_itens;
create trigger trg_estoque_itens_updated_at
before update on public.estoque_itens
for each row
execute function public.set_estoque_itens_updated_at();

create or replace function public.apply_estoque_movimentacao()
returns trigger
language plpgsql
as $$
declare
  v_item public.estoque_itens%rowtype;
  v_delta numeric(12,3);
  v_novo_saldo numeric(12,3);
begin
  select *
    into v_item
  from public.estoque_itens
  where id = new.item_id
  for update;

  if not found then
    raise exception 'Item de estoque não encontrado.';
  end if;

  if new.tipo = 'entrada' then
    v_delta := abs(new.quantidade);
  elsif new.tipo = 'saida' then
    v_delta := -abs(new.quantidade);
  else
    v_delta := new.quantidade;
  end if;

  v_novo_saldo := v_item.saldo_atual + v_delta;
  if v_novo_saldo < 0 then
    raise exception 'Saldo insuficiente para a movimentação.';
  end if;

  update public.estoque_itens
     set saldo_atual = v_novo_saldo,
         updated_at = timezone('utc', now())
   where id = v_item.id;

  new.company_id := v_item.company_id;
  new.store_id := coalesce(new.store_id, v_item.store_id);
  new.quantidade := v_delta;
  new.created_by := coalesce(new.created_by, auth.uid());

  return new;
end;
$$;

drop trigger if exists trg_apply_estoque_movimentacao on public.estoque_movimentacoes;
create trigger trg_apply_estoque_movimentacao
before insert on public.estoque_movimentacoes
for each row
execute function public.apply_estoque_movimentacao();

alter table public.estoque_itens enable row level security;
alter table public.estoque_movimentacoes enable row level security;

drop policy if exists "estoque_itens_select_member_company" on public.estoque_itens;
create policy "estoque_itens_select_member_company"
  on public.estoque_itens
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_itens_insert_member_company" on public.estoque_itens;
create policy "estoque_itens_insert_member_company"
  on public.estoque_itens
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_itens_update_member_company" on public.estoque_itens;
create policy "estoque_itens_update_member_company"
  on public.estoque_itens
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_itens_delete_member_company" on public.estoque_itens;
create policy "estoque_itens_delete_member_company"
  on public.estoque_itens
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_mov_select_member_company" on public.estoque_movimentacoes;
create policy "estoque_mov_select_member_company"
  on public.estoque_movimentacoes
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_mov_insert_member_company" on public.estoque_movimentacoes;
create policy "estoque_mov_insert_member_company"
  on public.estoque_movimentacoes
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_mov_delete_member_company" on public.estoque_movimentacoes;
create policy "estoque_mov_delete_member_company"
  on public.estoque_movimentacoes
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));
