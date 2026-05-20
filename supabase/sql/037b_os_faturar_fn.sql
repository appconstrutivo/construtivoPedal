create or replace function public.os_faturar(
  p_os_id uuid,
  p_vencimento date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_os public.ordens_servico%rowtype;
  v_total numeric(12,2) := 0;
  v_cr_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_os from public.ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if not public.is_member_of_company(v_os.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;

  if v_os.status = 'cancelada' then
    raise exception 'Não é possível faturar OS cancelada.';
  end if;

  if v_os.status not in ('pronta', 'entregue') then
    raise exception 'Fature a OS somente quando estiver Pronta ou Entregue.';
  end if;

  if exists (
    select 1 from public.financeiro_contas_receber cr
    where cr.os_id = p_os_id and cr.status in ('pendente', 'recebido')
  ) then
    raise exception 'Esta OS já possui faturamento ativo.';
  end if;

  select coalesce(sum(round(i.quantidade * i.preco_unitario, 2)), 0)
    into v_total
    from public.os_itens i
   where i.os_id = p_os_id;

  if v_total <= 0 then
    raise exception 'Adicione peças ou serviços antes de faturar.';
  end if;

  insert into public.financeiro_contas_receber (
    company_id, store_id, cliente_id, os_id, descricao, valor, vencimento, status
  )
  values (
    v_os.company_id,
    v_os.store_id,
    v_os.cliente_id,
    p_os_id,
    format('OS #%s — %s', v_os.numero, coalesce(
      (select c.nome from public.clientes c where c.id = v_os.cliente_id),
      'Cliente'
    )),
    v_total,
    coalesce(p_vencimento, current_date),
    'pendente'
  )
  returning id into v_cr_id;

  return v_cr_id;
end;
$$;

grant execute on function public.os_faturar(uuid, date) to authenticated;
