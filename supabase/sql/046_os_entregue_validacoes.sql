-- Impede marcar OS como "entregue" sem baixa de todas as peças vinculadas ao estoque.

create or replace function public.os_validar_status_entregue(p_os_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.os_itens i
     where i.os_id = p_os_id
       and i.tipo = 'peca'
       and i.estoque_item_id is not null
       and i.movimentacao_id is null
  ) then
    raise exception 'Dê baixa em todas as peças do estoque antes de marcar a OS como Entregue.';
  end if;
end;
$$;

grant execute on function public.os_validar_status_entregue(uuid) to authenticated;

create or replace function public.trg_ordens_servico_validar_entregue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'entregue' and coalesce(old.status, '') <> 'entregue' then
    perform public.os_validar_status_entregue(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordens_servico_validar_entregue on public.ordens_servico;
create trigger trg_ordens_servico_validar_entregue
  before update of status on public.ordens_servico
  for each row
  execute function public.trg_ordens_servico_validar_entregue();
