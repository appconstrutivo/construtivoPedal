-- Nota/recibo no valor cheio pago pelo cliente; financeiro no líquido.
-- Ex.: produtos R$ 1.390 + juros cartão → cliente paga R$ 1.586,76 (nota).
--      entrada líquida R$ 1.390 entra no caixa (o juros não é faturamento da loja).
-- Execute após 059.

create or replace function public.fin_pagamentos_cobrem_total(
  p_soma_bruto numeric,
  p_soma_liquido numeric,
  p_total numeric
)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p_total, 0) > 0
    and (
      abs(coalesce(p_soma_bruto, 0) - p_total) < 0.01
      or (
        coalesce(p_soma_bruto, 0) >= p_total - 0.01
        and abs(coalesce(p_soma_liquido, 0) - p_total) < 0.01
      )
    );
$$;

comment on function public.fin_pagamentos_cobrem_total(numeric, numeric, numeric) is
  'Valida se pagamentos fecham o total: pelo bruto ou pelo líquido quando o cliente pagou a mais.';

create or replace function public.pdv_finalizar_venda(
  p_company_id uuid,
  p_store_id uuid,
  p_cliente_id uuid,
  p_bicicleta_id uuid,
  p_forma_pagamento text,
  p_desconto numeric,
  p_observacao text,
  p_itens jsonb,
  p_pagamentos jsonb default null
)
returns table (venda_id uuid, numero integer, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_venda_id uuid;
  v_numero integer;
  v_subtotal numeric(12,2) := 0;
  v_desconto numeric(12,2);
  v_total_produtos numeric(12,2);
  v_total numeric(12,2);
  v_total_liquido numeric(12,2) := 0;
  v_item jsonb;
  v_pay jsonb;
  v_estoque_id uuid;
  v_descricao text;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_mov_id uuid;
  v_estoque public.estoque_itens%rowtype;
  v_cliente public.clientes%rowtype;
  v_forma_cabecalho text;
  v_soma_pagamentos numeric(12,2) := 0;
  v_qtd_pagamentos integer := 0;
  v_forma_pay text;
  v_valor_pay numeric(12,2);
  v_valor_liq numeric(12,2);
  v_conta_caixa_id uuid;
  v_realizada timestamptz;
begin
  if v_user is null then raise exception 'Não autenticado.'; end if;
  if not public.is_member_of_company(p_company_id) then raise exception 'Sem permissão para esta empresa.'; end if;
  if p_store_id is null then raise exception 'Loja obrigatória para registrar venda.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item à venda.';
  end if;

  v_desconto := greatest(coalesce(p_desconto, 0), 0);

  if p_cliente_id is not null then
    select * into v_cliente from public.clientes where id = p_cliente_id and company_id = p_company_id;
    if not found then raise exception 'Cliente não encontrado.'; end if;
    if v_cliente.store_id is distinct from p_store_id then raise exception 'Cliente não pertence à loja ativa.'; end if;
  end if;

  if p_bicicleta_id is not null and p_cliente_id is null then
    raise exception 'Informe o cliente para vincular a bicicleta.';
  end if;

  if p_bicicleta_id is not null then
    if not exists (
      select 1 from public.bicicletas b
       where b.id = p_bicicleta_id and b.company_id = p_company_id and b.cliente_id = p_cliente_id
    ) then
      raise exception 'Bicicleta inválida para o cliente informado.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida em um dos itens.'; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido em um dos itens.'; end if;
    v_subtotal := v_subtotal + round(v_qtd * v_preco, 2);
  end loop;

  v_total_produtos := greatest(round(v_subtotal - v_desconto, 2), 0);
  v_total := v_total_produtos;

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
      if v_pay ? 'valor_liquido' and v_pay->>'valor_liquido' is not null and trim(v_pay->>'valor_liquido') <> '' then
        v_valor_liq := round((v_pay->>'valor_liquido')::numeric, 2);
      else
        v_valor_liq := v_valor_pay;
      end if;
      if v_valor_liq <= 0 or v_valor_liq > v_valor_pay then
        raise exception 'Valor líquido inválido para % (deve ser maior que zero e não ultrapassar o valor pago).', v_forma_pay;
      end if;
      v_soma_pagamentos := v_soma_pagamentos + v_valor_pay;
      v_total_liquido := v_total_liquido + v_valor_liq;
      v_qtd_pagamentos := v_qtd_pagamentos + 1;
    end loop;

    if not public.fin_pagamentos_cobrem_total(v_soma_pagamentos, v_total_liquido, v_total_produtos) then
      raise exception
        'Pagamentos não fecham o total dos produtos (%). Informe valor pago = total, ou valor pago maior com entrada líquida = total dos produtos.',
        v_total_produtos;
    end if;

    -- Nota/recibo no valor cheio; financeiro usa v_total_liquido.
    v_total := v_soma_pagamentos;

    if v_qtd_pagamentos > 1 then
      v_forma_cabecalho := 'misto';
    else
      v_forma_cabecalho := v_forma_pay;
    end if;
  else
    v_forma_cabecalho := coalesce(nullif(trim(p_forma_pagamento), ''), 'dinheiro');
    if v_forma_cabecalho not in ('dinheiro', 'pix', 'credito', 'debito', 'outro', 'misto') then
      v_forma_cabecalho := 'dinheiro';
    end if;
    if v_forma_cabecalho = 'misto' then
      raise exception 'Informe os valores de cada forma de pagamento.';
    end if;
    v_total_liquido := v_total_produtos;
    v_total := v_total_produtos;
  end if;

  insert into public.vendas (
    company_id, store_id, cliente_id, bicicleta_id, status, forma_pagamento,
    subtotal, desconto, total, observacao, vendedor_id
  )
  values (
    p_company_id, p_store_id, p_cliente_id, p_bicicleta_id, 'finalizada', v_forma_cabecalho,
    v_subtotal, v_desconto, v_total, nullif(trim(p_observacao), ''), v_user
  )
  returning vendas.id, vendas.numero, vendas.realizada_em
    into v_venda_id, v_numero, v_realizada;

  if p_pagamentos is not null
     and jsonb_typeof(p_pagamentos) = 'array'
     and jsonb_array_length(p_pagamentos) > 0 then
    for v_pay in select * from jsonb_array_elements(p_pagamentos)
    loop
      v_valor_pay := round((v_pay->>'valor')::numeric, 2);
      if v_pay ? 'valor_liquido' and v_pay->>'valor_liquido' is not null and trim(v_pay->>'valor_liquido') <> '' then
        v_valor_liq := round((v_pay->>'valor_liquido')::numeric, 2);
      else
        v_valor_liq := v_valor_pay;
      end if;
      insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor, valor_liquido)
      values (p_company_id, v_venda_id, nullif(trim(v_pay->>'forma'), ''), v_valor_pay, v_valor_liq);
    end loop;
  else
    insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor, valor_liquido)
    values (p_company_id, v_venda_id, v_forma_cabecalho, v_total, v_total);
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_estoque_id := nullif(v_item->>'estoque_item_id', '')::uuid;
    v_descricao := coalesce(nullif(trim(v_item->>'descricao'), ''), 'Item');
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_mov_id := null;

    if v_estoque_id is not null then
      select * into v_estoque
        from public.estoque_itens
       where id = v_estoque_id and company_id = p_company_id and store_id = p_store_id and ativo = true
       for update;
      if not found then raise exception 'Produto não encontrado no estoque desta loja.'; end if;
      if v_estoque.saldo_atual < v_qtd then
        raise exception 'Saldo insuficiente para "%". Disponível: %', v_estoque.nome, v_estoque.saldo_atual;
      end if;
      insert into public.estoque_movimentacoes (
        company_id, item_id, store_id, tipo, quantidade, origem, observacao, created_by
      )
      values (
        p_company_id, v_estoque_id, p_store_id, 'saida', abs(v_qtd), 'pdv_venda',
        format('Venda #%s', v_numero), v_user
      )
      returning id into v_mov_id;
      v_descricao := coalesce(nullif(trim(v_item->>'descricao'), ''), v_estoque.nome);
    end if;

    insert into public.venda_itens (
      company_id, venda_id, estoque_item_id, descricao, quantidade, preco_unitario, movimentacao_id
    )
    values (p_company_id, v_venda_id, v_estoque_id, v_descricao, v_qtd, v_preco, v_mov_id);
  end loop;

  if v_total_liquido > 0 then
    v_conta_caixa_id := public.financeiro_garantir_conta_caixa(p_company_id, p_store_id);
    insert into public.financeiro_movimentacoes (
      company_id, store_id, conta_id, tipo, valor, descricao, origem, origem_id, realizada_em
    )
    values (
      p_company_id, p_store_id, v_conta_caixa_id, 'entrada', v_total_liquido,
      format(
        'Venda PDV #%s%s',
        v_numero,
        case when p_cliente_id is not null then format(' — %s', v_cliente.nome) else '' end
      ),
      'pdv', v_venda_id, v_realizada
    );
    update public.financeiro_contas
       set saldo_atual = saldo_atual + v_total_liquido,
           updated_at = timezone('utc', now())
     where id = v_conta_caixa_id;
  end if;

  if p_cliente_id is not null then
    insert into public.atividades (
      company_id, cliente_id, bicicleta_id, tipo, descricao, valor, data_registro
    )
    values (
      p_company_id, p_cliente_id, p_bicicleta_id, 'venda',
      format('Venda balcão #%s — %s itens', v_numero, jsonb_array_length(p_itens)),
      v_total, current_date
    );
  end if;

  return query select v_venda_id, v_numero, v_total;
end;
$$;

grant execute on function public.pdv_finalizar_venda(uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) to authenticated;

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
  v_valor_liq numeric(12,2);
  v_soma_pagamentos numeric(12,2) := 0;
  v_total_liquido numeric(12,2) := 0;
  v_qtd_pagamentos integer := 0;
  v_ultima_forma text;
  v_data_rec date;
  v_realizada timestamptz;
  v_venda_total numeric(12,2);
begin
  if v_user is null then raise exception 'Não autenticado.'; end if;

  v_data_rec := coalesce(p_data_recebimento, current_date);
  v_realizada := public.fin_data_operacional_br(v_data_rec);

  select * into v_cr from public.financeiro_contas_receber where id = p_conta_receber_id for update;
  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if not public.is_member_of_company(v_cr.company_id) then raise exception 'Sem permissão para esta empresa.'; end if;
  if v_cr.status <> 'pendente' then raise exception 'Somente contas pendentes podem ser recebidas.'; end if;

  select * into v_conta from public.financeiro_contas
  where id = p_conta_financeira_id and company_id = v_cr.company_id and store_id = v_cr.store_id and ativo = true
  for update;
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
      if v_pay ? 'valor_liquido' and v_pay->>'valor_liquido' is not null and trim(v_pay->>'valor_liquido') <> '' then
        v_valor_liq := round((v_pay->>'valor_liquido')::numeric, 2);
      else
        v_valor_liq := v_valor_pay;
      end if;
      if v_valor_liq <= 0 or v_valor_liq > v_valor_pay then
        raise exception 'Valor líquido inválido para % (deve ser maior que zero e não ultrapassar o valor pago).', v_forma_pay;
      end if;
      v_soma_pagamentos := v_soma_pagamentos + v_valor_pay;
      v_total_liquido := v_total_liquido + v_valor_liq;
      v_qtd_pagamentos := v_qtd_pagamentos + 1;
      v_ultima_forma := v_forma_pay;
    end loop;

    if not public.fin_pagamentos_cobrem_total(v_soma_pagamentos, v_total_liquido, v_cr.valor) then
      raise exception
        'Pagamentos não fecham o valor a receber (%). Informe valor pago = total, ou valor pago maior com entrada líquida = total.',
        v_cr.valor;
    end if;

    if v_qtd_pagamentos > 1 then
      v_forma := 'misto';
    else
      v_forma := v_ultima_forma;
    end if;
    v_venda_total := v_soma_pagamentos;
  else
    v_forma := coalesce(nullif(trim(p_forma_pagamento), ''), 'dinheiro');
    if v_forma not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
      raise exception 'Forma de pagamento inválida.';
    end if;
    v_total_liquido := v_cr.valor;
    v_venda_total := v_cr.valor;
  end if;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem, origem_id, realizada_em
  )
  values (
    v_cr.company_id, v_cr.store_id, p_conta_financeira_id, 'entrada', v_total_liquido,
    'Recebimento: ' || v_cr.descricao, 'conta_receber', p_conta_receber_id, v_realizada
  )
  returning id into v_mov_id;

  update public.financeiro_contas set saldo_atual = saldo_atual + v_total_liquido where id = p_conta_financeira_id;

  if v_cr.os_id is not null then
    insert into public.vendas (
      company_id, store_id, cliente_id, bicicleta_id, os_id, status, forma_pagamento,
      subtotal, desconto, total, observacao, vendedor_id, realizada_em
    )
    values (
      v_cr.company_id, v_cr.store_id, v_os.cliente_id, v_os.bicicleta_id, v_cr.os_id, 'finalizada', v_forma,
      v_cr.valor, 0, v_venda_total, format('Faturamento OS #%s', v_os.numero), v_user, v_realizada
    )
    returning vendas.id, vendas.numero into v_venda_id, v_numero;

    if p_pagamentos is not null
       and jsonb_typeof(p_pagamentos) = 'array'
       and jsonb_array_length(p_pagamentos) > 0 then
      for v_pay in select * from jsonb_array_elements(p_pagamentos)
      loop
        v_forma_pay := nullif(trim(v_pay->>'forma'), '');
        v_valor_pay := round((v_pay->>'valor')::numeric, 2);
        if v_pay ? 'valor_liquido' and v_pay->>'valor_liquido' is not null and trim(v_pay->>'valor_liquido') <> '' then
          v_valor_liq := round((v_pay->>'valor_liquido')::numeric, 2);
        else
          v_valor_liq := v_valor_pay;
        end if;
        insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor, valor_liquido)
        values (v_cr.company_id, v_venda_id, v_forma_pay, v_valor_pay, v_valor_liq);
      end loop;
    else
      insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor, valor_liquido)
      values (v_cr.company_id, v_venda_id, v_forma, v_cr.valor, v_cr.valor);
    end if;

    for v_item in select * from public.os_itens where os_id = v_cr.os_id order by created_at
    loop
      insert into public.venda_itens (company_id, venda_id, estoque_item_id, descricao, quantidade, preco_unitario, movimentacao_id)
      values (v_cr.company_id, v_venda_id, v_item.estoque_item_id, v_item.descricao, v_item.quantidade, v_item.preco_unitario, null);
    end loop;

    if v_os.cliente_id is not null then
      insert into public.atividades (company_id, cliente_id, bicicleta_id, tipo, descricao, valor, data_registro)
      values (
        v_cr.company_id, v_os.cliente_id, v_os.bicicleta_id, 'venda',
        format('OS #%s recebida — venda #%s', v_os.numero, v_numero), v_cr.valor, v_data_rec
      );
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
