-- PDV: vendas de balcão com baixa automática de estoque e histórico do cliente.
-- Execute após 009..023.

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  numero integer not null,
  cliente_id uuid references public.clientes (id) on delete set null,
  bicicleta_id uuid references public.bicicletas (id) on delete set null,
  status text not null default 'finalizada',
  forma_pagamento text not null default 'dinheiro',
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  observacao text,
  vendedor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vendas_status_check check (status in ('finalizada', 'cancelada')),
  constraint vendas_forma_pagamento_check
    check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'outro')),
  constraint vendas_subtotal_non_negative check (subtotal >= 0),
  constraint vendas_desconto_non_negative check (desconto >= 0),
  constraint vendas_total_non_negative check (total >= 0),
  constraint vendas_numero_unique_per_company unique (company_id, numero)
);

create index if not exists idx_vendas_company_store_created
  on public.vendas (company_id, store_id, created_at desc);

create index if not exists idx_vendas_cliente
  on public.vendas (cliente_id)
  where cliente_id is not null;

create table if not exists public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  venda_id uuid not null references public.vendas (id) on delete cascade,
  estoque_item_id uuid references public.estoque_itens (id) on delete set null,
  descricao text not null,
  quantidade numeric(12,3) not null default 1,
  preco_unitario numeric(12,2) not null default 0,
  movimentacao_id uuid references public.estoque_movimentacoes (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint venda_itens_qtd_positive check (quantidade > 0),
  constraint venda_itens_preco_non_negative check (preco_unitario >= 0)
);

create index if not exists idx_venda_itens_venda
  on public.venda_itens (venda_id);

create or replace function public.proximo_numero_venda(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(numero), 0) + 1
    from public.vendas
   where company_id = p_company_id;
$$;

create or replace function public.trg_vendas_assign_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or new.numero <= 0 then
    new.numero := public.proximo_numero_venda(new.company_id);
  end if;
  new.vendedor_id := coalesce(new.vendedor_id, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_vendas_numero on public.vendas;
create trigger trg_vendas_numero
before insert on public.vendas
for each row
execute function public.trg_vendas_assign_numero();

create or replace function public.validate_venda_item_company()
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

drop trigger if exists trg_venda_itens_company on public.venda_itens;
create trigger trg_venda_itens_company
before insert or update of company_id, venda_id on public.venda_itens
for each row
execute function public.validate_venda_item_company();

-- Finaliza venda no balcão: grava cabeçalho, itens, baixa estoque e atividade do cliente.
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
  returning id, numero into v_venda_id, v_numero;

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

  return query select v_venda_id, v_numero, v_total;
end;
$$;

grant execute on function public.pdv_finalizar_venda(uuid, uuid, uuid, uuid, text, numeric, text, jsonb) to authenticated;

alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;

drop policy if exists "vendas_select_member" on public.vendas;
create policy "vendas_select_member"
  on public.vendas for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "vendas_insert_member" on public.vendas;
create policy "vendas_insert_member"
  on public.vendas for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "venda_itens_select_member" on public.venda_itens;
create policy "venda_itens_select_member"
  on public.venda_itens for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "venda_itens_insert_member" on public.venda_itens;
create policy "venda_itens_insert_member"
  on public.venda_itens for insert to authenticated
  with check (public.is_member_of_company(company_id));
