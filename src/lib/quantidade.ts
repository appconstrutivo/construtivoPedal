/** Quantidades operacionais são sempre inteiras (unidades completas). */

export const MSG_QUANTIDADE_INTEIRA = 'Quantidade deve ser um número inteiro (sem decimais).'

export function ehQuantidadeInteira(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n)
}

export function ehQuantidadeInteiraPositiva(n: number): boolean {
  return ehQuantidadeInteira(n) && n > 0
}

export function ehQuantidadeInteiraNaoNegativa(n: number): boolean {
  return ehQuantidadeInteira(n) && n >= 0
}

export function parseQuantidadeInteira(
  texto: string,
  opcoes?: { permitirNegativo?: boolean },
): number {
  const s = String(texto).trim().replace(',', '.')
  if (!s) return Number.NaN
  const n = Number(s)
  if (!ehQuantidadeInteira(n)) return Number.NaN
  if (!opcoes?.permitirNegativo && n < 0) return Number.NaN
  return n
}

export function filtrarInputQuantidadeInteira(valor: string, permitirNegativo = false): string {
  if (permitirNegativo) {
    const neg = valor.startsWith('-')
    const digits = valor.replace(/[^\d]/g, '')
    if (!digits) return neg ? '-' : ''
    return neg ? `-${digits}` : digits
  }
  return valor.replace(/[^\d]/g, '')
}

export function formatQuantidadeInteira(v: number): string {
  const n = Number.isFinite(v) ? Math.trunc(v) : 0
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)
}
