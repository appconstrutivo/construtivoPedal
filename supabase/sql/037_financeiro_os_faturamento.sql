-- Faturamento de OS: contas a receber, recebimento no caixa e venda vinculada.
-- Execute após 036.

-- ─── Vendas originadas de OS (sem nova baixa de estoque) ───────────────────────
alter table public.vendas
  add column if not exists os_id uuid references public.ordens_servico (id) on delete set null;

create unique index if not exists idx_vendas_os_id_unique
  on public.vendas (os_id)
  where os_id is not null;

-- ─── Contas a receber ─────────────────────────────────────────────────────────
create table if not exists public.financeiro_contas_receber (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  cliente_id uuid references public.clientes (id) on delete set null,
  os_id uuid references public.ordens_servico (id) on delete restrict,
  venda_id uuid references public.vendas (id) on delete set null,
  descricao text not null,
  valor numeric(12,2) not null,
  vencimento date not null,
  status text not null default 'pendente',
  forma_pagamento text,
  conta_financeira_id uuid references public.financeiro_contas (id) on delete set null,
  data_recebimento date,
  movimentacao_id uuid references public.financeiro_movimentacoes (id) on delete set null,
  observacao text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint financeiro_contas_receber_valor_positive check (valor > 0),
  constraint financeiro_contas_receber_status_check
    check (status in ('pendente', 'recebido', 'cancelado')),
  constraint financeiro_contas_receber_forma_check
    check (
      forma_pagamento is null
      or forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'outro')
    )
);

create unique index if not exists idx_financeiro_contas_receber_os
  on public.financeiro_contas_receber (os_id)
  where os_id is not null and status <> 'cancelado';

create index if not exists idx_financeiro_contas_receber_store_venc
  on public.financeiro_contas_receber (company_id, store_id, vencimento, status);

drop trigger if exists trg_financeiro_contas_receber_updated_at on public.financeiro_contas_receber;
create trigger trg_financeiro_contas_receber_updated_at
before update on public.financeiro_contas_receber
for each row execute function public.set_financeiro_updated_at();

-- Origem das movimentações: incluir conta a receber
alter table public.financeiro_movimentacoes
  drop constraint if exists financeiro_movimentacoes_origem_check;

alter table public.financeiro_movimentacoes
  add constraint financeiro_movimentacoes_origem_check
  check (origem in ('manual', 'conta_pagar', 'conta_receber', 'pdv'));

-- ─── Validação de referências ─────────────────────────────────────────────────
create or replace function public.validate_financeiro_conta_receber_refs()
returns trigger
language plpgsql
as $$
declare
  v_store_company uuid;
  v_os public.ordens_servico%rowtype;
begin
  select s.company_id into v_store_company
  from public.stores s where s.id = new.store_id;

  if not found or v_store_company <> new.company_id then
    raise exception 'Loja inválida para a empresa.';
  end if;

  if new.os_id is not null then
    select * into v_os from public.ordens_servico where id = new.os_id;
    if not found or v_os.company_id <> new.company_id or v_os.store_id <> new.store_id then
      raise exception 'OS inválida para esta loja.';
    end if;
    new.cliente_id := coalesce(new.cliente_id, v_os.cliente_id);
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

drop trigger if exists trg_financeiro_contas_receber_refs on public.financeiro_contas_receber;
create trigger trg_financeiro_contas_receber_refs
before insert or update on public.financeiro_contas_receber
for each row execute function public.validate_financeiro_conta_receber_refs();

-- ─── Faturar OS (gera conta a receber pendente) ───────────────────────────────
create or replace function public.os_faturar(
  p_os_id uuid,
  p_vencimento date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_os public.ordens_servico%rowtype;
  v_total numeric(12,2) := 0;
  v_cr_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_os from public.ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if not public.is_member_of_company(v_os.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if v_os.status = 'cancelada' then
    raise exception 'Não é possível faturar OS cancelada.';
  end if;

  if v_os.status not in ('pronta', 'entregue') then
    raise exception 'Fature a OS somente quando estiver Pronta ou Entregue.';
  end if;

  if exists (
    select 1 from public.financeiro_contas_receber cr
    where cr.os_id = p_os_id and cr.status in ('pendente', 'recebido')
  ) then
    raise exception 'Esta OS já possui faturamento ativo.';
  end if;

  select coalesce(sum(round(i.quantidade * i.preco_unitario, 2)), 0)
    into v_total
    from public.os_itens i
   where i.os_id = p_os_id;

  if v_total <= 0 then
    raise exception 'Adicione peças ou serviços antes de faturar.';
  end if;

  insert into public.financeiro_contas_receber (
    company_id,
    store_id,
    cliente_id,
    os_id,
    descricao,
    valor,
    vencimento,
    status
  )
  values (
    v_os.company_id,
    v_os.store_id,
    v_os.cliente_id,
    p_os_id,
    format('OS #%s — %s', v_os.numero, coalesce(
      (select c.nome from public.clientes c where c.id = v_os.cliente_id),
      'Cliente'
    )),
    v_total,
    coalesce(p_vencimento, current_date),
    'pendente'
  )
  returning id into v_cr_id;

  return v_cr_id;
end;
$$;

grant execute on function public.os_faturar(uuid, date) to authenticated;

-- ─── Receber conta (caixa + venda espelho, sem nova baixa de estoque) ─────────
create or replace function public.financeiro_registrar_recebimento(
  p_conta_receber_id uuid,
  p_conta_financeira_id uuid,
  p_forma_pagamento text,
  p_data_recebimento date default current_date
)
returns table (venda_id uuid, venda_numero integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cr public.financeiro_contas_receber%rowtype;
  v_conta public.financeiro_contas%rowtype;
  v_os public.ordens_servico%rowtype;
  v_mov_id uuid;
  v_venda_id uuid;
  v_numero integer;
  v_item public.os_itens%rowtype;
  v_forma text;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  v_forma := coalesce(nullif(trim(p_forma_pagamento), ''), 'dinheiro');
  if v_forma not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  select * into v_cr
  from public.financeiro_contas_receber
  where id = p_conta_receber_id
  for update;

  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;

  if not public.is_member_of_company(v_cr.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if v_cr.status <> 'pendente' then
    raise exception 'Somente contas pendentes podem ser recebidas.';
  end if;

  select * into v_conta
  from public.financeiro_contas
  where id = p_conta_financeira_id
    and company_id = v_cr.company_id
    and store_id = v_cr.store_id
    and ativo = true
  for update;

  if not found then
    raise exception 'Conta financeira não encontrada.';
  end if;

  if v_cr.os_id is not null then
    select * into v_os from public.ordens_servico where id = v_cr.os_id;
    if not found then
      raise exception 'OS vinculada não encontrada.';
    end if;
  end if;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem, origem_id
  )
  values (
    v_cr.company_id,
    v_cr.store_id,
    p_conta_financeira_id,
    'entrada',
    v_cr.valor,
    'Recebimento: ' || v_cr.descricao,
    'conta_receber',
    p_conta_receber_id
  )
  returning id into v_mov_id;

  update public.financeiro_contas
  set saldo_atual = saldo_atual + v_cr.valor
  where id = p_conta_financeira_id;

  if v_cr.os_id is not null then
    insert into public.vendas (
      company_id,
      store_id,
      cliente_id,
      bicicleta_id,
      os_id,
      status,
      forma_pagamento,
      subtotal,
      desconto,
      total,
      observacao,
      vendedor_id,
      realizada_em
    )
    values (
      v_cr.company_id,
      v_cr.store_id,
      v_os.cliente_id,
      v_os.bicicleta_id,
      v_cr.os_id,
      'finalizada',
      v_forma,
      v_cr.valor,
      0,
      v_cr.valor,
      format('Faturamento OS #%s', v_os.numero),
      v_user,
      coalesce(p_data_recebimento, current_date)::timestamptz
    )
    returning vendas.id, vendas.numero into v_venda_id, v_numero;

    insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor)
    values (v_cr.company_id, v_venda_id, v_forma, v_cr.valor);

    for v_item in
      select * from public.os_itens where os_id = v_cr.os_id order by created_at
    loop
      insert into public.venda_itens (
        company_id,
        venda_id,
        estoque_item_id,
        descricao,
        quantidade,
        preco_unitario,
        movimentacao_id
      )
      values (
        v_cr.company_id,
        v_venda_id,
        v_item.estoque_item_id,
        v_item.descricao,
        v_item.quantidade,
        v_item.preco_unitario,
        null
      );
    end loop;

    if v_os.cliente_id is not null then
      insert into public.atividades (
        company_id,
        cliente_id,
        bicicleta_id,
        tipo,
        descricao,
        valor,
        data_registro
      )
      values (
        v_cr.company_id,
        v_os.cliente_id,
        v_os.bicicleta_id,
        'venda',
        format('OS #%s recebida — venda #%s', v_os.numero, v_numero),
        v_cr.valor,
        coalesce(p_data_recebimento, current_date)
      );
    end if;
  end if;

  update public.financeiro_contas_receber
  set status = 'recebido',
      forma_pagamento = v_forma,
      conta_financeira_id = p_conta_financeira_id,
      data_recebimento = coalesce(p_data_recebimento, current_date),
      movimentacao_id = v_mov_id,
      venda_id = v_venda_id
  where id = p_conta_receber_id;

  return query select v_venda_id, v_numero;
end;
$$;

grant execute on function public.financeiro_registrar_recebimento(uuid, uuid, text, date) to authenticated;

-- ─── Cancelar faturamento pendente (ex.: OS cancelada) ────────────────────────
create or replace function public.financeiro_cancelar_conta_receber(p_conta_receber_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cr public.financeiro_contas_receber%rowtype;
begin
  select * into v_cr from public.financeiro_contas_receber where id = p_conta_receber_id for update;
  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;

  if not public.is_member_of_company(v_cr.company_id) then
    raise exception 'Sem permissão.';
  end if;

  if v_cr.status <> 'pendente' then
    raise exception 'Somente contas pendentes podem ser canceladas.';
  end if;

  update public.financeiro_contas_receber
  set status = 'cancelado'
  where id = p_conta_receber_id;
end;
$$;

grant execute on function public.financeiro_cancelar_conta_receber(uuid) to authenticated;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.financeiro_contas_receber enable row level security;

drop policy if exists "financeiro_contas_receber_select" on public.financeiro_contas_receber;
create policy "financeiro_contas_receber_select" on public.financeiro_contas_receber
  for select to authenticated using (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_receber_insert" on public.financeiro_contas_receber;
create policy "financeiro_contas_receber_insert" on public.financeiro_contas_receber
  for insert to authenticated with check (public.is_member_of_company(company_id));

drop policy if exists "financeiro_contas_receber_update" on public.financeiro_contas_receber;
create policy "financeiro_contas_receber_update" on public.financeiro_contas_receber
  for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));
