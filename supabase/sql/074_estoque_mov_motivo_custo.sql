-- Motivo, custo e contagem nas movimentações de estoque.
-- motivo (movimentação manual):
--   entrada: compra | retorno
--   saida:   perda | consumo_interno | devolucao_fornecedor
--   ajuste:  balanco
--   null = movimentação automática (PDV, OS, kits) ou histórica.
-- custo_unitario: na compra é o custo informado e recalcula o custo médio ponderado do item;
--   nas demais é o custo médio vigente no momento (valoriza perdas, sobras e consumo).
-- saldo_contado: no balanço o operador informa a contagem física e o servidor calcula a diferença
--   com o item bloqueado (for update), evitando divergência com vendas simultâneas.
-- Execute após 073.

alter table public.estoque_movimentacoes
  add column if not exists motivo text,
  add column if not exists custo_unitario numeric(12,2),
  add column if not exists saldo_contado numeric(12,3);

alter table public.estoque_movimentacoes drop constraint if exists estoque_movimentacoes_motivo_check;
alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_motivo_check check (
    motivo is null
    or (tipo = 'entrada' and motivo in ('compra', 'retorno'))
    or (tipo = 'saida' and motivo in ('perda', 'consumo_interno', 'devolucao_fornecedor'))
    or (tipo = 'ajuste' and motivo = 'balanco')
  );

alter table public.estoque_movimentacoes drop constraint if exists estoque_movimentacoes_custo_non_negative;
alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_custo_non_negative check (custo_unitario is null or custo_unitario >= 0);

alter table public.estoque_movimentacoes drop constraint if exists estoque_movimentacoes_saldo_contado_check;
alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_saldo_contado_check check (
    saldo_contado is null or (saldo_contado >= 0 and saldo_contado = trunc(saldo_contado))
  );

create or replace function public.apply_estoque_movimentacao()
returns trigger
language plpgsql
as $$
declare
  v_item public.estoque_itens%rowtype;
  v_delta numeric(12,3);
  v_novo_saldo numeric(12,3);
  v_novo_custo numeric(12,2);
begin
  select *
    into v_item
  from public.estoque_itens
  where id = new.item_id
  for update;

  if not found then
    raise exception 'Item de estoque não encontrado.';
  end if;

  if new.motivo = 'balanco' then
    if new.saldo_contado is null then
      raise exception 'Informe a quantidade contada.';
    end if;
    new.tipo := 'ajuste';
    v_delta := new.saldo_contado - v_item.saldo_atual;
    if v_delta = 0 then
      raise exception 'A contagem confere com o saldo do sistema. Nada a ajustar.';
    end if;
  elsif new.tipo = 'entrada' then
    v_delta := abs(new.quantidade);
  elsif new.tipo = 'saida' then
    v_delta := -abs(new.quantidade);
  else
    v_delta := new.quantidade;
  end if;

  v_novo_saldo := v_item.saldo_atual + v_delta;
  if v_novo_saldo < 0 then
    raise exception 'Saldo insuficiente para a movimentação.';
  end if;

  v_novo_custo := v_item.custo_medio;
  if new.motivo = 'compra' then
    if new.custo_unitario is null then
      raise exception 'Informe o custo unitário da compra.';
    end if;
    if v_item.saldo_atual <= 0 or coalesce(v_item.custo_medio, 0) <= 0 then
      v_novo_custo := new.custo_unitario;
    else
      v_novo_custo := round(
        (v_item.saldo_atual * v_item.custo_medio + v_delta * new.custo_unitario) / v_novo_saldo,
        2
      );
    end if;
  else
    new.custo_unitario := v_item.custo_medio;
  end if;

  if new.motivo is distinct from 'balanco' then
    new.saldo_contado := null;
  end if;

  update public.estoque_itens
     set saldo_atual = v_novo_saldo,
         custo_medio = v_novo_custo,
         updated_at = timezone('utc', now())
   where id = v_item.id;

  new.company_id := v_item.company_id;
  new.store_id := coalesce(new.store_id, v_item.store_id);
  new.quantidade := v_delta;
  new.created_by := coalesce(new.created_by, auth.uid());

  return new;
end;
$$;
