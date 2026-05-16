import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'

export type CatalogoServicoRow = Tables<'catalogo_servicos'>

export async function listarCatalogoServicos(
  companyId: string,
  opts?: { somenteAtivos?: boolean; storeId?: string },
): Promise<CatalogoServicoRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('catalogo_servicos')
    .select('*')
    .eq('company_id', companyId)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (opts?.storeId) {
    q = q.eq('store_id', opts.storeId)
  }

  if (opts?.somenteAtivos) {
    q = q.eq('ativo', true)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message ?? 'Erro ao carregar catálogo de serviços.')
  return (data ?? []) as CatalogoServicoRow[]
}

export async function criarCatalogoServico(
  payload: TablesInsert<'catalogo_servicos'>,
): Promise<CatalogoServicoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('catalogo_servicos')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao criar serviço no catálogo.')
  return data as CatalogoServicoRow
}

export async function atualizarCatalogoServico(
  id: string,
  payload: TablesUpdate<'catalogo_servicos'>,
): Promise<CatalogoServicoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('catalogo_servicos')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao atualizar serviço.')
  return data as CatalogoServicoRow
}

export async function excluirCatalogoServico(id: string): Promise<void> {
  const { error } = await supabase.from('catalogo_servicos').delete().eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao excluir serviço.')
}
