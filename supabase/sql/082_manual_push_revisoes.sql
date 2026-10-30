-- Web Push do Manual do Proprietário: subscriptions, log de envios e RPCs.
-- Gatilhos MVP: 3 dias antes, no dia, 1º dia em atraso.

create table if not exists public.manual_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  bicicleta_id uuid not null references public.bicicletas (id) on delete cascade,
  token_manual text not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  ativo boolean not null default true,
  ultimo_erro text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint manual_push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists idx_manual_push_subs_bike_ativo
  on public.manual_push_subscriptions (bicicleta_id)
  where ativo = true;

create index if not exists idx_manual_push_subs_token_ativo
  on public.manual_push_subscriptions (token_manual)
  where ativo = true;

create table if not exists public.manual_push_envios (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.manual_push_subscriptions (id) on delete cascade,
  bicicleta_id uuid not null references public.bicicletas (id) on delete cascade,
  revisao_sequencia integer not null,
  gatilho text not null,
  enviado_em timestamptz not null default timezone('utc', now()),
  constraint manual_push_envios_gatilho_check
    check (gatilho in ('antes_3d', 'no_dia', 'atraso')),
  constraint manual_push_envios_unique
    unique (subscription_id, revisao_sequencia, gatilho)
);

create index if not exists idx_manual_push_envios_bike
  on public.manual_push_envios (bicicleta_id, enviado_em desc);

alter table public.manual_push_subscriptions enable row level security;
alter table public.manual_push_envios enable row level security;

-- Sem policies para anon/authenticated: acesso só via RPC security definer / service_role.

create or replace function public.set_manual_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_manual_push_subscriptions_updated_at on public.manual_push_subscriptions;
create trigger trg_manual_push_subscriptions_updated_at
before update on public.manual_push_subscriptions
for each row
execute function public.set_manual_push_subscriptions_updated_at();

create or replace function public.manual_push_registrar(
  p_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_ua text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bike public.bicicletas%rowtype;
  v_row public.manual_push_subscriptions%rowtype;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'Token inválido.';
  end if;
  if p_endpoint is null or length(trim(p_endpoint)) < 8 then
    raise exception 'Endpoint inválido.';
  end if;
  if p_p256dh is null or length(trim(p_p256dh)) < 8 then
    raise exception 'Chave p256dh inválida.';
  end if;
  if p_auth is null or length(trim(p_auth)) < 8 then
    raise exception 'Chave auth inválida.';
  end if;

  select * into v_bike
  from public.bicicletas
  where token_manual = trim(p_token);

  if not found then
    raise exception 'Manual não encontrado.';
  end if;

  insert into public.manual_push_subscriptions (
    company_id,
    bicicleta_id,
    token_manual,
    endpoint,
    p256dh,
    auth_key,
    user_agent,
    ativo,
    ultimo_erro
  )
  values (
    v_bike.company_id,
    v_bike.id,
    trim(p_token),
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    nullif(trim(coalesce(p_ua, '')), ''),
    true,
    null
  )
  on conflict (endpoint) do update set
    company_id = excluded.company_id,
    bicicleta_id = excluded.bicicleta_id,
    token_manual = excluded.token_manual,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    ativo = true,
    ultimo_erro = null,
    updated_at = timezone('utc', now())
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_row.id,
    'bicicleta_id', v_row.bicicleta_id
  );
end;
$$;

create or replace function public.manual_push_desativar(
  p_token text,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'Token inválido.';
  end if;
  if p_endpoint is null or length(trim(p_endpoint)) < 8 then
    raise exception 'Endpoint inválido.';
  end if;

  update public.manual_push_subscriptions s
  set ativo = false,
      updated_at = timezone('utc', now())
  where s.token_manual = trim(p_token)
    and s.endpoint = trim(p_endpoint)
    and s.ativo = true;

  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'desativadas', v_n);
end;
$$;

create or replace function public.manual_push_marcar_envio(
  p_subscription_id uuid,
  p_bicicleta_id uuid,
  p_revisao_sequencia integer,
  p_gatilho text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.manual_push_envios (
    subscription_id,
    bicicleta_id,
    revisao_sequencia,
    gatilho
  )
  values (
    p_subscription_id,
    p_bicicleta_id,
    p_revisao_sequencia,
    p_gatilho
  )
  on conflict (subscription_id, revisao_sequencia, gatilho) do nothing;
end;
$$;

create or replace function public.manual_push_desativar_por_endpoint(p_endpoint text, p_erro text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.manual_push_subscriptions
  set ativo = false,
      ultimo_erro = nullif(trim(coalesce(p_erro, '')), ''),
      updated_at = timezone('utc', now())
  where endpoint = trim(p_endpoint);
end;
$$;

-- Candidatos do job diário (somente service_role).
create or replace function public.manual_push_candidatos()
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  bicicleta_id uuid,
  token_manual text,
  company_id uuid,
  bike_label text,
  revisao_sequencia integer,
  revisao_titulo text,
  revisao_tipo text,
  prazo_em date,
  gatilho text,
  atrasadas_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
begin
  return query
  with regra_dias as (
    select distinct on (r.company_id, public.manual_tipo_revisao_de_texto(r.titulo))
      r.company_id,
      public.manual_tipo_revisao_de_texto(r.titulo) as tipo,
      r.dias_apos_venda
    from public.pos_venda_regras r
    where r.ativo = true
      and public.manual_tipo_revisao_de_texto(r.titulo) is not null
    order by
      r.company_id,
      public.manual_tipo_revisao_de_texto(r.titulo),
      r.ordem,
      r.dias_apos_venda
  ),
  bikes as (
    select
      b.id as bicicleta_id,
      b.company_id,
      b.token_manual,
      trim(both from coalesce(b.marca, '') || ' ' || coalesce(b.modelo, '')) as bike_label,
      case
        when b.data_compra is not null
             and extract(year from b.data_compra) >= 1990
          then b.data_compra
        else null
      end as data_compra_ok
    from public.bicicletas b
    where exists (
      select 1
      from public.manual_push_subscriptions s
      where s.bicicleta_id = b.id
        and s.ativo = true
    )
      and b.token_manual is not null
  ),
  slots as (
    select
      bk.bicicleta_id,
      bk.company_id,
      bk.token_manual,
      bk.bike_label,
      r.sequencia,
      r.tipo,
      r.titulo,
      public.manual_prazo_revisao(
        bk.data_compra_ok,
        r.sequencia,
        r.tipo,
        coalesce(rd.dias_apos_venda, public.manual_dias_padrao_tipo(r.tipo)),
        coalesce(rd_geral.dias_apos_venda, public.manual_dias_padrao_tipo('geral'), 210)
      ) as prazo
    from bikes bk
    join public.bike_manual_revisoes r
      on r.bicicleta_id = bk.bicicleta_id
     and r.status = 'pendente'
    left join regra_dias rd
      on rd.company_id = bk.company_id
     and rd.tipo = r.tipo
    left join regra_dias rd_geral
      on rd_geral.company_id = bk.company_id
     and rd_geral.tipo = 'geral'
    where bk.data_compra_ok is not null
  ),
  tagged as (
    select
      s.*,
      case
        when s.prazo = (v_hoje + 3) then 'antes_3d'
        when s.prazo = v_hoje then 'no_dia'
        when s.prazo = (v_hoje - 1) then 'atraso'
        else null
      end as gatilho_calc
    from slots s
  ),
  atrasadas as (
    select s.bicicleta_id, count(*)::integer as cnt
    from slots s
    where s.prazo is not null
      and s.prazo < v_hoje
    group by s.bicicleta_id
  )
  select
    sub.id,
    sub.endpoint,
    sub.p256dh,
    sub.auth_key,
    t.bicicleta_id,
    t.token_manual,
    t.company_id,
    t.bike_label,
    t.sequencia,
    t.titulo,
    t.tipo,
    t.prazo,
    t.gatilho_calc,
    coalesce(a.cnt, 0)
  from tagged t
  join public.manual_push_subscriptions sub
    on sub.bicicleta_id = t.bicicleta_id
   and sub.ativo = true
  left join atrasadas a on a.bicicleta_id = t.bicicleta_id
  where t.gatilho_calc is not null
    and not exists (
      select 1
      from public.manual_push_envios e
      where e.subscription_id = sub.id
        and e.revisao_sequencia = t.sequencia
        and e.gatilho = t.gatilho_calc
    );
end;
$$;

revoke all on function public.manual_push_registrar(text, text, text, text, text) from public;
revoke all on function public.manual_push_desativar(text, text) from public;
revoke all on function public.manual_push_candidatos() from public;
revoke all on function public.manual_push_marcar_envio(uuid, uuid, integer, text) from public;
revoke all on function public.manual_push_desativar_por_endpoint(text, text) from public;

grant execute on function public.manual_push_registrar(text, text, text, text, text) to anon, authenticated;
grant execute on function public.manual_push_desativar(text, text) to anon, authenticated;

-- candidatos / marcar / desativar endpoint: só service_role (já tem by default em security definer owners)
grant execute on function public.manual_push_candidatos() to service_role;
grant execute on function public.manual_push_marcar_envio(uuid, uuid, integer, text) to service_role;
grant execute on function public.manual_push_desativar_por_endpoint(text, text) to service_role;
