-- Onboarding automático no cadastro:
-- cria empresa, membership owner e vínculo no user_profile.
-- Execute após:
-- 001_create_user_profiles.sql
-- 002_create_company_memberships.sql

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_company_name text;
  v_company_slug text;
  v_company_id uuid;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    split_part(new.email, '@', 1)
  );

  v_company_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    'Bicicletaria ' || v_full_name
  );

  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    v_full_name
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
        updated_at = timezone('utc', now());

  select company_id
    into v_company_id
  from public.user_profiles
  where id = new.id;

  if v_company_id is null then
    v_company_slug := coalesce(
      nullif(regexp_replace(lower(v_company_name), '[^a-z0-9]+', '-', 'g'), ''),
      'bicicletaria'
    ) || '-' || substr(replace(new.id::text, '-', ''), 1, 8);

    insert into public.companies (name, slug, plan, active)
    values (v_company_name, v_company_slug, 'starter', true)
    returning id into v_company_id;

    insert into public.company_memberships (company_id, user_id, role, is_active)
    values (v_company_id, new.id, 'owner', true)
    on conflict (company_id, user_id) do update
      set role = excluded.role,
          is_active = excluded.is_active,
          updated_at = timezone('utc', now());

    update public.user_profiles
       set company_id = v_company_id,
           role = 'owner',
           is_active = true,
           updated_at = timezone('utc', now())
     where id = new.id;
  else
    insert into public.company_memberships (company_id, user_id, role, is_active)
    values (v_company_id, new.id, 'owner', true)
    on conflict (company_id, user_id) do update
      set role = excluded.role,
          is_active = excluded.is_active,
          updated_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

