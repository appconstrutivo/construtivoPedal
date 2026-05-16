import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../lib/database.types'

export type VendaRow = Tables<'vendas'>
export type FormaPagamento = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outro'

export type VendaLista = VendaRow & {
  clienteNome: string | null
  qtdItens: number
}

export type ResumoVendasHoje = {
  quantidade: number
  total: number
}

export type ItemFinalizarVenda = {
  estoque_item_id: string | null
  descricao: string
  quantidade: number
  preco_unitario: number
}

export type ResultadoFinalizarVenda = {
  vendaId: string
  numero: number
  total: number
}

export async function listarVendasRecentes(
  companyId: string,
  storeId: string,
  limit = 12,
): Promise<VendaLista[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('vendas')
    .select('*, clientes(nome), venda_itens(id)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'finalizada')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar vendas.')

  type Raw = VendaRow & {
    clientes?: { nome?: string | null } | null
    venda_itens?: Array<{ id: string }>
  }

  return ((data ?? []) as Raw[]).map((v) => ({
    ...v,
    clienteNome: v.clientes?.nome ?? null,
    qtdItens: v.venda_itens?.length ?? 0,
  }))
}

export async function obterResumoVendasHoje(
  companyId: string,
  storeId: string,
): Promise<ResumoVendasHoje> {
  if (!storeId) return { quantidade: 0, total: 0 }

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('vendas')
    .select('total')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'finalizada')
    .gte('created_at', inicioDia.toISOString())

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao resumir vendas.')

  const rows = (data ?? []) as Array<{ total: number }>
  return {
    quantidade: rows.length,
    total: rows.reduce((acc, r) => acc + Number(r.total), 0),
  }
}

export async function finalizarVendaPdv(params: {
  companyId: string
  storeId: string
  clienteId: string | null
  bicicletaId: string | null
  formaPagamento: FormaPagamento
  desconto: number
  observacao: string
  itens: ItemFinalizarVenda[]
}): Promise<ResultadoFinalizarVenda> {
  const {
    companyId,
    storeId,
    clienteId,
    bicicletaId,
    formaPagamento,
    desconto,
    observacao,
    itens,
  } = params

  if (!storeId) throw new Error('Selecione uma loja no topo da tela.')
  if (itens.length === 0) throw new Error('Adicione ao menos um item à venda.')

  const payloadItens = itens.map((i) => ({
    estoque_item_id: i.estoque_item_id,
    descricao: i.descricao,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('pdv_finalizar_venda', {
    p_company_id: companyId,
    p_store_id: storeId,
    p_cliente_id: clienteId,
    p_bicicleta_id: bicicletaId,
    p_forma_pagamento: formaPagamento,
    p_desconto: desconto,
    p_observacao: observacao || null,
    p_itens: payloadItens,
  })

  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/function public\.pdv_finalizar_venda|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de PDV não encontrada no banco. Recarregue a página ou aplique a migração supabase/sql/024_pdv_vendas.sql.',
      )
    }
    throw new Error(msg || 'Erro ao finalizar venda.')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.venda_id) throw new Error('Resposta inválida ao finalizar venda.')

  return {
    vendaId: row.venda_id as string,
    numero: Number(row.numero),
    total: Number(row.total),
  }
}
