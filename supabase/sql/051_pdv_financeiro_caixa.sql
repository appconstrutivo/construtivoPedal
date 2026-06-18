-- PDV: entradas automáticas no caixa da loja + backfill de vendas balcão anteriores.
-- Execute após 050.

-- Evita duplicar movimentação para a mesma venda PDV.
create unique index if not exists idx_financeiro_movimentacoes_pdv_venda
  on public.financeiro_movimentacoes (origem_id)
  where origem = 'pdv';

-- ─── Finalizar venda PDV: registra entrada no caixa ─────────────────────────
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
      v_soma_pagamentos := v_soma_pagamentos + v_valor_pay;
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
      insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor)
      values (
        p_company_id,
        v_venda_id,
        nullif(trim(v_pay->>'forma'), ''),
        round((v_pay->>'valor')::numeric, 2)
      );
    end loop;
  else
    insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor)
    values (p_company_id, v_venda_id, v_forma_cabecalho, v_total);
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

  if v_total > 0 then
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
      v_total,
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
       set saldo_atual = saldo_atual + v_total,
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

-- ─── Cancelar venda PDV balcão: estorna caixa + estoque ───────────────────────
create or replace function public.pdv_cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_venda public.vendas%rowtype;
  v_item public.venda_itens%rowtype;
  v_cr public.financeiro_contas_receber%rowtype;
  v_mov public.financeiro_movimentacoes%rowtype;
  v_os_numero integer;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_venda
    from public.vendas
   where id = p_venda_id
     for update;

  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  if not public.is_member_of_company(v_venda.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if v_venda.status <> 'finalizada' then
    raise exception 'Somente vendas finalizadas podem ser canceladas.';
  end if;

  if v_venda.os_id is not null then
    select * into v_cr
      from public.financeiro_contas_receber
     where venda_id = p_venda_id
        or (os_id = v_venda.os_id and status = 'recebido')
     order by case when venda_id = p_venda_id then 0 else 1 end,
              created_at desc
     limit 1
     for update;

    if found then
      if v_cr.movimentacao_id is not null then
        select * into v_mov
          from public.financeiro_movimentacoes
         where id = v_cr.movimentacao_id
           for update;

        if found then
          if v_mov.tipo = 'entrada' then
            update public.financeiro_contas
               set saldo_atual = saldo_atual - v_mov.valor,
                   updated_at = timezone('utc', now())
             where id = v_mov.conta_id;
          elsif v_mov.tipo = 'saida' then
            update public.financeiro_contas
               set saldo_atual = saldo_atual + v_mov.valor,
                   updated_at = timezone('utc', now())
             where id = v_mov.conta_id;
          end if;

          update public.financeiro_contas_receber
             set movimentacao_id = null,
                 updated_at = timezone('utc', now())
           where id = v_cr.id;

          delete from public.financeiro_movimentacoes where id = v_mov.id;
        end if;
      end if;

      update public.financeiro_contas_receber
         set venda_id = null,
             updated_at = timezone('utc', now())
       where id = v_cr.id;

      delete from public.financeiro_contas_receber where id = v_cr.id;
    end if;
  else
    select * into v_mov
      from public.financeiro_movimentacoes
     where origem = 'pdv'
       and origem_id = p_venda_id
     for update;

    if found then
      if v_mov.tipo = 'entrada' then
        update public.financeiro_contas
           set saldo_atual = saldo_atual - v_mov.valor,
               updated_at = timezone('utc', now())
         where id = v_mov.conta_id;
      elsif v_mov.tipo = 'saida' then
        update public.financeiro_contas
           set saldo_atual = saldo_atual + v_mov.valor,
               updated_at = timezone('utc', now())
         where id = v_mov.conta_id;
      end if;

      delete from public.financeiro_movimentacoes where id = v_mov.id;
    end if;

    for v_item in
      select * from public.venda_itens
       where venda_id = p_venda_id
         and movimentacao_id is not null
    loop
      perform public.pdv_estornar_item_venda(v_item.id);
    end loop;
  end if;

  update public.vendas
     set status = 'cancelada'
   where id = p_venda_id;

  if v_venda.cliente_id is not null then
    if v_venda.os_id is not null then
      select numero into v_os_numero
        from public.ordens_servico
       where id = v_venda.os_id;

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
        v_venda.company_id,
        v_venda.cliente_id,
        v_venda.bicicleta_id,
        'venda',
        format(
          'Cancelamento recebimento OS #%s — venda #%s',
          coalesce(v_os_numero::text, '?'),
          v_venda.numero
        ),
        0,
        current_date
      );
    else
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
        v_venda.company_id,
        v_venda.cliente_id,
        v_venda.bicicleta_id,
        'venda',
        format('Cancelamento venda balcão #%s', v_venda.numero),
        0,
        current_date
      );
    end if;
  end if;
end;
$$;

grant execute on function public.pdv_cancelar_venda(uuid) to authenticated;

-- ─── Ajuste de data da venda PDV propaga para movimentação do caixa ───────────
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

  update public.financeiro_movimentacoes
  set realizada_em = p_realizada_em
  where origem = 'pdv'
    and origem_id = p_venda_id;
end;
$$;

grant execute on function public.pdv_ajustar_data_venda(uuid, timestamptz) to authenticated;

-- ─── Backfill: vendas balcão finalizadas sem movimentação no caixa ────────────
do $$
declare
  v_rec record;
  v_conta_id uuid;
begin
  for v_rec in
    select
      v.id,
      v.company_id,
      v.store_id,
      v.numero,
      v.total,
      v.realizada_em,
      c.nome as cliente_nome
    from public.vendas v
    left join public.clientes c on c.id = v.cliente_id
    where v.status = 'finalizada'
      and v.os_id is null
      and v.total > 0
      and not exists (
        select 1
          from public.financeiro_movimentacoes fm
         where fm.origem = 'pdv'
           and fm.origem_id = v.id
      )
    order by v.realizada_em
  loop
    select fc.id into v_conta_id
      from public.financeiro_contas fc
     where fc.company_id = v_rec.company_id
       and fc.store_id = v_rec.store_id
       and fc.tipo = 'caixa'
       and fc.ativo = true
     order by fc.created_at
     limit 1;

    if v_conta_id is null then
      insert into public.financeiro_contas (company_id, store_id, nome, tipo, saldo_atual)
      values (v_rec.company_id, v_rec.store_id, 'Caixa da loja', 'caixa', 0)
      returning id into v_conta_id;
    end if;

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
      v_rec.company_id,
      v_rec.store_id,
      v_conta_id,
      'entrada',
      v_rec.total,
      format(
        'Venda PDV #%s%s',
        v_rec.numero,
        case
          when v_rec.cliente_nome is not null then format(' — %s', v_rec.cliente_nome)
          else ''
        end
      ),
      'pdv',
      v_rec.id,
      v_rec.realizada_em
    );

    update public.financeiro_contas
       set saldo_atual = saldo_atual + v_rec.total,
           updated_at = timezone('utc', now())
     where id = v_conta_id;
  end loop;
end;
$$;
