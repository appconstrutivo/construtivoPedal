-- Hardening do trigger de onboarding para não bloquear signup
-- caso exista erro interno no provisionamento multi-tenant.
-- Execute após 001, 002 e 003.

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
  begin
    if to_regclass('public.user_profiles') is null then
      return new;
    end if;

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

    if to_regclass('public.companies') is null then
      return new;
    end if;

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

      update public.user_profiles
         set company_id = v_company_id,
             role = 'owner',
             is_active = true,
             updated_at = timezone('utc', now())
       where id = new.id;
    end if;

    if to_regclass('public.company_memberships') is not null then
      insert into public.company_memberships (company_id, user_id, role, is_active)
      values (v_company_id, new.id, 'owner', true)
      on conflict (company_id, user_id) do update
        set role = excluded.role,
            is_active = excluded.is_active,
            updated_at = timezone('utc', now());
    end if;
  exception
    when others then
      -- Não quebrar o fluxo de signup do Auth por erro de onboarding.
      raise warning 'handle_new_auth_user falhou para user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

