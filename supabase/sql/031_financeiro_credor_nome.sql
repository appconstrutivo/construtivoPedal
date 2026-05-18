-- Credor livre para despesas que não são fornecedor de estoque (luz, aluguel, etc.).

alter table public.financeiro_contas_pagar
  add column if not exists credor_nome text;

comment on column public.financeiro_contas_pagar.credor_nome is
  'Nome do credor quando não vinculado ao cadastro de fornecedores do estoque (ex.: concessionária, proprietário).';

comment on column public.financeiro_contas_pagar.fornecedor_id is
  'Opcional. Apenas fornecedores de insumos/peças cadastrados no estoque.';
