import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../lib/database.types'
import { labelPagamento, type FormaPagamento } from './pdv.service'

export type PagamentoVendaDetalhe = {
  forma_pagamento: string
  valor: number
}

export type VendaStatus = 'finalizada' | 'cancelada'

export type VendaLancamentoLista = Tables<'vendas'> & {
  clienteNome: string | null
  qtdItens: number
  pagamentos: PagamentoVendaDetalhe[]
}

export type VendaItemDetalhe = {
  id: string
  descricao: string
  quantidade: number
  preco_unitario: number
}

export type VendaDetalhe = Tables<'vendas'> & {
  clienteNome: string | null
  clienteFone: string | null
  lojaNome: string
  itens: VendaItemDetalhe[]
  pagamentos: PagamentoVendaDetalhe[]
}

export async function listarVendasLancamentos(
  companyId: string,
  storeId: string,
  opts?: { limit?: number; status?: VendaStatus | 'todas' },
): Promise<VendaLancamentoLista[]> {
  if (!storeId) return []

  const limit = opts?.limit ?? 60

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('vendas')
    .select('*, clientes(nome), venda_itens(id), venda_pagamentos(forma_pagamento, valor)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts?.status && opts.status !== 'todas') {
    q = q.eq('status', opts.status)
  }

  const { data, error } = await q

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar vendas.')

  type Raw = Tables<'vendas'> & {
    clientes?: { nome?: string | null } | null
    venda_itens?: Array<{ id: string }>
    venda_pagamentos?: PagamentoVendaDetalhe[]
  }

  return ((data ?? []) as Raw[]).map((v) => ({
    ...v,
    clienteNome: v.clientes?.nome ?? null,
    qtdItens: v.venda_itens?.length ?? 0,
    pagamentos: (v.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
    })),
  }))
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

export async function cancelarVenda(companyId: string, storeId: string, vendaId: string): Promise<void> {
  if (!storeId) throw new Error('Selecione uma loja no topo da tela.')

  const detalhe = await obterVendaDetalhe(companyId, storeId, vendaId)
  if (detalhe.status !== 'finalizada') {
    throw new Error('Esta venda já está cancelada.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('pdv_cancelar_venda', {
    p_venda_id: vendaId,
  })

  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/function public\.pdv_cancelar_venda|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de cancelamento não encontrada. Aplique a migração supabase/sql/026_pdv_cancelar_venda.sql.',
      )
    }
    throw new Error(msg || 'Erro ao cancelar venda.')
  }
}

export const labelFormaPagamento = labelPagamento

export function labelStatusVenda(status: string) {
  if (status === 'cancelada') return 'Cancelada'
  return 'Finalizada'
}

export type { FormaPagamento }
