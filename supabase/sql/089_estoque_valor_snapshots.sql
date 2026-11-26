-- Snapshots mensais do valor contido em estoque (custo) por loja.
-- Serve análise de crescimento: o operador compara o capital parado mês a mês.
-- Competência = 1º dia do mês (America/Sao_Paulo).
-- A primeira captura do mês congela o valor; meses anteriores não são reconstruídos.
-- Execute após 088.

create table if not exists public.estoque_valor_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  -- Sempre o 1º dia do mês (ex.: 2026-11-01).
  competencia date not null,
  valor_mercadorias numeric(14,2) not null default 0,
  valor_patrimonio numeric(14,2) not null default 0,
  total_skus integer not null default 0,
  criticos integer not null default 0,
  reposicao integer not null default 0,
  origem text not null default 'auto',
  capturado_em timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint estoque_valor_snapshots_competencia_dia_1
    check (extract(day from competencia) = 1),
  constraint estoque_valor_snapshots_origem_check
    check (origem in ('auto', 'manual', 'cron')),
  constraint estoque_valor_snapshots_valores_non_negative
    check (
      valor_mercadorias >= 0
      and valor_patrimonio >= 0
      and total_skus >= 0
      and criticos >= 0
      and reposicao >= 0
    ),
  constraint estoque_valor_snapshots_unique_loja_competencia
    unique (company_id, store_id, competencia)
);

create index if not exists idx_estoque_valor_snapshots_loja_comp
  on public.estoque_valor_snapshots (company_id, store_id, competencia desc);

alter table public.estoque_valor_snapshots enable row level security;

drop policy if exists "estoque_valor_snapshots_select_member" on public.estoque_valor_snapshots;
create policy "estoque_valor_snapshots_select_member"
  on public.estoque_valor_snapshots
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_valor_snapshots_insert_member" on public.estoque_valor_snapshots;
create policy "estoque_valor_snapshots_insert_member"
  on public.estoque_valor_snapshots
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

-- Sem UPDATE/DELETE para membros: snapshot é imutável após a captura.

-- Competência do mês corrente no fuso da operação (Brasil).
create or replace function public.estoque_competencia_atual()
returns date
language sql
stable
as $$
  select (date_trunc('month', timezone('America/Sao_Paulo', now())))::date;
$$;

grant execute on function public.estoque_competencia_atual() to authenticated;

-- Calcula e grava o snapshot da loja para a competência (default = mês atual).
-- Se já existir, não altera (freeze). Retorna o registro vigente.
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
  -- Usuário autenticado: exige membership. Jobs (service_role) podem chamar sem JWT de usuário.
  if auth.uid() is not null and not public.is_member_of_company(p_company_id) then
    raise exception 'Sem acesso a esta empresa.';
  end if;

  if auth.uid() is null and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Não autenticado.';
  end if;

  if p_store_id is null then
    raise exception 'Informe a loja.';
  end if;

  if not exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and s.company_id = p_company_id
  ) then
    raise exception 'Loja inválida para a empresa.';
  end if;

  v_comp := coalesce(
    p_competencia,
    public.estoque_competencia_atual()
  );
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

grant execute on function public.capturar_estoque_valor_snapshot(uuid, uuid, date, text) to authenticated;

-- Captura o mês atual para todas as lojas ativas (uso futuro via cron / painel).
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
begin
  for r in
    select s.company_id, s.id as store_id
    from public.stores s
    where coalesce(s.active, true) = true
  loop
    perform public.capturar_estoque_valor_snapshot(
      r.company_id,
      r.store_id,
      public.estoque_competencia_atual(),
      coalesce(nullif(trim(p_origem), ''), 'cron')
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Função bulk só para service_role / jobs internos (não expor a authenticated
-- sem checagem — membership é validada na RPC unitária).
revoke all on function public.capturar_estoque_valor_snapshots_todas_lojas(text) from public;
revoke all on function public.capturar_estoque_valor_snapshots_todas_lojas(text) from authenticated;
