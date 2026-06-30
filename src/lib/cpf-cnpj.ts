export function somenteDigitosDoc(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function formatarCpfCnpj(valor: string | null | undefined): string | null {
  if (!valor?.trim()) return null
  const d = somenteDigitosDoc(valor)
  if (!d) return null

  if (d.length <= 11) {
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
  }

  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

export function validarCpfCnpj(valor: string): string | null {
  const d = somenteDigitosDoc(valor)
  if (!d) return null
  if (d.length !== 11 && d.length !== 14) {
    return 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.'
  }
  return null
}

export function formatarCep(valor: string | null | undefined): string | null {
  if (!valor?.trim()) return null
  const d = somenteDigitosDoc(valor).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}
