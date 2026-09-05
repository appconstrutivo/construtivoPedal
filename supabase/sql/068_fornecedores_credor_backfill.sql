-- Migra credores em texto livre (credor_nome) para fornecedores cadastrados.
-- Mantém credor_nome apenas como legado até todas as contas estarem vinculadas.

INSERT INTO fornecedores (company_id, store_id, nome)
SELECT DISTINCT cp.company_id, cp.store_id, trim(cp.credor_nome)
FROM financeiro_contas_pagar cp
WHERE cp.credor_nome IS NOT NULL
  AND trim(cp.credor_nome) <> ''
  AND cp.fornecedor_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fornecedores f
    WHERE f.company_id = cp.company_id
      AND f.store_id = cp.store_id
      AND lower(trim(f.nome)) = lower(trim(cp.credor_nome))
      AND f.ativo = true
  );

UPDATE financeiro_contas_pagar cp
SET
  fornecedor_id = f.id,
  credor_nome = NULL
FROM fornecedores f
WHERE cp.fornecedor_id IS NULL
  AND cp.credor_nome IS NOT NULL
  AND trim(cp.credor_nome) <> ''
  AND f.company_id = cp.company_id
  AND f.store_id = cp.store_id
  AND lower(trim(f.nome)) = lower(trim(cp.credor_nome))
  AND f.ativo = true;
