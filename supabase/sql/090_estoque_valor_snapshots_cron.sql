-- Automatiza a captura mensal do valor em estoque (independente do operador).
-- Agenda: dia 1 de cada mês às 00:05 America/Sao_Paulo (= 03:05 UTC).
-- Execute após 089.

create extension if not exists pg_cron with schema pg_catalog;

-- Núcleo interno (sem checagem de JWT) — usado pelo cron e pela RPC autenticada.
create or replace function public._capturar_estoque_valor_snapshot(
  p_company_id uuid,
  p_store_id uuid,
  p_competencia date default null,
  p_origem text default 'auto'
)
returns public.estoque_valor_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comp date;
  v_origem text;
  v_existente public.estoque_valor_snapshots%rowtype;
  v_valor_merc numeric(14,2) := 0;
  v_valor_patr numeric(14,2) := 0;
  v_skus integer := 0;
  v_criticos integer := 0;
  v_reposicao integer := 0;
  v_novo public.estoque_valor_snapshots%rowtype;
begin
  if p_company_id is null or p_store_id is null then
    raise exception 'Informe empresa e loja.';
  end if;

  if not exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and s.company_id = p_company_id
  ) then
    raise exception 'Loja inválida para a empresa.';
  end if;

  v_comp := coalesce(p_competencia, public.estoque_competencia_atual());
  v_comp := date_trunc('month', v_comp::timestamp)::date;

  v_origem := coalesce(nullif(trim(p_origem), ''), 'auto');
  if v_origem not in ('auto', 'manual', 'cron') then
    v_origem := 'auto';
  end if;

  select *
    into v_existente
  from public.estoque_valor_snapshots
  where company_id = p_company_id
    and store_id = p_store_id
    and competencia = v_comp;

  if found then
    return v_existente;
  end if;

  select
    count(*)::integer,
    coalesce(sum(
      case
        when coalesce(t.patrimonio, false) then 0
        else round((ei.custo_medio * ei.saldo_atual)::numeric, 2)
      end
    ), 0)::numeric(14,2),
    coalesce(sum(
      case
        when coalesce(t.patrimonio, false) then round((ei.custo_medio * ei.saldo_atual)::numeric, 2)
        else 0
      end
    ), 0)::numeric(14,2),
    coalesce(sum(
      case
        when coalesce(t.patrimonio, false) then 0
        when ei.saldo_atual <= ei.estoque_minimo * 0.5 then 1
        else 0
      end
    ), 0)::integer,
    coalesce(sum(
      case
        when coalesce(t.patrimonio, false) then 0
        when ei.saldo_atual > ei.estoque_minimo * 0.5
         and ei.saldo_atual <= ei.estoque_minimo then 1
        else 0
      end
    ), 0)::integer
  into v_skus, v_valor_merc, v_valor_patr, v_criticos, v_reposicao
  from public.estoque_itens ei
  left join public.estoque_tipos t on t.id = ei.tipo_id
  where ei.company_id = p_company_id
    and ei.store_id = p_store_id
    and ei.ativo = true;

  insert into public.estoque_valor_snapshots (
    company_id,
    store_id,
    competencia,
    valor_mercadorias,
    valor_patrimonio,
    total_skus,
    criticos,
    reposicao,
    origem,
    capturado_em
  )
  values (
    p_company_id,
    p_store_id,
    v_comp,
    coalesce(v_valor_merc, 0),
    coalesce(v_valor_patr, 0),
    coalesce(v_skus, 0),
    coalesce(v_criticos, 0),
    coalesce(v_reposicao, 0),
    v_origem,
    timezone('utc', now())
  )
  on conflict (company_id, store_id, competencia) do nothing
  returning * into v_novo;

  if v_novo.id is null then
    select *
      into v_novo
    from public.estoque_valor_snapshots
    where company_id = p_company_id
      and store_id = p_store_id
      and competencia = v_comp;
  end if;

  return v_novo;
end;
$$;

revoke all on function public._capturar_estoque_valor_snapshot(uuid, uuid, date, text) from public;
revoke all on function public._capturar_estoque_valor_snapshot(uuid, uuid, date, text) from authenticated;
revoke all on function public._capturar_estoque_valor_snapshot(uuid, uuid, date, text) from anon;

-- RPC autenticada: membership + núcleo interno.
create or replace function public.capturar_estoque_valor_snapshot(
  p_company_id uuid,
  p_store_id uuid,
  p_competencia date default null,
  p_origem text default 'auto'
)
returns public.estoque_valor_snapshots
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem acesso a esta empresa.';
  end if;

  return public._capturar_estoque_valor_snapshot(
    p_company_id,
    p_store_id,
    p_competencia,
    p_origem
  );
end;
$$;

grant execute on function public.capturar_estoque_valor_snapshot(uuid, uuid, date, text) to authenticated;

-- Job mensal: todas as lojas ativas, sem depender de operador.
create or replace function public.capturar_estoque_valor_snapshots_todas_lojas(
  p_origem text default 'cron'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_origem text := coalesce(nullif(trim(p_origem), ''), 'cron');
  v_comp date := public.estoque_competencia_atual();
begin
  for r in
    select s.company_id, s.id as store_id
    from public.stores s
    where coalesce(s.active, true) = true
  loop
    perform public._capturar_estoque_valor_snapshot(
      r.company_id,
      r.store_id,
      v_comp,
      v_origem
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.capturar_estoque_valor_snapshots_todas_lojas(text) from public;
revoke all on function public.capturar_estoque_valor_snapshots_todas_lojas(text) from authenticated;
revoke all on function public.capturar_estoque_valor_snapshots_todas_lojas(text) from anon;

-- Remove agenda anterior (se reaplicar) e cria job mensal.
do $$
declare
  jid bigint;
begin
  for jid in
    select jobid from cron.job where jobname = 'estoque-valor-snapshot-mensal'
  loop
    perform cron.unschedule(jid);
  end loop;

  perform cron.schedule(
    'estoque-valor-snapshot-mensal',
    '5 3 1 * *',
    $cron$select public.capturar_estoque_valor_snapshots_todas_lojas('cron');$cron$
  );
end $$;
