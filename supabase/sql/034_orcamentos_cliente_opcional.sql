-- Orçamentos: cliente opcional (Consumidor / balcão), igual ao PDV.
-- Permite vincular cliente cadastrado depois.

alter table public.orcamentos
  alter column cliente_id drop not null;

create or replace function public.validate_orcamento_bicicleta_cliente()
returns trigger
language plpgsql
as $$
begin
  if new.bicicleta_id is not null and new.cliente_id is null then
    raise exception 'Vincule um cliente antes de selecionar a bicicleta.';
  end if;

  if new.bicicleta_id is null then
    return new;
  end if;

  if new.cliente_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.bicicletas b
    where b.id = new.bicicleta_id
      and b.cliente_id = new.cliente_id
      and b.company_id = new.company_id
  ) then
    raise exception 'Bicicleta não pertence ao cliente informado.';
  end if;

  return new;
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
      'tipo', oi.tipo
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
