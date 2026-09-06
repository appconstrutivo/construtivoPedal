-- Agenda operacional da loja: eventos com período, marcação no calendário
-- e notificação no dia (badge, igual financeiro/orçamentos).

create or replace function public.set_calendario_eventos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  titulo text not null,
  observacoes text,
  tipo text not null default 'compromisso',
  data_inicio date not null,
  data_fim date not null,
  hora_inicio time,
  cliente_id uuid references public.clientes (id) on delete set null,
  status text not null default 'agendado',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint calendario_eventos_titulo_not_blank
    check (length(trim(titulo)) > 0),
  constraint calendario_eventos_periodo_check
    check (data_fim >= data_inicio),
  constraint calendario_eventos_tipo_check
    check (tipo in ('entrega', 'revisao', 'compromisso', 'fornecedor', 'interno', 'outro')),
  constraint calendario_eventos_status_check
    check (status in ('agendado', 'concluido', 'cancelado'))
);

create index if not exists idx_calendario_eventos_loja_periodo
  on public.calendario_eventos (company_id, store_id, data_inicio, data_fim)
  where status <> 'cancelado';

create index if not exists idx_calendario_eventos_hoje
  on public.calendario_eventos (company_id, store_id, status, data_inicio, data_fim);

drop trigger if exists trg_calendario_eventos_updated_at on public.calendario_eventos;
create trigger trg_calendario_eventos_updated_at
before update on public.calendario_eventos
for each row
execute function public.set_calendario_eventos_updated_at();

alter table public.calendario_eventos enable row level security;

drop policy if exists calendario_eventos_select_member on public.calendario_eventos;
create policy calendario_eventos_select_member
  on public.calendario_eventos for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists calendario_eventos_insert_member on public.calendario_eventos;
create policy calendario_eventos_insert_member
  on public.calendario_eventos for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists calendario_eventos_update_member on public.calendario_eventos;
create policy calendario_eventos_update_member
  on public.calendario_eventos for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists calendario_eventos_delete_member on public.calendario_eventos;
create policy calendario_eventos_delete_member
  on public.calendario_eventos for delete to authenticated
  using (public.is_member_of_company(company_id));

comment on table public.calendario_eventos is
  'Agenda da loja: entregas, revisões e compromissos. Notifica no dia em que o período começa a valer.';
