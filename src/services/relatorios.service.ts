import { supabase } from '../lib/supabaseClient'
import { obterResumoEstoqueLoja, listarItensEstoque } from './estoque.service'
import type { FormaPagamento } from './pdv.service'

export type PeriodoRelatorio = 'hoje' | '7d' | '30d' | 'mes'

export type IntervaloRelatorio = {
  desde: string
  ate: string
  label: string
}

const FORMAS_PAGAMENTO: FormaPagamento[] = ['dinheiro', 'pix', 'credito', 'debito', 'outro']

const FORMA_LABEL: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Crédito',
  debito: 'Débito',
  outro: 'Outro',
}

const STATUS_OS_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_aprovacao: 'Aguardando',
  pronta: 'Pronta',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
}

export function intervaloPeriodo(preset: PeriodoRelatorio): IntervaloRelatorio {
  const ate = new Date()
  const desde = new Date()

  switch (preset) {
    case 'hoje':
      desde.setHours(0, 0, 0, 0)
      return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Hoje' }
    case '7d':
      desde.setDate(desde.getDate() - 6)
      desde.setHours(0, 0, 0, 0)
      return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Últimos 7 dias' }
    case '30d':
      desde.setDate(desde.getDate() - 29)
      desde.setHours(0, 0, 0, 0)
      return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Últimos 30 dias' }
    case 'mes':
      desde.setDate(1)
      desde.setHours(0, 0, 0, 0)
      return {
        desde: desde.toISOString(),
        ate: ate.toISOString(),
        label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(ate),
      }
  }
}

export type RelatorioVendas = {
  quantidade: number
  faturamento: number
  faturamentoBalcao: number
  faturamentoOficina: number
  quantidadeBalcao: number
  quantidadeOficina: number
  ticketMedio: number
  descontos: number
  porFormaPagamento: Array<{ forma: FormaPagamento; label: string; quantidade: number; total: number }>
  topProdutos: Array<{ descricao: string; quantidade: number; faturamento: number }>
}

export type RelatorioOficina = {
  porStatus: Array<{ status: string; label: string; quantidade: number }>
  abertasAgora: number
  criadasNoPeriodo: number
  entreguesNoPeriodo: number
  canceladasNoPeriodo: number
  recebidasNoPeriodo: number
  faturamentoItensCriadas: number
  faturamentoRecebido: number
}

export type RelatorioEstoque = {
  totalSkus: number
  criticos: number
  reposicao: number
  valorEstoque: number
  entradas: number
  saidas: number
  itensCriticos: Array<{ nome: string; saldo: number; minimo: number; sku: string | null }>
}

export type RelatorioClientes = {
  total: number
  novosNoPeriodo: number
  comBicicleta: number
  inativos90d: number
}

export type RelatorioConsolidado = {
  vendas: RelatorioVendas
  oficina: RelatorioOficina
  estoque: RelatorioEstoque
  clientes: RelatorioClientes
}

function statusSaldoItem(saldo: number, minimo: number): 'critico' | 'reposicao' | 'saudavel' {
  if (saldo <= minimo * 0.5) return 'critico'
  if (saldo <= minimo) return 'reposicao'
  return 'saudavel'
}

export async function obterRelatorioVendas(
  companyId: string,
  storeId: string,
  intervalo: IntervaloRelatorio,
): Promise<RelatorioVendas> {
  const vazio: RelatorioVendas = {
    quantidade: 0,
    faturamento: 0,
    faturamentoBalcao: 0,
    faturamentoOficina: 0,
    quantidadeBalcao: 0,
    quantidadeOficina: 0,
    ticketMedio: 0,
    descontos: 0,
    porFormaPagamento: FORMAS_PAGAMENTO.map((forma) => ({
      forma,
      label: FORMA_LABEL[forma],
      quantidade: 0,
      total: 0,
    })),
    topProdutos: [],
  }
  if (!storeId) return vazio

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vendas, error } = await (supabase as any)
    .from('vendas')
    .select('id, total, desconto, forma_pagamento, os_id')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'finalizada')
    .gte('realizada_em', intervalo.desde)
    .lte('realizada_em', intervalo.ate)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar vendas.')

  type VendaRaw = {
    id: string
    total: number
    desconto: number
    forma_pagamento: string
    os_id: string | null
  }
  const rows = (vendas ?? []) as VendaRaw[]

  const porForma = new Map<FormaPagamento, { quantidade: number; total: number }>()
  for (const f of FORMAS_PAGAMENTO) porForma.set(f, { quantidade: 0, total: 0 })

  const vendaIds = rows.map((r) => r.id)
  const pagamentosPorVenda = new Map<string, Array<{ forma_pagamento: string; valor: number }>>()

  if (vendaIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pagRows, error: pagErr } = await (supabase as any)
      .from('venda_pagamentos')
      .select('venda_id, forma_pagamento, valor')
      .eq('company_id', companyId)
      .in('venda_id', vendaIds)

    if (pagErr) {
      throw new Error((pagErr as { message?: string }).message ?? 'Erro ao carregar pagamentos.')
    }

    for (const p of (pagRows ?? []) as Array<{
      venda_id: string
      forma_pagamento: string
      valor: number
    }>) {
      const list = pagamentosPorVenda.get(p.venda_id) ?? []
      list.push({ forma_pagamento: p.forma_pagamento, valor: Number(p.valor) })
      pagamentosPorVenda.set(p.venda_id, list)
    }
  }

  let faturamento = 0
  let faturamentoBalcao = 0
  let faturamentoOficina = 0
  let quantidadeBalcao = 0
  let quantidadeOficina = 0
  let descontos = 0
  for (const v of rows) {
    const total = Number(v.total)
    faturamento += total
    descontos += Number(v.desconto)
    if (v.os_id) {
      faturamentoOficina += total
      quantidadeOficina += 1
    } else {
      faturamentoBalcao += total
      quantidadeBalcao += 1
    }

    const pagamentos = pagamentosPorVenda.get(v.id)
    if (pagamentos && pagamentos.length > 0) {
      for (const p of pagamentos) {
        const forma = (FORMAS_PAGAMENTO.includes(p.forma_pagamento as FormaPagamento)
          ? p.forma_pagamento
          : 'outro') as FormaPagamento
        const agg = porForma.get(forma)!
        agg.quantidade += 1
        agg.total += Number(p.valor)
      }
    } else {
      const forma = (FORMAS_PAGAMENTO.includes(v.forma_pagamento as FormaPagamento)
        ? v.forma_pagamento === 'misto'
          ? 'outro'
          : v.forma_pagamento
        : 'outro') as FormaPagamento
      const agg = porForma.get(forma)!
      agg.quantidade += 1
      agg.total += total
    }
  }

  const topMap = new Map<string, { quantidade: number; faturamento: number }>()

  if (vendaIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: itens, error: itensErr } = await (supabase as any)
      .from('venda_itens')
      .select('descricao, quantidade, preco_unitario')
      .eq('company_id', companyId)
      .in('venda_id', vendaIds)

    if (itensErr) throw new Error((itensErr as { message?: string }).message ?? 'Erro ao carregar itens.')

    for (const item of (itens ?? []) as Array<{
      descricao: string
      quantidade: number
      preco_unitario: number
    }>) {
      const key = item.descricao.trim() || 'Item'
      const qtd = Number(item.quantidade)
      const linha = round2(qtd * Number(item.preco_unitario))
      const prev = topMap.get(key) ?? { quantidade: 0, faturamento: 0 }
      topMap.set(key, {
        quantidade: prev.quantidade + qtd,
        faturamento: prev.faturamento + linha,
      })
    }
  }

  const quantidade = rows.length
  return {
    quantidade,
    faturamento,
    faturamentoBalcao: round2(faturamentoBalcao),
    faturamentoOficina: round2(faturamentoOficina),
    quantidadeBalcao,
    quantidadeOficina,
    ticketMedio: quantidade > 0 ? round2(faturamento / quantidade) : 0,
    descontos,
    porFormaPagamento: FORMAS_PAGAMENTO.map((forma) => {
      const agg = porForma.get(forma)!
      return { forma, label: FORMA_LABEL[forma], ...agg }
    }),
    topProdutos: [...topMap.entries()]
      .map(([descricao, v]) => ({ descricao, ...v }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 8),
  }
}

export async function obterRelatorioOficina(
  companyId: string,
  storeId: string,
  intervalo: IntervaloRelatorio,
): Promise<RelatorioOficina> {
  const vazio: RelatorioOficina = {
    porStatus: [],
    abertasAgora: 0,
    criadasNoPeriodo: 0,
    entreguesNoPeriodo: 0,
    canceladasNoPeriodo: 0,
    recebidasNoPeriodo: 0,
    faturamentoItensCriadas: 0,
    faturamentoRecebido: 0,
  }
  if (!storeId) return vazio

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todas, error } = await (supabase as any)
    .from('ordens_servico')
    .select('id, status, created_at, closed_at, updated_at')
    .eq('company_id', companyId)
    .eq('store_id', storeId)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar oficina.')

  type OsRaw = {
    id: string
    status: string
    created_at: string
    closed_at: string | null
    updated_at: string
  }
  const rows = (todas ?? []) as OsRaw[]
  const desde = new Date(intervalo.desde).getTime()
  const ate = new Date(intervalo.ate).getTime()

  const statusCount = new Map<string, number>()
  let abertasAgora = 0
  let criadasNoPeriodo = 0
  let entreguesNoPeriodo = 0
  let canceladasNoPeriodo = 0
  const osIdsPeriodo: string[] = []

  const abertas = ['aberta', 'em_andamento', 'aguardando_aprovacao', 'pronta']

  for (const os of rows) {
    statusCount.set(os.status, (statusCount.get(os.status) ?? 0) + 1)
    if (abertas.includes(os.status)) abertasAgora += 1

    const criada = new Date(os.created_at).getTime()
    if (criada >= desde && criada <= ate) {
      criadasNoPeriodo += 1
      osIdsPeriodo.push(os.id)
    }

    if (os.status === 'entregue') {
      const ref = os.closed_at ?? os.updated_at
      const t = new Date(ref).getTime()
      if (t >= desde && t <= ate) entreguesNoPeriodo += 1
    }

    if (os.status === 'cancelada') {
      const t = new Date(os.updated_at).getTime()
      if (t >= desde && t <= ate) canceladasNoPeriodo += 1
    }
  }

  let faturamentoItensCriadas = 0
  if (osIdsPeriodo.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: itens, error: itErr } = await (supabase as any)
      .from('os_itens')
      .select('quantidade, preco_unitario')
      .eq('company_id', companyId)
      .in('os_id', osIdsPeriodo)

    if (itErr) throw new Error((itErr as { message?: string }).message ?? 'Erro ao carregar itens da OS.')

    for (const i of (itens ?? []) as Array<{ quantidade: number; preco_unitario: number }>) {
      faturamentoItensCriadas += Number(i.quantidade) * Number(i.preco_unitario)
    }
    faturamentoItensCriadas = round2(faturamentoItensCriadas)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vendasOs, error: vendasOsErr } = await (supabase as any)
    .from('vendas')
    .select('total')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'finalizada')
    .not('os_id', 'is', null)
    .gte('realizada_em', intervalo.desde)
    .lte('realizada_em', intervalo.ate)

  if (vendasOsErr) {
    throw new Error(
      (vendasOsErr as { message?: string }).message ?? 'Erro ao carregar vendas da oficina.',
    )
  }

  let faturamentoRecebido = 0
  for (const v of (vendasOs ?? []) as Array<{ total: number }>) {
    faturamentoRecebido += Number(v.total)
  }
  faturamentoRecebido = round2(faturamentoRecebido)

  const porStatus = [...statusCount.entries()]
    .map(([status, quantidade]) => ({
      status,
      label: STATUS_OS_LABEL[status] ?? status,
      quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  return {
    porStatus,
    abertasAgora,
    criadasNoPeriodo,
    entreguesNoPeriodo,
    canceladasNoPeriodo,
    recebidasNoPeriodo: (vendasOs ?? []).length,
    faturamentoItensCriadas,
    faturamentoRecebido,
  }
}

export async function obterRelatorioEstoque(
  companyId: string,
  storeId: string,
  intervalo: IntervaloRelatorio,
): Promise<RelatorioEstoque> {
  const vazio: RelatorioEstoque = {
    totalSkus: 0,
    criticos: 0,
    reposicao: 0,
    valorEstoque: 0,
    entradas: 0,
    saidas: 0,
    itensCriticos: [],
  }
  if (!storeId) return vazio

  const resumo = await obterResumoEstoqueLoja(companyId, storeId)
  const itens = await listarItensEstoque(companyId, storeId)

  const itensCriticos = itens
    .filter((i) => statusSaldoItem(Number(i.saldo_atual), Number(i.estoque_minimo)) === 'critico')
    .sort((a, b) => Number(a.saldo_atual) - Number(b.saldo_atual))
    .slice(0, 10)
    .map((i) => ({
      nome: i.nome,
      saldo: Number(i.saldo_atual),
      minimo: Number(i.estoque_minimo),
      sku: i.sku ?? i.sku_fornecedor ?? null,
    }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: movs, error } = await (supabase as any)
    .from('estoque_movimentacoes')
    .select('tipo, quantidade')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .gte('created_at', intervalo.desde)
    .lte('created_at', intervalo.ate)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar movimentações.')

  let entradas = 0
  let saidas = 0
  for (const m of (movs ?? []) as Array<{ tipo: string; quantidade: number }>) {
    const q = Number(m.quantidade)
    if (m.tipo === 'entrada') entradas += q
    else if (m.tipo === 'saida') saidas += q
  }

  return {
    totalSkus: resumo.totalSkus,
    criticos: resumo.criticos,
    reposicao: resumo.reposicao,
    valorEstoque: resumo.valorEstoque,
    entradas,
    saidas,
    itensCriticos,
  }
}

export async function obterRelatorioClientes(
  companyId: string,
  storeId: string,
  intervalo: IntervaloRelatorio,
): Promise<RelatorioClientes> {
  const vazio: RelatorioClientes = { total: 0, novosNoPeriodo: 0, comBicicleta: 0, inativos90d: 0 }
  if (!storeId) return vazio

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('clientes')
    .select('id, created_at, bicicletas(id), atividades(data_registro)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar clientes.')

  const desde = new Date(intervalo.desde).getTime()
  const ate = new Date(intervalo.ate).getTime()
  const limiteInativo = Date.now() - 90 * 86_400_000

  type Raw = {
    id: string
    created_at: string
    bicicletas?: Array<{ id: string }>
    atividades?: Array<{ data_registro: string }>
  }

  const rows = (data ?? []) as Raw[]
  let novosNoPeriodo = 0
  let comBicicleta = 0
  let inativos90d = 0

  for (const c of rows) {
    const criado = new Date(c.created_at).getTime()
    if (criado >= desde && criado <= ate) novosNoPeriodo += 1
    if ((c.bicicletas?.length ?? 0) > 0) comBicicleta += 1

    const datas = (c.atividades ?? []).map((a) => a.data_registro).filter(Boolean)
    const ultima = datas.length > 0 ? [...datas].sort().at(-1)! : null
    const ultimaMs = ultima
      ? new Date(ultima.includes('T') ? ultima : `${ultima}T12:00:00`).getTime()
      : criado
    if (ultimaMs < limiteInativo) inativos90d += 1
  }

  return {
    total: rows.length,
    novosNoPeriodo,
    comBicicleta,
    inativos90d,
  }
}

export async function obterRelatorioConsolidado(
  companyId: string,
  storeId: string,
  periodo: PeriodoRelatorio,
): Promise<RelatorioConsolidado & { intervalo: IntervaloRelatorio }> {
  const intervalo = intervaloPeriodo(periodo)
  const [vendas, oficina, estoque, clientes] = await Promise.all([
    obterRelatorioVendas(companyId, storeId, intervalo),
    obterRelatorioOficina(companyId, storeId, intervalo),
    obterRelatorioEstoque(companyId, storeId, intervalo),
    obterRelatorioClientes(companyId, storeId, intervalo),
  ])
  return { vendas, oficina, estoque, clientes, intervalo }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
