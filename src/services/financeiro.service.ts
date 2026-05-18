import { supabase } from '../lib/supabaseClient'

export type TipoContaFinanceira = 'caixa' | 'banco' | 'pix'
export type CategoriaContaPagar = 'fornecedor' | 'fixa' | 'imposto' | 'folha' | 'outro'
export type StatusContaPagar = 'pendente' | 'pago' | 'cancelado'
export type FiltroContaPagar = 'todas' | 'pendentes' | 'pagas' | 'vencidas' | 'canceladas'

export type ContaFinanceira = {
  id: string
  company_id: string
  store_id: string
  nome: string
  tipo: TipoContaFinanceira
  saldo_atual: number
  ativo: boolean
  created_at: string
}

export type ContaPagar = {
  id: string
  company_id: string
  store_id: string
  fornecedor_id: string | null
  descricao: string
  categoria: CategoriaContaPagar
  valor: number
  vencimento: string
  status: StatusContaPagar
  conta_financeira_id: string | null
  data_pagamento: string | null
  observacao: string | null
  created_at: string
  fornecedorNome?: string | null
}

export type MovimentacaoFinanceira = {
  id: string
  conta_id: string
  tipo: 'entrada' | 'saida'
  valor: number
  descricao: string
  origem: string
  created_at: string
}

export type ResumoContasPagar = {
  pendentes: number
  vencidas: number
  pagasMes: number
  totalPendente: number
}

const CATEGORIA_LABEL: Record<CategoriaContaPagar, string> = {
  fornecedor: 'Fornecedor',
  fixa: 'Despesa fixa',
  imposto: 'Imposto',
  folha: 'Folha',
  outro: 'Outro',
}

const TIPO_CONTA_LABEL: Record<TipoContaFinanceira, string> = {
  caixa: 'Caixa',
  banco: 'Banco',
  pix: 'PIX',
}

export function labelCategoriaContaPagar(c: CategoriaContaPagar) {
  return CATEGORIA_LABEL[c] ?? c
}

export function labelTipoConta(t: TipoContaFinanceira) {
  return TIPO_CONTA_LABEL[t] ?? t
}

export function labelStatusContaPagar(s: StatusContaPagar) {
  if (s === 'pendente') return 'Pendente'
  if (s === 'pago') return 'Pago'
  return 'Cancelado'
}

function isVencida(vencimento: string, status: StatusContaPagar) {
  if (status !== 'pendente') return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(`${vencimento}T12:00:00`)
  return venc < hoje
}

export async function garantirContaCaixa(companyId: string, storeId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('financeiro_garantir_conta_caixa', {
    p_company_id: companyId,
    p_store_id: storeId,
  })
  if (error) throw new Error(error.message ?? 'Erro ao preparar caixa da loja.')
  return data as string
}

export async function listarContasFinanceiras(
  companyId: string,
  storeId: string,
): Promise<ContaFinanceira[]> {
  if (!storeId) return []

  await garantirContaCaixa(companyId, storeId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas')
    .select('*')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('ativo', true)
    .order('tipo')
    .order('nome')

  if (error) throw new Error(error.message ?? 'Erro ao carregar contas.')

  return ((data ?? []) as ContaFinanceira[]).map((c) => ({
    ...c,
    saldo_atual: Number(c.saldo_atual),
  }))
}

export async function criarContaFinanceira(params: {
  companyId: string
  storeId: string
  nome: string
  tipo: TipoContaFinanceira
  saldoInicial?: number
}): Promise<ContaFinanceira> {
  const saldo = params.saldoInicial ?? 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas')
    .insert({
      company_id: params.companyId,
      store_id: params.storeId,
      nome: params.nome.trim(),
      tipo: params.tipo,
      saldo_atual: 0,
    })
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao criar conta.')

  const conta = { ...(data as ContaFinanceira), saldo_atual: Number(data.saldo_atual) }

  if (saldo > 0) {
    await registrarMovimentacao({
      companyId: params.companyId,
      storeId: params.storeId,
      contaId: conta.id,
      tipo: 'entrada',
      valor: saldo,
      descricao: 'Saldo inicial',
    })
  }

  return conta
}

export async function registrarMovimentacao(params: {
  companyId: string
  storeId: string
  contaId: string
  tipo: 'entrada' | 'saida'
  valor: number
  descricao: string
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('financeiro_registrar_movimentacao', {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_conta_id: params.contaId,
    p_tipo: params.tipo,
    p_valor: params.valor,
    p_descricao: params.descricao,
  })
  if (error) throw new Error(error.message ?? 'Erro ao registrar movimentação.')
}

export async function listarMovimentacoesConta(
  companyId: string,
  storeId: string,
  contaId: string,
  limit = 30,
): Promise<MovimentacaoFinanceira[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_movimentacoes')
    .select('id, conta_id, tipo, valor, descricao, origem, created_at')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('conta_id', contaId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message ?? 'Erro ao carregar movimentações.')

  return ((data ?? []) as MovimentacaoFinanceira[]).map((m) => ({
    ...m,
    valor: Number(m.valor),
  }))
}

export async function listarContasPagar(
  companyId: string,
  storeId: string,
  filtro: FiltroContaPagar = 'todas',
): Promise<ContaPagar[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('financeiro_contas_pagar')
    .select('*, fornecedores(nome)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('vencimento', { ascending: true })
    .order('created_at', { ascending: false })

  if (filtro === 'pendentes') q = q.eq('status', 'pendente')
  if (filtro === 'pagas') q = q.eq('status', 'pago')
  if (filtro === 'canceladas') q = q.eq('status', 'cancelado')

  const { data, error } = await q
  if (error) throw new Error(error.message ?? 'Erro ao carregar contas a pagar.')

  type Raw = ContaPagar & { fornecedores?: { nome?: string | null } | null }

  let lista = ((data ?? []) as Raw[]).map((row) => ({
    ...row,
    valor: Number(row.valor),
    fornecedorNome: row.fornecedores?.nome ?? null,
  }))

  if (filtro === 'vencidas') {
    lista = lista.filter((c) => isVencida(c.vencimento, c.status))
  }

  return lista
}

export async function obterResumoContasPagar(
  companyId: string,
  storeId: string,
): Promise<ResumoContasPagar> {
  const todas = await listarContasPagar(companyId, storeId, 'todas')
  const pendentes = todas.filter((c) => c.status === 'pendente')
  const vencidas = pendentes.filter((c) => isVencida(c.vencimento, c.status))

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const pagasMes = todas.filter((c) => {
    if (c.status !== 'pago' || !c.data_pagamento) return false
    return new Date(`${c.data_pagamento}T12:00:00`) >= inicioMes
  })

  return {
    pendentes: pendentes.length,
    vencidas: vencidas.length,
    pagasMes: pagasMes.length,
    totalPendente: pendentes.reduce((acc, c) => acc + c.valor, 0),
  }
}

export async function criarContaPagar(params: {
  companyId: string
  storeId: string
  descricao: string
  categoria: CategoriaContaPagar
  valor: number
  vencimento: string
  fornecedorId?: string | null
  observacao?: string
}): Promise<ContaPagar> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .insert({
      company_id: params.companyId,
      store_id: params.storeId,
      descricao: params.descricao.trim(),
      categoria: params.categoria,
      valor: params.valor,
      vencimento: params.vencimento,
      fornecedor_id: params.fornecedorId || null,
      observacao: params.observacao?.trim() || null,
      status: 'pendente',
    })
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao criar conta a pagar.')
  return { ...(data as ContaPagar), valor: Number(data.valor) }
}

export async function registrarPagamentoContaPagar(params: {
  companyId: string
  storeId: string
  contaPagarId: string
  contaFinanceiraId: string
  dataPagamento?: string
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('financeiro_registrar_pagamento', {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_conta_pagar_id: params.contaPagarId,
    p_conta_financeira_id: params.contaFinanceiraId,
    p_data_pagamento: params.dataPagamento ?? null,
  })
  if (error) throw new Error(error.message ?? 'Erro ao registrar pagamento.')
}

export async function cancelarContaPagar(
  companyId: string,
  storeId: string,
  contaPagarId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .update({ status: 'cancelado' })
    .eq('id', contaPagarId)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'pendente')

  if (error) throw new Error(error.message ?? 'Erro ao cancelar conta.')
}

export { isVencida }
