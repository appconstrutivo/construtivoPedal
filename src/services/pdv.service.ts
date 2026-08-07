import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../lib/database.types'
import { totalOperacionalVenda } from '../lib/venda-valores'

export type VendaRow = Tables<'vendas'>
export type FormaPagamento = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outro'

export type PagamentoVendaInput = {
  forma: FormaPagamento
  /** Valor pago pelo cliente (bruto). */
  valor: number
  /** Valor que entra na conta, após taxas — omitir quando igual ao bruto. */
  valor_liquido?: number
}

export function labelPagamento(f: string) {
  const map: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    credito: 'Crédito',
    debito: 'Débito',
    outro: 'Outro',
    misto: 'Misto',
  }
  return map[f] ?? f
}

export type VendaLista = VendaRow & {
  clienteNome: string | null
  qtdItens: number
  /** Valor de caixa (líquido) — preferir este nas telas internas. */
  totalOperacional: number
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
    .select('*, clientes(nome), venda_itens(id), venda_pagamentos(valor, valor_liquido)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'finalizada')
    .order('realizada_em', { ascending: false })
    .limit(limit)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar vendas.')

  type Raw = VendaRow & {
    clientes?: { nome?: string | null } | null
    venda_itens?: Array<{ id: string }>
    venda_pagamentos?: Array<{ valor: number; valor_liquido?: number | null }> | null
  }

  return ((data ?? []) as Raw[]).map((v) => ({
    ...v,
    clienteNome: v.clientes?.nome ?? null,
    qtdItens: v.venda_itens?.length ?? 0,
    totalOperacional: totalOperacionalVenda(Number(v.total), v.venda_pagamentos),
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
    .select('total, venda_pagamentos(valor, valor_liquido)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'finalizada')
    .gte('realizada_em', inicioDia.toISOString())

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao resumir vendas.')

  type Row = {
    total: number
    venda_pagamentos?: Array<{ valor: number; valor_liquido: number | null }> | null
  }
  const rows = (data ?? []) as Row[]
  return {
    quantidade: rows.length,
    // Faturamento operacional = o que entrou no caixa (líquido), não o juros da nota.
    total: rows.reduce((acc, r) => {
      const pags = r.venda_pagamentos ?? []
      if (pags.length > 0) {
        return (
          acc +
          pags.reduce((s, p) => s + Number(p.valor_liquido ?? p.valor), 0)
        )
      }
      return acc + Number(r.total)
    }, 0),
  }
}

export async function finalizarVendaPdv(params: {
  companyId: string
  storeId: string
  clienteId: string | null
  bicicletaId: string | null
  formaPagamento: FormaPagamento
  pagamentos?: PagamentoVendaInput[]
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
    pagamentos,
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

  const payloadPagamentos =
    pagamentos && pagamentos.length > 0
      ? pagamentos.map((p) => {
          const row: { forma: FormaPagamento; valor: number; valor_liquido?: number } = {
            forma: p.forma,
            valor: p.valor,
          }
          if (p.valor_liquido != null && p.valor_liquido < p.valor) {
            row.valor_liquido = p.valor_liquido
          }
          return row
        })
      : null

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
    p_pagamentos: payloadPagamentos,
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
