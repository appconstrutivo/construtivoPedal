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

/** Remove acentos para busca tolerante (ex.: "max" encontra "Máximo"). */
function normalizarTextoBusca(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function clienteCorrespondeBusca(
  cliente: Pick<ClienteRow, 'nome' | 'fone' | 'email' | 'cpf_cnpj'>,
  busca: string,
): boolean {
  const termos = busca
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true

  const nome = normalizarTextoBusca(cliente.nome)
  const foneRaw = (cliente.fone ?? '').toLowerCase()
  const foneDigits = normalizarTelefone(cliente.fone)
  const email = (cliente.email ?? '').toLowerCase()
  const docDigits = normalizarTelefone(cliente.cpf_cnpj)

  return termos.every((termo) => {
    const termoNorm = normalizarTextoBusca(termo)
    if (nome.includes(termoNorm)) return true
    if (foneRaw.includes(termo)) return true
    if (email.includes(termo)) return true

    const termoDigits = termo.replace(/\D/g, '')
    if (termoDigits.length >= 2) {
      if (foneDigits.includes(termoDigits)) return true
      if (docDigits.includes(termoDigits)) return true
    }

    return false
  })
}

export function rotuloCliente(cliente: Pick<ClienteRow, 'nome' | 'fone'>): string {
  const fone = cliente.fone?.trim()
  return fone ? `${cliente.nome} · ${fone}` : cliente.nome
}
