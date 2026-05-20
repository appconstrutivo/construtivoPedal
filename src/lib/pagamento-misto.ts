import { formatMoneyInput, parseMoneyInput, roundMoney } from './money'
import type { FormaPagamento, PagamentoVendaInput } from '../services/pdv.service'

export type PagamentoLinha = {
  id: string
  forma: FormaPagamento
  valorStr: string
}

export const FORMAS_PAGAMENTO_MISTO: FormaPagamento[] = ['pix', 'dinheiro', 'credito', 'debito']

export function novaLinhaPagamento(forma: FormaPagamento = 'pix'): PagamentoLinha {
  return { id: crypto.randomUUID(), forma, valorStr: '' }
}

export function linhasPagamentoParaEnvio(linhas: PagamentoLinha[]): PagamentoVendaInput[] {
  return linhas
    .map((p) => ({ forma: p.forma, valor: parseMoneyInput(p.valorStr) ?? 0 }))
    .filter((p) => p.valor > 0)
}

export function validarPagamentoMisto(total: number, linhas: PagamentoLinha[]) {
  const parsed = linhasPagamentoParaEnvio(linhas)
  const soma = roundMoney(parsed.reduce((acc, p) => acc + p.valor, 0))
  const restante = roundMoney(total - soma)
  const ok = total > 0 && parsed.length > 0 && Math.abs(restante) < 0.01
  return { ok, soma, restante, parsed }
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
