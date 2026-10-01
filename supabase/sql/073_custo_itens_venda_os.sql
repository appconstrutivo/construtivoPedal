-- Base de custo (CMV): custo unitário congelado em cada item vendido (PDV/OS) e em cada peça baixada na OS.
-- custo_origem:
--   'apurado'  = custo médio do item no momento da venda/baixa (gravado pelo servidor);
--   'estimado' = backfill com o custo médio vigente na data desta migração (vendas anteriores).
-- O custo é sempre definido no backend (trigger); valores enviados pelo cliente no INSERT são ignorados.
-- Execute após 072.

-- ─── Colunas ─────────────────────────────────────────────────────────────────
alter table public.venda_itens
  add column if not exists custo_unitario numeric(12,2),
  add column if not exists custo_origem text;

alter table public.os_itens
  add column if not exists custo_unitario numeric(12,2),
  add column if not exists custo_origem text;

alter table public.venda_itens drop constraint if exists venda_itens_custo_non_negative;
alter table public.venda_itens
  add constraint venda_itens_custo_non_negative check (custo_unitario is null or custo_unitario >= 0);

alter table public.venda_itens drop constraint if exists venda_itens_custo_origem_check;
alter table public.venda_itens
  add constraint venda_itens_custo_origem_check check (custo_origem is null or custo_origem in ('apurado', 'estimado'));

alter table public.os_itens drop constraint if exists os_itens_custo_non_negative;
alter table public.os_itens
  add constraint os_itens_custo_non_negative check (custo_unitario is null or custo_unitario >= 0);

alter table public.os_itens drop constraint if exists os_itens_custo_origem_check;
alter table public.os_itens
  add constraint os_itens_custo_origem_check check (custo_origem is null or custo_origem in ('apurado', 'estimado'));

-- ─── Peça da OS: congela o custo quando a baixa no estoque é registrada ─────
create or replace function public.os_itens_definir_custo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_custo numeric(12,2);
begin
  if new.tipo <> 'peca' or new.estoque_item_id is null or new.movimentacao_id is null then
    new.custo_unitario := null;
    new.custo_origem := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.movimentacao_id is not distinct from new.movimentacao_id then
    new.custo_unitario := old.custo_unitario;
    new.custo_origem := old.custo_origem;
    return new;
  end if;

  select e.custo_medio into v_custo
    from public.estoque_itens e
   where e.id = new.estoque_item_id
     and e.company_id = new.company_id;

  new.custo_unitario := v_custo;
  new.custo_origem := case when v_custo is null then null else 'apurado' end;
  return new;
end;
$$;

drop trigger if exists trg_os_itens_custo on public.os_itens;
create trigger trg_os_itens_custo
before insert or update of movimentacao_id on public.os_itens
for each row
execute function public.os_itens_definir_custo();

-- ─── Item de venda: custo da peça baixada na OS ou custo médio atual ────────
create or replace function public.venda_itens_definir_custo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_custo numeric(12,2);
  v_origem text;
begin
  new.custo_unitario := null;
  new.custo_origem := null;

  if new.estoque_item_id is null then
    return new;
  end if;

  select * into v_venda from public.vendas where id = new.venda_id;
  if not found then
    return new;
  end if;

  if v_venda.os_id is not null then
    select oi.custo_unitario, oi.custo_origem
      into v_custo, v_origem
      from public.os_itens oi
     where oi.os_id = v_venda.os_id
       and oi.company_id = v_venda.company_id
       and oi.estoque_item_id = new.estoque_item_id
       and oi.custo_unitario is not null
     order by (oi.quantidade = new.quantidade and oi.descricao = new.descricao) desc, oi.created_at
     limit 1;
  end if;

  if v_custo is null then
    select e.custo_medio into v_custo
      from public.estoque_itens e
     where e.id = new.estoque_item_id
       and e.company_id = v_venda.company_id;
    v_origem := 'apurado';
  end if;

  if v_custo is not null then
    new.custo_unitario := v_custo;
    new.custo_origem := coalesce(v_origem, 'apurado');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_venda_itens_custo on public.venda_itens;
create trigger trg_venda_itens_custo
before insert on public.venda_itens
for each row
execute function public.venda_itens_definir_custo();

-- ─── Backfill: vendas/baixas anteriores recebem o custo médio atual como estimativa ──
update public.os_itens oi
   set custo_unitario = e.custo_medio,
       custo_origem = 'estimado'
  from public.estoque_itens e
 where oi.custo_unitario is null
   and oi.tipo = 'peca'
   and oi.movimentacao_id is not null
   and oi.estoque_item_id = e.id
   and e.company_id = oi.company_id;

update public.venda_itens vi
   set custo_unitario = e.custo_medio,
       custo_origem = 'estimado'
  from public.estoque_itens e
 where vi.custo_unitario is null
   and vi.estoque_item_id = e.id
   and e.company_id = vi.company_id;
