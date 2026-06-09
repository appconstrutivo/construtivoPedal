import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../lib/database.types'
import { labelPagamento, type FormaPagamento } from './pdv.service'

export type PagamentoVendaDetalhe = {
  forma_pagamento: string
  valor: number
}

export type VendaStatus = 'finalizada' | 'cancelada'

/** Data exibida em listas, recibo e relatórios (data operacional da venda). */
export function dataExibicaoVenda(v: { realizada_em?: string | null; created_at: string }): string {
  return v.realizada_em ?? v.created_at
}

export type VendaLancamentoLista = Tables<'vendas'> & {
  os_id?: string | null
  clienteNome: string | null
  qtdItens: number
  pagamentos: PagamentoVendaDetalhe[]
}

export type VendasLancamentosPagina = {
  items: VendaLancamentoLista[]
  total: number
}

/** Tamanho fixo por página — padrão operacional sem expor seletor ao usuário. */
export const LANCAMENTOS_PAGE_SIZE = 20

export type VendaItemDetalhe = {
  id: string
  descricao: string
  quantidade: number
  preco_unitario: number
}

export type VendaDetalhe = Tables<'vendas'> & {
  os_id?: string | null
  clienteNome: string | null
  clienteFone: string | null
  lojaNome: string
  itens: VendaItemDetalhe[]
  pagamentos: PagamentoVendaDetalhe[]
}

export function vendaOriginadaDeOs(v: { os_id?: string | null; observacao?: string | null }): boolean {
  if (v.os_id) return true
  return (v.observacao ?? '').toLowerCase().includes('faturamento os')
}

function mapVendasLancamentosRaw(data: unknown[]): VendaLancamentoLista[] {
  type Raw = Tables<'vendas'> & {
    clientes?: { nome?: string | null } | null
    venda_itens?: Array<{ id: string }>
    venda_pagamentos?: PagamentoVendaDetalhe[]
  }

  return (data as Raw[]).map((v) => ({
    ...v,
    clienteNome: v.clientes?.nome ?? null,
    qtdItens: v.venda_itens?.length ?? 0,
    pagamentos: (v.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
    })),
  }))
}

export async function listarVendasLancamentos(
  companyId: string,
  storeId: string,
  opts?: {
    page?: number
    pageSize?: number
    status?: VendaStatus | 'todas'
    busca?: string
  },
): Promise<VendasLancamentosPagina> {
  if (!storeId) return { items: [], total: 0 }

  const pageSize = opts?.pageSize ?? LANCAMENTOS_PAGE_SIZE
  const page = Math.max(1, opts?.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const busca = opts?.busca?.trim() ?? ''

  const selectCols =
    '*, clientes(nome), venda_itens(id), venda_pagamentos(forma_pagamento, valor)'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('vendas')
    .select(selectCols, { count: 'exact' })
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('realizada_em', { ascending: false })
    .range(from, to)

  if (opts?.status && opts.status !== 'todas') {
    q = q.eq('status', opts.status)
  }

  if (busca) {
    const esc = busca.replace(/%/g, '\\%').replace(/_/g, '\\_')
    if (/^\d+$/.test(busca)) {
      const n = parseInt(busca, 10)
      q = q.or(`numero.eq.${n},clientes.nome.ilike.%${esc}%`)
    } else {
      q = q.filter('clientes.nome', 'ilike', `%${esc}%`)
    }
  }

  const { data, error, count } = await q

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar vendas.')

  return {
    items: mapVendasLancamentosRaw(data ?? []),
    total: count ?? 0,
  }
}

export async function obterVendaDetalhe(
  companyId: string,
  storeId: string,
  vendaId: string,
): Promise<VendaDetalhe> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('vendas')
    .select(
      '*, clientes(nome, fone), stores(name), venda_itens(id, descricao, quantidade, preco_unitario), venda_pagamentos(forma_pagamento, valor)',
    )
    .eq('id', vendaId)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar venda.')
  if (!data) throw new Error('Venda não encontrada.')

  type Raw = Tables<'vendas'> & {
    clientes?: { nome?: string | null; fone?: string | null } | null
    stores?: { name?: string | null } | null
    venda_itens?: VendaItemDetalhe[]
    venda_pagamentos?: PagamentoVendaDetalhe[]
  }

  const row = data as Raw

  return {
    ...row,
    clienteNome: row.clientes?.nome ?? null,
    clienteFone: row.clientes?.fone ?? null,
    lojaNome: row.stores?.name ?? 'Loja',
    itens: (row.venda_itens ?? []).map((i) => ({
      id: i.id,
      descricao: i.descricao,
      quantidade: Number(i.quantidade),
      preco_unitario: Number(i.preco_unitario),
    })),
    pagamentos: (row.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
    })),
  }
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function resumoPagamentosVenda(
  formaCabecalho: string,
  pagamentos: PagamentoVendaDetalhe[],
): string {
  if (pagamentos.length > 0) {
    return pagamentos
      .map((p) => `${labelPagamento(p.forma_pagamento)} ${formatBRL(p.valor)}`)
      .join(' · ')
  }
  return labelPagamento(formaCabecalho)
}

export async function ajustarDataVenda(
  companyId: string,
  storeId: string,
  vendaId: string,
  realizadaEmIso: string,
): Promise<void> {
  if (!storeId) throw new Error('Selecione uma loja no topo da tela.')

  const detalhe = await obterVendaDetalhe(companyId, storeId, vendaId)
  const quando = new Date(realizadaEmIso)
  if (Number.isNaN(quando.getTime())) {
    throw new Error('Data ou horário inválido.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('pdv_ajustar_data_venda', {
    p_venda_id: detalhe.id,
    p_realizada_em: quando.toISOString(),
  })

  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/function public\.pdv_ajustar_data_venda|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de ajuste de data não encontrada. Aplique a migração supabase/sql/036_vendas_realizada_em.sql.',
      )
    }
    throw new Error(msg || 'Erro ao ajustar data da venda.')
  }
}

export async function cancelarVenda(
  companyId: string,
  storeId: string,
  vendaId: string,
): Promise<{ originadaDeOs: boolean }> {
  if (!storeId) throw new Error('Selecione uma loja no topo da tela.')

  const detalhe = await obterVendaDetalhe(companyId, storeId, vendaId)
  if (detalhe.status !== 'finalizada') {
    throw new Error('Esta venda já está cancelada.')
  }

  const originadaDeOs = vendaOriginadaDeOs(detalhe)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('pdv_cancelar_venda', {
    p_venda_id: vendaId,
  })

  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/function public\.pdv_cancelar_venda|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de cancelamento não encontrada. Aplique a migração supabase/sql/048_pdv_cancelar_venda_os.sql.',
      )
    }
    throw new Error(msg || 'Erro ao cancelar venda.')
  }

  return { originadaDeOs }
}

export const labelFormaPagamento = labelPagamento

export function labelStatusVenda(status: string) {
  if (status === 'cancelada') return 'Cancelada'
  return 'Finalizada'
}

export type { FormaPagamento }
