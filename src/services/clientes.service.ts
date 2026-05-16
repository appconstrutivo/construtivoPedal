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

export async function listarClientes(companyId: string): Promise<ClienteComRelacoes[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('clientes')
    .select('*, bicicletas(*), atividades(*)')
    .eq('company_id', companyId)
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
