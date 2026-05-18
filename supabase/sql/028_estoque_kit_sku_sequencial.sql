-- SKU sequencial para kits compostos: KIT-000001, KIT-000002, … (por empresa).
-- Execute após 010 (kits) e 014/015 (padrão de SKU de itens).

create table if not exists public.estoque_kit_sku_seq (
  company_id uuid primary key references public.companies (id) on delete cascade,
  seq bigint not null default 0
);

create or replace function public.proximo_sku_estoque_kit(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para gerar SKU de kit nesta empresa.';
  end if;

  insert into public.estoque_kit_sku_seq (company_id, seq)
  values (p_company_id, 1)
  on conflict (company_id)
  do update set seq = public.estoque_kit_sku_seq.seq + 1
  returning seq into v_seq;

  return 'KIT-' || lpad(
    v_seq::text,
    greatest(6, length(v_seq::text)),
    '0'
  );
end;
$$;

grant execute on function public.proximo_sku_estoque_kit(uuid) to authenticated;

alter table public.estoque_kit_sku_seq enable row level security;

-- Alinha sequência com kits já cadastrados no formato KIT-000001.
insert into public.estoque_kit_sku_seq (company_id, seq)
select
  k.company_id,
  coalesce(max((regexp_replace(k.sku, '^KIT-', ''))::bigint), 0)
from public.estoque_kits k
where k.sku ~ '^KIT-[0-9]+$'
group by k.company_id
on conflict (company_id) do update
set seq = greatest(
  public.estoque_kit_sku_seq.seq,
  excluded.seq
);
