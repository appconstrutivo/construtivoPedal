-- RPC para auto-recuperar tenant do usuário logado.
-- Execute após:
-- 001_create_user_profiles.sql
-- 002_create_company_memberships.sql
-- 003_onboarding_auto_company_membership.sql

create or replace function public.ensure_current_user_tenant()
returns table(company_id uuid, company_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_full_name text;
  v_company_name text;
  v_company_slug text;
  v_company_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário autenticado não encontrado.';
  end if;

  select
    u.email,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'nome'), ''),
      split_part(u.email, '@', 1)
    ),
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'company_name'), ''),
      'Bicicletaria'
    )
  into
    v_email,
    v_full_name,
    v_company_name
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'Usuário sem e-mail no Auth.';
  end if;

  insert into public.user_profiles (id, email, full_name, is_active)
  values (v_user_id, v_email, v_full_name, true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
        is_active = true,
        updated_at = timezone('utc', now());

  select up.company_id
    into v_company_id
  from public.user_profiles up
  where up.id = v_user_id;

  if v_company_id is null then
    select cm.company_id
      into v_company_id
    from public.company_memberships cm
    where cm.user_id = v_user_id
      and cm.is_active = true
    order by cm.created_at asc
    limit 1;
  end if;

  if v_company_id is null then
    v_company_slug := coalesce(
      nullif(regexp_replace(lower(v_company_name), '[^a-z0-9]+', '-', 'g'), ''),
      'bicicletaria'
    ) || '-' || substr(replace(v_user_id::text, '-', ''), 1, 8);

    insert into public.companies (name, slug, plan, active)
    values (
      coalesce(nullif(v_company_name, ''), 'Bicicletaria ' || v_full_name),
      v_company_slug,
      'starter',
      true
    )
    returning id into v_company_id;
  end if;

  update public.user_profiles
     set company_id = v_company_id,
         role = coalesce(role, 'owner'),
         is_active = true,
         updated_at = timezone('utc', now())
   where id = v_user_id;

  insert into public.company_memberships (company_id, user_id, role, is_active)
  values (v_company_id, v_user_id, 'owner', true)
  on conflict (company_id, user_id) do update
    set role = excluded.role,
        is_active = excluded.is_active,
        updated_at = timezone('utc', now());

  return query
  select c.id, c.name, 'owner'::text
  from public.companies c
  where c.id = v_company_id;
end;
$$;

grant execute on function public.ensure_current_user_tenant() to authenticated;

