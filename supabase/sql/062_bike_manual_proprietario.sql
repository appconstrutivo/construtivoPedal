-- Manual do Proprietário: link público por bicicleta + quadro de revisões (carimbos).
-- Fluxo: cadastro da bike gera token; OS entregue com serviço de revisão carimba o quadro.

-- ─── Coluna token na bicicleta ───────────────────────────────────────────────

alter table public.bicicletas
  add column if not exists token_manual text;

create unique index if not exists bicicletas_token_manual_uidx
  on public.bicicletas (token_manual)
  where token_manual is not null;

-- ─── Quadro de revisões ──────────────────────────────────────────────────────

create table if not exists public.bike_manual_revisoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  bicicleta_id uuid not null references public.bicicletas (id) on delete cascade,
  sequencia integer not null,
  tipo text not null,
  titulo text not null,
  status text not null default 'pendente',
  realizada_em timestamptz,
  store_id uuid references public.stores (id) on delete set null,
  loja_nome text,
  os_id uuid references public.ordens_servico (id) on delete set null,
  os_numero integer,
  created_at timestamptz not null default timezone('utc', now()),
  constraint bike_manual_revisoes_tipo_check
    check (tipo in ('verificacao_30', 'periodica', 'intermediaria', 'geral')),
  constraint bike_manual_revisoes_status_check
    check (status in ('pendente', 'realizada')),
  constraint bike_manual_revisoes_seq_positive check (sequencia > 0),
  constraint bike_manual_revisoes_bike_seq_unique unique (bicicleta_id, sequencia)
);

create index if not exists idx_bike_manual_revisoes_bike
  on public.bike_manual_revisoes (bicicleta_id, sequencia);

create index if not exists idx_bike_manual_revisoes_os
  on public.bike_manual_revisoes (os_id)
  where os_id is not null;

create unique index if not exists bike_manual_revisoes_os_tipo_uidx
  on public.bike_manual_revisoes (os_id, tipo)
  where os_id is not null and status = 'realizada';

alter table public.bike_manual_revisoes enable row level security;

drop policy if exists "bike_manual_revisoes_select_member" on public.bike_manual_revisoes;
create policy "bike_manual_revisoes_select_member"
  on public.bike_manual_revisoes for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "bike_manual_revisoes_insert_member" on public.bike_manual_revisoes;
create policy "bike_manual_revisoes_insert_member"
  on public.bike_manual_revisoes for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "bike_manual_revisoes_update_member" on public.bike_manual_revisoes;
create policy "bike_manual_revisoes_update_member"
  on public.bike_manual_revisoes for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "bike_manual_revisoes_delete_member" on public.bike_manual_revisoes;
create policy "bike_manual_revisoes_delete_member"
  on public.bike_manual_revisoes for delete to authenticated
  using (public.is_member_of_company(company_id));

-- ─── Helpers de ciclo ────────────────────────────────────────────────────────

create or replace function public.manual_tipo_por_sequencia(p_seq integer)
returns text
language sql
immutable
as $$
  select case
    when p_seq <= 1 then 'verificacao_30'
    when ((p_seq - 2) % 3) = 0 then 'periodica'
    when ((p_seq - 2) % 3) = 1 then 'intermediaria'
    else 'geral'
  end;
$$;

create or replace function public.manual_label_tipo(p_tipo text)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'verificacao_30' then 'Verificação de 30 dias'
    when 'periodica' then 'Revisão Periódica'
    when 'intermediaria' then 'Revisão Intermediária'
    when 'geral' then 'Revisão Geral'
    else coalesce(p_tipo, 'Revisão')
  end;
$$;

create or replace function public.manual_titulo_slot(p_seq integer, p_tipo text)
returns text
language sql
immutable
as $$
  select p_seq::text || 'ª ' || public.manual_label_tipo(p_tipo);
$$;

create or replace function public.manual_tipo_revisao_de_texto(p_texto text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(p_texto, '')));
  if v = '' then
    return null;
  end if;

  -- Remove acentos comuns para matching robusto
  v := translate(v, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                    'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc');

  if v ~ 'verifica' and v ~ '30' then
    return 'verificacao_30';
  end if;
  if v ~ 'intermedi' then
    return 'intermediaria';
  end if;
  if v ~ 'periodica' then
    return 'periodica';
  end if;
  if v ~ 'revis' and v ~ 'geral' then
    return 'geral';
  end if;

  return null;
end;
$$;

create or replace function public.manual_gerar_token()
returns text
language sql
volatile
as $$
  -- Dois UUIDs concatenados (sem hífen) = 64 hex — sem depender de pgcrypto.
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- Garante token + slots iniciais (1..7). Estende sob demanda.
create or replace function public.manual_garantir_quadro_bike(p_bicicleta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bike public.bicicletas%rowtype;
  v_max integer;
  v_i integer;
  v_tipo text;
begin
  select * into v_bike from public.bicicletas where id = p_bicicleta_id for update;
  if not found then
    return;
  end if;

  if v_bike.token_manual is null or length(trim(v_bike.token_manual)) < 16 then
    update public.bicicletas
    set token_manual = public.manual_gerar_token(),
        updated_at = timezone('utc', now())
    where id = v_bike.id;
  end if;

  select coalesce(max(sequencia), 0) into v_max
  from public.bike_manual_revisoes
  where bicicleta_id = v_bike.id;

  if v_max < 7 then
    for v_i in (v_max + 1)..7 loop
      v_tipo := public.manual_tipo_por_sequencia(v_i);
      insert into public.bike_manual_revisoes (
        company_id, bicicleta_id, sequencia, tipo, titulo, status
      ) values (
        v_bike.company_id,
        v_bike.id,
        v_i,
        v_tipo,
        public.manual_titulo_slot(v_i, v_tipo),
        'pendente'
      )
      on conflict (bicicleta_id, sequencia) do nothing;
    end loop;
  end if;
end;
$$;

create or replace function public.manual_garantir_slot_tipo(
  p_bicicleta_id uuid,
  p_tipo text
)
returns public.bike_manual_revisoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.bike_manual_revisoes%rowtype;
  v_company uuid;
  v_max integer;
  v_next integer;
  v_tipo text;
  v_guard integer := 0;
begin
  perform public.manual_garantir_quadro_bike(p_bicicleta_id);

  select * into v_slot
  from public.bike_manual_revisoes
  where bicicleta_id = p_bicicleta_id
    and tipo = p_tipo
    and status = 'pendente'
  order by sequencia
  limit 1;

  if found then
    return v_slot;
  end if;

  select company_id into v_company from public.bicicletas where id = p_bicicleta_id;
  select coalesce(max(sequencia), 0) into v_max
  from public.bike_manual_revisoes
  where bicicleta_id = p_bicicleta_id;

  -- Estende o ciclo até aparecer um slot do tipo pedido
  loop
    v_guard := v_guard + 1;
    if v_guard > 12 then
      raise exception 'Não foi possível gerar slot de revisão (%) para a bike.', p_tipo;
    end if;

    v_next := v_max + 1;
    v_tipo := public.manual_tipo_por_sequencia(v_next);

    insert into public.bike_manual_revisoes (
      company_id, bicicleta_id, sequencia, tipo, titulo, status
    ) values (
      v_company,
      p_bicicleta_id,
      v_next,
      v_tipo,
      public.manual_titulo_slot(v_next, v_tipo),
      'pendente'
    )
    on conflict (bicicleta_id, sequencia) do nothing;

    v_max := v_next;

    if v_tipo = p_tipo then
      select * into v_slot
      from public.bike_manual_revisoes
      where bicicleta_id = p_bicicleta_id
        and sequencia = v_next;
      return v_slot;
    end if;
  end loop;
end;
$$;

-- Aplica carimbos a partir de uma OS entregue
create or replace function public.manual_aplicar_selos_os(p_os_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os public.ordens_servico%rowtype;
  v_loja text;
  v_item record;
  v_tipo text;
  v_slot public.bike_manual_revisoes%rowtype;
  v_count integer := 0;
  v_cliente_id uuid;
  v_titulo text;
begin
  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    return 0;
  end if;

  if v_os.status <> 'entregue' or v_os.bicicleta_id is null then
    return 0;
  end if;

  select s.name into v_loja from public.stores s where s.id = v_os.store_id;
  perform public.manual_garantir_quadro_bike(v_os.bicicleta_id);

  for v_item in
    select oi.id, oi.descricao, oi.servico_catalogo_id, cs.nome as catalogo_nome
    from public.os_itens oi
    left join public.catalogo_servicos cs on cs.id = oi.servico_catalogo_id
    where oi.os_id = v_os.id
      and oi.tipo = 'servico'
  loop
    v_tipo := public.manual_tipo_revisao_de_texto(coalesce(v_item.catalogo_nome, v_item.descricao));
    if v_tipo is null then
      continue;
    end if;

    -- Evita carimbo duplicado da mesma OS + tipo
    if exists (
      select 1
      from public.bike_manual_revisoes r
      where r.os_id = v_os.id
        and r.tipo = v_tipo
        and r.status = 'realizada'
    ) then
      continue;
    end if;

    v_slot := public.manual_garantir_slot_tipo(v_os.bicicleta_id, v_tipo);

    update public.bike_manual_revisoes
    set status = 'realizada',
        realizada_em = coalesce(v_os.closed_at, timezone('utc', now())),
        store_id = v_os.store_id,
        loja_nome = v_loja,
        os_id = v_os.id,
        os_numero = v_os.numero
    where id = v_slot.id
      and status = 'pendente';

    if found then
      v_count := v_count + 1;
      v_titulo := v_slot.titulo;

      select cliente_id into v_cliente_id from public.bicicletas where id = v_os.bicicleta_id;
      if v_cliente_id is not null then
        insert into public.atividades (
          company_id, cliente_id, bicicleta_id, tipo, descricao, data_registro
        ) values (
          v_os.company_id,
          v_cliente_id,
          v_os.bicicleta_id,
          'revisao',
          'Manual: ' || v_titulo || ' carimbada (OS #' || v_os.numero::text || ')',
          (timezone('America/Sao_Paulo', now()))::date
        );
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Trigger: ao entregar OS, carimba o manual
create or replace function public.trg_os_entregue_manual_selos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'entregue'
     and (tg_op = 'INSERT' or old.status is distinct from 'entregue')
     and new.bicicleta_id is not null then
    perform public.manual_aplicar_selos_os(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_os_entregue_manual_selos on public.ordens_servico;
create trigger trg_os_entregue_manual_selos
after insert or update of status, bicicleta_id on public.ordens_servico
for each row
execute function public.trg_os_entregue_manual_selos();

-- Trigger: ao criar bike, gera token + quadro
create or replace function public.trg_bicicleta_manual_init()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.token_manual is null or length(trim(new.token_manual)) < 16 then
    new.token_manual := public.manual_gerar_token();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bicicleta_manual_token on public.bicicletas;
create trigger trg_bicicleta_manual_token
before insert on public.bicicletas
for each row
execute function public.trg_bicicleta_manual_init();

create or replace function public.trg_bicicleta_manual_seed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.manual_garantir_quadro_bike(new.id);
  return new;
end;
$$;

drop trigger if exists trg_bicicleta_manual_seed on public.bicicletas;
create trigger trg_bicicleta_manual_seed
after insert on public.bicicletas
for each row
execute function public.trg_bicicleta_manual_seed();

-- Backfill bikes existentes
do $$
declare
  r record;
begin
  for r in select id from public.bicicletas loop
    perform public.manual_garantir_quadro_bike(r.id);
  end loop;
end;
$$;

-- Backfill: OS já entregues com revisão (idempotente)
do $$
declare
  r record;
begin
  for r in
    select distinct os.id
    from public.ordens_servico os
    join public.os_itens oi on oi.os_id = os.id and oi.tipo = 'servico'
    left join public.catalogo_servicos cs on cs.id = oi.servico_catalogo_id
    where os.status = 'entregue'
      and os.bicicleta_id is not null
      and public.manual_tipo_revisao_de_texto(coalesce(cs.nome, oi.descricao)) is not null
  loop
    perform public.manual_aplicar_selos_os(r.id);
  end loop;
end;
$$;

-- ─── RPC pública (anon) ──────────────────────────────────────────────────────

create or replace function public.manual_proprietario_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bike public.bicicletas%rowtype;
  v_cliente_nome text;
  v_primeiro text;
  v_empresa text;
  v_logo text;
  v_loja text;
  v_revisoes jsonb;
  v_proxima jsonb;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_bike
  from public.bicicletas
  where token_manual = trim(p_token);

  if not found then
    return null;
  end if;

  perform public.manual_garantir_quadro_bike(v_bike.id);

  select c.nome, s.name
  into v_cliente_nome, v_loja
  from public.clientes c
  left join public.stores s on s.id = c.store_id
  where c.id = v_bike.cliente_id;

  select co.name, co.logo_url
  into v_empresa, v_logo
  from public.companies co
  where co.id = v_bike.company_id;

  v_primeiro := split_part(trim(coalesce(v_cliente_nome, '')), ' ', 1);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sequencia', r.sequencia,
      'tipo', r.tipo,
      'titulo', r.titulo,
      'status', r.status,
      'realizada_em', r.realizada_em,
      'loja_nome', r.loja_nome,
      'os_numero', r.os_numero
    ) order by r.sequencia
  ), '[]'::jsonb)
  into v_revisoes
  from public.bike_manual_revisoes r
  where r.bicicleta_id = v_bike.id;

  select jsonb_build_object(
    'sequencia', r.sequencia,
    'tipo', r.tipo,
    'titulo', r.titulo
  )
  into v_proxima
  from public.bike_manual_revisoes r
  where r.bicicleta_id = v_bike.id
    and r.status = 'pendente'
  order by r.sequencia
  limit 1;

  return jsonb_build_object(
    'bike', jsonb_build_object(
      'marca', v_bike.marca,
      'modelo', v_bike.modelo,
      'aro', v_bike.aro,
      'cor', v_bike.cor,
      'numero_serie', v_bike.numero_serie,
      'foto_url', v_bike.foto_url,
      'quilometragem', v_bike.quilometragem
    ),
    'cliente_primeiro_nome', nullif(v_primeiro, ''),
    'empresa_nome', v_empresa,
    'empresa_logo_url', v_logo,
    'loja_nome', coalesce(v_loja, v_empresa),
    'revisoes', v_revisoes,
    'proxima', v_proxima
  );
end;
$$;

grant execute on function public.manual_proprietario_por_token(text) to anon, authenticated;
grant execute on function public.manual_aplicar_selos_os(uuid) to authenticated;
grant execute on function public.manual_garantir_quadro_bike(uuid) to authenticated;
