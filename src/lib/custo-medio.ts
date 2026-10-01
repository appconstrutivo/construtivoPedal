import { roundMoney } from './money'

/**
 * Custo médio ponderado móvel após uma entrada de compra.
 * Sem entrada (qtd ≤ 0) o custo vigente é mantido; saldo ou custo vigente zerado/negativo
 * não participa da média (evita puxar o custo para baixo com estoque sem custo).
 */
export function calcularCustoMedioPonderado(
  saldoAtual: number,
  custoAtual: number,
  qtdEntrada: number,
  custoEntrada: number,
): number {
  const saldo = Number(saldoAtual) || 0
  const custo = Number(custoAtual) || 0
  const qtd = Number(qtdEntrada) || 0
  const custoNovo = Number(custoEntrada) || 0

  if (qtd <= 0) return custo > 0 ? roundMoney(custo) : roundMoney(custoNovo)
  if (saldo <= 0 || custo <= 0) return roundMoney(custoNovo)

  return roundMoney((saldo * custo + qtd * custoNovo) / (saldo + qtd))
}
