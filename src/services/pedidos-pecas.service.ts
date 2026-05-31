import { supabase } from '../lib/supabaseClient'

export type PedidoPecaStatus = 'pendente' | 'chegou' | 'entregue' | 'cancelado'

export type PedidoPecaRow = {
  id: string
  company_id: string
  store_id: string
  descricao: string
  estoque_item_id: string | null
  quantidade: number
  cliente_id: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  sinal_valor: number | null
  status: PedidoPecaStatus
  observacoes: string | null
  cliente_avisado: boolean
  chegou_em: string | null
  entregue_em: string | null
  created_at: string
  updated_at: string
}

export type PedidoPecaComRelacoes = PedidoPecaRow & {
  estoque_item?: { id: string; nome: string; sku: string } | null
  cliente?: { id: string; nome: string; fone: string | null } | null
}

export type CriarPedidoPecaPayload = {
  company_id: string
  store_id: string
  descricao: string
  estoque_item_id?: string | null
  quantidade?: number
  cliente_id?: string | null
  cliente_nome?: string | null
  cliente_telefone?: string | null
  sinal_valor?: number | null
  observacoes?: string | null
}

export type FiltroPedidosPecas = 'ativos' | 'pendente' | 'chegou' | 'com_cliente' | 'todos'

const SELECT_PEDIDO =
  '*, estoque_item:estoque_itens(id, nome, sku), cliente:clientes(id, nome, fone)'

export function pedidoTemCliente(p: PedidoPecaRow): boolean {
  return Boolean(p.cliente_id || (p.cliente_nome && p.cliente_nome.trim()))
}

export function nomeClientePedido(p: PedidoPecaComRelacoes): string | null {
  if (p.cliente?.nome) return p.cliente.nome
  if (p.cliente_nome?.trim()) return p.cliente_nome.trim()
  return null
}

export function telefoneClientePedido(p: PedidoPecaComRelacoes): string | null {
  if (p.cliente?.fone?.trim()) return p.cliente.fone.trim()
  if (p.cliente_telefone?.trim()) return p.cliente_telefone.trim()
  return null
}

export function labelStatusPedidoPeca(status: PedidoPecaStatus): string {
  const map: Record<PedidoPecaStatus, string> = {
    pendente: 'Aguardando',
    chegou: 'Chegou',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
  }
  return map[status] ?? status
}

/* ─── leitura ───────────────────────────────────────── */

export async function listarPedidosPecas(
  companyId: string,
  storeId: string,
  filtro: FiltroPedidosPecas = 'ativos',
): Promise<PedidoPecaComRelacoes[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('pedidos_pecas')
    .select(SELECT_PEDIDO)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (filtro === 'ativos') {
    query = query.in('status', ['pendente', 'chegou'])
  } else if (filtro === 'pendente') {
    query = query.eq('status', 'pendente')
  } else if (filtro === 'chegou') {
    query = query.eq('status', 'chegou')
  } else if (filtro === 'com_cliente') {
    query = query.in('status', ['pendente', 'chegou']).or('cliente_id.not.is.null,cliente_nome.not.is.null')
  }

  const { data, error } = await query
  if (error) throw new Error((error as { message: string }).message)
  return (data ?? []) as PedidoPecaComRelacoes[]
}

/** Itens que chegaram, têm cliente e ainda não foram avisados. */
export async function contarPedidosAguardandoAviso(
  companyId: string,
  storeId: string,
): Promise<number> {
  if (!storeId) return 0

  const { count, error } = await supabase
    .from('pedidos_pecas')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'chegou')
    .eq('cliente_avisado', false)
    .or('cliente_id.not.is.null,cliente_nome.not.is.null')

  if (error) throw new Error(error.message ?? 'Erro ao contar pedidos.')
  return count ?? 0
}

/* ─── escrita ───────────────────────────────────────── */

export async function criarPedidoPeca(payload: CriarPedidoPecaPayload): Promise<PedidoPecaRow> {
  const descricao = payload.descricao.trim()
  if (!descricao) throw new Error('Informe a descrição do produto.')

  const insert = {
    company_id: payload.company_id,
    store_id: payload.store_id,
    descricao,
    estoque_item_id: payload.estoque_item_id ?? null,
    quantidade: payload.quantidade ?? 1,
    cliente_id: payload.cliente_id ?? null,
    cliente_nome: payload.cliente_nome?.trim() || null,
    cliente_telefone: payload.cliente_telefone?.trim() || null,
    sinal_valor: payload.sinal_valor ?? null,
    observacoes: payload.observacoes?.trim() || null,
    status: 'pendente' as const,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pedidos_pecas')
    .insert(insert)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PedidoPecaRow
}

export async function marcarPedidoChegou(
  companyId: string,
  storeId: string,
  id: string,
): Promise<PedidoPecaRow> {
  const agora = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pedidos_pecas')
    .update({ status: 'chegou', chegou_em: agora })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'pendente')
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PedidoPecaRow
}

export async function desfazerPedidoChegou(
  companyId: string,
  storeId: string,
  id: string,
): Promise<PedidoPecaRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pedidos_pecas')
    .update({ status: 'pendente', chegou_em: null, cliente_avisado: false })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'chegou')
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PedidoPecaRow
}

export async function marcarClienteAvisado(
  companyId: string,
  storeId: string,
  id: string,
  avisado: boolean,
): Promise<PedidoPecaRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pedidos_pecas')
    .update({ cliente_avisado: avisado })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PedidoPecaRow
}

export async function marcarPedidoEntregue(
  companyId: string,
  storeId: string,
  id: string,
): Promise<PedidoPecaRow> {
  const agora = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pedidos_pecas')
    .update({ status: 'entregue', entregue_em: agora })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .in('status', ['pendente', 'chegou'])
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PedidoPecaRow
}

export async function cancelarPedidoPeca(
  companyId: string,
  storeId: string,
  id: string,
): Promise<PedidoPecaRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pedidos_pecas')
    .update({ status: 'cancelado' })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .in('status', ['pendente', 'chegou'])
    .select()
    .single()

  if (error) throw new Error((error as { message: string }).message)
  return data as PedidoPecaRow
}

export async function excluirPedidoPeca(
  companyId: string,
  storeId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('pedidos_pecas')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .in('status', ['entregue', 'cancelado'])

  if (error) throw new Error(error.message ?? 'Erro ao excluir pedido.')
}
