import { opcaoCategoriaSaida, type CategoriaSaida } from '../lib/financeiro-categorias'
import { selectAllPages, selectByIdsInBatches } from '../lib/supabase-batch'
import { supabase } from '../lib/supabaseClient'
import { totalOperacionalVenda } from '../lib/venda-valores'
import type { IntervaloRelatorio } from './relatorios.service'

export type TipoMargem = 'peca' | 'bike' | 'acessorio' | 'servico'

/**
 * DRE gerencial por loja.
 * Receita pela data da venda (valor da nota − taxas = faturamento operacional dos relatórios);
 * CMV pelo custo congelado no item vendido; perdas pelas movimentações de estoque;
 * despesas pelas contas a pagar (vencimento) + saídas avulsas (data do lançamento).
 */
export type ResultadoDre = {
  quantidadeVendas: number
  vendasNota: number
  taxas: number
  receita: number
  impostos: number
  receitaLiquida: number
  cmv: number
  perdasEstoque: number
  lucroBruto: number
  despesasVariaveis: number
  margemContribuicao: number
  despesasFixas: number
  despesasOperacionais: number
  despesasFinanceiras: number
  lucroLiquido: number
  foraResultado: Array<{ categoria: CategoriaSaida; total: number }>
  margemPorTipo: Array<{ tipo: TipoMargem; receita: number; custo: number }>
  cmvEstimado: number
  itensSemCusto: number
}

const TIPOS_MARGEM: TipoMargem[] = ['peca', 'bike', 'acessorio', 'servico']

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function dataLocalIso(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isInicioDoMes(d: Date): boolean {
  return (
    d.getDate() === 1 &&
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  )
}

function labelIntervalo(desde: Date, ate: Date, mesesCheios: number): string {
  if (mesesCheios === 1) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(desde)
  }
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt.format(desde)} – ${fmt.format(ate)}`
}

/**
 * Intervalo de comparação, alinhado ao calendário quando o período começa no dia 1:
 * - meses cheios (ex.: outubro, ou jul–set) → os mesmos N meses imediatamente anteriores;
 * - mês em andamento (ex.: 1–15/out) → mesmo trecho do mês anterior (1–15/set), limitado ao fim dele;
 * - demais casos → janela de mesma duração imediatamente anterior.
 */
export function intervaloAnterior(intervalo: IntervaloRelatorio): IntervaloRelatorio {
  const desde = new Date(intervalo.desde)
  const ate = new Date(intervalo.ate)

  if (isInicioDoMes(desde)) {
    const y = desde.getFullYear()
    const m = desde.getMonth()
    const aposFim = new Date(ate.getTime() + 1)

    if (isInicioDoMes(aposFim)) {
      const meses = (aposFim.getFullYear() - y) * 12 + (aposFim.getMonth() - m)
      if (meses >= 1) {
        const prevDesde = new Date(y, m - meses, 1)
        const prevAte = new Date(desde.getTime() - 1)
        return {
          desde: prevDesde.toISOString(),
          ate: prevAte.toISOString(),
          label: labelIntervalo(prevDesde, prevAte, meses),
        }
      }
    }

    if (ate.getFullYear() === y && ate.getMonth() === m) {
      const ultimoDiaPrev = new Date(y, m, 0).getDate()
      const prevDesde = new Date(y, m - 1, 1)
      const prevAte =
        ate.getDate() > ultimoDiaPrev
          ? new Date(y, m - 1, ultimoDiaPrev, 23, 59, 59, 999)
          : new Date(
              y,
              m - 1,
              ate.getDate(),
              ate.getHours(),
              ate.getMinutes(),
              ate.getSeconds(),
              ate.getMilliseconds(),
            )
      return {
        desde: prevDesde.toISOString(),
        ate: prevAte.toISOString(),
        label: labelIntervalo(prevDesde, prevAte, 0),
      }
    }
  }

  const prevAte = new Date(desde.getTime() - 1)
  const prevDesde = new Date(prevAte.getTime() - (ate.getTime() - desde.getTime()))
  return {
    desde: prevDesde.toISOString(),
    ate: prevAte.toISOString(),
    label: labelIntervalo(prevDesde, prevAte, 0),
  }
}

type VendaRaw = {
  id: string
  total: number
  venda_pagamentos?: Array<{ valor: number; valor_liquido?: number | null }> | null
}

type ItemRaw = {
  estoque_item_id: string | null
  quantidade: number
  preco_unitario: number
  custo_unitario: number | null
  custo_origem: string | null
  estoque_itens?: { categoria?: string | null } | null
}

type MovEstoqueRaw = { quantidade: number; custo_unitario: number | null; motivo: string }
type SaidaRaw = { categoria: string | null; valor: number }

export async function obterResultadoDre(
  companyId: string,
  storeId: string,
  intervalo: IntervaloRelatorio,
): Promise<ResultadoDre> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const db = supabase as any

  const [vendas, movsEstoque, contasPagar, saidasManuais] = await Promise.all([
    selectAllPages<VendaRaw>((from, to) =>
      db
        .from('vendas')
        .select('id, total, venda_pagamentos(valor, valor_liquido)')
        .eq('company_id', companyId)
        .eq('store_id', storeId)
        .eq('status', 'finalizada')
        .gte('realizada_em', intervalo.desde)
        .lte('realizada_em', intervalo.ate)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    selectAllPages<MovEstoqueRaw>((from, to) =>
      db
        .from('estoque_movimentacoes')
        .select('quantidade, custo_unitario, motivo')
        .eq('company_id', companyId)
        .eq('store_id', storeId)
        .in('motivo', ['perda', 'balanco', 'consumo_interno'])
        .gte('created_at', intervalo.desde)
        .lte('created_at', intervalo.ate)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    selectAllPages<SaidaRaw>((from, to) =>
      db
        .from('financeiro_contas_pagar')
        .select('categoria, valor')
        .eq('company_id', companyId)
        .eq('store_id', storeId)
        .in('status', ['pendente', 'pago'])
        .gte('vencimento', dataLocalIso(intervalo.desde))
        .lte('vencimento', dataLocalIso(intervalo.ate))
        .order('id', { ascending: true })
        .range(from, to),
    ),
    selectAllPages<SaidaRaw>((from, to) =>
      db
        .from('financeiro_movimentacoes')
        .select('categoria, valor')
        .eq('company_id', companyId)
        .eq('store_id', storeId)
        .eq('tipo', 'saida')
        .eq('origem', 'manual')
        .gte('realizada_em', intervalo.desde)
        .lte('realizada_em', intervalo.ate)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const itens = await selectByIdsInBatches<ItemRaw>(
    vendas.map((v) => v.id),
    (chunk) =>
      db
        .from('venda_itens')
        .select('estoque_item_id, quantidade, preco_unitario, custo_unitario, custo_origem, estoque_itens(categoria)')
        .eq('company_id', companyId)
        .in('venda_id', chunk),
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return montarDre(vendas, itens, movsEstoque, [...contasPagar, ...saidasManuais])
}

function montarDre(
  vendas: VendaRaw[],
  itens: ItemRaw[],
  movsEstoque: MovEstoqueRaw[],
  saidas: SaidaRaw[],
): ResultadoDre {
  let vendasNota = 0
  let receita = 0
  for (const v of vendas) {
    const pags = v.venda_pagamentos ?? []
    const nota = pags.length > 0 ? pags.reduce((acc, p) => acc + (Number(p.valor) || 0), 0) : Number(v.total) || 0
    vendasNota += nota
    receita += totalOperacionalVenda(Number(v.total), pags)
  }

  let cmv = 0
  let cmvEstimado = 0
  let itensSemCusto = 0
  const porTipo = new Map<TipoMargem, { receita: number; custo: number }>()
  for (const t of TIPOS_MARGEM) porTipo.set(t, { receita: 0, custo: 0 })

  for (const i of itens) {
    const qtd = Number(i.quantidade) || 0
    const custoUnit = i.custo_unitario != null ? Number(i.custo_unitario) : 0
    const custo = qtd * custoUnit
    cmv += custo
    if (i.custo_origem === 'estimado') cmvEstimado += custo
    if (i.estoque_item_id && !(custoUnit > 0)) itensSemCusto += 1

    const categoria = i.estoque_itens?.categoria
    const tipo: TipoMargem =
      !i.estoque_item_id && i.custo_unitario == null
        ? 'servico'
        : categoria === 'bike' || categoria === 'acessorio'
          ? categoria
          : 'peca'
    const agg = porTipo.get(tipo)!
    agg.receita += qtd * (Number(i.preco_unitario) || 0)
    agg.custo += custo
  }

  let perdasEstoque = 0
  let consumoInterno = 0
  for (const m of movsEstoque) {
    const valor = (Number(m.quantidade) || 0) * (Number(m.custo_unitario) || 0)
    if (m.motivo === 'consumo_interno') consumoInterno += Math.abs(valor)
    else perdasEstoque -= valor
  }

  let impostos = 0
  let despesasVariaveis = 0
  let despesasFixas = 0
  let despesasOperacionais = consumoInterno
  let despesasFinanceiras = 0
  const fora = new Map<CategoriaSaida, number>()

  for (const s of saidas) {
    const valor = Number(s.valor) || 0
    const opcao = opcaoCategoriaSaida(s.categoria)
    switch (opcao?.grupoDre ?? 'despesa_operacional') {
      case 'deducao':
        impostos += valor
        break
      case 'despesa_variavel':
        despesasVariaveis += valor
        break
      case 'despesa_fixa':
        despesasFixas += valor
        break
      case 'despesa_financeira':
        despesasFinanceiras += valor
        break
      case 'fora_dre':
        fora.set(opcao!.key, (fora.get(opcao!.key) ?? 0) + valor)
        break
      default:
        despesasOperacionais += valor
    }
  }

  const taxas = vendasNota - receita
  const receitaLiquida = receita - impostos
  const lucroBruto = receitaLiquida - cmv - perdasEstoque
  const margemContribuicao = lucroBruto - despesasVariaveis
  const lucroLiquido = margemContribuicao - despesasFixas - despesasOperacionais - despesasFinanceiras

  return {
    quantidadeVendas: vendas.length,
    vendasNota: round2(vendasNota),
    taxas: round2(taxas),
    receita: round2(receita),
    impostos: round2(impostos),
    receitaLiquida: round2(receitaLiquida),
    cmv: round2(cmv),
    perdasEstoque: round2(perdasEstoque),
    lucroBruto: round2(lucroBruto),
    despesasVariaveis: round2(despesasVariaveis),
    margemContribuicao: round2(margemContribuicao),
    despesasFixas: round2(despesasFixas),
    despesasOperacionais: round2(despesasOperacionais),
    despesasFinanceiras: round2(despesasFinanceiras),
    lucroLiquido: round2(lucroLiquido),
    foraResultado: [...fora.entries()]
      .map(([categoria, total]) => ({ categoria, total: round2(total) }))
      .filter((f) => f.total > 0)
      .sort((a, b) => b.total - a.total),
    margemPorTipo: TIPOS_MARGEM.map((tipo) => {
      const agg = porTipo.get(tipo)!
      return { tipo, receita: round2(agg.receita), custo: round2(agg.custo) }
    }).filter((m) => m.receita > 0),
    cmvEstimado: round2(cmvEstimado),
    itensSemCusto,
  }
}
