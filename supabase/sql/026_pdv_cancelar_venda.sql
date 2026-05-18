-- Cancelamento de venda PDV com estorno de estoque.

create or replace function public.pdv_estornar_item_venda(p_venda_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.venda_itens%rowtype;
  v_venda public.vendas%rowtype;
  v_mov public.estoque_movimentacoes%rowtype;
  v_estorno_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_row from public.venda_itens where id = p_venda_item_id for update;
  if not found then
    raise exception 'Item da venda não encontrado.';
  end if;

  if v_row.movimentacao_id is null then
    return null;
  end if;

  select * into v_venda from public.vendas where id = v_row.venda_id;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  if not public.is_member_of_company(v_venda.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  select * into v_mov
    from public.estoque_movimentacoes
   where id = v_row.movimentacao_id;

  if not found then
    raise exception 'Movimentação de estoque não encontrada.';
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
    v_venda.company_id,
    v_mov.item_id,
    v_mov.store_id,
    'entrada',
    abs(v_mov.quantidade),
    'pdv_venda_estorno',
    format('Estorno venda #%s', v_venda.numero),
    v_user
  )
  returning id into v_estorno_id;

  update public.venda_itens
     set movimentacao_id = null
   where id = v_row.id;

  return v_estorno_id;
end;
$$;

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

  for v_item in
    select * from public.venda_itens
     where venda_id = p_venda_id
       and movimentacao_id is not null
  loop
    perform public.pdv_estornar_item_venda(v_item.id);
  end loop;

  update public.vendas
     set status = 'cancelada'
   where id = p_venda_id;

  if v_venda.cliente_id is not null then
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
end;
$$;

grant execute on function public.pdv_estornar_item_venda(uuid) to authenticated;
grant execute on function public.pdv_cancelar_venda(uuid) to authenticated;

drop policy if exists "vendas_update_member" on public.vendas;
create policy "vendas_update_member"
  on public.vendas for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));
