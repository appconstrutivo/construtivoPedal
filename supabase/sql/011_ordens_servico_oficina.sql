-- Módulo Oficina: ordens de serviço (OS), checklist, itens (peça/serviço), anexos e bucket de fotos.
-- Execute após o script 010.
-- Ordem: tabelas referenciadas nas funções SQL precisam existir antes do CREATE FUNCTION.

create extension if not exists "pgcrypto";

create or replace function public.set_ordens_servico_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.validate_os_bicicleta_cliente()
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

create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  numero integer not null,
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  bicicleta_id uuid references public.bicicletas (id) on delete set null,
  status text not null default 'aberta',
  problema_relatado text not null default '',
  diagnostico text,
  observacoes_internas text,
  opened_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  constraint ordens_servico_numero_unique_per_company unique (company_id, numero),
  constraint ordens_servico_status_check
    check (status in (
      'aberta',
      'em_andamento',
      'aguardando_aprovacao',
      'pronta',
      'entregue',
      'cancelada'
    ))
);

create index if not exists idx_ordens_servico_company_status
  on public.ordens_servico (company_id, status);

create index if not exists idx_ordens_servico_company_updated
  on public.ordens_servico (company_id, updated_at desc);

create or replace function public.proximo_numero_os(p_company_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(max(numero), 0) + 1
  from public.ordens_servico
  where company_id = p_company_id;
$$;

create or replace function public.trg_ordens_servico_assign_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or new.numero <= 0 then
    new.numero := public.proximo_numero_os(new.company_id);
  end if;
  return new;
end;
$$;

create or replace function public.validate_os_item_company()
returns trigger
language plpgsql
as $$
declare
  v_os_company uuid;
  v_item_company uuid;
begin
  select company_id into v_os_company from public.ordens_servico where id = new.os_id;
  if v_os_company is null then
    raise exception 'Ordem de serviço inválida.';
  end if;
  if new.company_id is distinct from v_os_company then
    raise exception 'company_id do item diverge da OS.';
  end if;

  if new.estoque_item_id is not null then
    select company_id into v_item_company from public.estoque_itens where id = new.estoque_item_id;
    if v_item_company is distinct from v_os_company then
      raise exception 'Item de estoque não pertence à mesma empresa da OS.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_os_anexo_company()
returns trigger
language plpgsql
as $$
declare
  v_os_company uuid;
begin
  select company_id into v_os_company from public.ordens_servico where id = new.os_id;
  if v_os_company is null then
    raise exception 'Ordem de serviço inválida.';
  end if;
  if new.company_id is distinct from v_os_company then
    raise exception 'company_id do anexo diverge da OS.';
  end if;
  return new;
end;
$$;

create or replace function public.validate_os_checklist_company()
returns trigger
language plpgsql
as $$
declare
  v_os_company uuid;
begin
  select company_id into v_os_company from public.ordens_servico where id = new.os_id;
  if v_os_company is null then
    raise exception 'Ordem de serviço inválida.';
  end if;
  if new.company_id is distinct from v_os_company then
    raise exception 'company_id do checklist diverge da OS.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordens_servico_numero on public.ordens_servico;
create trigger trg_ordens_servico_numero
before insert on public.ordens_servico
for each row
execute function public.trg_ordens_servico_assign_numero();

drop trigger if exists trg_ordens_servico_updated_at on public.ordens_servico;
create trigger trg_ordens_servico_updated_at
before update on public.ordens_servico
for each row
execute function public.set_ordens_servico_updated_at();

drop trigger if exists trg_ordens_servico_bike on public.ordens_servico;
create trigger trg_ordens_servico_bike
before insert or update of cliente_id, bicicleta_id, company_id on public.ordens_servico
for each row
execute function public.validate_os_bicicleta_cliente();

create table if not exists public.os_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  os_id uuid not null references public.ordens_servico (id) on delete cascade,
  rotulo text not null,
  concluido boolean not null default false,
  ordem smallint not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_os_checklist_os on public.os_checklist_itens (os_id, ordem);

drop trigger if exists trg_os_checklist_company on public.os_checklist_itens;
create trigger trg_os_checklist_company
before insert or update of company_id, os_id on public.os_checklist_itens
for each row
execute function public.validate_os_checklist_company();

create table if not exists public.os_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  os_id uuid not null references public.ordens_servico (id) on delete cascade,
  tipo text not null,
  estoque_item_id uuid references public.estoque_itens (id) on delete set null,
  descricao text not null,
  quantidade numeric(12,3) not null default 1,
  preco_unitario numeric(12,2) not null default 0,
  movimentacao_id uuid references public.estoque_movimentacoes (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint os_itens_tipo_check
    check (tipo in ('peca', 'servico')),
  constraint os_itens_qtd_positive
    check (quantidade > 0),
  constraint os_itens_preco_non_negative
    check (preco_unitario >= 0)
);

create index if not exists idx_os_itens_os on public.os_itens (os_id);

drop trigger if exists trg_os_itens_company on public.os_itens;
create trigger trg_os_itens_company
before insert or update of company_id, os_id, estoque_item_id on public.os_itens
for each row
execute function public.validate_os_item_company();

create table if not exists public.os_anexos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  os_id uuid not null references public.ordens_servico (id) on delete cascade,
  caminho_storage text not null,
  nome_arquivo text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_os_anexos_os on public.os_anexos (os_id);

drop trigger if exists trg_os_anexos_company on public.os_anexos;
create trigger trg_os_anexos_company
before insert or update of company_id, os_id on public.os_anexos
for each row
execute function public.validate_os_anexo_company();

-- Baixa atômica no estoque vinculada ao item da OS.
create or replace function public.os_baixar_item_estoque(p_os_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.os_itens%rowtype;
  v_os public.ordens_servico%rowtype;
  v_mov_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_row from public.os_itens where id = p_os_item_id for update;
  if not found then
    raise exception 'Item da OS não encontrado.';
  end if;

  if v_row.tipo <> 'peca' or v_row.estoque_item_id is null then
    raise exception 'Somente peças vinculadas ao estoque podem receber baixa.';
  end if;

  if v_row.movimentacao_id is not null then
    raise exception 'Baixa já registrada para este item.';
  end if;

  select * into v_os from public.ordens_servico where id = v_row.os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if not public.is_member_of_company(v_os.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if v_os.status = 'cancelada' then
    raise exception 'Não é possível baixar peças em OS cancelada.';
  end if;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    store_id,
    tipo,
    quantidade,
    origem,
    observacao,
    created_by
  )
  values (
    v_os.company_id,
    v_row.estoque_item_id,
    v_os.store_id,
    'saida',
    abs(v_row.quantidade),
    'oficina_os',
    format('OS #%s — item %s', v_os.numero, v_row.id),
    v_user
  )
  returning id into v_mov_id;

  update public.os_itens
    set movimentacao_id = v_mov_id
  where id = v_row.id;

  return v_mov_id;
end;
$$;

grant execute on function public.os_baixar_item_estoque(uuid) to authenticated;

alter table public.ordens_servico enable row level security;
alter table public.os_checklist_itens enable row level security;
alter table public.os_itens enable row level security;
alter table public.os_anexos enable row level security;

drop policy if exists "ordens_servico_select_member" on public.ordens_servico;
create policy "ordens_servico_select_member"
  on public.ordens_servico
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "ordens_servico_insert_member" on public.ordens_servico;
create policy "ordens_servico_insert_member"
  on public.ordens_servico
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "ordens_servico_update_member" on public.ordens_servico;
create policy "ordens_servico_update_member"
  on public.ordens_servico
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "ordens_servico_delete_member" on public.ordens_servico;
create policy "ordens_servico_delete_member"
  on public.ordens_servico
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "os_checklist_select_member" on public.os_checklist_itens;
create policy "os_checklist_select_member"
  on public.os_checklist_itens
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "os_checklist_insert_member" on public.os_checklist_itens;
create policy "os_checklist_insert_member"
  on public.os_checklist_itens
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "os_checklist_update_member" on public.os_checklist_itens;
create policy "os_checklist_update_member"
  on public.os_checklist_itens
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "os_checklist_delete_member" on public.os_checklist_itens;
create policy "os_checklist_delete_member"
  on public.os_checklist_itens
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "os_itens_select_member" on public.os_itens;
create policy "os_itens_select_member"
  on public.os_itens
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "os_itens_insert_member" on public.os_itens;
create policy "os_itens_insert_member"
  on public.os_itens
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "os_itens_update_member" on public.os_itens;
create policy "os_itens_update_member"
  on public.os_itens
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "os_itens_delete_member" on public.os_itens;
create policy "os_itens_delete_member"
  on public.os_itens
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "os_anexos_select_member" on public.os_anexos;
create policy "os_anexos_select_member"
  on public.os_anexos
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "os_anexos_insert_member" on public.os_anexos;
create policy "os_anexos_insert_member"
  on public.os_anexos
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "os_anexos_delete_member" on public.os_anexos;
create policy "os_anexos_delete_member"
  on public.os_anexos
  for delete
  to authenticated
  using (public.is_member_of_company(company_id));

-- Bucket privado para fotos: caminho sugerido {company_id}/{os_id}/{arquivo}
insert into storage.buckets (id, name, public)
values ('os-fotos', 'os-fotos', false)
on conflict (id) do nothing;

drop policy if exists "os_fotos_select_members" on storage.objects;
create policy "os_fotos_select_members"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'os-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "os_fotos_insert_members" on storage.objects;
create policy "os_fotos_insert_members"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'os-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "os_fotos_update_members" on storage.objects;
create policy "os_fotos_update_members"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'os-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'os-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "os_fotos_delete_members" on storage.objects;
create policy "os_fotos_delete_members"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'os-fotos'
    and public.is_member_of_company((storage.foldername(name))[1]::uuid)
  );
