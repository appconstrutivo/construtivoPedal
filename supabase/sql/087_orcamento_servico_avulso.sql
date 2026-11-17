-- Orçamento: permite serviço avulso (sem vínculo ao catálogo), igual à OS.

create or replace function public.validate_orcamento_item_company()
returns trigger
language plpgsql
as $$
declare
  v_orc_company uuid;
  v_item_company uuid;
  v_serv_company uuid;
begin
  select company_id into v_orc_company from public.orcamentos where id = new.orcamento_id;
  if v_orc_company is null then
    raise exception 'Orçamento inválido.';
  end if;
  if new.company_id is distinct from v_orc_company then
    raise exception 'company_id do item diverge do orçamento.';
  end if;

  if new.estoque_item_id is not null then
    select company_id into v_item_company from public.estoque_itens where id = new.estoque_item_id;
    if v_item_company is distinct from v_orc_company then
      raise exception 'Item de estoque não pertence à mesma empresa.';
    end if;
  end if;

  if new.servico_catalogo_id is not null then
    select company_id into v_serv_company from public.catalogo_servicos where id = new.servico_catalogo_id;
    if v_serv_company is distinct from v_orc_company then
      raise exception 'Serviço do catálogo não pertence à mesma empresa.';
    end if;
  end if;

  if new.tipo = 'peca' and new.estoque_item_id is null then
    raise exception 'Peça exige vínculo com item de estoque.';
  end if;

  if new.tipo = 'servico' and new.servico_catalogo_id is null
     and length(trim(coalesce(new.descricao, ''))) = 0 then
    raise exception 'Serviço avulso exige descrição.';
  end if;

  return new;
end;
$$;
