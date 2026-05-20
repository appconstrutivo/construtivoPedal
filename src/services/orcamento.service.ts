import { supabase } from '../lib/supabaseClient'
import { adicionarOsItem, criarOrdemServico } from './oficina.service'
import type { TablesInsert, TablesUpdate } from '../lib/database.types'

export type StatusOrcamento =
  | 'rascunho'
  | 'enviado'
  | 'aprovado'
  | 'recusado'
  | 'expirado'
  | 'convertido'

/** Rótulo exibido quando o orçamento não tem cliente vinculado (igual ao PDV). */
export const ORCAMENTO_CLIENTE_BALCAO = 'Consumidor / balcão'

export function nomeClienteOrcamento(nome: string | null | undefined): string {
  return nome?.trim() || ORCAMENTO_CLIENTE_BALCAO
}

export type OrcamentoRow = {
  id: string
  company_id: string
  store_id: string
  numero: number
  cliente_id: string | null
  bicicleta_id: string | null
  status: StatusOrcamento
  resumo: string
  observacoes: string | null
  desconto: number
  valido_ate: string | null
  token_aprovacao: string | null
  convertido_os_id: string | null
  convertido_venda_id: string | null
  aprovado_cliente_em: string | null
  aprovacao_vista_em: string | null
  created_at: string
  updated_at: string
}

export function orcamentoAprovacaoNaoVista(
  row: Pick<OrcamentoRow, 'status' | 'aprovado_cliente_em' | 'aprovacao_vista_em'>,
): boolean {
  return (
    row.status === 'aprovado' &&
    row.aprovado_cliente_em != null &&
    row.aprovacao_vista_em == null
  )
}

export type OrcamentoItemRow = {
  id: string
  company_id: string
  orcamento_id: string
  tipo: 'peca' | 'servico'
  estoque_item_id: string | null
  servico_catalogo_id: string | null
  descricao: string
  quantidade: number
  preco_unitario: number
  created_at: string
}

export type OrcamentoLista = OrcamentoRow & {
  clienteNome: string
  bikeLabel: string | null
  totalItens: number
  subtotal: number
  aprovacaoNaoVista: boolean
}

export type OrcamentoDetalhe = OrcamentoRow & {
  clienteNome: string
  bikeLabel: string | null
  itens: OrcamentoItemRow[]
}

export type PdvPrefillItem = {
  estoqueItemId: string
  descricao: string
  quantidade: number
  precoUnitario: number
  imagemUrl: string | null
}

export const PDV_PREFILL_STORAGE_KEY = 'cp_pdv_prefill_cart_v1'

function bikeLabel(b: { marca: string; modelo: string } | null): string | null {
  if (!b) return null
  return `${b.marca} ${b.modelo}`.trim()
}

export function calcularSubtotalOrcamento(itens: Pick<OrcamentoItemRow, 'quantidade' | 'preco_unitario'>[]) {
  return itens.reduce((acc, i) => acc + Number(i.quantidade) * Number(i.preco_unitario), 0)
}

export function calcularTotalOrcamento(
  itens: Pick<OrcamentoItemRow, 'quantidade' | 'preco_unitario'>[],
  desconto: number,
) {
  return Math.max(calcularSubtotalOrcamento(itens) - Number(desconto || 0), 0)
}

export function labelStatusOrcamento(s: StatusOrcamento): string {
  const map: Record<StatusOrcamento, string> = {
    rascunho: 'Rascunho',
    enviado: 'Enviado',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
    expirado: 'Expirado',
    convertido: 'Convertido',
  }
  return map[s] ?? s
}

export function gerarTokenAprovacao(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  }
  return `orc${Date.now()}${Math.random().toString(36).slice(2, 12)}`
}

export function urlAprovacaoOrcamento(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return `${base}?orcamento=${encodeURIComponent(token)}`
}

export async function listarOrcamentos(
  companyId: string,
  storeId: string,
): Promise<OrcamentoLista[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('orcamento_expirar_vencidos', { p_company_id: companyId })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orcamentos')
    .select('*, clientes(nome), bicicletas(marca, modelo), orcamento_itens(quantidade, preco_unitario)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message ?? 'Erro ao carregar orçamentos.')

  type Raw = OrcamentoRow & {
    clientes?: { nome?: string | null } | null
    bicicletas?: { marca?: string; modelo?: string } | null
    orcamento_itens?: Array<{ quantidade: number; preco_unitario: number }>
  }

  return ((data ?? []) as Raw[]).map((row) => {
    const itens = row.orcamento_itens ?? []
    const subtotal = calcularSubtotalOrcamento(itens)
    const base = row as OrcamentoRow
    return {
      ...base,
      clienteNome: nomeClienteOrcamento(row.clientes?.nome),
      bikeLabel: bikeLabel(
        row.bicicletas
          ? { marca: row.bicicletas.marca ?? '', modelo: row.bicicletas.modelo ?? '' }
          : null,
      ),
      totalItens: itens.length,
      subtotal,
      aprovacaoNaoVista: orcamentoAprovacaoNaoVista(base),
    }
  })
}

export async function contarOrcamentosAprovacaoNaoVista(
  companyId: string,
  storeId: string,
): Promise<number> {
  if (!storeId) return 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('contar_orcamentos_aprovacao_nao_vista', {
    p_company_id: companyId,
    p_store_id: storeId,
  })
  if (error) throw new Error(error.message ?? 'Erro ao contar aprovações.')
  return Number(data ?? 0)
}

export async function marcarAprovacaoOrcamentoVista(orcamentoId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('orcamentos')
    .update({ aprovacao_vista_em: new Date().toISOString() })
    .eq('id', orcamentoId)
    .eq('status', 'aprovado')
    .not('aprovado_cliente_em', 'is', null)
    .is('aprovacao_vista_em', null)
  if (error) throw new Error(error.message ?? 'Erro ao marcar aprovação como vista.')
}

export async function listarOrcamentosPorCliente(
  companyId: string,
  clienteId: string,
  limit = 8,
): Promise<OrcamentoLista[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orcamentos')
    .select('*, clientes(nome), bicicletas(marca, modelo), orcamento_itens(quantidade, preco_unitario)')
    .eq('company_id', companyId)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message ?? 'Erro ao carregar orçamentos do cliente.')

  type Raw = OrcamentoRow & {
    clientes?: { nome?: string | null } | null
    bicicletas?: { marca?: string; modelo?: string } | null
    orcamento_itens?: Array<{ quantidade: number; preco_unitario: number }>
  }

  return ((data ?? []) as Raw[]).map((row) => {
    const itens = row.orcamento_itens ?? []
    const base = row as OrcamentoRow
    return {
      ...base,
      clienteNome: nomeClienteOrcamento(row.clientes?.nome),
      bikeLabel: bikeLabel(
        row.bicicletas
          ? { marca: row.bicicletas.marca ?? '', modelo: row.bicicletas.modelo ?? '' }
          : null,
      ),
      totalItens: itens.length,
      subtotal: calcularSubtotalOrcamento(itens),
      aprovacaoNaoVista: orcamentoAprovacaoNaoVista(base),
    }
  })
}

export async function carregarOrcamentoDetalhe(
  companyId: string,
  orcamentoId: string,
): Promise<OrcamentoDetalhe | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (supabase as any)
    .from('orcamentos')
    .select('*, clientes(nome), bicicletas(marca, modelo)')
    .eq('company_id', companyId)
    .eq('id', orcamentoId)
    .maybeSingle()

  if (error) throw new Error(error.message ?? 'Erro ao carregar orçamento.')
  if (!row) return null

  type Raw = OrcamentoRow & {
    clientes?: { nome?: string | null } | null
    bicicletas?: { marca?: string; modelo?: string } | null
  }
  const base = row as Raw
  const { clientes: _c, bicicletas: _b, ...orc } = base

  const { data: itens, error: itErr } = await supabase
    .from('orcamento_itens')
    .select('*')
    .eq('orcamento_id', orcamentoId)
    .order('created_at', { ascending: true })

  if (itErr) throw new Error(itErr.message)

  return {
    ...(orc as OrcamentoRow),
    clienteNome: nomeClienteOrcamento(base.clientes?.nome),
    bikeLabel: bikeLabel(
      base.bicicletas
        ? { marca: base.bicicletas.marca ?? '', modelo: base.bicicletas.modelo ?? '' }
        : null,
    ),
    itens: (itens ?? []) as OrcamentoItemRow[],
  }
}

export async function criarOrcamento(
  payload: TablesInsert<'orcamentos'> & {
    company_id: string
    store_id: string
    cliente_id?: string | null
  },
): Promise<OrcamentoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orcamentos')
    .insert({ ...payload, numero: 0 })
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao criar orçamento.')
  return data as OrcamentoRow
}

export async function atualizarOrcamento(
  id: string,
  payload: TablesUpdate<'orcamentos'>,
): Promise<OrcamentoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orcamentos')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao atualizar orçamento.')
  return data as OrcamentoRow
}

export async function excluirOrcamento(companyId: string, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('orcamento_liberar_reservas', { p_orcamento_id: id })
  const { error } = await supabase.from('orcamentos').delete().eq('id', id).eq('company_id', companyId)
  if (error) throw new Error(error.message ?? 'Erro ao excluir orçamento.')
}

export async function adicionarOrcamentoItem(
  payload: TablesInsert<'orcamento_itens'>,
): Promise<OrcamentoItemRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('orcamento_itens').insert(payload).select().single()
  if (error) throw new Error(error.message ?? 'Erro ao adicionar item.')
  return data as OrcamentoItemRow
}

export async function atualizarOrcamentoItem(
  id: string,
  payload: TablesUpdate<'orcamento_itens'>,
): Promise<OrcamentoItemRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orcamento_itens')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao atualizar item.')
  return data as OrcamentoItemRow
}

export async function excluirOrcamentoItem(id: string): Promise<void> {
  const { error } = await supabase.from('orcamento_itens').delete().eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao remover item.')
}

export async function enviarOrcamento(params: {
  orcamentoId: string
  validoAte?: string | null
  gerarToken?: boolean
}): Promise<OrcamentoRow> {
  const { orcamentoId, validoAte, gerarToken = true } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: resErr } = await (supabase as any).rpc('orcamento_reservar_estoque', {
    p_orcamento_id: orcamentoId,
  })
  if (resErr) throw new Error((resErr as { message?: string }).message ?? 'Erro ao reservar estoque.')

  const patch: TablesUpdate<'orcamentos'> = {
    status: 'enviado',
    valido_ate: validoAte ?? null,
  }
  if (gerarToken) {
    patch.token_aprovacao = gerarTokenAprovacao()
  }

  return atualizarOrcamento(orcamentoId, patch)
}

export async function marcarOrcamentoAprovado(orcamentoId: string): Promise<OrcamentoRow> {
  return atualizarOrcamento(orcamentoId, { status: 'aprovado' })
}

export async function marcarOrcamentoRecusado(orcamentoId: string): Promise<OrcamentoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('orcamento_liberar_reservas', { p_orcamento_id: orcamentoId })
  return atualizarOrcamento(orcamentoId, { status: 'recusado' })
}

export async function converterOrcamentoEmOs(params: {
  companyId: string
  storeId: string
  orcamentoId: string
  openedBy?: string | null
}): Promise<{ osId: string; numero: number }> {
  const det = await carregarOrcamentoDetalhe(params.companyId, params.orcamentoId)
  if (!det) throw new Error('Orçamento não encontrado.')
  if (det.status === 'convertido') throw new Error('Orçamento já foi convertido.')
  if (det.itens.length === 0) throw new Error('Adicione itens ao orçamento.')
  if (!det.cliente_id) {
    throw new Error('Vincule um cliente cadastrado antes de converter em ordem de serviço.')
  }

  const temServico = det.itens.some((i) => i.tipo === 'servico')
  if (!temServico && det.itens.every((i) => i.tipo === 'peca')) {
    throw new Error('Orçamento só com peças: use "Converter em venda (PDV)".')
  }

  const os = await criarOrdemServico({
    company_id: params.companyId,
    store_id: params.storeId,
    cliente_id: det.cliente_id,
    bicicleta_id: det.bicicleta_id,
    status: 'aberta',
    problema_relatado: det.resumo || 'Serviço conforme orçamento',
    diagnostico: det.observacoes,
    opened_by: params.openedBy ?? null,
  })

  for (const item of det.itens) {
    await adicionarOsItem({
      company_id: params.companyId,
      os_id: os.id,
      tipo: item.tipo,
      estoque_item_id: item.estoque_item_id,
      servico_catalogo_id: item.servico_catalogo_id,
      descricao: item.descricao,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('orcamento_liberar_reservas', { p_orcamento_id: params.orcamentoId })

  await atualizarOrcamento(params.orcamentoId, {
    status: 'convertido',
    convertido_os_id: os.id,
  })

  return { osId: os.id, numero: os.numero }
}

export function montarPrefillPdvDoOrcamento(
  det: OrcamentoDetalhe,
): { clienteId: string; bicicletaId: string; itens: PdvPrefillItem[]; desconto: number } | null {
  const pecas = det.itens.filter((i) => i.tipo === 'peca' && i.estoque_item_id)
  if (pecas.length === 0) return null

  return {
    clienteId: det.cliente_id ?? '',
    bicicletaId: det.bicicleta_id ?? '',
    desconto: Number(det.desconto) || 0,
    itens: pecas.map((i) => ({
      estoqueItemId: i.estoque_item_id!,
      descricao: i.descricao,
      quantidade: Number(i.quantidade),
      precoUnitario: Number(i.preco_unitario),
      imagemUrl: null,
    })),
  }
}

export function salvarPrefillPdv(prefill: {
  clienteId: string
  bicicletaId: string
  desconto: number
  itens: PdvPrefillItem[]
  orcamentoId?: string
}) {
  sessionStorage.setItem(PDV_PREFILL_STORAGE_KEY, JSON.stringify(prefill))
}

export function lerPrefillPdv(): {
  clienteId: string
  bicicletaId: string
  desconto: number
  itens: PdvPrefillItem[]
  orcamentoId?: string
} | null {
  const raw = sessionStorage.getItem(PDV_PREFILL_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ReturnType<typeof lerPrefillPdv>
  } catch {
    return null
  }
}

export function limparPrefillPdv() {
  sessionStorage.removeItem(PDV_PREFILL_STORAGE_KEY)
}

export async function converterOrcamentoEmPdvPrefill(
  companyId: string,
  orcamentoId: string,
): Promise<{ osId?: string }> {
  const det = await carregarOrcamentoDetalhe(companyId, orcamentoId)
  if (!det) throw new Error('Orçamento não encontrado.')
  if (det.status === 'convertido') throw new Error('Orçamento já foi convertido.')

  const prefill = montarPrefillPdvDoOrcamento(det)
  if (!prefill) throw new Error('Não há peças de estoque neste orçamento.')

  salvarPrefillPdv({ ...prefill, orcamentoId })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('orcamento_liberar_reservas', { p_orcamento_id: orcamentoId })

  await atualizarOrcamento(orcamentoId, { status: 'aprovado' })

  return {}
}

export async function finalizarConversaoPdv(orcamentoId: string, vendaId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('orcamento_liberar_reservas', { p_orcamento_id: orcamentoId })
  await atualizarOrcamento(orcamentoId, {
    status: 'convertido',
    convertido_venda_id: vendaId,
  })
  limparPrefillPdv()
}

export type OrcamentoPublico = {
  numero: number
  status: string
  resumo: string
  desconto: number
  valido_ate: string | null
  cliente_nome: string
  loja_nome: string
  itens: Array<{
    descricao: string
    quantidade: number
    preco_unitario: number
    tipo: string
  }>
  erro?: string
}

export async function carregarOrcamentoPublico(token: string): Promise<OrcamentoPublico | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('orcamento_publico_por_token', {
    p_token: token,
  })
  if (error) throw new Error(error.message ?? 'Erro ao carregar orçamento.')
  if (!data) return null
  const obj = data as OrcamentoPublico & { erro?: string }
  if (obj.erro) return obj
  return obj
}

export async function responderOrcamentoPublico(
  token: string,
  aprovar: boolean,
): Promise<{ ok: boolean; status?: string; erro?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('orcamento_publico_responder', {
    p_token: token,
    p_aprovar: aprovar,
  })
  if (error) throw new Error(error.message ?? 'Erro ao registrar resposta.')
  return data as { ok: boolean; status?: string; erro?: string }
}

export function montarTextoWhatsappOrcamento(det: OrcamentoDetalhe, companyName: string): string {
  const total = calcularTotalOrcamento(det.itens, det.desconto)
  const linhas = det.itens.map(
    (i) =>
      `• ${i.descricao} — ${Number(i.quantidade)} x ${Number(i.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
  )
  const validade =
    det.valido_ate &&
    new Intl.DateTimeFormat('pt-BR').format(new Date(`${det.valido_ate}T12:00:00`))
  let msg = `*Orçamento #${det.numero} — ${companyName}*\n\n`
  if (det.resumo) msg += `${det.resumo}\n\n`
  msg += linhas.join('\n')
  msg += `\n\n*Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*`
  if (Number(det.desconto) > 0) {
    msg += ` (desconto ${Number(det.desconto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
  }
  if (validade) msg += `\nVálido até: ${validade}`
  if (det.token_aprovacao) {
    msg += `\n\nAprovar online: ${urlAprovacaoOrcamento(det.token_aprovacao)}`
  }
  return msg
}
