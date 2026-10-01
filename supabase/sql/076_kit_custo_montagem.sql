-- Custo real na montagem/desmontagem de kits.
-- Montagem: o item montado entra pelo custo das peças efetivamente baixadas
--   (Σ quantidade × custo médio de cada componente no momento) e entra na média ponderada
--   do item montado. Alterar a receita ou o custo dos componentes afeta só montagens futuras.
-- Desmontagem: o item montado sai pelo custo médio dele e esse valor é rateado entre os
--   componentes devolvidos, proporcional ao custo médio atual de cada um (conserva o valor).
-- Movimentações automáticas de kit passam a ter motivo 'montagem' | 'desmontagem'.
-- Também: valida membro da empresa nas RPCs (security definer) e remove acesso anônimo.
-- Execute após 075.

alter table public.estoque_movimentacoes drop constraint if exists estoque_movimentacoes_motivo_check;
alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_motivo_check check (
    motivo is null
    or (tipo = 'entrada' and motivo in ('compra', 'retorno', 'montagem', 'desmontagem'))
    or (tipo = 'saida' and motivo in ('perda', 'consumo_interno', 'devolucao_fornecedor', 'montagem', 'desmontagem'))
    or (tipo = 'ajuste' and motivo = 'balanco')
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
  if new.tipo = 'entrada' and new.motivo in ('compra', 'montagem', 'desmontagem') then
    if new.custo_unitario is null then
      raise exception 'Informe o custo unitário da entrada.';
    end if;
    -- Componentes sem custo cadastrado não zeram o custo de um item que já tem custo.
    if new.motivo <> 'compra' and new.custo_unitario <= 0 and coalesce(v_item.custo_medio, 0) > 0 then
      new.custo_unitario := v_item.custo_medio;
    elsif v_item.saldo_atual <= 0 or coalesce(v_item.custo_medio, 0) <= 0 then
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
  v_custo_mov numeric(12,2);
  v_qtd_mov numeric(12,3);
  v_custo_total numeric(14,2) := 0;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Acesso negado a esta empresa.';
  end if;

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
      motivo,
      quantidade,
      origem,
      observacao
    )
    values (
      p_company_id,
      v_comp.componente_item_id,
      'saida',
      'montagem',
      v_comp.quantidade * p_quantidade,
      coalesce(p_origem, 'montagem de kit'),
      format('Baixa por montagem do kit: %s', v_kit.nome)
    )
    returning custo_unitario, abs(quantidade) into v_custo_mov, v_qtd_mov;

    v_custo_total := v_custo_total + coalesce(v_custo_mov, 0) * v_qtd_mov;
  end loop;

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
    v_kit.item_resultante_id,
    'entrada',
    'montagem',
    p_quantidade,
    round(v_custo_total / p_quantidade, 2),
    coalesce(p_origem, 'montagem de kit'),
    format('Entrada por montagem do kit: %s', v_kit.nome)
  );
end;
$$;

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
  v_unidades_receita numeric(14,3);
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

  select coalesce(sum(c.quantidade * coalesce(i.custo_medio, 0)), 0),
         coalesce(sum(c.quantidade), 0)
    into v_custo_receita, v_unidades_receita
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

    if v_custo_receita > 0 then
      v_custo_comp := round(v_comp.custo_medio * coalesce(v_custo_kit, 0) / v_custo_receita, 2);
    elsif v_unidades_receita > 0 then
      v_custo_comp := round(coalesce(v_custo_kit, 0) / v_unidades_receita, 2);
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

revoke all on function public.registrar_montagem_kit(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.registrar_desmontagem_kit(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.registrar_montagem_kit(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.registrar_desmontagem_kit(uuid, uuid, numeric, text) to authenticated;

-- Itens montados sem saldo não têm unidade antiga a preservar: alinha o custo à receita atual.
with receita as (
  select k.item_resultante_id as item_id,
         round(sum(c.quantidade * coalesce(ci.custo_medio, 0)), 2) as custo
  from public.estoque_kits k
  join public.estoque_kit_componentes c on c.kit_id = k.id
  join public.estoque_itens ci on ci.id = c.componente_item_id
  where k.ativo = true
    and k.item_resultante_id is not null
  group by k.id, k.item_resultante_id
),
unica as (
  select item_id, max(custo) as custo
  from receita
  group by item_id
  having count(*) = 1
)
update public.estoque_itens r
   set custo_medio = u.custo,
       updated_at = timezone('utc', now())
  from unica u
 where r.id = u.item_id
   and r.saldo_atual <= 0
   and u.custo > 0
   and r.custo_medio is distinct from u.custo;
