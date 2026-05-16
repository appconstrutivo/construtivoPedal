-- Estorno de baixa de estoque ao cancelar ou excluir OS.

create or replace function public.os_estornar_item_estoque(p_os_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.os_itens%rowtype;
  v_os public.ordens_servico%rowtype;
  v_mov public.estoque_movimentacoes%rowtype;
  v_estorno_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_row from public.os_itens where id = p_os_item_id for update;
  if not found then
    raise exception 'Item da OS não encontrado.';
  end if;

  if v_row.movimentacao_id is null then
    return null;
  end if;

  select * into v_os from public.ordens_servico where id = v_row.os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if not public.is_member_of_company(v_os.company_id) then
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
    v_os.company_id,
    v_mov.item_id,
    v_mov.store_id,
    'entrada',
    abs(v_mov.quantidade),
    'oficina_os_estorno',
    format('Estorno OS #%s — item %s', v_os.numero, v_row.id),
    v_user
  )
  returning id into v_estorno_id;

  update public.os_itens
     set movimentacao_id = null
   where id = v_row.id;

  return v_estorno_id;
end;
$$;

create or replace function public.os_estornar_baixas_os(p_os_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_os public.ordens_servico%rowtype;
  v_item record;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if not public.is_member_of_company(v_os.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  for v_item in
    select id
      from public.os_itens
     where os_id = p_os_id
       and movimentacao_id is not null
  loop
    perform public.os_estornar_item_estoque(v_item.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.os_estornar_item_estoque(uuid) to authenticated;
grant execute on function public.os_estornar_baixas_os(uuid) to authenticated;
