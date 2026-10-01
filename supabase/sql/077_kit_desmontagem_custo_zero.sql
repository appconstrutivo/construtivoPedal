-- Desmontagem: componente com custo médio zero volta com custo zero.
-- O rateio proporcional (076) já dá zero a esses componentes; aqui remove-se o fallback
-- que dividia o custo do kit por unidade quando todos os componentes estavam sem custo.
-- Execute após 076.

create or replace function public.registrar_desmontagem_kit(
  p_company_id uuid,
  p_kit_id uuid,
  p_quantidade numeric,
  p_origem text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.estoque_kits%rowtype;
  v_comp record;
  v_saldo numeric(12,3);
  v_custo_kit numeric(12,2);
  v_custo_receita numeric(14,4);
  v_custo_comp numeric(12,2);
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Acesso negado a esta empresa.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade de desmontagem deve ser maior que zero.';
  end if;

  if p_quantidade <> trunc(p_quantidade) then
    raise exception 'Quantidade de desmontagem deve ser um número inteiro (sem decimais).';
  end if;

  select *
    into v_kit
  from public.estoque_kits k
  where k.id = p_kit_id
    and k.company_id = p_company_id
    and k.ativo = true;

  if not found then
    raise exception 'Kit não encontrado para esta empresa.';
  end if;

  if v_kit.item_resultante_id is null then
    raise exception 'Kit sem item resultante vinculado.';
  end if;

  select i.saldo_atual
    into v_saldo
  from public.estoque_itens i
  where i.id = v_kit.item_resultante_id
    and i.company_id = p_company_id
  for update;

  if not found then
    raise exception 'Item resultante do kit não encontrado.';
  end if;

  if v_saldo < p_quantidade then
    raise exception 'Saldo insuficiente do item montado. Disponível: %, solicitado: %.',
      trunc(v_saldo), trunc(p_quantidade);
  end if;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    tipo,
    motivo,
    quantidade,
    origem,
    observacao
  )
  values (
    p_company_id,
    v_kit.item_resultante_id,
    'saida',
    'desmontagem',
    p_quantidade,
    coalesce(p_origem, 'desmontagem de kit'),
    format('Baixa por desmontagem do kit: %s', v_kit.nome)
  )
  returning custo_unitario into v_custo_kit;

  select coalesce(sum(c.quantidade * coalesce(i.custo_medio, 0)), 0)
    into v_custo_receita
  from public.estoque_kit_componentes c
  join public.estoque_itens i on i.id = c.componente_item_id
  where c.kit_id = v_kit.id
    and c.company_id = p_company_id;

  for v_comp in
    select c.componente_item_id, c.quantidade, coalesce(i.custo_medio, 0) as custo_medio
    from public.estoque_kit_componentes c
    join public.estoque_itens i on i.id = c.componente_item_id
    where c.kit_id = v_kit.id
      and c.company_id = p_company_id
  loop
    if v_comp.quantidade <> trunc(v_comp.quantidade) then
      raise exception 'Componente do kit com quantidade fracionada. Atualize o cadastro do kit.';
    end if;

    if v_custo_receita > 0 and v_comp.custo_medio > 0 then
      v_custo_comp := round(v_comp.custo_medio * coalesce(v_custo_kit, 0) / v_custo_receita, 2);
    else
      v_custo_comp := 0;
    end if;

    insert into public.estoque_movimentacoes (
      company_id,
      item_id,
      tipo,
      motivo,
      quantidade,
      custo_unitario,
      origem,
      observacao
    )
    values (
      p_company_id,
      v_comp.componente_item_id,
      'entrada',
      'desmontagem',
      v_comp.quantidade * p_quantidade,
      v_custo_comp,
      coalesce(p_origem, 'desmontagem de kit'),
      format('Entrada por desmontagem do kit: %s', v_kit.nome)
    );
  end loop;
end;
$$;

revoke all on function public.registrar_desmontagem_kit(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.registrar_desmontagem_kit(uuid, uuid, numeric, text) to authenticated;
