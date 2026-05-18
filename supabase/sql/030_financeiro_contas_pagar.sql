-- Financeiro: contas (caixa/banco) e contas a pagar por loja.
-- Execute após 029.

-- ─── Contas financeiras (caixa, banco, pix) ───────────────────────────────────
create table if not exists public.financeiro_contas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  nome text not null,
  tipo text not null default 'caixa',
  saldo_atual numeric(12,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint financeiro_contas_tipo_check check (tipo in ('caixa', 'banco', 'pix')),
  constraint financeiro_contas_nome_unique unique (company_id, store_id, nome)
);

create index if not exists idx_financeiro_contas_company_store
  on public.financeiro_contas (company_id, store_id)
  where ativo = true;

-- ─── Contas a pagar ───────────────────────────────────────────────────────────
create table if not exists public.financeiro_contas_pagar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  fornecedor_id uuid references public.fornecedores (id) on delete set null,
  descricao text not null,
  categoria text not null default 'outro',
  valor numeric(12,2) not null,
  vencimento date not null,
  status text not null default 'pendente',
  conta_financeira_id uuid references public.financeiro_contas (id) on delete set null,
  data_pagamento date,
  observacao text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint financeiro_contas_pagar_valor_positive check (valor > 0),
  constraint financeiro_contas_pagar_categoria_check
    check (categoria in ('fornecedor', 'fixa', 'imposto', 'folha', 'outro')),
  constraint financeiro_contas_pagar_status_check
    check (status in ('pendente', 'pago', 'cancelado'))
);

create index if not exists idx_financeiro_contas_pagar_store_venc
  on public.financeiro_contas_pagar (company_id, store_id, vencimento, status);

-- ─── Movimentações nas contas ─────────────────────────────────────────────────
create table if not exists public.financeiro_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  conta_id uuid not null references public.financeiro_contas (id) on delete restrict,
  tipo text not null,
  valor numeric(12,2) not null,
  descricao text not null,
  origem text not null default 'manual',
  origem_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint financeiro_movimentacoes_tipo_check check (tipo in ('entrada', 'saida')),
  constraint financeiro_movimentacoes_valor_positive check (valor > 0),
  constraint financeiro_movimentacoes_origem_check
    check (origem in ('manual', 'conta_pagar', 'pdv'))
);

create index if not exists idx_financeiro_movimentacoes_conta
  on public.financeiro_movimentacoes (conta_id, created_at desc);

-- ─── updated_at ───────────────────────────────────────────────────────────────
create or replace function public.set_financeiro_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_financeiro_contas_updated_at on public.financeiro_contas;
create trigger trg_financeiro_contas_updated_at
before update on public.financeiro_contas
for each row execute function public.set_financeiro_updated_at();

drop trigger if exists trg_financeiro_contas_pagar_updated_at on public.financeiro_contas_pagar;
create trigger trg_financeiro_contas_pagar_updated_at
before update on public.financeiro_contas_pagar
for each row execute function public.set_financeiro_updated_at();

-- ─── Valida loja / fornecedor na mesma empresa ────────────────────────────────
create or replace function public.validate_financeiro_conta_pagar_refs()
returns trigger
language plpgsql
as $$
declare
  v_store_company uuid;
  v_forn_company uuid;
  v_forn_store uuid;
begin
  select s.company_id into v_store_company
  from public.stores s where s.id = new.store_id;

  if not found or v_store_company <> new.company_id then
    raise exception 'Loja inválida para a empresa.';
  end if;

  if new.fornecedor_id is not null then
    select f.company_id, f.store_id into v_forn_company, v_forn_store
    from public.fornecedores f where f.id = new.fornecedor_id;

    if not found or v_forn_company <> new.company_id then
      raise exception 'Fornecedor não pertence à empresa.';
    end if;

    if v_forn_store is not null and v_forn_store <> new.store_id then
      raise exception 'Fornecedor não pertence à mesma loja.';
    end if;
  end if;

  if new.conta_financeira_id is not null then
    if not exists (
      select 1 from public.financeiro_contas c
      where c.id = new.conta_financeira_id
        and c.company_id = new.company_id
        and c.store_id = new.store_id
    ) then
      raise exception 'Conta financeira inválida para esta loja.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_contas_pagar_refs on public.financeiro_contas_pagar;
create trigger trg_financeiro_contas_pagar_refs
before insert or update on public.financeiro_contas_pagar
for each row execute function public.validate_financeiro_conta_pagar_refs();

-- ─── Garante caixa padrão da loja ─────────────────────────────────────────────
create or replace function public.financeiro_garantir_conta_caixa(
  p_company_id uuid,
  p_store_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  select c.id into v_id
  from public.financeiro_contas c
  where c.company_id = p_company_id
    and c.store_id = p_store_id
    and c.tipo = 'caixa'
    and c.ativo = true
  order by c.created_at
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.financeiro_contas (company_id, store_id, nome, tipo, saldo_atual)
  values (p_company_id, p_store_id, 'Caixa da loja', 'caixa', 0)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.financeiro_garantir_conta_caixa(uuid, uuid) to authenticated;

-- ─── Registrar pagamento de conta a pagar ─────────────────────────────────────
create or replace function public.financeiro_registrar_pagamento(
  p_company_id uuid,
  p_store_id uuid,
  p_conta_pagar_id uuid,
  p_conta_financeira_id uuid,
  p_data_pagamento date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp public.financeiro_contas_pagar%rowtype;
  v_conta public.financeiro_contas%rowtype;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  select * into v_cp
  from public.financeiro_contas_pagar
  where id = p_conta_pagar_id
    and company_id = p_company_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;

  if v_cp.status <> 'pendente' then
    raise exception 'Somente contas pendentes podem ser pagas.';
  end if;

  select * into v_conta
  from public.financeiro_contas
  where id = p_conta_financeira_id
    and company_id = p_company_id
    and store_id = p_store_id
    and ativo = true
  for update;

  if not found then
    raise exception 'Conta financeira não encontrada.';
  end if;

  update public.financeiro_contas_pagar
  set status = 'pago',
      conta_financeira_id = p_conta_financeira_id,
      data_pagamento = coalesce(p_data_pagamento, current_date)
  where id = p_conta_pagar_id;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem, origem_id
  ) values (
    p_company_id,
    p_store_id,
    p_conta_financeira_id,
    'saida',
    v_cp.valor,
    'Pagamento: ' || v_cp.descricao,
    'conta_pagar',
    p_conta_pagar_id
  );

  update public.financeiro_contas
  set saldo_atual = saldo_atual - v_cp.valor
  where id = p_conta_financeira_id;
end;
$$;

grant execute on function public.financeiro_registrar_pagamento(uuid, uuid, uuid, uuid, date) to authenticated;

-- ─── Movimentação manual (entrada/saída) ──────────────────────────────────────
create or replace function public.financeiro_registrar_movimentacao(
  p_company_id uuid,
  p_store_id uuid,
  p_conta_id uuid,
  p_tipo text,
  p_valor numeric,
  p_descricao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov_id uuid;
  v_delta numeric;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor deve ser maior que zero.';
  end if;

  if not exists (
    select 1 from public.financeiro_contas c
    where c.id = p_conta_id
      and c.company_id = p_company_id
      and c.store_id = p_store_id
      and c.ativo = true
  ) then
    raise exception 'Conta financeira não encontrada.';
  end if;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem
  ) values (
    p_company_id, p_store_id, p_conta_id, p_tipo, p_valor, trim(p_descricao), 'manual'
  )
  returning id into v_mov_id;

  v_delta := case when p_tipo = 'entrada' then p_valor else -p_valor end;

  update public.financeiro_contas
  set saldo_atual = saldo_atual + v_delta
  where id = p_conta_id;

  return v_mov_id;
end;
$$;

grant execute on function public.financeiro_registrar_movimentacao(uuid, uuid, uuid, text, numeric, text) to authenticated;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.financeiro_contas enable row level security;
alter table public.financeiro_contas_pagar enable row level security;
alter table public.financeiro_movimentacoes enable row level security;

drop policy if exists "financeiro_contas_select" on public.financeiro_contas;
create policy "financeiro_contas_select" on public.financeiro_contas
  for select to authenticated using (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_insert" on public.financeiro_contas;
create policy "financeiro_contas_insert" on public.financeiro_contas
  for insert to authenticated with check (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_update" on public.financeiro_contas;
create policy "financeiro_contas_update" on public.financeiro_contas
  for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_pagar_select" on public.financeiro_contas_pagar;
create policy "financeiro_contas_pagar_select" on public.financeiro_contas_pagar
  for select to authenticated using (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_pagar_insert" on public.financeiro_contas_pagar;
create policy "financeiro_contas_pagar_insert" on public.financeiro_contas_pagar
  for insert to authenticated with check (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_pagar_update" on public.financeiro_contas_pagar;
create policy "financeiro_contas_pagar_update" on public.financeiro_contas_pagar
  for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "financeiro_movimentacoes_select" on public.financeiro_movimentacoes;
create policy "financeiro_movimentacoes_select" on public.financeiro_movimentacoes
  for select to authenticated using (public.is_member_of_company(company_id));
