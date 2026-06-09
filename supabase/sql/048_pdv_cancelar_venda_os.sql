-- Cancelamento de venda originada de OS: reverte caixa e remove faturamento
-- para permitir editar e faturar a OS novamente.

-- Só uma venda finalizada por OS (vendas canceladas não bloqueiam refaturamento).
drop index if exists public.idx_vendas_os_id_unique;
create unique index idx_vendas_os_id_unique
  on public.vendas (os_id)
  where os_id is not null and status = 'finalizada';

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
  v_cr public.financeiro_contas_receber%rowtype;
  v_mov public.financeiro_movimentacoes%rowtype;
  v_os_numero integer;
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

  if v_venda.os_id is not null then
    -- Venda espelho de OS: reverte entrada no caixa e remove conta a receber.
    select * into v_cr
      from public.financeiro_contas_receber
     where venda_id = p_venda_id
        or (os_id = v_venda.os_id and status = 'recebido')
     order by case when venda_id = p_venda_id then 0 else 1 end,
              created_at desc
     limit 1
     for update;

    if found then
      if v_cr.movimentacao_id is not null then
        select * into v_mov
          from public.financeiro_movimentacoes
         where id = v_cr.movimentacao_id
           for update;

        if found then
          if v_mov.tipo = 'entrada' then
            update public.financeiro_contas
               set saldo_atual = saldo_atual - v_mov.valor,
                   updated_at = timezone('utc', now())
             where id = v_mov.conta_id;
          elsif v_mov.tipo = 'saida' then
            update public.financeiro_contas
               set saldo_atual = saldo_atual + v_mov.valor,
                   updated_at = timezone('utc', now())
             where id = v_mov.conta_id;
          end if;

          update public.financeiro_contas_receber
             set movimentacao_id = null,
                 updated_at = timezone('utc', now())
           where id = v_cr.id;

          delete from public.financeiro_movimentacoes where id = v_mov.id;
        end if;
      end if;

      update public.financeiro_contas_receber
         set venda_id = null,
             updated_at = timezone('utc', now())
       where id = v_cr.id;

      delete from public.financeiro_contas_receber where id = v_cr.id;
    end if;
  else
    -- PDV balcão: estorna estoque dos itens com baixa.
    for v_item in
      select * from public.venda_itens
       where venda_id = p_venda_id
         and movimentacao_id is not null
    loop
      perform public.pdv_estornar_item_venda(v_item.id);
    end loop;
  end if;

  update public.vendas
     set status = 'cancelada'
   where id = p_venda_id;

  if v_venda.cliente_id is not null then
    if v_venda.os_id is not null then
      select numero into v_os_numero
        from public.ordens_servico
       where id = v_venda.os_id;

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
        format(
          'Cancelamento recebimento OS #%s — venda #%s',
          coalesce(v_os_numero::text, '?'),
          v_venda.numero
        ),
        0,
        current_date
      );
    else
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
  end if;
end;
$$;

grant execute on function public.pdv_cancelar_venda(uuid) to authenticated;
