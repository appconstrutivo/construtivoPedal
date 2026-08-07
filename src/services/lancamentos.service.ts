import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../lib/database.types'
import { formatarCnpj } from './empresa.service'
import { formatarCep, formatarCpfCnpj } from '../lib/cpf-cnpj'
import { labelPagamento, type FormaPagamento } from './pdv.service'
import { totalOperacionalVenda, valorOperacionalPagamento } from '../lib/venda-valores'

export type { PagamentoValorRef } from '../lib/venda-valores'
export { totalOperacionalVenda, valorOperacionalPagamento } from '../lib/venda-valores'

export type PagamentoVendaDetalhe = {
  forma_pagamento: string
  /** Valor pago pelo cliente (nota/recibo). */
  valor: number
  /** Valor que entra no caixa — quando omitido, usa `valor`. */
  valor_liquido?: number | null
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
  /** Valor interno (caixa) — não usar `total` da nota nas telas operacionais. */
  totalOperacional: number
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

export type LojaReciboInfo = {
  nome: string
  endereco: string | null
}

export type EmpresaReciboInfo = {
  nome: string
  razaoSocial: string | null
  cnpj: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
}

export type VendaDetalhe = Tables<'vendas'> & {
  os_id?: string | null
  clienteNome: string | null
  clienteFone: string | null
  clienteCpfCnpj: string | null
  clienteInscricaoEstadual: string | null
  clienteEndereco: string | null
  clienteBairro: string | null
  clienteCep: string | null
  clienteMunicipio: string | null
  clienteUf: string | null
  lojaNome: string
  loja: LojaReciboInfo
  empresa: EmpresaReciboInfo
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
    venda_pagamentos?: Array<{
      forma_pagamento: string
      valor: number
      valor_liquido?: number | null
    }>
  }

  return (data as Raw[]).map((v) => {
    const pagamentos: PagamentoVendaDetalhe[] = (v.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
      valor_liquido:
        p.valor_liquido != null && p.valor_liquido !== undefined
          ? Number(p.valor_liquido)
          : null,
    }))
    return {
      ...v,
      clienteNome: v.clientes?.nome ?? null,
      qtdItens: v.venda_itens?.length ?? 0,
      pagamentos,
      totalOperacional: totalOperacionalVenda(Number(v.total), pagamentos),
    }
  })
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

  const buscaPorCliente = Boolean(busca) && !/^\d+$/.test(busca)
  const selectCols = buscaPorCliente
    ? '*, clientes!inner(nome), venda_itens(id), venda_pagamentos(forma_pagamento, valor, valor_liquido)'
    : '*, clientes(nome), venda_itens(id), venda_pagamentos(forma_pagamento, valor, valor_liquido)'

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
      q = q.eq('numero', parseInt(busca, 10))
    } else {
      q = q.ilike('clientes.nome', `%${esc}%`)
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
      '*, clientes(nome, fone, cpf_cnpj, inscricao_estadual, endereco, bairro, cep, municipio, uf), stores(name, address), companies(name, legal_name, cnpj, phone, email, address), venda_itens(id, descricao, quantidade, preco_unitario), venda_pagamentos(forma_pagamento, valor, valor_liquido)',
    )
    .eq('id', vendaId)
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar venda.')
  if (!data) throw new Error('Venda não encontrada.')

  type Raw = Tables<'vendas'> & {
    clientes?: {
      nome?: string | null
      fone?: string | null
      cpf_cnpj?: string | null
      inscricao_estadual?: string | null
      endereco?: string | null
      bairro?: string | null
      cep?: string | null
      municipio?: string | null
      uf?: string | null
    } | null
    stores?: { name?: string | null; address?: string | null } | null
    companies?: {
      name?: string | null
      legal_name?: string | null
      cnpj?: string | null
      phone?: string | null
      email?: string | null
      address?: string | null
    } | null
    venda_itens?: VendaItemDetalhe[]
    venda_pagamentos?: PagamentoVendaDetalhe[]
  }

  const row = data as Raw
  const empresaRow = row.companies

  const clienteRow = row.clientes

  return {
    ...row,
    clienteNome: clienteRow?.nome ?? null,
    clienteFone: clienteRow?.fone ?? null,
    clienteCpfCnpj: formatarCpfCnpj(clienteRow?.cpf_cnpj),
    clienteInscricaoEstadual: clienteRow?.inscricao_estadual?.trim() || null,
    clienteEndereco: clienteRow?.endereco?.trim() || null,
    clienteBairro: clienteRow?.bairro?.trim() || null,
    clienteCep: formatarCep(clienteRow?.cep),
    clienteMunicipio: clienteRow?.municipio?.trim() || null,
    clienteUf: clienteRow?.uf?.trim()?.toUpperCase() || null,
    lojaNome: row.stores?.name ?? 'Loja',
    loja: {
      nome: row.stores?.name ?? 'Loja',
      endereco: row.stores?.address?.trim() || null,
    },
    empresa: {
      nome: empresaRow?.name ?? 'Empresa',
      razaoSocial: empresaRow?.legal_name?.trim() || null,
      cnpj: empresaRow?.cnpj ? formatarCnpj(empresaRow.cnpj) : null,
      telefone: empresaRow?.phone?.trim() || null,
      email: empresaRow?.email?.trim() || null,
      endereco: empresaRow?.address?.trim() || null,
    },
    itens: (row.venda_itens ?? []).map((i) => ({
      id: i.id,
      descricao: i.descricao,
      quantidade: Number(i.quantidade),
      preco_unitario: Number(i.preco_unitario),
    })),
    pagamentos: (row.venda_pagamentos ?? []).map((p) => ({
      forma_pagamento: p.forma_pagamento,
      valor: Number(p.valor),
      valor_liquido:
        p.valor_liquido != null && p.valor_liquido !== undefined
          ? Number(p.valor_liquido)
          : null,
    })),
  }
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function resumoPagamentosVenda(
  formaCabecalho: string,
  pagamentos: PagamentoVendaDetalhe[],
  opts?: { modo?: 'nota' | 'operacional' },
): string {
  const modo = opts?.modo ?? 'nota'
  if (pagamentos.length > 0) {
    return pagamentos
      .map((p) => {
        const valor = modo === 'operacional' ? valorOperacionalPagamento(p) : Number(p.valor)
        return `${labelPagamento(p.forma_pagamento)} ${formatBRL(valor)}`
      })
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
