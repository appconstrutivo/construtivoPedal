-- Tipo de item marcado como patrimônio da loja (ferramentas, equipamentos de uso interno):
-- seus itens não somam no valor do estoque nem nos alertas de reposição.
-- Execute após 080.

alter table public.estoque_tipos
  add column if not exists patrimonio boolean not null default false;
