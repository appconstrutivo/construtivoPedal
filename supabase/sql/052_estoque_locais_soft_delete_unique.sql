-- Permite recriar local após exclusão (soft delete com ativo = false).
-- Execute após 051.

drop index if exists public.idx_estoque_locais_unique_posicao;

create unique index idx_estoque_locais_unique_posicao
  on public.estoque_locais (company_id, store_id, estante, upper(prateleira), divisoria)
  where ativo = true;

create or replace function public.validate_item_local_company()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
  v_store_id uuid;
  v_ativo boolean;
begin
  if new.local_id is null then
    return new;
  end if;

  select l.company_id, l.store_id, l.ativo
    into v_company_id, v_store_id, v_ativo
  from public.estoque_locais l
  where l.id = new.local_id;

  if not found then
    raise exception 'Local de estoque não encontrado.';
  end if;

  if not v_ativo then
    raise exception 'Local de estoque inativo.';
  end if;

  if v_company_id <> new.company_id then
    raise exception 'Local de estoque não pertence à mesma empresa do item.';
  end if;

  if new.store_id is not null and v_store_id is not null and new.store_id <> v_store_id then
    raise exception 'Local de estoque não pertence à mesma loja do item.';
  end if;

  return new;
end;
$$;
