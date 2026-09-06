-- Orçamento: permite peças sem saldo. Elas ficam no documento com observação,
-- não são reservadas e não entram na OS (nem no valor da ordem).

alter table public.orcamento_itens
  add column if not exists sem_saldo boolean not null default false;

comment on column public.orcamento_itens.sem_saldo is
  'Peça sem saldo disponível. Permanece no orçamento, não é reservada e não entra na OS.';

create or replace function public.orcamento_item_calcular_sem_saldo()
returns trigger
language plpgsql
as $$
declare
  v_disponivel numeric;
begin
  if new.tipo is distinct from 'peca' or new.estoque_item_id is null then
    new.sem_saldo := false;
    return new;
  end if;

  select coalesce(e.saldo_atual, 0) - coalesce((
    select sum(r.quantidade)
    from public.estoque_reservas r
    join public.orcamentos o on o.id = r.orcamento_id
    where r.estoque_item_id = new.estoque_item_id
      and o.status in ('enviado', 'aprovado')
      and r.orcamento_id is distinct from new.orcamento_id
  ), 0)
  into v_disponivel
  from public.estoque_itens e
  where e.id = new.estoque_item_id;

  new.sem_saldo := coalesce(v_disponivel, 0) < new.quantidade;
  return new;
end;
$$;

drop trigger if exists trg_orcamento_item_sem_saldo on public.orcamento_itens;
create trigger trg_orcamento_item_sem_saldo
before insert or update of tipo, estoque_item_id, quantidade, orcamento_id
on public.orcamento_itens
for each row
execute function public.orcamento_item_calcular_sem_saldo();

-- Recalcula a flag nos itens já cadastrados.
update public.orcamento_itens oi
set quantidade = oi.quantidade
where oi.tipo = 'peca'
  and oi.estoque_item_id is not null;

create or replace function public.orcamento_reservar_estoque(p_orcamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_orc public.orcamentos%rowtype;
  v_item record;
  v_disponivel numeric;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_orc from public.orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.';
  end if;

  if not public.is_member_of_company(v_orc.company_id) then
    raise exception 'Sem permissão.';
  end if;

  perform public.orcamento_liberar_reservas(p_orcamento_id);

  for v_item in
    select oi.*
    from public.orcamento_itens oi
    where oi.orcamento_id = p_orcamento_id
      and oi.tipo = 'peca'
      and oi.estoque_item_id is not null
  loop
    v_disponivel := public.estoque_saldo_disponivel(v_item.estoque_item_id);
    if v_item.quantidade > coalesce(v_disponivel, 0) then
      update public.orcamento_itens
        set sem_saldo = true
      where id = v_item.id;
      continue;
    end if;

    update public.orcamento_itens
      set sem_saldo = false
    where id = v_item.id;

    insert into public.estoque_reservas (
      company_id, store_id, orcamento_id, orcamento_item_id, estoque_item_id, quantidade
    ) values (
      v_orc.company_id, v_orc.store_id, p_orcamento_id, v_item.id, v_item.estoque_item_id, v_item.quantidade
    );
  end loop;
end;
$$;

create or replace function public.orcamento_publico_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc public.orcamentos%rowtype;
  v_itens jsonb;
  v_cliente text;
  v_loja text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_orc
  from public.orcamentos
  where token_aprovacao = trim(p_token);

  if not found then
    return null;
  end if;

  if v_orc.status not in ('enviado', 'aprovado', 'recusado', 'expirado', 'convertido') then
    return jsonb_build_object('erro', 'Orçamento indisponível para aprovação.');
  end if;

  select coalesce(c.nome, 'Consumidor / balcão')
    into v_cliente
  from public.clientes c
  where c.id = v_orc.cliente_id;

  if v_cliente is null then
    v_cliente := 'Consumidor / balcão';
  end if;

  select s.name into v_loja from public.stores s where s.id = v_orc.store_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'descricao', oi.descricao,
      'quantidade', oi.quantidade,
      'preco_unitario', oi.preco_unitario,
      'tipo', oi.tipo,
      'sem_saldo', coalesce(oi.sem_saldo, false)
    ) order by oi.created_at
  ), '[]'::jsonb)
  into v_itens
  from public.orcamento_itens oi
  where oi.orcamento_id = v_orc.id;

  return jsonb_build_object(
    'numero', v_orc.numero,
    'status', v_orc.status,
    'resumo', v_orc.resumo,
    'desconto', v_orc.desconto,
    'valido_ate', v_orc.valido_ate,
    'cliente_nome', v_cliente,
    'loja_nome', v_loja,
    'itens', v_itens
  );
end;
$$;
