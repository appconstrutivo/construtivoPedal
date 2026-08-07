/** Valores comerciais (nota) vs operacionais (caixa) de uma venda. */

export type PagamentoValorRef = {
  valor: number
  valor_liquido?: number | null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Valor que entra no caixa / finanças (líquido). */
export function valorOperacionalPagamento(p: PagamentoValorRef): number {
  const liq = p.valor_liquido
  if (liq != null && Number.isFinite(Number(liq)) && Number(liq) > 0) {
    return Number(liq)
  }
  return Number(p.valor) || 0
}

/**
 * Total operacional da venda (o que o sistema deve exibir em relatórios,
 * financeiro e lançamentos). O valor cheio da nota fica em `venda.total`
 * e só deve aparecer no recibo.
 */
export function totalOperacionalVenda(
  totalNota: number,
  pagamentos?: PagamentoValorRef[] | null,
): number {
  if (pagamentos && pagamentos.length > 0) {
    return round2(pagamentos.reduce((acc, p) => acc + valorOperacionalPagamento(p), 0))
  }
  return Number(totalNota) || 0
}
