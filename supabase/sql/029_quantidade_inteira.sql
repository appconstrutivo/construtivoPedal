-- Quantidades operacionais apenas inteiras (sem frações).

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

create or replace function public.validate_estoque_movimentacao_quantidade_inteira()
returns trigger
language plpgsql
as $$
begin
  if new.quantidade <> trunc(new.quantidade) then
    raise exception 'Quantidade deve ser um número inteiro (sem decimais).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_estoque_movimentacao_qtd_inteira on public.estoque_movimentacoes;
create trigger trg_estoque_movimentacao_qtd_inteira
before insert or update of quantidade on public.estoque_movimentacoes
for each row
execute function public.validate_estoque_movimentacao_quantidade_inteira();

drop trigger if exists trg_estoque_kit_componentes_qtd_inteira on public.estoque_kit_componentes;
create trigger trg_estoque_kit_componentes_qtd_inteira
before insert or update of quantidade on public.estoque_kit_componentes
for each row
execute function public.validate_estoque_movimentacao_quantidade_inteira();
