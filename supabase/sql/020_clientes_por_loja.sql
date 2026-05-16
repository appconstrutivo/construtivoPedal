-- Clientes vinculados à loja (multi-loja).
-- Execute após 007, 008 e 016.

alter table public.clientes
  add column if not exists store_id uuid references public.stores (id) on delete restrict;

-- Clientes existentes → loja "Matriz" (ou primeira loja ativa da empresa).
update public.clientes c
set store_id = coalesce(
  (
    select s.id
    from public.stores s
    where s.company_id = c.company_id
      and s.active = true
      and lower(trim(s.name)) = 'matriz'
    limit 1
  ),
  (
    select s.id
    from public.stores s
    where s.company_id = c.company_id
      and s.active = true
    order by s.name
    limit 1
  )
)
where c.store_id is null;

create index if not exists idx_clientes_company_store_nome
  on public.clientes (company_id, store_id, nome);

create index if not exists idx_clientes_company_store
  on public.clientes (company_id, store_id);
