-- Camada de membro por empresa (tenant).
-- Execute após o script 001_create_user_profiles.sql.

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'manager',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_memberships_role_check
    check (role in ('owner', 'admin', 'manager', 'mechanic', 'sales', 'cashier')),
  constraint company_memberships_unique_user_company unique (company_id, user_id)
);

create index if not exists idx_company_memberships_user_id
  on public.company_memberships (user_id);

create index if not exists idx_company_memberships_company_id
  on public.company_memberships (company_id);

alter table public.company_memberships enable row level security;

drop policy if exists "company_memberships_select_own" on public.company_memberships;
create policy "company_memberships_select_own"
  on public.company_memberships
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_company_memberships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_company_memberships_updated_at on public.company_memberships;
create trigger trg_company_memberships_updated_at
before update on public.company_memberships
for each row
execute function public.set_company_memberships_updated_at();

-- Backfill opcional para bases que já possuem company_id e role em user_profiles.
insert into public.company_memberships (company_id, user_id, role, is_active)
select
  up.company_id,
  up.id,
  up.role,
  up.is_active
from public.user_profiles up
where up.company_id is not null
on conflict (company_id, user_id) do update
set role = excluded.role,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());
