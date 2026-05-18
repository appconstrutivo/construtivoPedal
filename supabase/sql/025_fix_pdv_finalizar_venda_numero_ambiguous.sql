-- Corrige ambiguidade de "numero" em pdv_finalizar_venda:
-- colunas OUT do RETURNS TABLE conflitam com RETURNING/SELECT sem qualificação.

create or replace function public.proximo_numero_venda(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(v.numero), 0) + 1
    from public.vendas v
   where v.company_id = p_company_id;
$$;

create or replace function public.pdv_finalizar_venda(
  p_company_id uuid,
  p_store_id uuid,
  p_cliente_id uuid,
  p_bicicleta_id uuid,
  p_forma_pagamento text,
  p_desconto numeric,
  p_observacao text,
  p_itens jsonb
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
  v_estoque_id uuid;
  v_descricao text;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_linha_total numeric(12,2);
  v_mov_id uuid;
  v_estoque public.estoque_itens%rowtype;
  v_cliente public.clientes%rowtype;
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
    coalesce(nullif(trim(p_forma_pagamento), ''), 'dinheiro'),
    v_subtotal,
    v_desconto,
    v_total,
    nullif(trim(p_observacao), ''),
    v_user
  )
  returning vendas.id, vendas.numero into v_venda_id, v_numero;

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

grant execute on function public.pdv_finalizar_venda(uuid, uuid, uuid, uuid, text, numeric, text, jsonb) to authenticated;
