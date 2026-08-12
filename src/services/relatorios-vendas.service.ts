import { supabase } from '../lib/supabaseClient'
import { dataExibicaoVenda, resumoPagamentosVenda } from './lancamentos.service'
import { labelPagamento, type FormaPagamento } from './pdv.service'
import { totalOperacionalVenda, valorOperacionalPagamento } from '../lib/venda-valores'
import { selectAllPages, selectByIdsInBatches } from '../lib/supabase-batch'
import {
  obterRelatorioVendas,
  type IntervaloRelatorio,
  type RelatorioVendas,
} from './relatorios.service'

export type OrigemVendaFiltro = 'todas' | 'balcao' | 'oficina'

export type CategoriaProdutoFiltro = 'todas' | 'peca' | 'bike' | 'acessorio'

export type FiltrosRelatorioVendas = {
  clienteId?: string | null
  origem?: OrigemVendaFiltro
  formaPagamento?: FormaPagamento | 'todas'
  /** Filtra vendas/itens pela categoria do produto de estoque. */
  categoria?: CategoriaProdutoFiltro
}

export type VendaRelatorioLinha = {
  id: string
  numero: number
  realizadaEm: string
  clienteNome: string | null
  origem: 'balcao' | 'oficina'
  total: number
  desconto: number
  pagamentoResumo: string
  qtdItens: number
}

export type ItemVendidoLinha = {
  descricao: string
  sku: string | null
  quantidade: number
  faturamento: number
  vendas: number
}

export type ServicoRealizadoLinha = {
  descricao: string
  quantidade: number
  faturamento: number
  vendas: number
}

export type ClienteVendasLinha = {
  clienteId: string
  clienteNome: string
  quantidadeVendas: number
  faturamento: number
  ticketMedio: number
  ultimaCompra: string
}

export type FaturamentoDiarioLinha = {
  data: string
  label: string
  quantidade: number
  faturamento: number
  faturamentoBalcao: number
  faturamentoOficina: number
  ticketMedio: number
}

export type RelatorioVendasDetalhado = {
  resumo: RelatorioVendas
  porVenda: VendaRelatorioLinha[]
  porItem: ItemVendidoLinha[]
  porServico: ServicoRealizadoLinha[]
  porCliente: ClienteVendasLinha[]
  faturamentoDiario: FaturamentoDiarioLinha[]
}

const FORMAS_PAGAMENTO: FormaPagamento[] = ['dinheiro', 'pix', 'credito', 'debito', 'outro']

type VendaRaw = {
  id: string
  numero: number
  total: number
  desconto: number
  forma_pagamento: string
  os_id: string | null
  cliente_id: string | null
  realizada_em?: string | null
  created_at: string
  clientes?: { nome?: string | null } | null
  venda_pagamentos?: Array<{
    forma_pagamento: string
    valor: number
    valor_liquido?: number | null
  }>
  venda_itens?: Array<{ id: string }>
}

type ItemRaw = {
  venda_id: string
  descricao: string
  quantidade: number
  preco_unitario: number
  estoque_item_id: string | null
  estoque_itens?: {
    sku?: string | null
    sku_fornecedor?: string | null
    categoria?: string | null
  } | null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Normaliza categoria do estoque para o filtro do relatório (componente → acessório). */
export function normalizarCategoriaProduto(
  categoria: string | null | undefined,
): Exclude<CategoriaProdutoFiltro, 'todas'> {
  const c = (categoria ?? '').trim().toLowerCase()
  if (c === 'bike') return 'bike'
  if (c === 'acessorio' || c === 'componente') return 'acessorio'
  return 'peca'
}

function itemPassaCategoria(item: ItemRaw, categoria: CategoriaProdutoFiltro): boolean {
  if (categoria === 'todas') return true
  if (!item.estoque_item_id) return false
  return normalizarCategoriaProduto(item.estoque_itens?.categoria) === categoria
}

function dataLocalKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function labelDataCurta(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso))
}

function vendaPassaFormaPagamento(
  v: VendaRaw,
  forma: FormaPagamento | 'todas',
): boolean {
  if (forma === 'todas') return true
  const pagamentos = v.venda_pagamentos ?? []
  if (pagamentos.length > 0) {
    return pagamentos.some((p) => p.forma_pagamento === forma)
  }
  if (v.forma_pagamento === 'misto') return forma === 'outro'
  return v.forma_pagamento === forma
}

export async function obterRelatorioVendasDetalhado(
  companyId: string,
  storeId: string,
  intervalo: IntervaloRelatorio,
  filtros: FiltrosRelatorioVendas = {},
): Promise<RelatorioVendasDetalhado> {
  const vazio: RelatorioVendasDetalhado = {
    resumo: await obterRelatorioVendas(companyId, storeId, intervalo),
    porVenda: [],
    porItem: [],
    porServico: [],
    porCliente: [],
    faturamentoDiario: [],
  }
  if (!storeId) return vazio

  const origem = filtros.origem ?? 'todas'
  const forma = filtros.formaPagamento ?? 'todas'
  const categoria = filtros.categoria ?? 'todas'
  const filtrarPorCategoria = categoria !== 'todas'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = await selectAllPages<VendaRaw>((from, to) => {
    let q = (supabase as any)
      .from('vendas')
      .select(
        'id, numero, total, desconto, forma_pagamento, os_id, cliente_id, realizada_em, created_at, clientes(nome), venda_pagamentos(forma_pagamento, valor, valor_liquido), venda_itens(id)',
      )
      .eq('company_id', companyId)
      .eq('store_id', storeId)
      .eq('status', 'finalizada')
      .gte('realizada_em', intervalo.desde)
      .lte('realizada_em', intervalo.ate)
      .order('realizada_em', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)

    if (filtros.clienteId) q = q.eq('cliente_id', filtros.clienteId)
    if (origem === 'balcao') q = q.is('os_id', null)
    if (origem === 'oficina') q = q.not('os_id', 'is', null)
    return q
  })

  if (forma !== 'todas') {
    rows = rows.filter((v) => vendaPassaFormaPagamento(v, forma))
  }

  const vendaIds = rows.map((r) => r.id)
  const itensPorVenda = new Map<string, ItemRaw[]>()

  if (vendaIds.length > 0) {
    const itens = await selectByIdsInBatches<ItemRaw>(vendaIds, (chunk) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('venda_itens')
        .select(
          'venda_id, descricao, quantidade, preco_unitario, estoque_item_id, estoque_itens(sku, sku_fornecedor, categoria)',
        )
        .eq('company_id', companyId)
        .in('venda_id', chunk),
    )

    for (const item of itens) {
      if (!itemPassaCategoria(item, categoria)) continue
      const list = itensPorVenda.get(item.venda_id) ?? []
      list.push(item)
      itensPorVenda.set(item.venda_id, list)
    }
  }

  if (filtrarPorCategoria) {
    rows = rows.filter((v) => (itensPorVenda.get(v.id)?.length ?? 0) > 0)
  }

  const totalItensVenda = (vendaId: string) => {
    const itens = itensPorVenda.get(vendaId) ?? []
    return round2(
      itens.reduce((acc, item) => acc + Number(item.quantidade) * Number(item.preco_unitario), 0),
    )
  }

  const porVenda: VendaRelatorioLinha[] = rows.map((v) => {
    const pags = (v.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
      valor_liquido: p.valor_liquido != null ? Number(p.valor_liquido) : null,
    }))
    const totalVenda = totalOperacionalVenda(Number(v.total), pags)
    const itensCat = itensPorVenda.get(v.id) ?? []
    const total = filtrarPorCategoria ? totalItensVenda(v.id) : totalVenda
    const desconto = filtrarPorCategoria
      ? totalVenda > 0
        ? round2(Number(v.desconto) * (total / totalVenda))
        : 0
      : Number(v.desconto)
    return {
      id: v.id,
      numero: v.numero,
      realizadaEm: dataExibicaoVenda(v),
      clienteNome: v.clientes?.nome ?? null,
      origem: v.os_id ? ('oficina' as const) : ('balcao' as const),
      total,
      desconto,
      pagamentoResumo: resumoPagamentosVenda(v.forma_pagamento, pags, { modo: 'operacional' }),
      qtdItens: filtrarPorCategoria
        ? itensCat.length
        : (v.venda_itens?.length ?? itensCat.length),
    }
  })

  const itemMap = new Map<string, { sku: string | null; quantidade: number; faturamento: number; vendas: Set<string> }>()
  const servicoMap = new Map<string, { quantidade: number; faturamento: number; vendas: Set<string> }>()
  const clienteMap = new Map<
    string,
    { nome: string; quantidade: number; faturamento: number; ultimaCompra: string }
  >()
  const diarioMap = new Map<
    string,
    { quantidade: number; faturamento: number; balcao: number; oficina: number; label: string }
  >()

  let faturamento = 0
  let faturamentoBalcao = 0
  let faturamentoOficina = 0
  let quantidadeBalcao = 0
  let quantidadeOficina = 0
  let descontos = 0
  const porForma = new Map<FormaPagamento, { quantidade: number; total: number }>()
  for (const f of FORMAS_PAGAMENTO) porForma.set(f, { quantidade: 0, total: 0 })

  for (const v of rows) {
    const pags = (v.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
      valor_liquido: p.valor_liquido != null ? Number(p.valor_liquido) : null,
    }))
    const totalVenda = totalOperacionalVenda(Number(v.total), pags)
    const total = filtrarPorCategoria ? totalItensVenda(v.id) : totalVenda
    const fatorPagamento =
      filtrarPorCategoria && totalVenda > 0 ? Math.min(1, total / totalVenda) : 1
    const descontoVenda = filtrarPorCategoria
      ? round2(Number(v.desconto) * fatorPagamento)
      : Number(v.desconto)
    const quando = dataExibicaoVenda(v)
    const diaKey = dataLocalKey(quando)
    const isOficina = Boolean(v.os_id)

    faturamento += total
    descontos += descontoVenda
    if (isOficina) {
      faturamentoOficina += total
      quantidadeOficina += 1
    } else {
      faturamentoBalcao += total
      quantidadeBalcao += 1
    }

    if (pags.length > 0) {
      for (const p of pags) {
        const formaKey = (FORMAS_PAGAMENTO.includes(p.forma_pagamento as FormaPagamento)
          ? p.forma_pagamento
          : 'outro') as FormaPagamento
        const agg = porForma.get(formaKey)!
        agg.quantidade += 1
        agg.total += valorOperacionalPagamento(p) * fatorPagamento
      }
    } else {
      const formaKey = (FORMAS_PAGAMENTO.includes(v.forma_pagamento as FormaPagamento)
        ? v.forma_pagamento === 'misto'
          ? 'outro'
          : v.forma_pagamento
        : 'outro') as FormaPagamento
      const agg = porForma.get(formaKey)!
      agg.quantidade += 1
      agg.total += total
    }

    const diaPrev = diarioMap.get(diaKey) ?? {
      quantidade: 0,
      faturamento: 0,
      balcao: 0,
      oficina: 0,
      label: labelDataCurta(`${diaKey}T12:00:00`),
    }
    diaPrev.quantidade += 1
    diaPrev.faturamento += total
    if (isOficina) diaPrev.oficina += total
    else diaPrev.balcao += total
    diarioMap.set(diaKey, diaPrev)

    if (v.cliente_id) {
      const nome = v.clientes?.nome?.trim() || 'Cliente'
      const prev = clienteMap.get(v.cliente_id) ?? {
        nome,
        quantidade: 0,
        faturamento: 0,
        ultimaCompra: quando,
      }
      prev.quantidade += 1
      prev.faturamento += total
      if (new Date(quando).getTime() > new Date(prev.ultimaCompra).getTime()) {
        prev.ultimaCompra = quando
      }
      clienteMap.set(v.cliente_id, prev)
    }

    for (const item of itensPorVenda.get(v.id) ?? []) {
      const descricao = item.descricao.trim() || 'Item'
      const qtd = Number(item.quantidade)
      const linha = round2(qtd * Number(item.preco_unitario))

      if (item.estoque_item_id) {
        const sku =
          item.estoque_itens?.sku?.trim() ||
          item.estoque_itens?.sku_fornecedor?.trim() ||
          null
        const prev = itemMap.get(descricao) ?? {
          sku,
          quantidade: 0,
          faturamento: 0,
          vendas: new Set<string>(),
        }
        if (!prev.sku && sku) prev.sku = sku
        prev.quantidade += qtd
        prev.faturamento += linha
        prev.vendas.add(v.id)
        itemMap.set(descricao, prev)
      } else if (!filtrarPorCategoria) {
        const prev = servicoMap.get(descricao) ?? {
          quantidade: 0,
          faturamento: 0,
          vendas: new Set<string>(),
        }
        prev.quantidade += qtd
        prev.faturamento += linha
        prev.vendas.add(v.id)
        servicoMap.set(descricao, prev)
      }
    }
  }

  const quantidade = rows.length
  const resumo: RelatorioVendas = {
    quantidade,
    faturamento: round2(faturamento),
    faturamentoBalcao: round2(faturamentoBalcao),
    faturamentoOficina: round2(faturamentoOficina),
    quantidadeBalcao,
    quantidadeOficina,
    ticketMedio: quantidade > 0 ? round2(faturamento / quantidade) : 0,
    descontos: round2(descontos),
    porFormaPagamento: FORMAS_PAGAMENTO.map((f) => {
      const agg = porForma.get(f)!
      return { forma: f, label: labelPagamento(f), ...agg }
    }),
    topProdutos: [...itemMap.entries()]
      .map(([descricao, v]) => ({
        descricao,
        quantidade: v.quantidade,
        faturamento: round2(v.faturamento),
      }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 8),
  }

  return {
    resumo,
    porVenda,
    porItem: [...itemMap.entries()]
      .map(([descricao, v]) => ({
        descricao,
        sku: v.sku,
        quantidade: v.quantidade,
        faturamento: round2(v.faturamento),
        vendas: v.vendas.size,
      }))
      .sort((a, b) => b.faturamento - a.faturamento),
    porServico: [...servicoMap.entries()]
      .map(([descricao, v]) => ({
        descricao,
        quantidade: v.quantidade,
        faturamento: round2(v.faturamento),
        vendas: v.vendas.size,
      }))
      .sort((a, b) => b.faturamento - a.faturamento),
    porCliente: [...clienteMap.entries()]
      .map(([clienteId, v]) => ({
        clienteId,
        clienteNome: v.nome,
        quantidadeVendas: v.quantidade,
        faturamento: round2(v.faturamento),
        ticketMedio: v.quantidade > 0 ? round2(v.faturamento / v.quantidade) : 0,
        ultimaCompra: v.ultimaCompra,
      }))
      .sort((a, b) => b.faturamento - a.faturamento),
    faturamentoDiario: [...diarioMap.entries()]
      .map(([data, v]) => ({
        data,
        label: v.label,
        quantidade: v.quantidade,
        faturamento: round2(v.faturamento),
        faturamentoBalcao: round2(v.balcao),
        faturamentoOficina: round2(v.oficina),
        ticketMedio: v.quantidade > 0 ? round2(v.faturamento / v.quantidade) : 0,
      }))
      .sort((a, b) => a.data.localeCompare(b.data)),
  }
}
