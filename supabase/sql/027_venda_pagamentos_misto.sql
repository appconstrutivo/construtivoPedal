-- Pagamento misto no PDV: múltiplas formas por venda.

alter table public.vendas drop constraint if exists vendas_forma_pagamento_check;
alter table public.vendas add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'outro', 'misto'));

create table if not exists public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  venda_id uuid not null references public.vendas (id) on delete cascade,
  forma_pagamento text not null,
  valor numeric(12,2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint venda_pagamentos_forma_check
    check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'outro')),
  constraint venda_pagamentos_valor_positive check (valor > 0)
);

create index if not exists idx_venda_pagamentos_venda
  on public.venda_pagamentos (venda_id);

create or replace function public.validate_venda_pagamento_company()
returns trigger
language plpgsql
as $$
declare
  v_venda public.vendas%rowtype;
begin
  select * into v_venda from public.vendas where id = new.venda_id;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  new.company_id := v_venda.company_id;
  return new;
end;
$$;

drop trigger if exists trg_venda_pagamentos_company on public.venda_pagamentos;
create trigger trg_venda_pagamentos_company
before insert or update of company_id, venda_id on public.venda_pagamentos
for each row
execute function public.validate_venda_pagamento_company();

alter table public.venda_pagamentos enable row level security;

drop policy if exists "venda_pagamentos_select_member" on public.venda_pagamentos;
create policy "venda_pagamentos_select_member"
  on public.venda_pagamentos for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "venda_pagamentos_insert_member" on public.venda_pagamentos;
create policy "venda_pagamentos_insert_member"
  on public.venda_pagamentos for insert to authenticated
  with check (public.is_member_of_company(company_id));

-- Backfill: vendas antigas sem linhas de pagamento
insert into public.venda_pagamentos (company_id, venda_id, forma_pagamento, valor)
select v.company_id, v.id,
  case when v.forma_pagamento = 'misto' then 'outro' else v.forma_pagamento end,
  v.total
  from public.vendas v
 where v.status = 'finalizada'
   and not exists (
     select 1 from public.venda_pagamentos vp where vp.venda_id = v.id
   );

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
  returning vendas.id, vendas.numero into v_venda_id, v_numero;

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
