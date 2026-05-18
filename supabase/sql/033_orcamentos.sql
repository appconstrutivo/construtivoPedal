-- Orçamentos de balcão: peças (estoque) + serviços (catálogo), reserva de estoque e conversão OS/PDV.
-- Execute após 032_financeiro_recorrencia.sql

create extension if not exists "pgcrypto";

-- ─── Orçamentos ─────────────────────────────────────────────────────────────

create or replace function public.set_orcamentos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  numero integer not null,
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  bicicleta_id uuid references public.bicicletas (id) on delete set null,
  status text not null default 'rascunho',
  resumo text not null default '',
  observacoes text,
  desconto numeric(12, 2) not null default 0,
  valido_ate date,
  token_aprovacao text unique,
  convertido_os_id uuid references public.ordens_servico (id) on delete set null,
  convertido_venda_id uuid references public.vendas (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint orcamentos_numero_unique_per_company unique (company_id, numero),
  constraint orcamentos_status_check
    check (status in ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado', 'convertido')),
  constraint orcamentos_desconto_non_negative check (desconto >= 0)
);

create index if not exists idx_orcamentos_company_store_status
  on public.orcamentos (company_id, store_id, status);

create index if not exists idx_orcamentos_company_updated
  on public.orcamentos (company_id, updated_at desc);

create index if not exists idx_orcamentos_cliente
  on public.orcamentos (cliente_id, created_at desc);

create or replace function public.proximo_numero_orcamento(p_company_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(max(numero), 0) + 1
  from public.orcamentos
  where company_id = p_company_id;
$$;

create or replace function public.trg_orcamentos_assign_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or new.numero <= 0 then
    new.numero := public.proximo_numero_orcamento(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orcamentos_numero on public.orcamentos;
create trigger trg_orcamentos_numero
before insert on public.orcamentos
for each row
execute function public.trg_orcamentos_assign_numero();

drop trigger if exists trg_orcamentos_updated_at on public.orcamentos;
create trigger trg_orcamentos_updated_at
before update on public.orcamentos
for each row
execute function public.set_orcamentos_updated_at();

create or replace function public.validate_orcamento_bicicleta_cliente()
returns trigger
language plpgsql
as $$
begin
  if new.bicicleta_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.bicicletas b
    where b.id = new.bicicleta_id
      and b.cliente_id = new.cliente_id
      and b.company_id = new.company_id
  ) then
    raise exception 'Bicicleta não pertence ao cliente informado.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orcamentos_bike on public.orcamentos;
create trigger trg_orcamentos_bike
before insert or update of cliente_id, bicicleta_id, company_id on public.orcamentos
for each row
execute function public.validate_orcamento_bicicleta_cliente();

-- ─── Itens do orçamento ─────────────────────────────────────────────────────

create or replace function public.validate_orcamento_item_company()
returns trigger
language plpgsql
as $$
declare
  v_orc_company uuid;
  v_item_company uuid;
  v_serv_company uuid;
begin
  select company_id into v_orc_company from public.orcamentos where id = new.orcamento_id;
  if v_orc_company is null then
    raise exception 'Orçamento inválido.';
  end if;
  if new.company_id is distinct from v_orc_company then
    raise exception 'company_id do item diverge do orçamento.';
  end if;

  if new.estoque_item_id is not null then
    select company_id into v_item_company from public.estoque_itens where id = new.estoque_item_id;
    if v_item_company is distinct from v_orc_company then
      raise exception 'Item de estoque não pertence à mesma empresa.';
    end if;
  end if;

  if new.servico_catalogo_id is not null then
    select company_id into v_serv_company from public.catalogo_servicos where id = new.servico_catalogo_id;
    if v_serv_company is distinct from v_orc_company then
      raise exception 'Serviço do catálogo não pertence à mesma empresa.';
    end if;
  end if;

  if new.tipo = 'peca' and new.estoque_item_id is null then
    raise exception 'Peça exige vínculo com item de estoque.';
  end if;

  if new.tipo = 'servico' and new.servico_catalogo_id is null then
    raise exception 'Serviço exige vínculo com catálogo.';
  end if;

  return new;
end;
$$;

create table if not exists public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  tipo text not null,
  estoque_item_id uuid references public.estoque_itens (id) on delete set null,
  servico_catalogo_id uuid references public.catalogo_servicos (id) on delete set null,
  descricao text not null,
  quantidade numeric(12, 3) not null default 1,
  preco_unitario numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint orcamento_itens_tipo_check check (tipo in ('peca', 'servico')),
  constraint orcamento_itens_qtd_positive check (quantidade > 0),
  constraint orcamento_itens_preco_non_negative check (preco_unitario >= 0)
);

create index if not exists idx_orcamento_itens_orcamento on public.orcamento_itens (orcamento_id);

drop trigger if exists trg_orcamento_itens_company on public.orcamento_itens;
create trigger trg_orcamento_itens_company
before insert or update of company_id, orcamento_id, estoque_item_id, servico_catalogo_id on public.orcamento_itens
for each row
execute function public.validate_orcamento_item_company();

-- ─── Reservas de estoque (fase 3) ───────────────────────────────────────────

create table if not exists public.estoque_reservas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  orcamento_item_id uuid not null references public.orcamento_itens (id) on delete cascade,
  estoque_item_id uuid not null references public.estoque_itens (id) on delete cascade,
  quantidade numeric(12, 3) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint estoque_reservas_qtd_positive check (quantidade > 0),
  constraint estoque_reservas_item_unique unique (orcamento_item_id)
);

create index if not exists idx_estoque_reservas_item
  on public.estoque_reservas (estoque_item_id);

create index if not exists idx_estoque_reservas_orcamento
  on public.estoque_reservas (orcamento_id);

-- Saldo disponível = saldo_atual - reservas ativas (orçamento enviado/aprovado)
create or replace function public.estoque_saldo_disponivel(p_estoque_item_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(e.saldo_atual, 0) - coalesce((
    select sum(r.quantidade)
    from public.estoque_reservas r
    join public.orcamentos o on o.id = r.orcamento_id
    where r.estoque_item_id = p_estoque_item_id
      and o.status in ('enviado', 'aprovado')
  ), 0)
  from public.estoque_itens e
  where e.id = p_estoque_item_id;
$$;

create or replace function public.orcamento_liberar_reservas(p_orcamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.estoque_reservas where orcamento_id = p_orcamento_id;
end;
$$;

create or replace function public.orcamento_reservar_estoque(p_orcamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_orc public.orcamentos%rowtype;
  v_item record;
  v_disponivel numeric;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_orc from public.orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.';
  end if;

  if not public.is_member_of_company(v_orc.company_id) then
    raise exception 'Sem permissão.';
  end if;

  perform public.orcamento_liberar_reservas(p_orcamento_id);

  for v_item in
    select oi.*
    from public.orcamento_itens oi
    where oi.orcamento_id = p_orcamento_id
      and oi.tipo = 'peca'
      and oi.estoque_item_id is not null
  loop
    v_disponivel := public.estoque_saldo_disponivel(v_item.estoque_item_id);
    if v_item.quantidade > v_disponivel then
      raise exception 'Saldo insuficiente para reservar "%" (disponível: %).', v_item.descricao, v_disponivel;
    end if;

    insert into public.estoque_reservas (
      company_id, store_id, orcamento_id, orcamento_item_id, estoque_item_id, quantidade
    ) values (
      v_orc.company_id, v_orc.store_id, p_orcamento_id, v_item.id, v_item.estoque_item_id, v_item.quantidade
    );
  end loop;
end;
$$;

-- Marca orçamentos vencidos
create or replace function public.orcamento_expirar_vencidos(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with upd as (
    update public.orcamentos o
    set status = 'expirado', updated_at = timezone('utc', now())
    where o.company_id = p_company_id
      and o.status in ('enviado', 'aprovado')
      and o.valido_ate is not null
      and o.valido_ate < current_date
    returning o.id
  )
  select count(*) into v_count from upd;

  delete from public.estoque_reservas r
  using upd u
  where r.orcamento_id = u.id;

  return coalesce(v_count, 0);
end;
$$;

-- Aprovação pública por token (fase 3)
create or replace function public.orcamento_publico_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc public.orcamentos%rowtype;
  v_itens jsonb;
  v_cliente text;
  v_loja text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_orc
  from public.orcamentos
  where token_aprovacao = trim(p_token);

  if not found then
    return null;
  end if;

  if v_orc.status not in ('enviado', 'aprovado', 'recusado', 'expirado', 'convertido') then
    return jsonb_build_object('erro', 'Orçamento indisponível para aprovação.');
  end if;

  select c.nome into v_cliente from public.clientes c where c.id = v_orc.cliente_id;
  select s.name into v_loja from public.stores s where s.id = v_orc.store_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'descricao', oi.descricao,
      'quantidade', oi.quantidade,
      'preco_unitario', oi.preco_unitario,
      'tipo', oi.tipo
    ) order by oi.created_at
  ), '[]'::jsonb)
  into v_itens
  from public.orcamento_itens oi
  where oi.orcamento_id = v_orc.id;

  return jsonb_build_object(
    'numero', v_orc.numero,
    'status', v_orc.status,
    'resumo', v_orc.resumo,
    'desconto', v_orc.desconto,
    'valido_ate', v_orc.valido_ate,
    'cliente_nome', v_cliente,
    'loja_nome', v_loja,
    'itens', v_itens
  );
end;
$$;

create or replace function public.orcamento_publico_responder(
  p_token text,
  p_aprovar boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc public.orcamentos%rowtype;
  v_novo_status text;
begin
  select * into v_orc
  from public.orcamentos
  where token_aprovacao = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Orçamento não encontrado.');
  end if;

  if v_orc.status <> 'enviado' then
    return jsonb_build_object('ok', false, 'erro', 'Este orçamento já foi respondido ou não está aguardando aprovação.');
  end if;

  if v_orc.valido_ate is not null and v_orc.valido_ate < current_date then
    update public.orcamentos set status = 'expirado', updated_at = timezone('utc', now()) where id = v_orc.id;
    perform public.orcamento_liberar_reservas(v_orc.id);
    return jsonb_build_object('ok', false, 'erro', 'Orçamento expirado.');
  end if;

  v_novo_status := case when p_aprovar then 'aprovado' else 'recusado' end;

  update public.orcamentos
  set status = v_novo_status, updated_at = timezone('utc', now())
  where id = v_orc.id;

  if v_novo_status = 'recusado' then
    perform public.orcamento_liberar_reservas(v_orc.id);
  end if;

  return jsonb_build_object('ok', true, 'status', v_novo_status);
end;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.estoque_reservas enable row level security;

drop policy if exists "orcamentos_select_member" on public.orcamentos;
create policy "orcamentos_select_member"
  on public.orcamentos for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "orcamentos_insert_member" on public.orcamentos;
create policy "orcamentos_insert_member"
  on public.orcamentos for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "orcamentos_update_member" on public.orcamentos;
create policy "orcamentos_update_member"
  on public.orcamentos for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "orcamentos_delete_member" on public.orcamentos;
create policy "orcamentos_delete_member"
  on public.orcamentos for delete to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "orcamento_itens_select_member" on public.orcamento_itens;
create policy "orcamento_itens_select_member"
  on public.orcamento_itens for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "orcamento_itens_insert_member" on public.orcamento_itens;
create policy "orcamento_itens_insert_member"
  on public.orcamento_itens for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "orcamento_itens_update_member" on public.orcamento_itens;
create policy "orcamento_itens_update_member"
  on public.orcamento_itens for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "orcamento_itens_delete_member" on public.orcamento_itens;
create policy "orcamento_itens_delete_member"
  on public.orcamento_itens for delete to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_reservas_select_member" on public.estoque_reservas;
create policy "estoque_reservas_select_member"
  on public.estoque_reservas for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_reservas_insert_member" on public.estoque_reservas;
create policy "estoque_reservas_insert_member"
  on public.estoque_reservas for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_reservas_delete_member" on public.estoque_reservas;
create policy "estoque_reservas_delete_member"
  on public.estoque_reservas for delete to authenticated
  using (public.is_member_of_company(company_id));

grant execute on function public.orcamento_reservar_estoque(uuid) to authenticated;
grant execute on function public.orcamento_liberar_reservas(uuid) to authenticated;
grant execute on function public.orcamento_expirar_vencidos(uuid) to authenticated;
grant execute on function public.estoque_saldo_disponivel(uuid) to authenticated;
grant execute on function public.orcamento_publico_por_token(text) to anon, authenticated;
grant execute on function public.orcamento_publico_responder(text, boolean) to anon, authenticated;
