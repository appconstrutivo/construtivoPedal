import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'

export type ClienteRow   = Tables<'clientes'>
export type BicicletaRow = Tables<'bicicletas'>
export type AtividadeRow = Tables<'atividades'>

export type ClienteComRelacoes = ClienteRow & {
  bicicletas: BicicletaRow[]
  atividades: AtividadeRow[]
  ultima_visita: string | null
}

/* ─── leitura ───────────────────────────────────────── */

export async function listarClientes(
  companyId: string,
  storeId: string,
): Promise<ClienteComRelacoes[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('clientes')
    .select('*, bicicletas(*), atividades(*)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('nome')

  if (error) throw new Error((error as { message: string }).message)

  type Raw = ClienteRow & { bicicletas: BicicletaRow[]; atividades: AtividadeRow[] }

  return ((data ?? []) as Raw[]).map((c) => {
    const datas = c.atividades.map((a) => a.data_registro).filter(Boolean)
    const ultima_visita = datas.length > 0 ? [...datas].sort().at(-1)! : null
    return { ...c, ultima_visita }
  })
}

/* ─── escrita ───────────────────────────────────────── */

export async function criarCliente(payload: TablesInsert<'clientes'>): Promise<ClienteRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('clientes')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as ClienteRow
}

export async function atualizarCliente(
  id: string,
  payload: TablesUpdate<'clientes'>,
): Promise<ClienteRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('clientes')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as ClienteRow
}

export async function criarBicicleta(payload: TablesInsert<'bicicletas'>): Promise<BicicletaRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('bicicletas')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as BicicletaRow
}

export async function atualizarBicicleta(
  id: string,
  payload: TablesUpdate<'bicicletas'>,
): Promise<BicicletaRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('bicicletas')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as BicicletaRow
}

export async function excluirBicicleta(id: string): Promise<void> {
  const { error } = await supabase.from('bicicletas').delete().eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao excluir bicicleta.')
}

export async function clienteTemOrdensServico(companyId: string, clienteId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('ordens_servico')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('cliente_id', clienteId)

  if (error) throw new Error(error.message ?? 'Erro ao verificar ordens de serviço.')
  return (count ?? 0) > 0
}

/** Remove cliente; bicicletas e atividades são excluídas em cascata no banco. */
export async function excluirCliente(companyId: string, clienteId: string): Promise<void> {
  const temOs = await clienteTemOrdensServico(companyId, clienteId)
  if (temOs) {
    throw new Error(
      'Este cliente possui ordens de serviço. Exclua ou transfira as OS antes de remover o cadastro.',
    )
  }

  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', clienteId)
    .eq('company_id', companyId)

  if (error) throw new Error(error.message ?? 'Erro ao excluir cliente.')
}

export async function criarAtividade(payload: TablesInsert<'atividades'>): Promise<AtividadeRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('atividades')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as AtividadeRow
}
