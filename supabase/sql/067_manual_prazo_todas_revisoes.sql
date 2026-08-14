-- Prazo vencido em todas as revisões do manual (não só a verificação de 30 dias).
-- Prazo = data_compra + dias da regra de pós-venda do tipo.
-- A partir da 5ª revisão, soma-se um ciclo (dias da revisão geral) por volta.

create or replace function public.manual_dias_padrao_tipo(p_tipo text)
returns integer
language sql
immutable
as $$
  select case p_tipo
    when 'verificacao_30' then 30
    when 'periodica' then 60
    when 'intermediaria' then 120
    when 'geral' then 210
    else null
  end;
$$;

create or replace function public.manual_prazo_revisao(
  p_data_compra date,
  p_sequencia integer,
  p_tipo text,
  p_dias_tipo integer,
  p_dias_ciclo integer
)
returns date
language plpgsql
immutable
as $$
declare
  v_dias integer;
  v_ciclo integer;
  v_ciclo_dias integer;
begin
  if p_data_compra is null then
    return null;
  end if;

  v_dias := coalesce(nullif(p_dias_tipo, 0), public.manual_dias_padrao_tipo(p_tipo));
  if v_dias is null then
    return null;
  end if;

  if p_tipo = 'verificacao_30' or coalesce(p_sequencia, 1) <= 1 then
    return p_data_compra + v_dias;
  end if;

  -- seq 2–4 = ciclo 0; seq 5–7 = ciclo 1; seq 8–10 = ciclo 2 …
  v_ciclo := greatest((coalesce(p_sequencia, 2) - 2) / 3, 0);
  v_ciclo_dias := coalesce(
    nullif(p_dias_ciclo, 0),
    public.manual_dias_padrao_tipo('geral'),
    210
  );

  return p_data_compra + (v_ciclo * v_ciclo_dias) + v_dias;
end;
$$;

create or replace function public.manual_proprietario_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bike public.bicicletas%rowtype;
  v_data_compra date;
  v_cliente_nome text;
  v_primeiro text;
  v_empresa text;
  v_logo text;
  v_loja text;
  v_store_id uuid;
  v_regras jsonb;
  v_revisoes jsonb;
  v_proxima jsonb;
  v_manutencoes jsonb;
  v_hoje date;
  v_prazo_30 date;
  v_verif_atrasada boolean := false;
  v_dias_ciclo integer;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_bike
  from public.bicicletas
  where token_manual = trim(p_token);

  if not found then
    return null;
  end if;

  v_data_compra := case
    when v_bike.data_compra is not null
         and extract(year from v_bike.data_compra) >= 1990
      then v_bike.data_compra
    else null
  end;

  perform public.manual_garantir_quadro_bike(v_bike.id);

  select c.nome, s.name, c.store_id
  into v_cliente_nome, v_loja, v_store_id
  from public.clientes c
  left join public.stores s on s.id = c.store_id
  where c.id = v_bike.cliente_id;

  if v_store_id is null then
    select s.id into v_store_id
    from public.stores s
    where s.company_id = v_bike.company_id
    order by s.created_at
    limit 1;
  end if;

  select co.name, co.logo_url
  into v_empresa, v_logo
  from public.companies co
  where co.id = v_bike.company_id;

  v_primeiro := split_part(trim(coalesce(v_cliente_nome, '')), ' ', 1);

  select coalesce(jsonb_object_agg(x.tipo, x.obj), '{}'::jsonb)
  into v_regras
  from (
    select distinct on (public.manual_tipo_revisao_de_texto(r.titulo))
      public.manual_tipo_revisao_de_texto(r.titulo) as tipo,
      jsonb_build_object(
        'titulo', r.titulo,
        'descricao', nullif(trim(coalesce(r.descricao, '')), ''),
        'dias_apos_venda', r.dias_apos_venda
      ) as obj
    from public.pos_venda_regras r
    where r.company_id = v_bike.company_id
      and r.ativo = true
      and public.manual_tipo_revisao_de_texto(r.titulo) is not null
    order by
      public.manual_tipo_revisao_de_texto(r.titulo),
      case when v_store_id is not null and r.store_id = v_store_id then 0 else 1 end,
      r.ordem,
      r.dias_apos_venda
  ) x;

  v_hoje := (timezone('America/Sao_Paulo', now()))::date;
  v_dias_ciclo := coalesce((v_regras->'geral'->>'dias_apos_venda')::int, 210);
  v_prazo_30 := public.manual_prazo_revisao(
    v_data_compra,
    1,
    'verificacao_30',
    coalesce((v_regras->'verificacao_30'->>'dias_apos_venda')::int, 30),
    v_dias_ciclo
  );

  select coalesce(jsonb_agg(x.obj order by x.sequencia), '[]'::jsonb)
  into v_revisoes
  from (
    select
      r.sequencia,
      jsonb_build_object(
        'sequencia', r.sequencia,
        'tipo', r.tipo,
        'titulo', r.titulo,
        'status', r.status,
        'realizada_em', r.realizada_em,
        'loja_nome', r.loja_nome,
        'os_numero', r.os_numero,
        'atrasada', (
          r.status = 'pendente'
          and p.prazo is not null
          and v_hoje > p.prazo
        ),
        'prazo_em', case
          when p.prazo is not null then to_char(p.prazo, 'YYYY-MM-DD')
          else null
        end,
        'descricao', v_regras->r.tipo->>'descricao',
        'dias_apos_venda', coalesce(
          (v_regras->r.tipo->>'dias_apos_venda')::int,
          public.manual_dias_padrao_tipo(r.tipo)
        ),
        'regra_titulo', v_regras->r.tipo->>'titulo'
      ) as obj
    from public.bike_manual_revisoes r
    cross join lateral (
      select public.manual_prazo_revisao(
        v_data_compra,
        r.sequencia,
        r.tipo,
        coalesce(
          (v_regras->r.tipo->>'dias_apos_venda')::int,
          public.manual_dias_padrao_tipo(r.tipo)
        ),
        v_dias_ciclo
      ) as prazo
    ) p
    where r.bicicleta_id = v_bike.id
  ) x;

  v_verif_atrasada := exists (
    select 1
    from jsonb_array_elements(v_revisoes) j
    where j->>'tipo' = 'verificacao_30'
      and (j->>'sequencia')::int = 1
      and coalesce((j->>'atrasada')::boolean, false)
  );

  select jsonb_build_object(
    'sequencia', r.sequencia,
    'tipo', r.tipo,
    'titulo', r.titulo
  )
  into v_proxima
  from public.bike_manual_revisoes r
  where r.bicicleta_id = v_bike.id
    and r.status = 'pendente'
  order by r.sequencia
  limit 1;

  select coalesce(jsonb_agg(m.obj order by m.ordenacao desc), '[]'::jsonb)
  into v_manutencoes
  from (
    select
      coalesce(os.closed_at, os.updated_at, os.created_at) as ordenacao,
      jsonb_build_object(
        'os_numero', os.numero,
        'data', coalesce(os.closed_at, os.updated_at, os.created_at),
        'loja_nome', st.name,
        'problema', nullif(trim(coalesce(os.problema_relatado, '')), ''),
        'itens', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'tipo', oi.tipo,
              'descricao', oi.descricao,
              'quantidade', oi.quantidade
            ) order by oi.created_at
          ), '[]'::jsonb)
          from public.os_itens oi
          where oi.os_id = os.id
        )
      ) as obj
    from public.ordens_servico os
    left join public.stores st on st.id = os.store_id
    where os.bicicleta_id = v_bike.id
      and os.status = 'entregue'
  ) m;

  return jsonb_build_object(
    'bike', jsonb_build_object(
      'marca', v_bike.marca,
      'modelo', v_bike.modelo,
      'aro', v_bike.aro,
      'cor', v_bike.cor,
      'numero_serie', v_bike.numero_serie,
      'foto_url', v_bike.foto_url,
      'quilometragem', v_bike.quilometragem,
      'observacoes', v_bike.observacoes,
      'data_compra', v_data_compra,
      'comprada_na_loja', coalesce(v_bike.comprada_na_loja, true)
    ),
    'cliente_primeiro_nome', nullif(v_primeiro, ''),
    'empresa_nome', v_empresa,
    'empresa_logo_url', v_logo,
    'loja_nome', coalesce(v_loja, v_empresa),
    'revisoes', v_revisoes,
    'proxima', v_proxima,
    'manutencoes', v_manutencoes,
    'verificacao_30_atrasada', v_verif_atrasada,
    'prazo_verificacao_30', case
      when v_prazo_30 is not null then to_char(v_prazo_30, 'YYYY-MM-DD')
      else null
    end
  );
end;
$$;

grant execute on function public.manual_proprietario_por_token(text) to anon, authenticated;
