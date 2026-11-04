-- Versões permanentes de kit + snapshot de montagem + substituição pontual.
-- - estoque_kit_versoes: receitas alternativas do mesmo kit (quadro, freio, etc.)
-- - componentes passam a pertencer à versão
-- - montagens gravam o que saiu de fato (inclui substituto manual)
-- - desmontagem consome snapshots em FIFO; sem snapshot, usa a receita da versão
-- Execute após 083 (ou 082 se 083 ainda não existir no ambiente).

create table if not exists public.estoque_kit_versoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kit_id uuid not null references public.estoque_kits (id) on delete cascade,
  nome text not null,
  item_resultante_id uuid not null references public.estoque_itens (id) on delete restrict,
  eh_padrao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint estoque_kit_versoes_nome_unique unique (kit_id, nome)
);

create index if not exists idx_estoque_kit_versoes_company_kit
  on public.estoque_kit_versoes (company_id, kit_id);

-- Item resultante pode repetir em dados legados; a UI evita conflito ao cadastrar versão nova.
create index if not exists idx_estoque_kit_versoes_item_resultante
  on public.estoque_kit_versoes (item_resultante_id)
  where ativo = true;

-- No máximo uma versão padrão ativa por kit.
create unique index if not exists idx_estoque_kit_versoes_padrao_por_kit
  on public.estoque_kit_versoes (kit_id)
  where eh_padrao = true and ativo = true;

alter table public.estoque_kit_componentes
  add column if not exists versao_id uuid references public.estoque_kit_versoes (id) on delete cascade;

create table if not exists public.estoque_kit_montagens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kit_id uuid not null references public.estoque_kits (id) on delete restrict,
  versao_id uuid not null references public.estoque_kit_versoes (id) on delete restrict,
  item_resultante_id uuid not null references public.estoque_itens (id) on delete restrict,
  quantidade numeric(12,3) not null,
  quantidade_restante numeric(12,3) not null,
  origem text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users (id) on delete set null,
  constraint estoque_kit_montagens_qtd_positive check (quantidade > 0),
  constraint estoque_kit_montagens_restante_check check (
    quantidade_restante >= 0 and quantidade_restante <= quantidade
  )
);

create index if not exists idx_estoque_kit_montagens_fifo
  on public.estoque_kit_montagens (company_id, versao_id, created_at)
  where quantidade_restante > 0;

create table if not exists public.estoque_kit_montagem_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  montagem_id uuid not null references public.estoque_kit_montagens (id) on delete cascade,
  componente_receita_item_id uuid not null references public.estoque_itens (id) on delete restrict,
  item_baixado_id uuid not null references public.estoque_itens (id) on delete restrict,
  quantidade_por_kit numeric(12,3) not null,
  constraint estoque_kit_montagem_itens_qtd_positive check (quantidade_por_kit > 0)
);

create index if not exists idx_estoque_kit_montagem_itens_montagem
  on public.estoque_kit_montagem_itens (montagem_id);

-- Backfill: cada kit existente vira 1 versão "Principal".
insert into public.estoque_kit_versoes (
  company_id, kit_id, nome, item_resultante_id, eh_padrao, ativo
)
select
  k.company_id,
  k.id,
  'Principal',
  k.item_resultante_id,
  true,
  true
from public.estoque_kits k
where k.item_resultante_id is not null
  and not exists (
    select 1 from public.estoque_kit_versoes v where v.kit_id = k.id
  );

update public.estoque_kit_componentes c
   set versao_id = v.id
  from public.estoque_kit_versoes v
 where v.kit_id = c.kit_id
   and c.versao_id is null;

-- Componentes órfãos (kit sem item resultante) não devem bloquear; remove inconsistência.
delete from public.estoque_kit_componentes
 where versao_id is null;

alter table public.estoque_kit_componentes
  alter column versao_id set not null;

alter table public.estoque_kit_componentes
  drop constraint if exists estoque_kit_componentes_unique;

alter table public.estoque_kit_componentes
  add constraint estoque_kit_componentes_unique unique (versao_id, componente_item_id);

create index if not exists idx_estoque_kit_componentes_versao
  on public.estoque_kit_componentes (company_id, versao_id);

create or replace function public.set_estoque_kit_versoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estoque_kit_versoes_updated_at on public.estoque_kit_versoes;
create trigger trg_estoque_kit_versoes_updated_at
before update on public.estoque_kit_versoes
for each row
execute function public.set_estoque_kit_versoes_updated_at();

-- Mantém item_resultante_id do kit apontando para a versão padrão (compatibilidade).
create or replace function public.sync_kit_item_resultante_from_padrao()
returns trigger
language plpgsql
as $$
declare
  v_item uuid;
begin
  select v.item_resultante_id
    into v_item
  from public.estoque_kit_versoes v
  where v.kit_id = coalesce(new.kit_id, old.kit_id)
    and v.ativo = true
    and v.eh_padrao = true
  limit 1;

  if v_item is null then
    select v.item_resultante_id
      into v_item
    from public.estoque_kit_versoes v
    where v.kit_id = coalesce(new.kit_id, old.kit_id)
      and v.ativo = true
    order by v.created_at
    limit 1;
  end if;

  update public.estoque_kits
     set item_resultante_id = v_item,
         updated_at = timezone('utc', now())
   where id = coalesce(new.kit_id, old.kit_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_kit_item_resultante on public.estoque_kit_versoes;
create trigger trg_sync_kit_item_resultante
after insert or update or delete on public.estoque_kit_versoes
for each row
execute function public.sync_kit_item_resultante_from_padrao();

alter table public.estoque_kit_versoes enable row level security;
alter table public.estoque_kit_montagens enable row level security;
alter table public.estoque_kit_montagem_itens enable row level security;

drop policy if exists "estoque_kit_versoes_select_member_company" on public.estoque_kit_versoes;
create policy "estoque_kit_versoes_select_member_company"
  on public.estoque_kit_versoes for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_versoes_insert_member_company" on public.estoque_kit_versoes;
create policy "estoque_kit_versoes_insert_member_company"
  on public.estoque_kit_versoes for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_versoes_update_member_company" on public.estoque_kit_versoes;
create policy "estoque_kit_versoes_update_member_company"
  on public.estoque_kit_versoes for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_versoes_delete_member_company" on public.estoque_kit_versoes;
create policy "estoque_kit_versoes_delete_member_company"
  on public.estoque_kit_versoes for delete to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_montagens_select_member_company" on public.estoque_kit_montagens;
create policy "estoque_kit_montagens_select_member_company"
  on public.estoque_kit_montagens for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_montagens_insert_member_company" on public.estoque_kit_montagens;
create policy "estoque_kit_montagens_insert_member_company"
  on public.estoque_kit_montagens for insert to authenticated
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_montagens_update_member_company" on public.estoque_kit_montagens;
create policy "estoque_kit_montagens_update_member_company"
  on public.estoque_kit_montagens for update to authenticated
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_montagem_itens_select_member_company" on public.estoque_kit_montagem_itens;
create policy "estoque_kit_montagem_itens_select_member_company"
  on public.estoque_kit_montagem_itens for select to authenticated
  using (public.is_member_of_company(company_id));

drop policy if exists "estoque_kit_montagem_itens_insert_member_company" on public.estoque_kit_montagem_itens;
create policy "estoque_kit_montagem_itens_insert_member_company"
  on public.estoque_kit_montagem_itens for insert to authenticated
  with check (public.is_member_of_company(company_id));

-- RPCs novas (assinatura com versão + substituições).
drop function if exists public.registrar_montagem_kit(uuid, uuid, numeric, text);
drop function if exists public.registrar_desmontagem_kit(uuid, uuid, numeric, text);

create or replace function public.registrar_montagem_kit(
  p_company_id uuid,
  p_kit_id uuid,
  p_versao_id uuid,
  p_quantidade numeric,
  p_origem text default null,
  p_substituicoes jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.estoque_kits%rowtype;
  v_versao public.estoque_kit_versoes%rowtype;
  v_comp record;
  v_item public.estoque_itens%rowtype;
  v_necessario numeric(12,3);
  v_faltas text := '';
  v_custo_mov numeric(12,2);
  v_qtd_mov numeric(12,3);
  v_custo_total numeric(14,2) := 0;
  v_item_baixa uuid;
  v_subs jsonb;
  v_montagem_id uuid;
  v_obs text;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Acesso negado a esta empresa.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade de montagem deve ser maior que zero.';
  end if;

  if p_quantidade <> trunc(p_quantidade) then
    raise exception 'Quantidade de montagem deve ser um número inteiro (sem decimais).';
  end if;

  if p_substituicoes is null or jsonb_typeof(p_substituicoes) <> 'array' then
    raise exception 'Substituições inválidas.';
  end if;

  select *
    into v_kit
  from public.estoque_kits k
  where k.id = p_kit_id
    and k.company_id = p_company_id
    and k.ativo = true;

  if not found then
    raise exception 'Kit não encontrado para esta empresa.';
  end if;

  select *
    into v_versao
  from public.estoque_kit_versoes v
  where v.id = p_versao_id
    and v.kit_id = p_kit_id
    and v.company_id = p_company_id
    and v.ativo = true;

  if not found then
    raise exception 'Versão do kit não encontrada.';
  end if;

  -- Valida substituições: cada chave deve existir na receita; destino ≠ receita/resultante.
  for v_subs in
    select value from jsonb_array_elements(p_substituicoes)
  loop
    if coalesce(v_subs->>'componente_item_id', '') = ''
       or coalesce(v_subs->>'substituir_por_item_id', '') = '' then
      raise exception 'Substituição incompleta: informe a peça da receita e a peça substituta.';
    end if;

    if (v_subs->>'componente_item_id') = (v_subs->>'substituir_por_item_id') then
      raise exception 'Substituição inválida: a peça substituta deve ser diferente da receita.';
    end if;

    if (v_subs->>'substituir_por_item_id')::uuid = v_versao.item_resultante_id then
      raise exception 'A peça substituta não pode ser o item resultante da versão.';
    end if;

    if not exists (
      select 1
      from public.estoque_kit_componentes c
      where c.versao_id = v_versao.id
        and c.componente_item_id = (v_subs->>'componente_item_id')::uuid
    ) then
      raise exception 'Substituição refere peça que não está na receita desta versão.';
    end if;

    if exists (
      select 1
      from public.estoque_kit_componentes c
      where c.versao_id = v_versao.id
        and c.componente_item_id = (v_subs->>'substituir_por_item_id')::uuid
    ) then
      raise exception 'A peça substituta já faz parte da receita. Ajuste a quantidade na versão.';
    end if;

    if not exists (
      select 1
      from public.estoque_itens i
      where i.id = (v_subs->>'substituir_por_item_id')::uuid
        and i.company_id = p_company_id
        and i.ativo = true
    ) then
      raise exception 'Peça substituta não encontrada ou inativa.';
    end if;
  end loop;

  for v_comp in
    select c.componente_item_id, c.quantidade
    from public.estoque_kit_componentes c
    where c.versao_id = v_versao.id
      and c.company_id = p_company_id
  loop
    if v_comp.quantidade <> trunc(v_comp.quantidade) then
      raise exception 'Componente do kit com quantidade fracionada. Atualize o cadastro da versão.';
    end if;

    v_item_baixa := v_comp.componente_item_id;
    select (s->>'substituir_por_item_id')::uuid
      into v_item_baixa
    from jsonb_array_elements(p_substituicoes) s
    where (s->>'componente_item_id')::uuid = v_comp.componente_item_id
    limit 1;

    v_item_baixa := coalesce(v_item_baixa, v_comp.componente_item_id);
    v_necessario := v_comp.quantidade * p_quantidade;

    select *
      into v_item
    from public.estoque_itens i
    where i.id = v_item_baixa
      and i.company_id = p_company_id;

    if not found then
      raise exception 'Componente do kit não encontrado no estoque.';
    end if;

    if v_item.saldo_atual < v_necessario then
      v_faltas := v_faltas || format(
        E'\n• %s: necessário %s, disponível %s (faltam %s)',
        v_item.nome,
        trunc(v_necessario),
        trunc(greatest(v_item.saldo_atual, 0)),
        trunc(v_necessario - greatest(v_item.saldo_atual, 0))
      );
    end if;
  end loop;

  if v_faltas <> '' then
    raise exception 'Estoque insuficiente para montar o kit:%', v_faltas;
  end if;

  insert into public.estoque_kit_montagens (
    company_id,
    kit_id,
    versao_id,
    item_resultante_id,
    quantidade,
    quantidade_restante,
    origem,
    created_by
  )
  values (
    p_company_id,
    v_kit.id,
    v_versao.id,
    v_versao.item_resultante_id,
    p_quantidade,
    p_quantidade,
    coalesce(p_origem, 'montagem de kit'),
    auth.uid()
  )
  returning id into v_montagem_id;

  for v_comp in
    select c.componente_item_id, c.quantidade
    from public.estoque_kit_componentes c
    where c.versao_id = v_versao.id
      and c.company_id = p_company_id
  loop
    v_item_baixa := v_comp.componente_item_id;
    select (s->>'substituir_por_item_id')::uuid
      into v_item_baixa
    from jsonb_array_elements(p_substituicoes) s
    where (s->>'componente_item_id')::uuid = v_comp.componente_item_id
    limit 1;
    v_item_baixa := coalesce(v_item_baixa, v_comp.componente_item_id);

    insert into public.estoque_kit_montagem_itens (
      company_id,
      montagem_id,
      componente_receita_item_id,
      item_baixado_id,
      quantidade_por_kit
    )
    values (
      p_company_id,
      v_montagem_id,
      v_comp.componente_item_id,
      v_item_baixa,
      v_comp.quantidade
    );

    if v_item_baixa = v_comp.componente_item_id then
      v_obs := format('Baixa por montagem do kit: %s (%s)', v_kit.nome, v_versao.nome);
    else
      v_obs := format(
        'Baixa por montagem do kit: %s (%s) — substituição de peça da receita',
        v_kit.nome,
        v_versao.nome
      );
    end if;

    insert into public.estoque_movimentacoes (
      company_id,
      item_id,
      tipo,
      motivo,
      quantidade,
      origem,
      observacao
    )
    values (
      p_company_id,
      v_item_baixa,
      'saida',
      'montagem',
      v_comp.quantidade * p_quantidade,
      coalesce(p_origem, 'montagem de kit'),
      v_obs
    )
    returning custo_unitario, abs(quantidade) into v_custo_mov, v_qtd_mov;

    v_custo_total := v_custo_total + coalesce(v_custo_mov, 0) * v_qtd_mov;
  end loop;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    tipo,
    motivo,
    quantidade,
    custo_unitario,
    origem,
    observacao
  )
  values (
    p_company_id,
    v_versao.item_resultante_id,
    'entrada',
    'montagem',
    p_quantidade,
    round(v_custo_total / p_quantidade, 2),
    coalesce(p_origem, 'montagem de kit'),
    format('Entrada por montagem do kit: %s (%s)', v_kit.nome, v_versao.nome)
  );
end;
$$;

create or replace function public.registrar_desmontagem_kit(
  p_company_id uuid,
  p_kit_id uuid,
  p_versao_id uuid,
  p_quantidade numeric,
  p_origem text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.estoque_kits%rowtype;
  v_versao public.estoque_kit_versoes%rowtype;
  v_saldo numeric(12,3);
  v_custo_kit numeric(12,2);
  v_restante numeric(12,3);
  v_usar numeric(12,3);
  v_montagem record;
  v_linha record;
  v_custo_receita numeric(14,4);
  v_custo_comp numeric(12,2);
  v_mapa_custo jsonb := '{}'::jsonb;
  v_item_id uuid;
  v_qtd numeric(12,3);
  v_custo_med numeric(12,2);
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'Acesso negado a esta empresa.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade de desmontagem deve ser maior que zero.';
  end if;

  if p_quantidade <> trunc(p_quantidade) then
    raise exception 'Quantidade de desmontagem deve ser um número inteiro (sem decimais).';
  end if;

  select *
    into v_kit
  from public.estoque_kits k
  where k.id = p_kit_id
    and k.company_id = p_company_id
    and k.ativo = true;

  if not found then
    raise exception 'Kit não encontrado para esta empresa.';
  end if;

  select *
    into v_versao
  from public.estoque_kit_versoes v
  where v.id = p_versao_id
    and v.kit_id = p_kit_id
    and v.company_id = p_company_id
    and v.ativo = true;

  if not found then
    raise exception 'Versão do kit não encontrada.';
  end if;

  select i.saldo_atual
    into v_saldo
  from public.estoque_itens i
  where i.id = v_versao.item_resultante_id
    and i.company_id = p_company_id
  for update;

  if not found then
    raise exception 'Item resultante da versão não encontrado.';
  end if;

  if v_saldo < p_quantidade then
    raise exception 'Saldo insuficiente do item montado. Disponível: %, solicitado: %.',
      trunc(v_saldo), trunc(p_quantidade);
  end if;

  insert into public.estoque_movimentacoes (
    company_id,
    item_id,
    tipo,
    motivo,
    quantidade,
    origem,
    observacao
  )
  values (
    p_company_id,
    v_versao.item_resultante_id,
    'saida',
    'desmontagem',
    p_quantidade,
    coalesce(p_origem, 'desmontagem de kit'),
    format('Baixa por desmontagem do kit: %s (%s)', v_kit.nome, v_versao.nome)
  )
  returning custo_unitario into v_custo_kit;

  v_restante := p_quantidade;

  -- FIFO pelos snapshots desta versão.
  for v_montagem in
    select m.*
    from public.estoque_kit_montagens m
    where m.company_id = p_company_id
      and m.versao_id = v_versao.id
      and m.quantidade_restante > 0
    order by m.created_at asc
    for update
  loop
    exit when v_restante <= 0;

    v_usar := least(v_montagem.quantidade_restante, v_restante);

    for v_linha in
      select mi.item_baixado_id, mi.quantidade_por_kit
      from public.estoque_kit_montagem_itens mi
      where mi.montagem_id = v_montagem.id
    loop
      v_item_id := v_linha.item_baixado_id;
      v_qtd := v_linha.quantidade_por_kit * v_usar;
      v_mapa_custo := jsonb_set(
        v_mapa_custo,
        array[v_item_id::text],
        to_jsonb(coalesce((v_mapa_custo->>v_item_id::text)::numeric, 0) + v_qtd),
        true
      );
    end loop;

    update public.estoque_kit_montagens
       set quantidade_restante = quantidade_restante - v_usar
     where id = v_montagem.id;

    v_restante := v_restante - v_usar;
  end loop;

  -- Saldo legado (montado antes do snapshot): usa receita atual da versão.
  if v_restante > 0 then
    for v_linha in
      select c.componente_item_id, c.quantidade
      from public.estoque_kit_componentes c
      where c.versao_id = v_versao.id
        and c.company_id = p_company_id
    loop
      v_item_id := v_linha.componente_item_id;
      v_qtd := v_linha.quantidade * v_restante;
      v_mapa_custo := jsonb_set(
        v_mapa_custo,
        array[v_item_id::text],
        to_jsonb(coalesce((v_mapa_custo->>v_item_id::text)::numeric, 0) + v_qtd),
        true
      );
    end loop;
  end if;

  select coalesce(sum((value)::numeric * coalesce(i.custo_medio, 0)), 0)
    into v_custo_receita
  from jsonb_each_text(v_mapa_custo) e
  join public.estoque_itens i on i.id = e.key::uuid;

  for v_linha in
    select e.key::uuid as item_id, (e.value)::numeric as quantidade
    from jsonb_each_text(v_mapa_custo) e
  loop
    select coalesce(i.custo_medio, 0) into v_custo_med
    from public.estoque_itens i
    where i.id = v_linha.item_id;

    if v_custo_receita > 0 and v_custo_med > 0 then
      v_custo_comp := round(v_custo_med * coalesce(v_custo_kit, 0) / v_custo_receita, 2);
    else
      v_custo_comp := 0;
    end if;

    insert into public.estoque_movimentacoes (
      company_id,
      item_id,
      tipo,
      motivo,
      quantidade,
      custo_unitario,
      origem,
      observacao
    )
    values (
      p_company_id,
      v_linha.item_id,
      'entrada',
      'desmontagem',
      v_linha.quantidade,
      v_custo_comp,
      coalesce(p_origem, 'desmontagem de kit'),
      format('Entrada por desmontagem do kit: %s (%s)', v_kit.nome, v_versao.nome)
    );
  end loop;
end;
$$;

revoke all on function public.registrar_montagem_kit(uuid, uuid, uuid, numeric, text, jsonb) from public, anon;
revoke all on function public.registrar_desmontagem_kit(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.registrar_montagem_kit(uuid, uuid, uuid, numeric, text, jsonb) to authenticated;
grant execute on function public.registrar_desmontagem_kit(uuid, uuid, uuid, numeric, text) to authenticated;
