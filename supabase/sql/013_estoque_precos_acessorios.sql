-- Preços de venda (varejo/atacado), categoria "acessorio" (antes "componente").
-- Execute após 010.

alter table public.estoque_itens
  add column if not exists preco_varejo numeric(12, 2) not null default 0,
  add column if not exists preco_atacado numeric(12, 2) not null default 0;

alter table public.estoque_itens drop constraint if exists estoque_itens_categoria_check;

update public.estoque_itens
set categoria = 'acessorio'
where categoria = 'componente';

alter table public.estoque_itens
  add constraint estoque_itens_categoria_check
  check (categoria in ('peca', 'bike', 'acessorio'));

alter table public.estoque_itens drop constraint if exists estoque_itens_preco_varejo_non_negative;
alter table public.estoque_itens
  add constraint estoque_itens_preco_varejo_non_negative check (preco_varejo >= 0);

alter table public.estoque_itens drop constraint if exists estoque_itens_preco_atacado_non_negative;
alter table public.estoque_itens
  add constraint estoque_itens_preco_atacado_non_negative check (preco_atacado >= 0);
