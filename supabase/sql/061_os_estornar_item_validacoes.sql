-- Validações ao retornar peça ao estoque (estorno individual da baixa na OS).
-- Impede estorno com faturamento/recebimento ativo.
-- Nota: status cancelada NÃO é bloqueado aqui — o cancelamento da OS chama
-- os_estornar_baixas_os após gravar o status e precisa conseguir estornar.

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
  v_fat boolean;
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

  -- Permite estorno em OS cancelada (fluxo de cancelamento/exclusão).
  -- Bloqueia apenas quando há conta a receber ativa (faturada/recebida).
  if coalesce(v_os.status, '') <> 'cancelada' then
    select exists (
      select 1
        from public.financeiro_contas_receber cr
       where cr.os_id = v_os.id
         and cr.status in ('pendente', 'recebido')
    ) into v_fat;

    if v_fat then
      raise exception 'Não é possível retornar estoque de OS faturada ou recebida. Cancele o faturamento/recebimento e altere o status para Aberta.';
    end if;
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

grant execute on function public.os_estornar_item_estoque(uuid) to authenticated;
