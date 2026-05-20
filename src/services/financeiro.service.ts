import { supabase } from '../lib/supabaseClient'
import type { FormaPagamento, PagamentoVendaInput } from './pdv.service'

export type TipoContaFinanceira = 'caixa' | 'banco' | 'pix'
export type CategoriaContaPagar = 'fornecedor' | 'fixa' | 'imposto' | 'folha' | 'outro'
export type StatusContaPagar = 'pendente' | 'pago' | 'cancelado'
export type FiltroContaPagar = 'todas' | 'pendentes' | 'pagas' | 'vencidas' | 'canceladas'
export type FrequenciaRecorrencia = 'mensal' | 'trimestral' | 'anual'

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
  credor_nome: string | null
  descricao: string
  categoria: CategoriaContaPagar
  valor: number
  vencimento: string
  status: StatusContaPagar
  conta_financeira_id: string | null
  data_pagamento: string | null
  observacao: string | null
  grupo_recorrencia_id: string | null
  parcela: number | null
  parcelas_total: number | null
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
  realizada_em: string
  created_at: string
}

export type ResumoContasPagar = {
  pendentes: number
  vencidas: number
  pagasMes: number
  totalPendente: number
}

export type StatusContaReceber = 'pendente' | 'recebido' | 'cancelado'
export type FiltroContaReceber = 'todas' | 'pendentes' | 'recebidas' | 'vencidas' | 'canceladas'

export type ContaReceber = {
  id: string
  company_id: string
  store_id: string
  cliente_id: string | null
  os_id: string | null
  venda_id: string | null
  descricao: string
  valor: number
  vencimento: string
  status: StatusContaReceber
  forma_pagamento: FormaPagamento | 'misto' | null
  conta_financeira_id: string | null
  data_recebimento: string | null
  created_at: string
  clienteNome?: string | null
  osNumero?: number | null
  vendaNumero?: number | null
}

export type ResumoContasReceber = {
  pendentes: number
  vencidas: number
  recebidasMes: number
  totalPendente: number
  recebidoMesOs: number
}

const CATEGORIA_LABEL: Record<CategoriaContaPagar, string> = {
  fornecedor: 'Compra de insumos/peças',
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

export function labelStatusContaReceber(s: StatusContaReceber) {
  if (s === 'pendente') return 'A receber'
  if (s === 'recebido') return 'Recebido'
  return 'Cancelado'
}

const FORMA_RECEBIMENTO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Crédito',
  debito: 'Débito',
  outro: 'Outro',
  misto: 'Misto',
}

export function labelFormaRecebimento(f: FormaPagamento | 'misto' | null | undefined) {
  if (!f) return '—'
  return FORMA_RECEBIMENTO_LABEL[f] ?? f
}

/** Nome exibido do credor: estoque (peças) ou texto livre (luz, aluguel…). */
export function nomeCredorContaPagar(cp: Pick<ContaPagar, 'fornecedorNome' | 'credor_nome'>) {
  if (cp.fornecedorNome?.trim()) return cp.fornecedorNome.trim()
  if (cp.credor_nome?.trim()) return cp.credor_nome.trim()
  return null
}

/** Data local no formato YYYY-MM-DD (comparável com coluna `date` do banco). */
export function dataLocalISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isVencendoHoje(vencimento: string, status: StatusContaPagar): boolean {
  return status === 'pendente' && vencimento === dataLocalISO()
}

function isVencida(vencimento: string, status: StatusContaPagar) {
  if (status !== 'pendente') return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(`${vencimento}T12:00:00`)
  return venc < hoje
}

/** Contas pendentes com vencimento na data de hoje (badge do menu Financeiro). */
export async function contarContasPagarVencendoHoje(
  companyId: string,
  storeId: string,
): Promise<number> {
  if (!storeId) return 0

  const hoje = dataLocalISO()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'pendente')
    .eq('vencimento', hoje)

  if (error) throw new Error(error.message ?? 'Erro ao contar contas a pagar.')

  return count ?? 0
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
    .select('id, conta_id, tipo, valor, descricao, origem, realizada_em, created_at')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('conta_id', contaId)
    .order('realizada_em', { ascending: false })
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

export type CriarContaPagarInput = {
  companyId: string
  storeId: string
  descricao: string
  categoria: CategoriaContaPagar
  valor: number
  vencimento: string
  credorNome?: string | null
  fornecedorId?: string | null
  observacao?: string
  recorrencia?: {
    frequencia: FrequenciaRecorrencia
    parcelas: number
  }
}

const FREQUENCIA_MESES: Record<FrequenciaRecorrencia, number> = {
  mensal: 1,
  trimestral: 3,
  anual: 12,
}

const FREQUENCIA_LABEL: Record<FrequenciaRecorrencia, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
}

export function labelFrequenciaRecorrencia(f: FrequenciaRecorrencia) {
  return FREQUENCIA_LABEL[f]
}

/** Gera datas de vencimento (YYYY-MM-DD) para despesa recorrente. */
export function gerarVencimentosRecorrentes(
  primeiroVencimento: string,
  frequencia: FrequenciaRecorrencia,
  parcelas: number,
): string[] {
  const partes = primeiroVencimento.split('-').map(Number)
  if (partes.length !== 3 || parcelas < 1) return []

  const [ano0, mes0, dia0] = partes
  const salto = FREQUENCIA_MESES[frequencia]
  const datas: string[] = []

  for (let i = 0; i < parcelas; i++) {
    const mesAbs = mes0 - 1 + i * salto
    const ano = ano0 + Math.floor(mesAbs / 12)
    const mes = (mesAbs % 12) + 1
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dia = Math.min(dia0, ultimoDia)
    const m = String(mes).padStart(2, '0')
    const d = String(dia).padStart(2, '0')
    datas.push(`${ano}-${m}-${d}`)
  }

  return datas
}

function montarLinhaContaPagar(
  params: CriarContaPagarInput,
  vencimento: string,
  opts?: { grupoId: string; parcela: number; parcelasTotal: number },
) {
  const usaFornecedorEstoque = params.categoria === 'fornecedor'
  const total = opts?.parcelasTotal ?? 1
  const num = opts?.parcela ?? 1
  const descBase = params.descricao.trim()
  const descricao = total > 1 ? `${descBase} (${num}/${total})` : descBase

  return {
    company_id: params.companyId,
    store_id: params.storeId,
    descricao,
    categoria: params.categoria,
    valor: params.valor,
    vencimento,
    credor_nome: usaFornecedorEstoque ? null : params.credorNome?.trim() || null,
    fornecedor_id: usaFornecedorEstoque ? params.fornecedorId || null : null,
    observacao: params.observacao?.trim() || null,
    status: 'pendente' as const,
    grupo_recorrencia_id: opts?.grupoId ?? null,
    parcela: total > 1 ? num : null,
    parcelas_total: total > 1 ? total : null,
  }
}

export async function criarContaPagar(params: CriarContaPagarInput): Promise<ContaPagar> {
  const rec = params.recorrencia
  const parcelas = rec?.parcelas ?? 1

  if (rec && parcelas > 1) {
    const criadas = await criarContasPagarRecorrentes(params)
    return criadas[0]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .insert(montarLinhaContaPagar(params, params.vencimento))
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao criar conta a pagar.')
  return { ...(data as ContaPagar), valor: Number(data.valor) }
}

export async function criarContasPagarRecorrentes(params: CriarContaPagarInput): Promise<ContaPagar[]> {
  const rec = params.recorrencia
  if (!rec || rec.parcelas < 2) {
    const uma = await criarContaPagar({ ...params, recorrencia: undefined })
    return [uma]
  }

  if (rec.parcelas > 36) {
    throw new Error('Máximo de 36 parcelas por lançamento recorrente.')
  }

  const vencimentos = gerarVencimentosRecorrentes(params.vencimento, rec.frequencia, rec.parcelas)
  if (vencimentos.length === 0) {
    throw new Error('Não foi possível gerar as datas de vencimento.')
  }

  const grupoId = crypto.randomUUID()
  const linhas = vencimentos.map((venc, i) =>
    montarLinhaContaPagar(params, venc, {
      grupoId,
      parcela: i + 1,
      parcelasTotal: vencimentos.length,
    }),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .insert(linhas)
    .select()

  if (error) throw new Error(error.message ?? 'Erro ao criar parcelas recorrentes.')

  return ((data ?? []) as ContaPagar[]).map((row) => ({
    ...row,
    valor: Number(row.valor),
  }))
}

/** Cancela parcelas pendentes futuras do mesmo grupo (mantém a atual e as já pagas). */
export async function cancelarParcelasRecorrentesFuturas(
  companyId: string,
  storeId: string,
  contaPagarId: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ref, error: refErr } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .select('grupo_recorrencia_id, parcela, vencimento')
    .eq('id', contaPagarId)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (refErr) throw new Error(refErr.message ?? 'Erro ao localizar parcela.')
  if (!ref?.grupo_recorrencia_id) {
    throw new Error('Esta despesa não faz parte de uma série recorrente.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas_pagar')
    .update({ status: 'cancelado' })
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('grupo_recorrencia_id', ref.grupo_recorrencia_id)
    .eq('status', 'pendente')
    .gt('parcela', ref.parcela)
    .select('id')

  if (error) throw new Error(error.message ?? 'Erro ao cancelar parcelas futuras.')
  return (data ?? []).length
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

export async function obterContaReceberPorOs(
  companyId: string,
  osId: string,
): Promise<ContaReceber | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('financeiro_contas_receber')
    .select('*, clientes(nome), ordens_servico(numero), vendas(numero)')
    .eq('company_id', companyId)
    .eq('os_id', osId)
    .neq('status', 'cancelado')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message ?? 'Erro ao carregar faturamento da OS.')

  if (!data) return null

  type Raw = ContaReceber & {
    clientes?: { nome?: string | null } | null
    ordens_servico?: { numero?: number } | null
    vendas?: { numero?: number } | null
  }
  const row = data as Raw
  return {
    ...row,
    valor: Number(row.valor),
    clienteNome: row.clientes?.nome ?? null,
    osNumero: row.ordens_servico?.numero ?? null,
    vendaNumero: row.vendas?.numero ?? null,
  }
}

export async function listarContasReceber(
  companyId: string,
  storeId: string,
  filtro: FiltroContaReceber = 'pendentes',
): Promise<ContaReceber[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('financeiro_contas_receber')
    .select('*, clientes(nome), ordens_servico(numero), vendas(numero)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('vencimento', { ascending: true })
    .order('created_at', { ascending: false })

  if (filtro === 'pendentes') q = q.eq('status', 'pendente')
  if (filtro === 'recebidas') q = q.eq('status', 'recebido')
  if (filtro === 'canceladas') q = q.eq('status', 'cancelado')

  const { data, error } = await q
  if (error) throw new Error(error.message ?? 'Erro ao carregar contas a receber.')

  type Raw = ContaReceber & {
    clientes?: { nome?: string | null } | null
    ordens_servico?: { numero?: number } | null
    vendas?: { numero?: number } | null
  }

  let lista = ((data ?? []) as Raw[]).map((row) => ({
    ...row,
    valor: Number(row.valor),
    clienteNome: row.clientes?.nome ?? null,
    osNumero: row.ordens_servico?.numero ?? null,
    vendaNumero: row.vendas?.numero ?? null,
  }))

  if (filtro === 'vencidas') {
    lista = lista.filter((c) => isVencida(c.vencimento, c.status === 'pendente' ? 'pendente' : 'pago'))
  }

  return lista
}

export async function obterResumoContasReceber(
  companyId: string,
  storeId: string,
): Promise<ResumoContasReceber> {
  const todas = await listarContasReceber(companyId, storeId, 'todas')
  const pendentes = todas.filter((c) => c.status === 'pendente')
  const vencidas = pendentes.filter((c) => isVencida(c.vencimento, 'pendente'))

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const recebidasMes = todas.filter((c) => {
    if (c.status !== 'recebido' || !c.data_recebimento) return false
    return new Date(`${c.data_recebimento}T12:00:00`) >= inicioMes
  })

  const recebidoMesOs = recebidasMes
    .filter((c) => c.os_id)
    .reduce((acc, c) => acc + c.valor, 0)

  return {
    pendentes: pendentes.length,
    vencidas: vencidas.length,
    recebidasMes: recebidasMes.length,
    totalPendente: pendentes.reduce((acc, c) => acc + c.valor, 0),
    recebidoMesOs,
  }
}

export async function faturarOs(osId: string, vencimento: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('os_faturar', {
    p_os_id: osId,
    p_vencimento: vencimento,
  })
  if (error) throw new Error(error.message ?? 'Erro ao faturar OS.')
  return data as string
}

export async function registrarRecebimentoConta(params: {
  contaReceberId: string
  contaFinanceiraId: string
  formaPagamento?: FormaPagamento
  pagamentos?: PagamentoVendaInput[]
  dataRecebimento?: string
}): Promise<{ vendaId: string | null; vendaNumero: number | null }> {
  const pagamentosJson =
    params.pagamentos && params.pagamentos.length > 0
      ? params.pagamentos.map((p) => ({ forma: p.forma, valor: p.valor }))
      : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('financeiro_registrar_recebimento', {
    p_conta_receber_id: params.contaReceberId,
    p_conta_financeira_id: params.contaFinanceiraId,
    p_forma_pagamento: pagamentosJson ? null : (params.formaPagamento ?? 'dinheiro'),
    p_data_recebimento: params.dataRecebimento ?? null,
    p_pagamentos: pagamentosJson,
  })
  if (error) throw new Error(error.message ?? 'Erro ao registrar recebimento.')

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { vendaId: null, vendaNumero: null }
  return {
    vendaId: row.venda_id ?? null,
    vendaNumero: row.venda_numero != null ? Number(row.venda_numero) : null,
  }
}

export async function cancelarContaReceber(contaReceberId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('financeiro_cancelar_conta_receber', {
    p_conta_receber_id: contaReceberId,
  })
  if (error) throw new Error(error.message ?? 'Erro ao cancelar faturamento.')
}

export { isVencida }
