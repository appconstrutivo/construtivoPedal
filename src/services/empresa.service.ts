import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesUpdate } from '../lib/database.types'

export type EmpresaRow = Tables<'companies'>

export type EmpresaFormPayload = {
  name: string
  legal_name: string | null
  cnpj: string | null
  email: string | null
  phone: string | null
  address: string | null
  logo_url: string | null
}

export function somenteDigitosCnpj(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 14)
}

export function formatarCnpj(valor: string): string {
  const d = somenteDigitosCnpj(valor)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export async function obterEmpresa(companyId: string): Promise<EmpresaRow> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao carregar dados da empresa.')
  if (!data) throw new Error('Empresa não encontrada.')
  return data
}

export async function atualizarEmpresa(
  companyId: string,
  payload: EmpresaFormPayload,
): Promise<EmpresaRow> {
  const nome = payload.name.trim()
  if (!nome) throw new Error('Informe o nome da empresa.')

  const cnpjDigits = payload.cnpj ? somenteDigitosCnpj(payload.cnpj) : ''
  if (cnpjDigits && cnpjDigits.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos.')
  }

  const update: TablesUpdate<'companies'> = {
    name: nome,
    legal_name: payload.legal_name?.trim() || null,
    cnpj: cnpjDigits || null,
    email: payload.email?.trim() || null,
    phone: payload.phone?.trim() || null,
    address: payload.address?.trim() || null,
    logo_url: payload.logo_url?.trim() || null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('companies')
    .update(update)
    .eq('id', companyId)
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao salvar dados da empresa.')
  if (!data) throw new Error('Erro ao salvar dados da empresa.')
  return data
}
