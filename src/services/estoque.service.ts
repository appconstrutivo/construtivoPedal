import {
  calcularCustoComAdicional,
  calcularPrecoComMarkup,
  type LinhaPlanilhaEstoque,
} from '../lib/estoque-import-planilha'
import { calcularCustoComposicaoKit, type LinhaCustoKit } from '../lib/kit-custo'
import { MSG_QUANTIDADE_INTEIRA, ehQuantidadeInteiraPositiva } from '../lib/quantidade'
import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'

const BUCKET_ESTOQUE_FOTOS = 'estoque-fotos'

export type EstoqueItemRow = Tables<'estoque_itens'>
export type EstoqueMovimentacaoRow = Tables<'estoque_movimentacoes'>
export type FornecedorRow = Tables<'fornecedores'>
export type EstoqueLocalRow = Tables<'estoque_locais'>
export type { StoreRow } from './lojas.service'
export { listarLojas } from './lojas.service'
export type EstoqueKitRow = Tables<'estoque_kits'>
export type EstoqueKitComponenteRow = Tables<'estoque_kit_componentes'>

export type EstoqueItemComLocal = EstoqueItemRow & {
  storeName: string
  fornecedorNome: string | null
  localCodigo: string | null
  localNome: string | null
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

/** Remove quebras de linha e espaços duplicados vindos de planilhas importadas. */
export function normalizarNomeEstoque(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim()
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
    .select('*, stores(name), fornecedores(nome), estoque_locais(codigo, nome)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao carregar itens de estoque.')

  type Raw = EstoqueItemRow & {
    stores?: { name?: string | null } | null
    fornecedores?: { nome?: string | null } | null
    estoque_locais?: { codigo?: string | null; nome?: string | null } | null
  }
  return ((data ?? []) as Raw[]).map((item) => ({
    ...item,
    nome: normalizarNomeEstoque(item.nome),
    storeName: item.stores?.name ?? 'Sem loja',
    fornecedorNome: item.fornecedores?.nome ?? null,
    localCodigo: item.estoque_locais?.codigo ?? null,
    localNome: item.estoque_locais?.nome ?? null,
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

export async function listarLocaisEstoque(
  companyId: string,
  storeId: string,
): Promise<EstoqueLocalRow[]> {
  if (!storeId) return []

  const { data, error } = await supabase
    .from('estoque_locais')
    .select('*')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('ativo', true)
    .order('estante', { ascending: true })
    .order('prateleira', { ascending: true })
    .order('divisoria', { ascending: true })

  if (error) throw new Error(error.message ?? 'Erro ao carregar locais de estoque.')
  return data ?? []
}

export async function criarLocalEstoque(
  payload: TablesInsert<'estoque_locais'>,
): Promise<EstoqueLocalRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_locais')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao criar local de estoque.')
  return data as EstoqueLocalRow
}

export async function atualizarLocalEstoque(
  id: string,
  payload: TablesUpdate<'estoque_locais'>,
): Promise<EstoqueLocalRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_locais')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao atualizar local de estoque.')
  return data as EstoqueLocalRow
}

/** Desativa o local (soft delete). Itens vinculados perdem o vínculo. */
export async function excluirLocalEstoque(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('estoque_locais').update({ ativo: false }).eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao excluir local de estoque.')
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
  /** Opcional: % sobre o custo da planilha (impostos, cupons etc.). */
  custoAdicionalPct?: number
  linhas: LinhaPlanilhaEstoque[]
  onProgress?: (concluidos: number, total: number) => void
}): Promise<ResultadoImportacaoPlanilha> {
  const { companyId, storeId, fornecedorId, markupPct, custoAdicionalPct = 0, linhas, onProgress } =
    params
  const erros: string[] = []
  let criados = 0
  let atualizados = 0

  // Planilha não é enviada ao Supabase Storage. `sku` = código interno; `sku_fornecedor` = coluna SKU da planilha.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existentesRaw, error: listErr } = await (supabase as any)
    .from('estoque_itens')
    .select('id, nome, sku_fornecedor, saldo_atual, custo_medio')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('fornecedor_id', fornecedorId)
    .eq('ativo', true)

  if (listErr) {
    throw new Error(
      (listErr as { message?: string }).message ?? 'Erro ao consultar itens existentes para importação.',
    )
  }

  type RefItemImportacao = {
    id: string
    saldo_atual: number
    custo_medio: number
  }

  const porSkuFornecedor = new Map<string, RefItemImportacao>()
  const porNome = new Map<string, RefItemImportacao>()
  for (const row of (existentesRaw ?? []) as Array<{
    id: string
    nome: string
    sku_fornecedor: string | null
    saldo_atual: number
    custo_medio: number | null
  }>) {
    const ref: RefItemImportacao = {
      id: row.id,
      saldo_atual: Number(row.saldo_atual),
      custo_medio: Number(row.custo_medio ?? 0),
    }
    const skuF = String(row.sku_fornecedor ?? '').trim()
    if (skuF) porSkuFornecedor.set(skuF, ref)
    const nomeKey = row.nome.trim().toUpperCase()
    if (nomeKey) porNome.set(nomeKey, ref)
  }

  const total = linhas.length
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const existente =
      porSkuFornecedor.get(linha.skuFornecedor) ??
      porNome.get(linha.nome.trim().toUpperCase())

    try {
      const custoPlanilha = calcularCustoComAdicional(linha.custo, custoAdicionalPct)

      if (existente) {
        const novoSaldo = existente.saldo_atual + linha.quantidade
        // Coluna "Preço de Venda" da planilha = custo_medio (Custo R$) no cadastro.
        const custoMedio = Math.max(custoPlanilha, existente.custo_medio)
        // Itens já cadastrados: atualiza custo/saldo, mas mantém preços de venda validados na loja.
        await atualizarItemEstoque(existente.id, {
          nome: linha.nome,
          sku_fornecedor: linha.skuFornecedor,
          custo_medio: custoMedio,
          saldo_atual: novoSaldo,
          fornecedor_id: fornecedorId,
        })
        existente.saldo_atual = novoSaldo
        existente.custo_medio = custoMedio
        porSkuFornecedor.set(linha.skuFornecedor, existente)
        porNome.set(linha.nome.trim().toUpperCase(), existente)
        atualizados += 1
      } else {
        const precoVenda = calcularPrecoComMarkup(custoPlanilha, markupPct)
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
          custo_medio: custoPlanilha,
          preco_varejo: precoVenda,
          preco_atacado: precoVenda,
        })
        const ref: RefItemImportacao = {
          id: criado.id,
          saldo_atual: linha.quantidade,
          custo_medio: custoPlanilha,
        }
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

/** Próximo SKU de kit (KIT-000001…), por empresa — RPC `proximo_sku_estoque_kit`. */
export async function reservarProximoSkuKit(companyId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('proximo_sku_estoque_kit', {
    p_company_id: companyId,
  })
  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/function public\.proximo_sku_estoque_kit|não consegui encontrar a função|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de SKU de kit não encontrada no banco. Execute supabase/sql/028_estoque_kit_sku_sequencial.sql no Supabase.',
      )
    }
    throw new Error(msg || 'Erro ao gerar SKU do kit.')
  }
  if (data == null || typeof data !== 'string' || !data.trim()) {
    throw new Error('Resposta inválida ao gerar SKU do kit.')
  }
  return data.trim()
}

export async function criarMovimentacaoEstoque(
  payload: TablesInsert<'estoque_movimentacoes'>,
): Promise<EstoqueMovimentacaoRow> {
  const qtd = Number(payload.quantidade)
  if (!Number.isFinite(qtd) || !Number.isInteger(qtd)) {
    throw new Error(MSG_QUANTIDADE_INTEIRA)
  }
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

  for (const comp of componentes) {
    if (!ehQuantidadeInteiraPositiva(comp.quantidade)) {
      throw new Error(MSG_QUANTIDADE_INTEIRA)
    }
  }

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

export async function atualizarKitComComponentes(params: {
  companyId: string
  kitId: string
  nome: string
  itemResultanteId: string
  componentes: Array<{ componenteItemId: string; quantidade: number }>
}): Promise<void> {
  const { companyId, kitId, nome, itemResultanteId, componentes } = params

  for (const comp of componentes) {
    if (!ehQuantidadeInteiraPositiva(comp.quantidade)) {
      throw new Error(MSG_QUANTIDADE_INTEIRA)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: kitError } = await (supabase as any)
    .from('estoque_kits')
    .update({
      nome,
      item_resultante_id: itemResultanteId,
    })
    .eq('id', kitId)
    .eq('company_id', companyId)

  if (kitError) throw new Error((kitError as { message?: string }).message ?? 'Erro ao atualizar kit.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteError } = await (supabase as any)
    .from('estoque_kit_componentes')
    .delete()
    .eq('kit_id', kitId)
    .eq('company_id', companyId)

  if (deleteError) {
    throw new Error((deleteError as { message?: string }).message ?? 'Erro ao atualizar componentes do kit.')
  }

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

/** Atualiza o custo médio do item resultante com base na composição do kit. */
export async function sincronizarCustoItemResultanteKit(params: {
  itemResultanteId: string
  componentes: LinhaCustoKit[]
  itens: Array<{ id: string; custo_medio: number }>
}): Promise<void> {
  const { itemResultanteId, componentes, itens } = params
  const custo = calcularCustoComposicaoKit(componentes, itens)
  await atualizarItemEstoque(itemResultanteId, { custo_medio: custo })
}

export async function montarKit(params: {
  companyId: string
  kitId: string
  quantidade: number
  origem?: string
}): Promise<void> {
  const { companyId, kitId, quantidade, origem } = params
  if (!ehQuantidadeInteiraPositiva(quantidade)) {
    throw new Error(MSG_QUANTIDADE_INTEIRA)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('registrar_montagem_kit', {
    p_company_id: companyId,
    p_kit_id: kitId,
    p_quantidade: quantidade,
    p_origem: origem ?? null,
  })

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao montar kit.')
}

export async function desmontarKit(params: {
  companyId: string
  kitId: string
  quantidade: number
  origem?: string
}): Promise<void> {
  const { companyId, kitId, quantidade, origem } = params
  if (!ehQuantidadeInteiraPositiva(quantidade)) {
    throw new Error(MSG_QUANTIDADE_INTEIRA)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('registrar_desmontagem_kit', {
    p_company_id: companyId,
    p_kit_id: kitId,
    p_quantidade: quantidade,
    p_origem: origem ?? null,
  })

  if (error) {
    const msg = (error as { message?: string }).message ?? ''
    if (/registrar_desmontagem_kit|não consegui encontrar a função|does not exist|schema cache/i.test(msg)) {
      throw new Error(
        'Função de desmontagem de kit não encontrada no banco. Execute supabase/sql/041_desmontagem_kit.sql no Supabase.',
      )
    }
    throw new Error(msg || 'Erro ao desmontar kit.')
  }
}
