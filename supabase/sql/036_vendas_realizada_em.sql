-- Data operacional da venda (pode ser ajustada após o lançamento).
-- Execute após 035.

alter table public.vendas
  add column if not exists realizada_em timestamptz;

update public.vendas
set realizada_em = created_at
where realizada_em is null;

alter table public.vendas
  alter column realizada_em set not null,
  alter column realizada_em set default timezone('utc', now());

create index if not exists idx_vendas_company_store_realizada
  on public.vendas (company_id, store_id, realizada_em desc);

create or replace function public.trg_vendas_set_realizada_em()
returns trigger
language plpgsql
as $$
begin
  if new.realizada_em is null then
    new.realizada_em := coalesce(new.created_at, timezone('utc', now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendas_realizada_em on public.vendas;
create trigger trg_vendas_realizada_em
before insert on public.vendas
for each row
execute function public.trg_vendas_set_realizada_em();

create or replace function public.pdv_ajustar_data_venda(
  p_venda_id uuid,
  p_realizada_em timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
begin
  if p_realizada_em is null then
    raise exception 'Informe a data da venda.';
  end if;

  if p_realizada_em > timezone('utc', now()) + interval '1 day' then
    raise exception 'A data da venda não pode ser no futuro.';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  if not public.is_member_of_company(v_venda.company_id) then
    raise exception 'Sem permissão para alterar esta venda.';
  end if;

  update public.vendas
  set realizada_em = p_realizada_em
  where id = p_venda_id;
end;
$$;

grant execute on function public.pdv_ajustar_data_venda(uuid, timestamptz) to authenticated;
