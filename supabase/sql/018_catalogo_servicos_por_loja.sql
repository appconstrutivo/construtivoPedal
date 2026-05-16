-- Catálogo de serviços vinculado à loja (multi-loja).
-- Execute após 012 e 016.

alter table public.catalogo_servicos
  add column if not exists store_id uuid references public.stores (id) on delete set null;

-- Serviços existentes → loja "Matriz" (ou primeira loja ativa da empresa).
update public.catalogo_servicos cs
set store_id = coalesce(
  (
    select s.id
    from public.stores s
    where s.company_id = cs.company_id
      and s.active = true
      and lower(trim(s.name)) = 'matriz'
    limit 1
  ),
  (
    select s.id
    from public.stores s
    where s.company_id = cs.company_id
      and s.active = true
    order by s.name
    limit 1
  )
)
where cs.store_id is null;

alter table public.catalogo_servicos drop constraint if exists catalogo_servicos_nome_unique_per_company;

drop index if exists public.idx_catalogo_servicos_company_store_nome;
create unique index idx_catalogo_servicos_company_store_nome
  on public.catalogo_servicos (company_id, store_id, nome);

create index if not exists idx_catalogo_servicos_company_store_ativo
  on public.catalogo_servicos (company_id, store_id, ativo, ordem, nome);
