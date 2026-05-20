-- Data operacional das movimentações (sincroniza com venda/OS e ajuste em Lançamentos).

alter table public.financeiro_movimentacoes
  add column if not exists realizada_em timestamptz;

update public.financeiro_movimentacoes
set realizada_em = created_at
where realizada_em is null;

alter table public.financeiro_movimentacoes
  alter column realizada_em set not null,
  alter column realizada_em set default timezone('utc', now());

create index if not exists idx_financeiro_movimentacoes_conta_realizada
  on public.financeiro_movimentacoes (conta_id, realizada_em desc);

-- Sincroniza movimentações de OS já recebidas com a data da venda vinculada
update public.financeiro_movimentacoes fm
set realizada_em = v.realizada_em
from public.financeiro_contas_receber cr
join public.vendas v on v.id = cr.venda_id
where cr.movimentacao_id = fm.id
  and v.realizada_em is not null
  and fm.realizada_em is distinct from v.realizada_em;

create or replace function public.trg_financeiro_mov_set_realizada_em()
returns trigger
language plpgsql
as $$
begin
  if new.realizada_em is null then
    new.realizada_em := coalesce(new.created_at, timezone('utc', now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_financeiro_mov_realizada_em on public.financeiro_movimentacoes;
create trigger trg_financeiro_mov_realizada_em
before insert on public.financeiro_movimentacoes
for each row
execute function public.trg_financeiro_mov_set_realizada_em();

-- ─── Ajuste de data da venda propaga para conta a receber e movimentação ─────
create or replace function public.pdv_ajustar_data_venda(
  p_venda_id uuid,
  p_realizada_em timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_data_br date;
begin
  if p_realizada_em is null then
    raise exception 'Informe a data da venda.';
  end if;

  if p_realizada_em > timezone('utc', now()) + interval '1 day' then
    raise exception 'A data da venda não pode ser no futuro.';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  if not public.is_member_of_company(v_venda.company_id) then
    raise exception 'Sem permissão para alterar esta venda.';
  end if;

  v_data_br := (p_realizada_em at time zone 'America/Sao_Paulo')::date;

  update public.vendas
  set realizada_em = p_realizada_em
  where id = p_venda_id;

  update public.financeiro_contas_receber
  set data_recebimento = v_data_br
  where venda_id = p_venda_id
     or (v_venda.os_id is not null and os_id = v_venda.os_id and status = 'recebido');

  update public.financeiro_movimentacoes fm
  set realizada_em = p_realizada_em
  from public.financeiro_contas_receber cr
  where cr.movimentacao_id = fm.id
    and (cr.venda_id = p_venda_id
      or (v_venda.os_id is not null and cr.os_id = v_venda.os_id));
end;
$$;

grant execute on function public.pdv_ajustar_data_venda(uuid, timestamptz) to authenticated;

-- ─── Pagamento de conta a pagar: data operacional ─────────────────────────────
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
  v_data date;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  v_data := coalesce(p_data_pagamento, current_date);

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
      data_pagamento = v_data
  where id = p_conta_pagar_id;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem, origem_id, realizada_em
  ) values (
    p_company_id,
    p_store_id,
    p_conta_financeira_id,
    'saida',
    v_cp.valor,
    'Pagamento: ' || v_cp.descricao,
    'conta_pagar',
    p_conta_pagar_id,
    v_data::timestamptz
  );

  update public.financeiro_contas
  set saldo_atual = saldo_atual - v_cp.valor
  where id = p_conta_financeira_id;
end;
$$;

-- ─── Recebimento (com pagamento misto): data operacional na movimentação ───────
drop function if exists public.financeiro_registrar_recebimento(uuid, uuid, text, date, jsonb);

create or replace function public.financeiro_registrar_recebimento(
  p_conta_receber_id uuid,
  p_conta_financeira_id uuid,
  p_forma_pagamento text default null,
  p_data_recebimento date default current_date,
  p_pagamentos jsonb default null
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
  v_pay jsonb;
  v_forma_pay text;
  v_valor_pay numeric(12,2);
  v_soma_pagamentos numeric(12,2) := 0;
  v_qtd_pagamentos integer := 0;
  v_ultima_forma text;
  v_data_rec date;
  v_realizada timestamptz;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  v_data_rec := coalesce(p_data_recebimento, current_date);
  v_realizada := v_data_rec::timestamptz;

  select * into v_cr from public.financeiro_contas_receber where id = p_conta_receber_id for update;
  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if not public.is_member_of_company(v_cr.company_id) then raise exception 'Sem permissão para esta empresa.'; end if;
  if v_cr.status <> 'pendente' then raise exception 'Somente contas pendentes podem ser recebidas.'; end if;

  select * into v_conta from public.financeiro_contas
  where id = p_conta_financeira_id and company_id = v_cr.company_id and store_id = v_cr.store_id and ativo = true for update;
  if not found then raise exception 'Conta financeira não encontrada.'; end if;

  if v_cr.os_id is not null then
    select * into v_os from public.ordens_servico where id = v_cr.os_id;
    if not found then raise exception 'OS vinculada não encontrada.'; end if;
  end if;

  if p_pagamentos is not null
     and jsonb_typeof(p_pagamentos) = 'array'
     and jsonb_array_length(p_pagamentos) > 0 then
    for v_pay in select * from jsonb_array_elements(p_pagamentos)
    loop
      v_forma_pay := nullif(trim(v_pay->>'forma'), '');
      v_valor_pay := round((v_pay->>'valor')::numeric, 2);
      if v_forma_pay is null or v_forma_pay not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
        raise exception 'Forma de pagamento inválida.';
      end if;
      if v_valor_pay is null or v_valor_pay <= 0 then
        raise exception 'Valor de pagamento inválido.';
      end if;
      v_soma_pagamentos := v_soma_pagamentos + v_valor_pay;
      v_qtd_pagamentos := v_qtd_pagamentos + 1;
      v_ultima_forma := v_forma_pay;
    end loop;
    if abs(v_soma_pagamentos - v_cr.valor) > 0.01 then
      raise exception 'A soma dos pagamentos (%) deve ser igual ao valor a receber (%).', v_soma_pagamentos, v_cr.valor;
    end if;
    if v_qtd_pagamentos > 1 then
      v_forma := 'misto';
    else
      v_forma := v_ultima_forma;
    end if;
  else
    v_forma := coalesce(nullif(trim(p_forma_pagamento), ''), 'dinheiro');
    if v_forma not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
      raise exception 'Forma de pagamento inválida.';
    end if;
  end if;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem, origem_id, realizada_em
  )
  values (
    v_cr.company_id, v_cr.store_id, p_conta_financeira_id, 'entrada', v_cr.valor,
    'Recebimento: ' || v_cr.descricao, 'conta_receber', p_conta_receber_id, v_realizada
  )
  returning id into v_mov_id;

  update public.financeiro_contas set saldo_atual = saldo_atual + v_cr.valor where id = p_conta_financeira_id;

  if v_cr.os_id is not null then
    insert into public.vendas (
      company_id, store_id, cliente_id, bicicleta_id, os_id, status, forma_pagamento,
      subtotal, desconto, total, observacao, vendedor_id, realizada_em
    )
    values (
      v_cr.company_id, v_cr.store_id, v_os.cliente_id, v_os.bicicleta_id, v_cr.os_id, 'finalizada', v_forma,
      v_cr.valor, 0, v_cr.valor, format('Faturamento OS #%s', v_os.numero), v_user, v_realizada
    )
    returning vendas.id, vendas.numero into v_venda_id, v_numero;

    if p_pagamentos is not null
       and jsonb_typeof(p_pagamentos) = 'array'
       and jsonb_array_length(p_pagamentos) > 0 then
      for v_pay in select * from jsonb_array_elements(p_pagamentos)
      loop
        v_forma_pay := nullif(trim(v_pay->>'forma'), '');
        v_valor_pay := round((v_pay->>'valor')::numeric, 2);
        insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor)
        values (v_cr.company_id, v_venda_id, v_forma_pay, v_valor_pay);
      end loop;
    else
      insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor)
      values (v_cr.company_id, v_venda_id, v_forma, v_cr.valor);
    end if;

    for v_item in select * from public.os_itens where os_id = v_cr.os_id order by created_at loop
      insert into public.venda_itens (company_id, venda_id, estoque_item_id, descricao, quantidade, preco_unitario, movimentacao_id)
      values (v_cr.company_id, v_venda_id, v_item.estoque_item_id, v_item.descricao, v_item.quantidade, v_item.preco_unitario, null);
    end loop;

    if v_os.cliente_id is not null then
      insert into public.atividades (company_id, cliente_id, bicicleta_id, tipo, descricao, valor, data_registro)
      values (v_cr.company_id, v_os.cliente_id, v_os.bicicleta_id, 'venda', format('OS #%s recebida — venda #%s', v_os.numero, v_numero), v_cr.valor, v_data_rec);
    end if;
  end if;

  update public.financeiro_contas_receber
  set status = 'recebido', forma_pagamento = v_forma, conta_financeira_id = p_conta_financeira_id,
      data_recebimento = v_data_rec, movimentacao_id = v_mov_id, venda_id = v_venda_id
  where id = p_conta_receber_id;

  return query select v_venda_id, v_numero;
end;
$$;

grant execute on function public.financeiro_registrar_recebimento(uuid, uuid, text, date, jsonb) to authenticated;
