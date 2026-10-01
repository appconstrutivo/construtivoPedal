-- Categorias de saída para apuração de resultado (DRE gerencial).
-- 'fornecedor' permanece como chave (rótulo "Compra de mercadoria"): compra para estoque, fora da DRE
--   (o custo entra como CMV quando o item é vendido).
-- Novas: variavel, servico_terceiro, financeira, investimento, retirada_socio.
-- 'transferencia' (sangria/suprimento entre contas) existe só no lançamento manual e também fica fora da DRE.
-- financeiro_movimentacoes.categoria:
--   saída de conta a pagar herda a categoria da conta (e acompanha correções posteriores);
--   saída manual recebe a categoria informada (padrão 'outro' para chamadas sem categoria);
--   entradas e demais origens ficam sem categoria.
-- Execute após 074.

alter table public.financeiro_contas_pagar drop constraint if exists financeiro_contas_pagar_categoria_check;
alter table public.financeiro_contas_pagar
  add constraint financeiro_contas_pagar_categoria_check check (
    categoria in (
      'fornecedor', 'fixa', 'imposto', 'folha', 'outro',
      'variavel', 'servico_terceiro', 'financeira', 'investimento', 'retirada_socio'
    )
  );

alter table public.financeiro_movimentacoes
  add column if not exists categoria text;

alter table public.financeiro_movimentacoes drop constraint if exists financeiro_movimentacoes_categoria_check;
alter table public.financeiro_movimentacoes
  add constraint financeiro_movimentacoes_categoria_check check (
    categoria is null or categoria in (
      'fornecedor', 'fixa', 'imposto', 'folha', 'outro',
      'variavel', 'servico_terceiro', 'financeira', 'investimento', 'retirada_socio',
      'transferencia'
    )
  );

-- ─── Categoria da saída definida no servidor ────────────────────────────────
create or replace function public.financeiro_mov_definir_categoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo <> 'saida' then
    new.categoria := null;
  elsif new.origem = 'conta_pagar' and new.origem_id is not null then
    select cp.categoria into new.categoria
      from public.financeiro_contas_pagar cp
     where cp.id = new.origem_id
       and cp.company_id = new.company_id;
  elsif new.origem = 'manual' then
    new.categoria := coalesce(new.categoria, 'outro');
  else
    new.categoria := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_financeiro_mov_categoria on public.financeiro_movimentacoes;
create trigger trg_financeiro_mov_categoria
before insert on public.financeiro_movimentacoes
for each row
execute function public.financeiro_mov_definir_categoria();

create or replace function public.financeiro_contas_pagar_propagar_categoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.financeiro_movimentacoes
     set categoria = new.categoria
   where origem = 'conta_pagar'
     and origem_id = new.id
     and company_id = new.company_id;
  return new;
end;
$$;

drop trigger if exists trg_financeiro_contas_pagar_categoria on public.financeiro_contas_pagar;
create trigger trg_financeiro_contas_pagar_categoria
after update of categoria on public.financeiro_contas_pagar
for each row
when (old.categoria is distinct from new.categoria)
execute function public.financeiro_contas_pagar_propagar_categoria();

-- ─── Movimentação manual com categoria ──────────────────────────────────────
drop function if exists public.financeiro_registrar_movimentacao(uuid, uuid, uuid, text, numeric, text);

create or replace function public.financeiro_registrar_movimentacao(
  p_company_id uuid,
  p_store_id uuid,
  p_conta_id uuid,
  p_tipo text,
  p_valor numeric,
  p_descricao text,
  p_categoria text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov_id uuid;
  v_delta numeric;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor deve ser maior que zero.';
  end if;

  if not exists (
    select 1 from public.financeiro_contas c
    where c.id = p_conta_id
      and c.company_id = p_company_id
      and c.store_id = p_store_id
      and c.ativo = true
  ) then
    raise exception 'Conta financeira não encontrada.';
  end if;

  insert into public.financeiro_movimentacoes (
    company_id, store_id, conta_id, tipo, valor, descricao, origem, categoria
  ) values (
    p_company_id, p_store_id, p_conta_id, p_tipo, p_valor, trim(p_descricao), 'manual',
    case when p_tipo = 'saida' then nullif(trim(p_categoria), '') end
  )
  returning id into v_mov_id;

  v_delta := case when p_tipo = 'entrada' then p_valor else -p_valor end;

  update public.financeiro_contas
  set saldo_atual = saldo_atual + v_delta
  where id = p_conta_id;

  return v_mov_id;
end;
$$;

revoke execute on function public.financeiro_registrar_movimentacao(uuid, uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.financeiro_registrar_movimentacao(uuid, uuid, uuid, text, numeric, text, text) to authenticated;

-- ─── Backfill ───────────────────────────────────────────────────────────────
update public.financeiro_movimentacoes m
   set categoria = cp.categoria
  from public.financeiro_contas_pagar cp
 where m.origem = 'conta_pagar'
   and m.tipo = 'saida'
   and m.origem_id = cp.id
   and m.company_id = cp.company_id
   and m.categoria is null;

update public.financeiro_movimentacoes
   set categoria = 'outro'
 where origem = 'manual'
   and tipo = 'saida'
   and categoria is null;
