-- Backfill de lembretes para vendas de bike anteriores à configuração das regras.
-- Execute após 055.

-- Idempotente: ignora combinações venda_item + regra já existentes.
create or replace function public.pos_venda_gerar_lembretes(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_item record;
  v_regra record;
  v_data_venda date;
begin
  select * into v_venda from public.vendas where id = p_venda_id;
  if not found then
    return;
  end if;

  if v_venda.status <> 'finalizada' or v_venda.cliente_id is null then
    return;
  end if;

  v_data_venda := (v_venda.realizada_em at time zone 'America/Sao_Paulo')::date;

  for v_item in
    select
      vi.id as venda_item_id,
      vi.descricao as produto_descricao,
      coalesce(ei.categoria, 'peca') as categoria
    from public.venda_itens vi
    left join public.estoque_itens ei on ei.id = vi.estoque_item_id
    where vi.venda_id = p_venda_id
      and vi.estoque_item_id is not null
      and coalesce(ei.categoria, 'peca') = 'bike'
  loop
    for v_regra in
      select *
        from public.pos_venda_regras r
       where r.company_id = v_venda.company_id
         and r.store_id = v_venda.store_id
         and r.categoria_produto = v_item.categoria
         and r.ativo = true
       order by r.ordem, r.dias_apos_venda
    loop
      if not exists (
        select 1
          from public.pos_venda_lembretes l
         where l.venda_item_id = v_item.venda_item_id
           and l.regra_id = v_regra.id
           and l.status <> 'cancelado'
      ) then
        insert into public.pos_venda_lembretes (
          company_id,
          store_id,
          regra_id,
          venda_id,
          venda_item_id,
          cliente_id,
          produto_descricao,
          titulo,
          data_venda,
          data_prevista
        )
        values (
          v_venda.company_id,
          v_venda.store_id,
          v_regra.id,
          p_venda_id,
          v_item.venda_item_id,
          v_venda.cliente_id,
          v_item.produto_descricao,
          v_regra.titulo,
          v_data_venda,
          v_data_venda + v_regra.dias_apos_venda
        );
      end if;
    end loop;
  end loop;
end;
$$;

-- Gera lembretes retroativos para vendas finalizadas com bike + cliente.
create or replace function public.pos_venda_backfill_lembretes(
  p_company_id uuid,
  p_store_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_antes integer;
  v_depois integer;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  select count(*)::integer into v_antes
    from public.pos_venda_lembretes
   where company_id = p_company_id
     and store_id = p_store_id;

  for v_venda_id in
    select distinct v.id
      from public.vendas v
      join public.venda_itens vi on vi.venda_id = v.id
      join public.estoque_itens ei on ei.id = vi.estoque_item_id
     where v.company_id = p_company_id
       and v.store_id = p_store_id
       and v.status = 'finalizada'
       and v.cliente_id is not null
       and ei.categoria = 'bike'
     order by v.id
  loop
    perform public.pos_venda_gerar_lembretes(v_venda_id);
  end loop;

  select count(*)::integer into v_depois
    from public.pos_venda_lembretes
   where company_id = p_company_id
     and store_id = p_store_id;

  return v_depois - v_antes;
end;
$$;

grant execute on function public.pos_venda_backfill_lembretes(uuid, uuid) to authenticated;
