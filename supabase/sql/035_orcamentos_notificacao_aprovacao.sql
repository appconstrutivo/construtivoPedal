-- Notificação: cliente aprovou orçamento pelo link público (não visto pela loja).

alter table public.orcamentos
  add column if not exists aprovado_cliente_em timestamptz,
  add column if not exists aprovacao_vista_em timestamptz;

comment on column public.orcamentos.aprovado_cliente_em is
  'Preenchido quando o cliente aprova via link público.';
comment on column public.orcamentos.aprovacao_vista_em is
  'Preenchido quando a loja abre/visualiza a aprovação no sistema.';

create index if not exists idx_orcamentos_aprovacao_pendente
  on public.orcamentos (company_id, store_id)
  where status = 'aprovado'
    and aprovado_cliente_em is not null
    and aprovacao_vista_em is null;

create or replace function public.orcamento_publico_responder(
  p_token text,
  p_aprovar boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc public.orcamentos%rowtype;
  v_novo_status text;
begin
  select * into v_orc
  from public.orcamentos
  where token_aprovacao = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Orçamento não encontrado.');
  end if;

  if v_orc.status <> 'enviado' then
    return jsonb_build_object('ok', false, 'erro', 'Este orçamento já foi respondido ou não está aguardando aprovação.');
  end if;

  if v_orc.valido_ate is not null and v_orc.valido_ate < current_date then
    update public.orcamentos set status = 'expirado', updated_at = timezone('utc', now()) where id = v_orc.id;
    perform public.orcamento_liberar_reservas(v_orc.id);
    return jsonb_build_object('ok', false, 'erro', 'Orçamento expirado.');
  end if;

  v_novo_status := case when p_aprovar then 'aprovado' else 'recusado' end;

  update public.orcamentos
  set
    status = v_novo_status,
    updated_at = timezone('utc', now()),
    aprovado_cliente_em = case when p_aprovar then timezone('utc', now()) else null end,
    aprovacao_vista_em = null
  where id = v_orc.id;

  if v_novo_status = 'recusado' then
    perform public.orcamento_liberar_reservas(v_orc.id);
  end if;

  return jsonb_build_object('ok', true, 'status', v_novo_status);
end;
$$;

create or replace function public.contar_orcamentos_aprovacao_nao_vista(
  p_company_id uuid,
  p_store_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.orcamentos o
  where o.company_id = p_company_id
    and o.store_id = p_store_id
    and o.status = 'aprovado'
    and o.aprovado_cliente_em is not null
    and o.aprovacao_vista_em is null
    and public.is_member_of_company(p_company_id);
$$;

grant execute on function public.contar_orcamentos_aprovacao_nao_vista(uuid, uuid) to authenticated;
