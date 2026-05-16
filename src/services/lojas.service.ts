import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert } from '../lib/database.types'

export type StoreRow = Tables<'stores'>

export async function listarLojas(companyId: string): Promise<StoreRow[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message ?? 'Erro ao carregar lojas.')
  return data ?? []
}

export async function criarLoja(payload: TablesInsert<'stores'>): Promise<StoreRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('stores').insert(payload).select().single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe uma loja com este nome nesta empresa.')
    }
    throw new Error(error.message ?? 'Erro ao cadastrar loja.')
  }
  if (!data) throw new Error('Erro ao cadastrar loja.')
  return data
}
