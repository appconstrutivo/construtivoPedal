-- SKU do fornecedor (planilha) separado do SKU interno sequencial da loja.
-- Execute após 022_estoque_item_descricao.sql.

alter table public.estoque_itens
  add column if not exists sku_fornecedor text;

create index if not exists idx_estoque_itens_sku_fornecedor
  on public.estoque_itens (company_id, store_id, fornecedor_id, sku_fornecedor)
  where sku_fornecedor is not null and ativo = true;

comment on column public.estoque_itens.sku_fornecedor is 'Código SKU do fornecedor (ex.: coluna SKU da planilha de pedido).';
