-- Valor bruto vs líquido nos pagamentos de venda.
-- valor = o que o cliente paga (recibo, total da venda)
-- valor_liquido = o que entra no caixa/conta (após taxas de cartão/adquirente)
-- Execute após 052.

alter table public.venda_pagamentos
  add column if not exists valor_liquido numeric(12,2);

update public.venda_pagamentos
   set valor_liquido = valor
 where valor_liquido is null;

alter table public.venda_pagamentos
  alter column valor_liquido set not null;

alter table public.venda_pagamentos
  drop constraint if exists venda_pagamentos_valor_liquido_check;

alter table public.venda_pagamentos
  add constraint venda_pagamentos_valor_liquido_check
    check (valor_liquido > 0 and valor_liquido <= valor);

-- ─── PDV: caixa usa soma dos valores líquidos ────────────────────────────────
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
  v_total numeric(12,2);
  v_total_liquido numeric(12,2) := 0;
  v_item jsonb;
  v_pay jsonb;
  v_estoque_id uuid;
  v_descricao text;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_linha_total numeric(12,2);
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
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if p_store_id is null then
    raise exception 'Loja obrigatória para registrar venda.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item à venda.';
  end if;

  v_desconto := greatest(coalesce(p_desconto, 0), 0);

  if p_cliente_id is not null then
    select * into v_cliente
      from public.clientes
     where id = p_cliente_id
       and company_id = p_company_id;
    if not found then
      raise exception 'Cliente não encontrado.';
    end if;
    if v_cliente.store_id is distinct from p_store_id then
      raise exception 'Cliente não pertence à loja ativa.';
    end if;
  end if;

  if p_bicicleta_id is not null and p_cliente_id is null then
    raise exception 'Informe o cliente para vincular a bicicleta.';
  end if;

  if p_bicicleta_id is not null then
    if not exists (
      select 1 from public.bicicletas b
       where b.id = p_bicicleta_id
         and b.company_id = p_company_id
         and b.cliente_id = p_cliente_id
    ) then
      raise exception 'Bicicleta inválida para o cliente informado.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade inválida em um dos itens.';
    end if;
    if v_preco is null or v_preco < 0 then
      raise exception 'Preço inválido em um dos itens.';
    end if;
    v_subtotal := v_subtotal + round(v_qtd * v_preco, 2);
  end loop;

  v_total := greatest(round(v_subtotal - v_desconto, 2), 0);

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
    if abs(v_soma_pagamentos - v_total) > 0.01 then
      raise exception 'A soma dos pagamentos (%) deve ser igual ao total da venda (%).', v_soma_pagamentos, v_total;
    end if;
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
    v_total_liquido := v_total;
  end if;

  insert into public.vendas (
    company_id,
    store_id,
    cliente_id,
    bicicleta_id,
    status,
    forma_pagamento,
    subtotal,
    desconto,
    total,
    observacao,
    vendedor_id
  )
  values (
    p_company_id,
    p_store_id,
    p_cliente_id,
    p_bicicleta_id,
    'finalizada',
    v_forma_cabecalho,
    v_subtotal,
    v_desconto,
    v_total,
    nullif(trim(p_observacao), ''),
    v_user
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
      values (
        p_company_id,
        v_venda_id,
        nullif(trim(v_pay->>'forma'), ''),
        v_valor_pay,
        v_valor_liq
      );
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
       where id = v_estoque_id
         and company_id = p_company_id
         and store_id = p_store_id
         and ativo = true
       for update;

      if not found then
        raise exception 'Produto não encontrado no estoque desta loja.';
      end if;

      if v_estoque.saldo_atual < v_qtd then
        raise exception 'Saldo insuficiente para "%". Disponível: %', v_estoque.nome, v_estoque.saldo_atual;
      end if;

      insert into public.estoque_movimentacoes (
        company_id,
        item_id,
        store_id,
        tipo,
        quantidade,
        origem,
        observacao,
        created_by
      )
      values (
        p_company_id,
        v_estoque_id,
        p_store_id,
        'saida',
        abs(v_qtd),
        'pdv_venda',
        format('Venda #%s', v_numero),
        v_user
      )
      returning id into v_mov_id;

      v_descricao := coalesce(nullif(trim(v_item->>'descricao'), ''), v_estoque.nome);
    end if;

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
      p_company_id,
      v_venda_id,
      v_estoque_id,
      v_descricao,
      v_qtd,
      v_preco,
      v_mov_id
    );
  end loop;

  if v_total_liquido > 0 then
    v_conta_caixa_id := public.financeiro_garantir_conta_caixa(p_company_id, p_store_id);

    insert into public.financeiro_movimentacoes (
      company_id,
      store_id,
      conta_id,
      tipo,
      valor,
      descricao,
      origem,
      origem_id,
      realizada_em
    )
    values (
      p_company_id,
      p_store_id,
      v_conta_caixa_id,
      'entrada',
      v_total_liquido,
      format(
        'Venda PDV #%s%s',
        v_numero,
        case
          when p_cliente_id is not null then format(' — %s', v_cliente.nome)
          else ''
        end
      ),
      'pdv',
      v_venda_id,
      v_realizada
    );

    update public.financeiro_contas
       set saldo_atual = saldo_atual + v_total_liquido,
           updated_at = timezone('utc', now())
     where id = v_conta_caixa_id;
  end if;

  if p_cliente_id is not null then
    v_linha_total := v_total;
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
      p_company_id,
      p_cliente_id,
      p_bicicleta_id,
      'venda',
      format('Venda balcão #%s — %s itens', v_numero, jsonb_array_length(p_itens)),
      v_linha_total,
      current_date
    );
  end if;

  return query
  select
    v_venda_id,
    v_numero,
    v_total;
end;
$$;

grant execute on function public.pdv_finalizar_venda(uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) to authenticated;

-- ─── Recebimento de conta: caixa usa valores líquidos ────────────────────────
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
    v_total_liquido := v_cr.valor;
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
