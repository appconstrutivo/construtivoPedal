-- Valida saldo dos componentes antes de montar kit (quantidade × receita).

create or replace function public.registrar_montagem_kit(
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
  v_item public.estoque_itens%rowtype;
  v_necessario numeric(12,3);
  v_faltas text := '';
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade de montagem deve ser maior que zero.';
  end if;

  if p_quantidade <> trunc(p_quantidade) then
    raise exception 'Quantidade de montagem deve ser um número inteiro (sem decimais).';
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

  for v_comp in
    select c.componente_item_id, c.quantidade
    from public.estoque_kit_componentes c
    where c.kit_id = v_kit.id
      and c.company_id = p_company_id
  loop
    if v_comp.quantidade <> trunc(v_comp.quantidade) then
      raise exception 'Componente do kit com quantidade fracionada. Atualize o cadastro do kit.';
    end if;

    v_necessario := v_comp.quantidade * p_quantidade;

    select *
      into v_item
    from public.estoque_itens i
    where i.id = v_comp.componente_item_id
      and i.company_id = p_company_id;

    if not found then
      raise exception 'Componente do kit não encontrado no estoque.';
    end if;

    if v_item.saldo_atual < v_necessario then
      v_faltas := v_faltas || format(
        E'\n• %s: necessário %s, disponível %s (faltam %s)',
        v_item.nome,
        trunc(v_necessario),
        trunc(greatest(v_item.saldo_atual, 0)),
        trunc(v_necessario - greatest(v_item.saldo_atual, 0))
      );
    end if;
  end loop;

  if v_faltas <> '' then
    raise exception 'Estoque insuficiente para montar o kit:%', v_faltas;
  end if;

  for v_comp in
    select c.componente_item_id, c.quantidade
    from public.estoque_kit_componentes c
    where c.kit_id = v_kit.id
      and c.company_id = p_company_id
  loop
    insert into public.estoque_movimentacoes (
      company_id,
      item_id,
      tipo,
      quantidade,
      origem,
      observacao
    )
    values (
      p_company_id,
      v_comp.componente_item_id,
      'saida',
      v_comp.quantidade * p_quantidade,
      coalesce(p_origem, 'montagem de kit'),
      format('Baixa por montagem do kit: %s', v_kit.nome)
    );
  end loop;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    tipo,
    quantidade,
    origem,
    observacao
  )
  values (
    p_company_id,
    v_kit.item_resultante_id,
    'entrada',
    p_quantidade,
    coalesce(p_origem, 'montagem de kit'),
    format('Entrada por montagem do kit: %s', v_kit.nome)
  );
end;
$$;
