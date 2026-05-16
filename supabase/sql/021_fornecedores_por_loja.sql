-- Fornecedores vinculados à loja (multi-loja).
-- Execute após 010 e 016.

alter table public.fornecedores
  add column if not exists store_id uuid references public.stores (id) on delete restrict;

update public.fornecedores f
set store_id = coalesce(
  (
    select s.id
    from public.stores s
    where s.company_id = f.company_id
      and s.active = true
      and lower(trim(s.name)) = 'matriz'
    limit 1
  ),
  (
    select s.id
    from public.stores s
    where s.company_id = f.company_id
      and s.active = true
    order by s.name
    limit 1
  )
)
where f.store_id is null;

alter table public.fornecedores drop constraint if exists fornecedores_nome_unique_per_company;

drop index if exists public.idx_fornecedores_company_store_nome;
create unique index idx_fornecedores_company_store_nome
  on public.fornecedores (company_id, store_id, nome);

create index if not exists idx_fornecedores_company_store
  on public.fornecedores (company_id, store_id);

-- Item e fornecedor devem ser da mesma empresa e, quando informados, da mesma loja.
create or replace function public.validate_item_fornecedor_company()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
  v_store_id uuid;
begin
  if new.fornecedor_id is null then
    return new;
  end if;

  select f.company_id, f.store_id
    into v_company_id, v_store_id
  from public.fornecedores f
  where f.id = new.fornecedor_id;

  if not found then
    raise exception 'Fornecedor não encontrado.';
  end if;

  if v_company_id <> new.company_id then
    raise exception 'Fornecedor não pertence à mesma empresa do item.';
  end if;

  if new.store_id is not null and v_store_id is not null and new.store_id <> v_store_id then
    raise exception 'Fornecedor não pertence à mesma loja do item.';
  end if;

  return new;
end;
$$;
