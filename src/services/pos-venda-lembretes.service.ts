import { supabase } from '../lib/supabaseClient'

export type PosVendaRegraRow = {
  id: string
  company_id: string
  store_id: string
  categoria_produto: 'peca' | 'bike' | 'acessorio'
  dias_apos_venda: number
  titulo: string
  descricao: string | null
  ativo: boolean
  ordem: number
  created_at: string
  updated_at: string
}

export type PosVendaLembreteStatus = 'pendente' | 'concluido' | 'dispensado' | 'cancelado'

export type PosVendaLembreteRow = {
  id: string
  company_id: string
  store_id: string
  regra_id: string | null
  venda_id: string
  venda_item_id: string | null
  cliente_id: string
  produto_descricao: string
  titulo: string
  data_venda: string
  data_prevista: string
  status: PosVendaLembreteStatus
  concluido_em: string | null
  concluido_por: string | null
  observacao: string | null
  created_at: string
  updated_at: string
}

export type PosVendaLembreteComRelacoes = PosVendaLembreteRow & {
  cliente?: { id: string; nome: string; fone: string | null } | null
  venda?: { id: string; numero: number } | null
}

export type CriarPosVendaRegraPayload = {
  company_id: string
  store_id: string
  categoria_produto?: 'bike'
  dias_apos_venda: number
  titulo: string
  descricao?: string | null
  ativo?: boolean
  ordem?: number
}

const SELECT_LEMBRETE =
  '*, cliente:clientes(id, nome, fone), venda:vendas(id, numero)'

export async function listarPosVendaRegras(
  companyId: string,
  storeId: string,
): Promise<PosVendaRegraRow[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pos_venda_regras')
    .select('*')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('ordem')
    .order('dias_apos_venda')

  if (error) throw new Error((error as { message: string }).message)
  return (data ?? []) as PosVendaRegraRow[]
}

export async function criarPosVendaRegra(
  payload: CriarPosVendaRegraPayload,
): Promise<PosVendaRegraRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pos_venda_regras')
    .insert({
      ...payload,
      categoria_produto: payload.categoria_produto ?? 'bike',
      ativo: payload.ativo ?? true,
      ordem: payload.ordem ?? 0,
    })
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PosVendaRegraRow
}

export async function atualizarPosVendaRegra(
  id: string,
  patch: Partial<
    Pick<PosVendaRegraRow, 'dias_apos_venda' | 'titulo' | 'descricao' | 'ativo' | 'ordem'>
  >,
): Promise<PosVendaRegraRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pos_venda_regras')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PosVendaRegraRow
}

export async function excluirPosVendaRegra(id: string): Promise<void> {
  const { error } = await supabase.from('pos_venda_regras').delete().eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao excluir regra.')
}

export async function listarPosVendaLembretes(
  companyId: string,
  storeId: string,
  opts?: { status?: PosVendaLembreteStatus | 'ativos'; clienteId?: string },
): Promise<PosVendaLembreteComRelacoes[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('pos_venda_lembretes')
    .select(SELECT_LEMBRETE)
    .eq('company_id', companyId)
    .eq('store_id', storeId)

  if (opts?.clienteId) q = q.eq('cliente_id', opts.clienteId)

  if (opts?.status === 'ativos') {
    q = q.in('status', ['pendente'])
  } else if (opts?.status) {
    q = q.eq('status', opts.status)
  }

  const { data, error } = await q.order('data_prevista').order('created_at')

  if (error) throw new Error((error as { message: string }).message)
  return (data ?? []) as PosVendaLembreteComRelacoes[]
}

export async function listarPosVendaLembretesVencidos(
  companyId: string,
  storeId: string,
): Promise<PosVendaLembreteComRelacoes[]> {
  if (!storeId) return []

  const hoje = new Date().toISOString().slice(0, 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pos_venda_lembretes')
    .select(SELECT_LEMBRETE)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'pendente')
    .lte('data_prevista', hoje)
    .order('data_prevista')
    .order('created_at')

  if (error) throw new Error((error as { message: string }).message)
  return (data ?? []) as PosVendaLembreteComRelacoes[]
}

export async function contarPosVendaLembretesPendentes(
  companyId: string,
  storeId: string,
): Promise<number> {
  if (!storeId) return 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('contar_pos_venda_lembretes_pendentes', {
    p_company_id: companyId,
    p_store_id: storeId,
  })

  if (error) throw new Error((error as { message: string }).message)
  return Number(data ?? 0)
}

export async function concluirPosVendaLembrete(
  id: string,
  observacao?: string | null,
): Promise<PosVendaLembreteRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pos_venda_lembretes')
    .update({
      status: 'concluido',
      concluido_em: new Date().toISOString(),
      observacao: observacao?.trim() || null,
    })
    .eq('id', id)
    .eq('status', 'pendente')
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PosVendaLembreteRow
}

export async function dispensarPosVendaLembrete(
  id: string,
  observacao?: string | null,
): Promise<PosVendaLembreteRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pos_venda_lembretes')
    .update({
      status: 'dispensado',
      concluido_em: new Date().toISOString(),
      observacao: observacao?.trim() || null,
    })
    .eq('id', id)
    .eq('status', 'pendente')
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PosVendaLembreteRow
}

export async function backfillPosVendaLembretes(
  companyId: string,
  storeId: string,
): Promise<number> {
  if (!storeId) return 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('pos_venda_backfill_lembretes', {
    p_company_id: companyId,
    p_store_id: storeId,
  })

  if (error) throw new Error((error as { message: string }).message)
  return Number(data ?? 0)
}

export function diasAteLembrete(dataPrevista: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const prev = new Date(`${dataPrevista}T12:00:00`)
  return Math.round((prev.getTime() - hoje.getTime()) / 86_400_000)
}

export function labelUrgenciaLembrete(dataPrevista: string): string {
  const dias = diasAteLembrete(dataPrevista)
  if (dias < 0) return `${Math.abs(dias)} dia(s) atrasado`
  if (dias === 0) return 'Hoje'
  if (dias === 1) return 'Amanhã'
  return `Em ${dias} dias`
}
