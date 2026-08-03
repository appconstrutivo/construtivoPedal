-- Impede incluir/remover itens de OS faturada (CR pendente) ou recebida.
-- Para editar itens: cancelar faturamento/recebimento e voltar status da OS para "aberta".
-- UPDATE permanece liberado (ex.: baixa de estoque em movimentacao_id).

create or replace function public.os_itens_validar_edicao(p_os_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select os.status into v_status
    from public.ordens_servico os
   where os.id = p_os_id;

  if v_status is null then
    raise exception 'Ordem de serviço inválida.';
  end if;

  if v_status = 'cancelada' then
    raise exception 'Não é possível alterar itens de OS cancelada.';
  end if;

  if exists (
    select 1
      from public.financeiro_contas_receber cr
     where cr.os_id = p_os_id
       and cr.status in ('pendente', 'recebido')
  ) then
    raise exception
      'Não é possível alterar itens de OS faturada ou recebida. Cancele o faturamento/recebimento e altere o status para Aberta para editar os itens.';
  end if;
end;
$$;

grant execute on function public.os_itens_validar_edicao(uuid) to authenticated;

create or replace function public.trg_os_itens_bloquear_faturada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.os_itens_validar_edicao(old.os_id);
    return old;
  end if;

  -- INSERT
  perform public.os_itens_validar_edicao(new.os_id);
  return new;
end;
$$;

drop trigger if exists trg_os_itens_bloquear_faturada on public.os_itens;
create trigger trg_os_itens_bloquear_faturada
  before insert or delete on public.os_itens
  for each row
  execute function public.trg_os_itens_bloquear_faturada();
