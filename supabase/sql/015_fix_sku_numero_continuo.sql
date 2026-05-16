-- PATCH: alinha a função com o SKU só numérico (000001…), igual ao 014 atual.
-- Use se você já tinha rodado uma versão antiga do 014/015 com letras no SKU.

drop function if exists public._sku_sufixo_alfabetico(bigint);

create or replace function public.proximo_sku_estoque_item(
  p_company_id uuid,
  p_store_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key uuid;
  v_seq bigint;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para gerar SKU nesta empresa.';
  end if;

  v_key := coalesce(p_store_id, '00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.estoque_item_sku_seq (company_id, store_key, seq)
  values (p_company_id, v_key, 1)
  on conflict (company_id, store_key)
  do update set seq = public.estoque_item_sku_seq.seq + 1
  returning seq into v_seq;

  return lpad(
    v_seq::text,
    greatest(6, length(v_seq::text)),
    '0'
  );
end;
$$;
