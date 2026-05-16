import {
  calcularPrecoComMarkup,
  type LinhaPlanilhaEstoque,
} from '../lib/estoque-import-planilha'
import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'

const BUCKET_ESTOQUE_FOTOS = 'estoque-fotos'

export type EstoqueItemRow = Tables<'estoque_itens'>
export type EstoqueMovimentacaoRow = Tables<'estoque_movimentacoes'>
export type FornecedorRow = Tables<'fornecedores'>
export type { StoreRow } from './lojas.service'
export { listarLojas } from './lojas.service'
export type EstoqueKitRow = Tables<'estoque_kits'>
export type EstoqueKitComponenteRow = Tables<'estoque_kit_componentes'>

export type EstoqueItemComLocal = EstoqueItemRow & {
  storeName: string
  fornecedorNome: string | null
}

export type EstoqueMovimentacaoComItem = EstoqueMovimentacaoRow & {
  itemNome: string
}

export type KitComComponentes = EstoqueKitRow & {
  itemResultanteNome: string | null
  componentes: Array<{
    id: string
    componenteItemId: string
    componenteNome: string
    quantidade: number
  }>
}

export type ResumoEstoqueLoja = {
  totalSkus: number
  criticos: number
  reposicao: number
  valorEstoque: number
}

function statusSaldoItem(saldo: number, minimo: number): 'critico' | 'reposicao' | 'saudavel' {
  if (saldo <= minimo * 0.5) return 'critico'
  if (saldo <= minimo) return 'reposicao'
  return 'saudavel'
}

export async function obterResumoEstoqueLoja(
  companyId: string,
  storeId: string,
): Promise<ResumoEstoqueLoja> {
  const itens = await listarItensEstoque(companyId, storeId)
  let criticos = 0
  let reposicao = 0
  let valorEstoque = 0
  for (const item of itens) {
    const st = statusSaldoItem(Number(item.saldo_atual), Number(item.estoque_minimo))
    if (st === 'critico') criticos += 1
    else if (st === 'reposicao') reposicao += 1
    valorEstoque += Number(item.custo_medio) * Number(item.saldo_atual)
  }
  return { totalSkus: itens.length, criticos, reposicao, valorEstoque }
}

export async function listarItensEstoque(
  companyId: string,
  storeId: string,
): Promise<EstoqueItemComLocal[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_itens')
    .select('*, stores(name), fornecedores(nome)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar itens de estoque.')

  type Raw = EstoqueItemRow & {
    stores?: { name?: string | null } | null
    fornecedores?: { nome?: string | null } | null
  }
  return ((data ?? []) as Raw[]).map((item) => ({
    ...item,
    storeName: item.stores?.name ?? 'Sem loja',
    fornecedorNome: item.fornecedores?.nome ?? null,
  }))
}

export async function listarMovimentacoesHoje(
  companyId: string,
  storeId: string,
  limit = 8,
): Promise<EstoqueMovimentacaoComItem[]> {
  if (!storeId) return []

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_movimentacoes')
    .select('*, estoque_itens(nome)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .gte('created_at', inicioDia.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar movimentações.')

  type Raw = EstoqueMovimentacaoRow & { estoque_itens?: { nome?: string | null } | null }
  return ((data ?? []) as Raw[]).map((mov) => ({
    ...mov,
    itemNome: mov.estoque_itens?.nome ?? 'Item removido',
  }))
}

export async function listarFornecedores(
  companyId: string,
  storeId: string,
): Promise<FornecedorRow[]> {
  if (!storeId) return []

  const { data, error } = await supabase
    .from('fornecedores')
    .select('*')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error(error.message ?? 'Erro ao carregar fornecedores.')
  return data ?? []
}

export async function criarFornecedor(
  payload: TablesInsert<'fornecedores'>,
): Promise<FornecedorRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('fornecedores')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao criar fornecedor.')
  return data as FornecedorRow
}

export async function atualizarFornecedor(
  id: string,
  payload: TablesUpdate<'fornecedores'>,
): Promise<FornecedorRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('fornecedores')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao atualizar fornecedor.')
  return data as FornecedorRow
}

/** Desativa o fornecedor (soft delete). Itens vinculados perdem o vínculo via ON DELETE SET NULL se hard delete; aqui mantemos histórico. */
export async function excluirFornecedor(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('fornecedores').update({ ativo: false }).eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao excluir fornecedor.')
}

export async function criarItemEstoque(
  payload: TablesInsert<'estoque_itens'>,
): Promise<EstoqueItemRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_itens')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao criar item de estoque.')
  return data as EstoqueItemRow
}

/** Desativa o item (soft delete); some da listagem ativa. */
export async function excluirItemEstoque(itemId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('estoque_itens').update({ ativo: false }).eq('id', itemId)
  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao excluir item.')
}

export async function obterUrlImagemItem(imagemRef: string): Promise<string | null> {
  const ref = imagemRef.trim()
  if (!ref) return null
  if (/^https?:\/\//i.test(ref)) return ref

  const { data, error } = await supabase.storage
    .from(BUCKET_ESTOQUE_FOTOS)
    .createSignedUrl(ref, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function uploadImagemItem(
  companyId: string,
  itemId: string,
  file: File,
  caminhoAtual?: string | null,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${companyId}/${itemId}/${crypto.randomUUID()}-${safeName}`

  const { error: upErr } = await supabase.storage.from(BUCKET_ESTOQUE_FOTOS).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (upErr) throw new Error(upErr.message ?? 'Falha no upload da imagem.')

  if (caminhoAtual) {
    await supabase.storage.from(BUCKET_ESTOQUE_FOTOS).remove([caminhoAtual])
  }

  return path
}

export async function atualizarItemEstoque(
  itemId: string,
  payload: TablesUpdate<'estoque_itens'>,
): Promise<EstoqueItemRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_itens')
    .update(payload)
    .eq('id', itemId)
    .select()
    .single()

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao atualizar item de estoque.')
  return data as EstoqueItemRow
}

/** Próximo SKU numérico sequencial (000001…), por empresa + loja — RPC `proximo_sku_estoque_item`. */
export type ResultadoImportacaoPlanilha = {
  criados: number
  atualizados: number
  erros: string[]
}

function inferirCategoriaEstoque(nome: string): 'peca' | 'bike' | 'acessorio' {
  const n = nome.toUpperCase()
  if (n.includes('BICICLETA') || /\bBIKE\b/.test(n)) return 'bike'
  return 'peca'
}

export async function importarItensPlanilhaEstoque(params: {
  companyId: string
  storeId: string
  fornecedorId: string
  markupPct: number
  linhas: LinhaPlanilhaEstoque[]
  onProgress?: (concluidos: number, total: number) => void
}): Promise<ResultadoImportacaoPlanilha> {
  const { companyId, storeId, fornecedorId, markupPct, linhas, onProgress } = params
  const erros: string[] = []
  let criados = 0
  let atualizados = 0

  // Planilha não é enviada ao Supabase Storage. `sku` = código interno; `sku_fornecedor` = coluna SKU da planilha.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existentesRaw, error: listErr } = await (supabase as any)
    .from('estoque_itens')
    .select('id, nome, sku_fornecedor, saldo_atual')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('fornecedor_id', fornecedorId)
    .eq('ativo', true)

  if (listErr) {
    throw new Error(
      (listErr as { message?: string }).message ?? 'Erro ao consultar itens existentes para importação.',
    )
  }

  const porSkuFornecedor = new Map<string, { id: string; saldo_atual: number }>()
  const porNome = new Map<string, { id: string; saldo_atual: number }>()
  for (const row of (existentesRaw ?? []) as Array<{
    id: string
    nome: string
    sku_fornecedor: string | null
    saldo_atual: number
  }>) {
    const ref = { id: row.id, saldo_atual: Number(row.saldo_atual) }
    const skuF = String(row.sku_fornecedor ?? '').trim()
    if (skuF) porSkuFornecedor.set(skuF, ref)
    const nomeKey = row.nome.trim().toUpperCase()
    if (nomeKey) porNome.set(nomeKey, ref)
  }

  const total = linhas.length
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const precoVenda = calcularPrecoComMarkup(linha.custo, markupPct)
    const existente =
      porSkuFornecedor.get(linha.skuFornecedor) ??
      porNome.get(linha.nome.trim().toUpperCase())

    try {
      if (existente) {
        const novoSaldo = existente.saldo_atual + linha.quantidade
        await atualizarItemEstoque(existente.id, {
          nome: linha.nome,
          sku_fornecedor: linha.skuFornecedor,
          custo_medio: linha.custo,
          preco_varejo: precoVenda,
          preco_atacado: precoVenda,
          saldo_atual: novoSaldo,
          fornecedor_id: fornecedorId,
        })
        existente.saldo_atual = novoSaldo
        porSkuFornecedor.set(linha.skuFornecedor, existente)
        atualizados += 1
      } else {
        const sku = await reservarProximoSkuEstoque(companyId, storeId)
        const criado = await criarItemEstoque({
          company_id: companyId,
          store_id: storeId,
          sku,
          sku_fornecedor: linha.skuFornecedor,
          nome: linha.nome,
          categoria: inferirCategoriaEstoque(linha.nome),
          unidade: 'un',
          fornecedor_id: fornecedorId,
          saldo_atual: linha.quantidade,
          estoque_minimo: 0,
          custo_medio: linha.custo,
          preco_varejo: precoVenda,
          preco_atacado: precoVenda,
        })
        const ref = { id: criado.id, saldo_atual: linha.quantidade }
        porSkuFornecedor.set(linha.skuFornecedor, ref)
        porNome.set(linha.nome.trim().toUpperCase(), ref)
        criados += 1
      }
    } catch (err: unknown) {
      erros.push(
        `Linha ${linha.linhaPlanilha} (${linha.skuFornecedor}): ${
          err instanceof Error ? err.message : 'Erro ao importar.'
        }`,
      )
    }

    onProgress?.(i + 1, total)
  }

  return { criados, atualizados, erros }
}

export async function reservarProximoSkuEstoque(
  companyId: string,
  storeId: string | null,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('proximo_sku_estoque_item', {
    p_company_id: companyId,
    p_store_id: storeId && storeId.length > 0 ? storeId : null,
  })
  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/function public\.proximo_sku_estoque_item|não consegui encontrar a função|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de SKU não encontrada no banco. Abra o SQL Editor do Supabase e execute o arquivo supabase/sql/014_estoque_sku_sequencial.sql (ou 015 para atualizar só a função).',
      )
    }
    throw new Error(msg || 'Erro ao gerar SKU.')
  }
  if (data == null || typeof data !== 'string' || !data.trim()) {
    throw new Error('Resposta inválida ao gerar SKU.')
  }
  return data.trim()
}

export async function criarMovimentacaoEstoque(
  payload: TablesInsert<'estoque_movimentacoes'>,
): Promise<EstoqueMovimentacaoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_movimentacoes')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao lançar movimentação.')
  return data as EstoqueMovimentacaoRow
}

export async function listarKits(companyId: string, storeId: string): Promise<KitComComponentes[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_kits')
    .select(
      '*, item_resultante:estoque_itens!estoque_kits_item_resultante_id_fkey(nome, store_id)',
    )
    .eq('company_id', companyId)
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar kits.')

  const kitsRaw = (
    (data ?? []) as Array<
      EstoqueKitRow & { item_resultante?: { nome?: string | null; store_id?: string | null } | null }
    >
  ).filter((k) => k.item_resultante?.store_id === storeId)

  if (kitsRaw.length === 0) return []

  const kitIds = kitsRaw.map((k) => k.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: compsData, error: compsError } = await (supabase as any)
    .from('estoque_kit_componentes')
    .select('id, kit_id, componente_item_id, quantidade, componente:estoque_itens!estoque_kit_componentes_componente_item_id_fkey(nome)')
    .eq('company_id', companyId)
    .in('kit_id', kitIds)

  if (compsError) {
    throw new Error((compsError as { message?: string }).message ?? 'Erro ao carregar componentes dos kits.')
  }

  const compsRaw = (compsData ?? []) as Array<
    EstoqueKitComponenteRow & { componente?: { nome?: string | null } | null }
  >

  return kitsRaw.map((kit) => ({
    ...kit,
    itemResultanteNome: kit.item_resultante?.nome ?? null,
    componentes: compsRaw
      .filter((c) => c.kit_id === kit.id)
      .map((c) => ({
        id: c.id,
        componenteItemId: c.componente_item_id,
        componenteNome: c.componente?.nome ?? 'Componente removido',
        quantidade: c.quantidade,
      })),
  }))
}

export async function criarKitComComponentes(params: {
  companyId: string
  sku: string
  nome: string
  itemResultanteId: string
  componentes: Array<{ componenteItemId: string; quantidade: number }>
}): Promise<void> {
  const { companyId, sku, nome, itemResultanteId, componentes } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kitData, error: kitError } = await (supabase as any)
    .from('estoque_kits')
    .insert({
      company_id: companyId,
      sku,
      nome,
      item_resultante_id: itemResultanteId,
    })
    .select()
    .single()

  if (kitError) throw new Error((kitError as { message?: string }).message ?? 'Erro ao criar kit.')
  const kitId = (kitData as EstoqueKitRow).id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: compsError } = await (supabase as any).from('estoque_kit_componentes').insert(
    componentes.map((comp) => ({
      company_id: companyId,
      kit_id: kitId,
      componente_item_id: comp.componenteItemId,
      quantidade: comp.quantidade,
    })),
  )

  if (compsError) {
    throw new Error((compsError as { message?: string }).message ?? 'Erro ao salvar componentes do kit.')
  }
}

export async function montarKit(params: {
  companyId: string
  kitId: string
  quantidade: number
  origem?: string
}): Promise<void> {
  const { companyId, kitId, quantidade, origem } = params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('registrar_montagem_kit', {
    p_company_id: companyId,
    p_kit_id: kitId,
    p_quantidade: quantidade,
    p_origem: origem ?? null,
  })

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao montar kit.')
}
