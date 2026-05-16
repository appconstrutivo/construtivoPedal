-- Descrição do item + imagem_url passa a aceitar URL externa (link).
-- Execute após 017_estoque_item_imagem.sql.

alter table public.estoque_itens
  add column if not exists descricao text;

comment on column public.estoque_itens.imagem_url is 'URL pública da foto do produto (https). Caminhos legados do Storage ainda são suportados.';
comment on column public.estoque_itens.descricao is 'Descrição comercial/técnica do item de estoque.';
