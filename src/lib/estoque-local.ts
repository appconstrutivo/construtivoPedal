const PRATELEIRA_MAX_LEN = 32

export function formatCodigoLocalEstoque(
  estante: number,
  prateleira: string,
  divisoria: number,
): string {
  const rotulo = prateleira.trim()
  const div = String(Math.trunc(divisoria)).padStart(2, '0')
  return `${Math.trunc(estante)}-${rotulo}-${div}`
}

export function formatNomeLocalEstoque(
  estante: number,
  prateleira: string,
  divisoria: number,
): string {
  const rotulo = prateleira.trim()
  return `Estante ${Math.trunc(estante)} · Prateleira ${rotulo} · Divisória ${Math.trunc(divisoria)}`
}

export function parseEstanteLocal(value: string): number {
  const n = Number(String(value).trim())
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : Number.NaN
}

export function parseDivisoriaLocal(value: string): number {
  return parseEstanteLocal(value)
}

export function parsePrateleiraLocal(value: string): string | null {
  const rotulo = value.trim()
  if (!rotulo || rotulo.length > PRATELEIRA_MAX_LEN) return null
  return rotulo
}

export function validarCamposLocalEstoque(
  estanteStr: string,
  prateleiraStr: string,
  divisoriaStr: string,
): { ok: true; estante: number; prateleira: string; divisoria: number } | { ok: false; erro: string } {
  const estante = parseEstanteLocal(estanteStr)
  if (!Number.isFinite(estante)) {
    return { ok: false, erro: 'Estante deve ser um número inteiro maior que zero.' }
  }

  const prateleira = parsePrateleiraLocal(prateleiraStr)
  if (!prateleira) {
    return {
      ok: false,
      erro: `Informe a prateleira (texto livre, até ${PRATELEIRA_MAX_LEN} caracteres).`,
    }
  }

  const divisoria = parseDivisoriaLocal(divisoriaStr)
  if (!Number.isFinite(divisoria)) {
    return { ok: false, erro: 'Divisória deve ser um número inteiro maior que zero.' }
  }

  return { ok: true, estante, prateleira, divisoria }
}
