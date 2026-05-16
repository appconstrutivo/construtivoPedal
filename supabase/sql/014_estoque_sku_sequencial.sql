-- SKU sequencial numérico: 000001, 000002, … (mínimo 6 dígitos; cresce se passar de 999999).
-- Por empresa + loja (“Sem loja” usa chave fixa).
-- Execute no SQL Editor do Supabase após 013 (ou após 009, conforme seu histórico).

create table if not exists public.estoque_item_sku_seq (
  company_id uuid not null references public.companies (id) on delete cascade,
  store_key uuid not null,
  seq bigint not null default 0,
  primary key (company_id, store_key)
);

create index if not exists idx_estoque_item_sku_seq_company on public.estoque_item_sku_seq (company_id);

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

grant execute on function public.proximo_sku_estoque_item(uuid, uuid) to authenticated;

alter table public.estoque_item_sku_seq enable row level security;

-- Sem políticas diretas: a RPC (security definer) atualiza a sequência.
