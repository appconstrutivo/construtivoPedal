-- Corrige exclusão de OS: o trigger que bloqueia DELETE de itens em OS faturada
-- também disparava no CASCADE ao excluir a própria OS. Nessa hora a OS já não
-- é visível na consulta → "Ordem de serviço inválida." e a exclusão falhava.
-- Solução: no DELETE de os_itens, se a OS pai não existe mais, permitir (cascade).

create or replace function public.trg_os_itens_bloquear_faturada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Cascata da exclusão da OS: a linha pai já não está visível.
    if not exists (
      select 1 from public.ordens_servico where id = old.os_id
    ) then
      return old;
    end if;

    perform public.os_itens_validar_edicao(old.os_id);
    return old;
  end if;

  -- INSERT
  perform public.os_itens_validar_edicao(new.os_id);
  return new;
end;
$$;
