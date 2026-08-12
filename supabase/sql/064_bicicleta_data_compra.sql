-- Data de compra e origem da bike (loja vs externa) — Manual do Proprietário.

alter table public.bicicletas
  add column if not exists data_compra date;

alter table public.bicicletas
  add column if not exists comprada_na_loja boolean not null default true;

comment on column public.bicicletas.data_compra is
  'Data de aquisição da bike (venda na loja ou informada no cadastro).';
comment on column public.bicicletas.comprada_na_loja is
  'true = adquirida nesta empresa; false = trazida de fora (manual destaca isso).';

-- Backfill: bikes já vinculadas a vendas
update public.bicicletas b
set
  data_compra = coalesce(
    b.data_compra,
    (timezone('America/Sao_Paulo', v.realizada_em))::date,
    (timezone('America/Sao_Paulo', v.created_at))::date
  ),
  comprada_na_loja = true
from (
  select distinct on (bicicleta_id)
    bicicleta_id,
    realizada_em,
    created_at
  from public.vendas
  where bicicleta_id is not null
  order by bicicleta_id, coalesce(realizada_em, created_at) asc
) v
where v.bicicleta_id = b.id
  and b.data_compra is null;

create or replace function public.manual_proprietario_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bike public.bicicletas%rowtype;
  v_cliente_nome text;
  v_primeiro text;
  v_empresa text;
  v_logo text;
  v_loja text;
  v_revisoes jsonb;
  v_proxima jsonb;
  v_manutencoes jsonb;
  v_hoje date;
  v_prazo_30 date;
  v_verif_atrasada boolean := false;
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

  perform public.manual_garantir_quadro_bike(v_bike.id);

  select c.nome, s.name
  into v_cliente_nome, v_loja
  from public.clientes c
  left join public.stores s on s.id = c.store_id
  where c.id = v_bike.cliente_id;

  select co.name, co.logo_url
  into v_empresa, v_logo
  from public.companies co
  where co.id = v_bike.company_id;

  v_primeiro := split_part(trim(coalesce(v_cliente_nome, '')), ' ', 1);

  v_hoje := (timezone('America/Sao_Paulo', now()))::date;
  if v_bike.data_compra is not null then
    v_prazo_30 := v_bike.data_compra + 30;
    if exists (
      select 1
      from public.bike_manual_revisoes r
      where r.bicicleta_id = v_bike.id
        and r.tipo = 'verificacao_30'
        and r.status = 'pendente'
        and r.sequencia = 1
    ) and v_hoje > v_prazo_30 then
      v_verif_atrasada := true;
    end if;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sequencia', r.sequencia,
      'tipo', r.tipo,
      'titulo', r.titulo,
      'status', r.status,
      'realizada_em', r.realizada_em,
      'loja_nome', r.loja_nome,
      'os_numero', r.os_numero,
      'atrasada', (
        r.tipo = 'verificacao_30'
        and r.sequencia = 1
        and r.status = 'pendente'
        and v_verif_atrasada
      ),
      'prazo_em', case
        when r.tipo = 'verificacao_30' and r.sequencia = 1 and v_bike.data_compra is not null
          then to_char(v_bike.data_compra + 30, 'YYYY-MM-DD')
        else null
      end
    ) order by r.sequencia
  ), '[]'::jsonb)
  into v_revisoes
  from public.bike_manual_revisoes r
  where r.bicicleta_id = v_bike.id;

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
      'data_compra', v_bike.data_compra,
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
      when v_bike.data_compra is not null then to_char(v_bike.data_compra + 30, 'YYYY-MM-DD')
      else null
    end
  );
end;
$$;

grant execute on function public.manual_proprietario_por_token(text) to anon, authenticated;
