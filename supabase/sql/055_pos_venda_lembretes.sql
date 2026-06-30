-- Lembretes pós-venda configuráveis (ex.: contato X dias após venda de bike).
-- Execute após 054.

create extension if not exists "pgcrypto";

-- ─── Regras (configuração por loja) ─────────────────────────────────────────

create or replace function public.set_pos_venda_regras_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.pos_venda_regras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  categoria_produto text not null default 'bike',
  dias_apos_venda integer not null,
  titulo text not null,
  descricao text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pos_venda_regras_categoria_check
    check (categoria_produto in ('peca', 'bike', 'acessorio')),
  constraint pos_venda_regras_dias_positive
    check (dias_apos_venda > 0),
  constraint pos_venda_regras_titulo_not_blank
    check (length(trim(titulo)) > 0)
);

create index if not exists idx_pos_venda_regras_store_ativo
  on public.pos_venda_regras (company_id, store_id, categoria_produto, ativo, ordem);

drop trigger if exists trg_pos_venda_regras_updated_at on public.pos_venda_regras;
create trigger trg_pos_venda_regras_updated_at
before update on public.pos_venda_regras
for each row
execute function public.set_pos_venda_regras_updated_at();

-- ─── Instâncias (geradas na venda) ──────────────────────────────────────────

create or replace function public.set_pos_venda_lembretes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.pos_venda_lembretes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  regra_id uuid references public.pos_venda_regras (id) on delete set null,
  venda_id uuid not null references public.vendas (id) on delete cascade,
  venda_item_id uuid references public.venda_itens (id) on delete set null,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  produto_descricao text not null,
  titulo text not null,
  data_venda date not null,
  data_prevista date not null,
  status text not null default 'pendente',
  concluido_em timestamptz,
  concluido_por uuid references auth.users (id) on delete set null,
  observacao text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pos_venda_lembretes_status_check
    check (status in ('pendente', 'concluido', 'dispensado', 'cancelado')),
  constraint pos_venda_lembretes_produto_not_blank
    check (length(trim(produto_descricao)) > 0),
  constraint pos_venda_lembretes_titulo_not_blank
    check (length(trim(titulo)) > 0)
);

create index if not exists idx_pos_venda_lembretes_pendentes
  on public.pos_venda_lembretes (company_id, store_id, data_prevista)
  where status = 'pendente';

create index if not exists idx_pos_venda_lembretes_cliente
  on public.pos_venda_lembretes (cliente_id, status, data_prevista);

drop trigger if exists trg_pos_venda_lembretes_updated_at on public.pos_venda_lembretes;
create trigger trg_pos_venda_lembretes_updated_at
before update on public.pos_venda_lembretes
for each row
execute function public.set_pos_venda_lembretes_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.pos_venda_regras enable row level security;
alter table public.pos_venda_lembretes enable row level security;

drop policy if exists pos_venda_regras_select on public.pos_venda_regras;
create policy pos_venda_regras_select
  on public.pos_venda_regras for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists pos_venda_regras_insert on public.pos_venda_regras;
create policy pos_venda_regras_insert
  on public.pos_venda_regras for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists pos_venda_regras_update on public.pos_venda_regras;
create policy pos_venda_regras_update
  on public.pos_venda_regras for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists pos_venda_regras_delete on public.pos_venda_regras;
create policy pos_venda_regras_delete
  on public.pos_venda_regras for delete to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists pos_venda_lembretes_select on public.pos_venda_lembretes;
create policy pos_venda_lembretes_select
  on public.pos_venda_lembretes for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists pos_venda_lembretes_update on public.pos_venda_lembretes;
create policy pos_venda_lembretes_update
  on public.pos_venda_lembretes for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- ─── Gerar lembretes após venda (cliente + produto vendido) ───────────────────

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

grant execute on function public.pos_venda_gerar_lembretes(uuid) to authenticated;

-- ─── Contador para badges ───────────────────────────────────────────────────

create or replace function public.contar_pos_venda_lembretes_pendentes(
  p_company_id uuid,
  p_store_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.pos_venda_lembretes l
   where l.company_id = p_company_id
     and l.store_id = p_store_id
     and l.status = 'pendente'
     and l.data_prevista <= current_date
     and public.is_member_of_company(p_company_id);
$$;

grant execute on function public.contar_pos_venda_lembretes_pendentes(uuid, uuid) to authenticated;

create unique index if not exists idx_pos_venda_lembretes_unique_item_regra
  on public.pos_venda_lembretes (venda_item_id, regra_id)
  where venda_item_id is not null and regra_id is not null and status <> 'cancelado';

-- ─── Triggers: gerar/cancelar lembretes sem alterar pdv_finalizar_venda ─────

create or replace function public.trg_vendas_pos_venda_lembretes_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finalizada' and new.cliente_id is not null then
    perform public.pos_venda_gerar_lembretes(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendas_pos_venda_lembretes on public.vendas;
create constraint trigger trg_vendas_pos_venda_lembretes
after insert on public.vendas
deferrable initially deferred
for each row
execute function public.trg_vendas_pos_venda_lembretes_fn();

create or replace function public.trg_vendas_cancelar_lembretes_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelada' and old.status = 'finalizada' then
    update public.pos_venda_lembretes
       set status = 'cancelado',
           updated_at = timezone('utc', now())
     where venda_id = new.id
       and status = 'pendente';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendas_cancelar_lembretes on public.vendas;
create trigger trg_vendas_cancelar_lembretes
after update of status on public.vendas
for each row
execute function public.trg_vendas_cancelar_lembretes_fn();
