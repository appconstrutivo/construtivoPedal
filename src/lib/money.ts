/** Campos monetários em Real (BRL): digite apenas números; centavos são implícitos. */

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Exibe valor no input (ex.: 1327 → "1.327,00"). */
export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value) || value < 0) return ''
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Converte texto digitado em valor numérico (vazio = null). */
export function parseMoneyInput(s: string): number | null {
  const digits = s.replace(/\D/g, '')
  if (!digits) return null
  const cents = Number(digits)
  if (!Number.isFinite(cents)) return null
  return roundMoney(cents / 100)
}

/** Aplica máscara BRL enquanto o usuário digita. */
export function maskMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return formatMoneyInput(Number(digits) / 100)
}
