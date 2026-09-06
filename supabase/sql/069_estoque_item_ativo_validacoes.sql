-- Validações de item ativo/inativo no estoque.
-- Execute após 068.

-- Oficina: bloqueia baixa de peça inativa (alinhado ao PDV).
create or replace function public.os_baixar_item_estoque(p_os_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.os_itens%rowtype;
  v_os public.ordens_servico%rowtype;
  v_item public.estoque_itens%rowtype;
  v_mov_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_row from public.os_itens where id = p_os_item_id for update;
  if not found then
    raise exception 'Item da OS não encontrado.';
  end if;

  if v_row.tipo <> 'peca' or v_row.estoque_item_id is null then
    raise exception 'Somente peças vinculadas ao estoque podem receber baixa.';
  end if;

  if v_row.movimentacao_id is not null then
    raise exception 'Baixa já registrada para este item.';
  end if;

  select * into v_os from public.ordens_servico where id = v_row.os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if not public.is_member_of_company(v_os.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if v_os.status = 'cancelada' then
    raise exception 'Não é possível baixar peças em OS cancelada.';
  end if;

  select * into v_item
    from public.estoque_itens
   where id = v_row.estoque_item_id
     and company_id = v_os.company_id
     and store_id = v_os.store_id
   for update;

  if not found then
    raise exception 'Produto não encontrado no estoque desta loja.';
  end if;

  if not coalesce(v_item.ativo, false) then
    raise exception 'Produto inativo no estoque desta loja.';
  end if;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    store_id,
    tipo,
    quantidade,
    origem,
    observacao,
    created_by
  )
  values (
    v_os.company_id,
    v_row.estoque_item_id,
    v_os.store_id,
    'saida',
    abs(v_row.quantidade),
    'oficina_os',
    format('OS #%s — item %s', v_os.numero, v_row.id),
    v_user
  )
  returning id into v_mov_id;

  update public.os_itens
    set movimentacao_id = v_mov_id
  where id = v_row.id;

  return v_mov_id;
end;
$$;

-- Impede dois itens ATIVOS com mesmo nome ou SKU fornecedor na mesma loja.
create or replace function public.validate_estoque_item_duplicado_ativo()
returns trigger
language plpgsql
as $$
declare
  v_existe uuid;
  v_nome_key text;
begin
  if coalesce(new.ativo, true) is distinct from true then
    return new;
  end if;

  if new.sku_fornecedor is not null and trim(new.sku_fornecedor) <> '' then
    select id into v_existe
      from public.estoque_itens
     where company_id = new.company_id
       and store_id = new.store_id
       and ativo = true
       and trim(sku_fornecedor) = trim(new.sku_fornecedor)
       and id is distinct from new.id
     limit 1;

    if found then
      raise exception 'Já existe um item ativo com o mesmo SKU do fornecedor nesta loja.';
    end if;
  end if;

  v_nome_key := upper(trim(regexp_replace(new.nome, '\s+', ' ', 'g')));
  if v_nome_key = '' then
    return new;
  end if;

  select id into v_existe
    from public.estoque_itens
   where company_id = new.company_id
     and store_id = new.store_id
     and ativo = true
     and upper(trim(regexp_replace(nome, '\s+', ' ', 'g'))) = v_nome_key
     and id is distinct from new.id
   limit 1;

  if found then
    raise exception 'Já existe um item ativo com o mesmo nome nesta loja.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_estoque_itens_duplicado_ativo on public.estoque_itens;
create trigger trg_estoque_itens_duplicado_ativo
before insert or update of nome, sku_fornecedor, ativo, company_id, store_id
on public.estoque_itens
for each row
execute function public.validate_estoque_item_duplicado_ativo();
