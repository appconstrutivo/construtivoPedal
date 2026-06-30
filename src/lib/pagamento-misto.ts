import { formatMoneyInput, parseMoneyInput, roundMoney } from './money'
import type { FormaPagamento, PagamentoVendaInput } from '../services/pdv.service'

export type PagamentoLinha = {
  id: string
  forma: FormaPagamento
  /** Valor pago pelo cliente (bruto). */
  valorStr: string
  /** Valor que entra na conta, após taxas — opcional para formas não-dinheiro. */
  valorLiquidoStr?: string
}

export const FORMAS_PAGAMENTO_MISTO: FormaPagamento[] = ['pix', 'dinheiro', 'credito', 'debito']

export function pagamentoAceitaValorLiquido(forma: FormaPagamento): boolean {
  return forma !== 'dinheiro'
}

export function novaLinhaPagamento(forma: FormaPagamento = 'pix'): PagamentoLinha {
  return { id: crypto.randomUUID(), forma, valorStr: '' }
}

export function resolverValorLiquido(linha: PagamentoLinha, valorBruto: number): number {
  if (!pagamentoAceitaValorLiquido(linha.forma)) return valorBruto
  const liq = parseMoneyInput(linha.valorLiquidoStr ?? '')
  if (liq == null || liq <= 0) return valorBruto
  return Math.min(roundMoney(liq), valorBruto)
}

export function linhasPagamentoParaEnvio(linhas: PagamentoLinha[]): PagamentoVendaInput[] {
  return linhas
    .map((p) => {
      const valor = parseMoneyInput(p.valorStr) ?? 0
      if (valor <= 0) return null
      const valorLiquido = resolverValorLiquido(p, valor)
      const item: PagamentoVendaInput = { forma: p.forma, valor }
      if (pagamentoAceitaValorLiquido(p.forma) && valorLiquido < valor) {
        item.valor_liquido = valorLiquido
      }
      return item
    })
    .filter((p): p is PagamentoVendaInput => p !== null)
}

export function validarPagamentoMisto(total: number, linhas: PagamentoLinha[]) {
  const parsed = linhasPagamentoParaEnvio(linhas)
  const soma = roundMoney(parsed.reduce((acc, p) => acc + p.valor, 0))
  const restante = roundMoney(total - soma)
  const okBruto = total > 0 && parsed.length > 0 && Math.abs(restante) < 0.01

  const errosLiquido: string[] = []
  for (const linha of linhas) {
    const bruto = parseMoneyInput(linha.valorStr) ?? 0
    if (bruto <= 0) continue
    if (!pagamentoAceitaValorLiquido(linha.forma)) continue
    const liqStr = linha.valorLiquidoStr?.trim()
    if (!liqStr) continue
    const liq = parseMoneyInput(liqStr)
    if (liq == null || liq <= 0) {
      errosLiquido.push('Informe um valor líquido válido ou deixe em branco para usar o valor pago.')
      break
    }
    if (liq > bruto) {
      errosLiquido.push('O valor líquido não pode ser maior que o valor pago pelo cliente.')
      break
    }
  }

  const ok = okBruto && errosLiquido.length === 0
  return {
    ok,
    soma,
    restante,
    parsed,
    erroLiquido: errosLiquido[0] ?? null,
  }
}

export function preencherRestanteLinha(
  linhas: PagamentoLinha[],
  linhaId: string,
  total: number,
): PagamentoLinha[] {
  const outros = linhas
    .filter((p) => p.id !== linhaId)
    .reduce((acc, p) => acc + (parseMoneyInput(p.valorStr) ?? 0), 0)
  const falta = Math.max(roundMoney(total - outros), 0)
  return linhas.map((p) =>
    p.id === linhaId ? { ...p, valorStr: falta > 0 ? formatMoneyInput(falta) : '' } : p,
  )
}

export function adicionarLinhaPagamento(linhas: PagamentoLinha[]): PagamentoLinha[] {
  const usadas = new Set(linhas.map((p) => p.forma))
  const proxima = FORMAS_PAGAMENTO_MISTO.find((f) => !usadas.has(f)) ?? 'pix'
  return [...linhas, novaLinhaPagamento(proxima)]
}

export function removerLinhaPagamento(linhas: PagamentoLinha[], id: string): PagamentoLinha[] {
  if (linhas.length <= 1) return linhas
  return linhas.filter((p) => p.id !== id)
}
