-- Lista de pedidos de peças (reposição + pedidos de clientes no balcão).
-- Execute após 046_os_entregue_validacoes.sql

create extension if not exists "pgcrypto";

-- ─── Pedidos de peças ───────────────────────────────────────────────────────

create or replace function public.set_pedidos_pecas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.pedidos_pecas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  descricao text not null,
  estoque_item_id uuid references public.estoque_itens (id) on delete set null,
  quantidade integer not null default 1,
  cliente_id uuid references public.clientes (id) on delete set null,
  cliente_nome text,
  cliente_telefone text,
  sinal_valor numeric(12, 2),
  status text not null default 'pendente',
  observacoes text,
  cliente_avisado boolean not null default false,
  chegou_em timestamptz,
  entregue_em timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pedidos_pecas_quantidade_positive check (quantidade > 0),
  constraint pedidos_pecas_sinal_non_negative check (sinal_valor is null or sinal_valor >= 0),
  constraint pedidos_pecas_status_check
    check (status in ('pendente', 'chegou', 'entregue', 'cancelado')),
  constraint pedidos_pecas_descricao_not_blank check (length(trim(descricao)) > 0)
);

create index if not exists idx_pedidos_pecas_company_store_status
  on public.pedidos_pecas (company_id, store_id, status, created_at desc);

create index if not exists idx_pedidos_pecas_cliente
  on public.pedidos_pecas (cliente_id)
  where cliente_id is not null;

create index if not exists idx_pedidos_pecas_estoque_item
  on public.pedidos_pecas (estoque_item_id)
  where estoque_item_id is not null;

drop trigger if exists trg_pedidos_pecas_updated_at on public.pedidos_pecas;
create trigger trg_pedidos_pecas_updated_at
before update on public.pedidos_pecas
for each row
execute function public.set_pedidos_pecas_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.pedidos_pecas enable row level security;

drop policy if exists "pedidos_pecas_select_member_company" on public.pedidos_pecas;
create policy "pedidos_pecas_select_member_company"
  on public.pedidos_pecas
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "pedidos_pecas_insert_member_company" on public.pedidos_pecas;
create policy "pedidos_pecas_insert_member_company"
  on public.pedidos_pecas
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "pedidos_pecas_update_member_company" on public.pedidos_pecas;
create policy "pedidos_pecas_update_member_company"
  on public.pedidos_pecas
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "pedidos_pecas_delete_member_company" on public.pedidos_pecas;
create policy "pedidos_pecas_delete_member_company"
  on public.pedidos_pecas
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));
