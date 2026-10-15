-- Tipos de item personalizados (substitui estoque_categorias da 079).
-- Cada tipo tem uma BASE (peca/acessorio/bike) que é gravada em estoque_itens.categoria,
-- mantendo o comportamento de PDV, Oficina, Orçamentos e relatórios.
-- Execute após 079.

drop trigger if exists trg_validate_item_categoria on public.estoque_itens;
drop trigger if exists trg_unlink_itens_categoria_inativa on public.estoque_categorias;
drop trigger if exists trg_estoque_categorias_fields on public.estoque_categorias;
drop function if exists public.validate_item_categoria_company();
drop function if exists public.unlink_itens_categoria_inativa();
drop function if exists public.set_estoque_categorias_fields();
drop policy if exists "estoque_categorias_select_member_company" on public.estoque_categorias;
drop policy if exists "estoque_categorias_insert_member_company" on public.estoque_categorias;
drop policy if exists "estoque_categorias_update_member_company" on public.estoque_categorias;

alter table public.estoque_categorias rename to estoque_tipos;
alter table public.estoque_tipos rename constraint estoque_categorias_nome_len to estoque_tipos_nome_len;
alter index public.idx_estoque_categorias_nome_unico rename to idx_estoque_tipos_nome_unico;
alter index public.idx_estoque_categorias_company rename to idx_estoque_tipos_company;

-- Registros criados como "categoria" na 079 eram tipos de produto (ex.: Ferramentas/equipamentos):
-- entram como acessório; novos tipos usam 'peca' por padrão.
alter table public.estoque_tipos
  add column if not exists base text not null default 'acessorio';
alter table public.estoque_tipos alter column base set default 'peca';

alter table public.estoque_tipos drop constraint if exists estoque_tipos_base_check;
alter table public.estoque_tipos
  add constraint estoque_tipos_base_check check (base in ('peca', 'acessorio', 'bike'));

alter table public.estoque_itens rename column categoria_id to tipo_id;
alter index public.idx_estoque_itens_categoria_id rename to idx_estoque_itens_tipo_id;

create or replace function public.set_estoque_tipos_fields()
returns trigger
language plpgsql
as $$
begin
  new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
  if lower(new.nome) in ('peça', 'peca', 'peças', 'pecas', 'acessório', 'acessorio', 'acessórios', 'acessorios', 'bike', 'bikes') then
    raise exception 'Este tipo já existe no sistema.';
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_tipos_fields on public.estoque_tipos;
create trigger trg_estoque_tipos_fields
before insert or update on public.estoque_tipos
for each row
execute function public.set_estoque_tipos_fields();

-- Item com tipo personalizado: valida empresa/ativo e sincroniza categoria com a base do tipo.
create or replace function public.validate_item_tipo()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
  v_ativo boolean;
  v_base text;
begin
  if new.tipo_id is null then
    return new;
  end if;

  select t.company_id, t.ativo, t.base
    into v_company_id, v_ativo, v_base
  from public.estoque_tipos t
  where t.id = new.tipo_id;

  if not found then
    raise exception 'Tipo de item não encontrado.';
  end if;

  if not v_ativo then
    raise exception 'Tipo de item inativo.';
  end if;

  if v_company_id <> new.company_id then
    raise exception 'Tipo de item não pertence à mesma empresa do item.';
  end if;

  new.categoria := v_base;
  return new;
end;
$$;

drop trigger if exists trg_validate_item_tipo on public.estoque_itens;
create trigger trg_validate_item_tipo
before insert or update of company_id, tipo_id, categoria on public.estoque_itens
for each row
execute function public.validate_item_tipo();

-- Mudança de base propaga para os itens; desativação devolve os itens ao tipo base.
create or replace function public.sync_itens_estoque_tipo()
returns trigger
language plpgsql
as $$
begin
  if old.ativo and not new.ativo then
    update public.estoque_itens
      set tipo_id = null
    where tipo_id = new.id;
  elsif new.ativo and new.base is distinct from old.base then
    update public.estoque_itens
      set categoria = new.base
    where tipo_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_itens_estoque_tipo on public.estoque_tipos;
create trigger trg_sync_itens_estoque_tipo
after update of ativo, base on public.estoque_tipos
for each row
execute function public.sync_itens_estoque_tipo();

drop policy if exists "estoque_tipos_select_member_company" on public.estoque_tipos;
create policy "estoque_tipos_select_member_company"
  on public.estoque_tipos
  for select
  to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_tipos_insert_member_company" on public.estoque_tipos;
create policy "estoque_tipos_insert_member_company"
  on public.estoque_tipos
  for insert
  to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_tipos_update_member_company" on public.estoque_tipos;
create policy "estoque_tipos_update_member_company"
  on public.estoque_tipos
  for update
  to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));
