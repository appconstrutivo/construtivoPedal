import { formatarCep, somenteDigitosDoc } from './cpf-cnpj'

export type EnderecoViaCep = {
  cep: string
  logradouro: string
  bairro: string
  municipio: string
  uf: string
}

type ViaCepResponse = {
  erro?: boolean
  cep?: string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
}

export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoViaCep | null> {
  const digits = somenteDigitosDoc(cep)
  if (digits.length !== 8) return null

  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  if (!res.ok) throw new Error('Erro ao consultar CEP.')

  const data = (await res.json()) as ViaCepResponse
  if (data.erro) return null

  return {
    cep: formatarCep(digits) ?? digits,
    logradouro: data.logradouro?.trim() ?? '',
    bairro: data.bairro?.trim() ?? '',
    municipio: data.localidade?.trim() ?? '',
    uf: data.uf?.trim().toUpperCase() ?? '',
  }
}
