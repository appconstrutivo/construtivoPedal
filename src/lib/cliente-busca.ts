import type { ClienteRow } from '../services/clientes.service'

export const CLIENTE_BALCAO_LABEL = 'Consumidor / balcão'

/** Mantém só dígitos para comparar telefones com ou sem máscara. */
export function normalizarTelefone(fone: string | null | undefined): string {
  return (fone ?? '').replace(/\D/g, '')
}

export function balcaoCorrespondeBusca(busca: string): boolean {
  const q = busca.trim().toLowerCase()
  if (!q) return true
  const termos = q.split(/\s+/).filter(Boolean)
  const alvo = CLIENTE_BALCAO_LABEL.toLowerCase()
  return termos.every((t) => alvo.includes(t) || t.includes('balc') || t.includes('consum'))
}

export function clienteCorrespondeBusca(cliente: Pick<ClienteRow, 'nome' | 'fone'>, busca: string): boolean {
  const termos = busca
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true

  const nome = cliente.nome.toLowerCase()
  const foneRaw = (cliente.fone ?? '').toLowerCase()
  const foneDigits = normalizarTelefone(cliente.fone)

  return termos.every((termo) => {
    if (nome.includes(termo)) return true
    if (foneRaw.includes(termo)) return true

    const termoDigits = termo.replace(/\D/g, '')
    if (termoDigits.length >= 2 && foneDigits.includes(termoDigits)) return true

    return false
  })
}

export function rotuloCliente(cliente: Pick<ClienteRow, 'nome' | 'fone'>): string {
  const fone = cliente.fone?.trim()
  return fone ? `${cliente.nome} · ${fone}` : cliente.nome
}
