import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'

const BUCKET_OS_FOTOS = 'os-fotos'

export type OrdemServicoRow = Tables<'ordens_servico'>
export type OsItemRow = Tables<'os_itens'>
export type OsChecklistRow = Tables<'os_checklist_itens'>
export type OsAnexoRow = Tables<'os_anexos'>

export type StatusOrdemServico =
  | 'aberta'
  | 'em_andamento'
  | 'aguardando_aprovacao'
  | 'pronta'
  | 'entregue'
  | 'cancelada'

export const STATUS_OS_ABERTAS: StatusOrdemServico[] = [
  'aberta',
  'em_andamento',
  'aguardando_aprovacao',
  'pronta',
]

export type OrdemServicoLista = OrdemServicoRow & {
  clienteNome: string
  bikeLabel: string | null
}

export type OrdemServicoDetalhe = OrdemServicoRow & {
  clienteNome: string
  bikeLabel: string | null
  checklist: OsChecklistRow[]
  itens: OsItemRow[]
  anexos: Array<OsAnexoRow & { urlAssinada: string | null }>
}

function bikeLabel(b: { marca: string; modelo: string } | null): string | null {
  if (!b) return null
  return `${b.marca} ${b.modelo}`.trim()
}

export async function listarOrdensServico(
  companyId: string,
  storeId: string,
): Promise<OrdemServicoLista[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ordens_servico')
    .select('*, clientes(nome), bicicletas(marca, modelo)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message ?? 'Erro ao carregar ordens de serviço.')

  type Raw = OrdemServicoRow & {
    clientes?: { nome?: string | null } | null
    bicicletas?: { marca?: string; modelo?: string } | null
  }

  return ((data ?? []) as Raw[]).map((row) => ({
    ...row,
    clienteNome: row.clientes?.nome ?? 'Cliente',
    bikeLabel: bikeLabel(
      row.bicicletas
        ? { marca: row.bicicletas.marca ?? '', modelo: row.bicicletas.modelo ?? '' }
        : null,
    ),
  }))
}

export async function contarOsAbertas(companyId: string, storeId: string): Promise<number> {
  if (!storeId) return 0

  const { count, error } = await supabase
    .from('ordens_servico')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .in('status', STATUS_OS_ABERTAS)

  if (error) throw new Error(error.message ?? 'Erro ao contar OS abertas.')
  return count ?? 0
}

export async function carregarOrdemDetalhe(
  companyId: string,
  osId: string,
): Promise<OrdemServicoDetalhe | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: osRow, error: osError } = await (supabase as any)
    .from('ordens_servico')
    .select('*, clientes(nome), bicicletas(marca, modelo)')
    .eq('company_id', companyId)
    .eq('id', osId)
    .maybeSingle()

  if (osError) throw new Error(osError.message ?? 'Erro ao carregar OS.')
  if (!osRow) return null

  type OsRaw = OrdemServicoRow & {
    clientes?: { nome?: string | null } | null
    bicicletas?: { marca?: string; modelo?: string } | null
  }
  const base = osRow as OsRaw
  const { clientes: _cl, bicicletas: _bi, ...osLimpo } = base

  const [{ data: checklist, error: chErr }, { data: itens, error: itErr }, { data: anexos, error: axErr }] =
    await Promise.all([
      supabase
        .from('os_checklist_itens')
        .select('*')
        .eq('os_id', osId)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('os_itens').select('*').eq('os_id', osId).order('created_at', { ascending: true }),
      supabase.from('os_anexos').select('*').eq('os_id', osId).order('created_at', { ascending: false }),
    ])

  if (chErr) throw new Error(chErr.message)
  if (itErr) throw new Error(itErr.message)
  if (axErr) throw new Error(axErr.message)

  const anexosComUrl: Array<OsAnexoRow & { urlAssinada: string | null }> = await Promise.all(
    (anexos ?? []).map(async (a: OsAnexoRow) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET_OS_FOTOS)
        .createSignedUrl(a.caminho_storage, 3600)
      return { ...a, urlAssinada: signed?.signedUrl ?? null }
    }),
  )

  return {
    ...(osLimpo as OrdemServicoRow),
    clienteNome: base.clientes?.nome ?? 'Cliente',
    bikeLabel: bikeLabel(
      base.bicicletas
        ? { marca: base.bicicletas.marca ?? '', modelo: base.bicicletas.modelo ?? '' }
        : null,
    ),
    checklist: (checklist ?? []) as OsChecklistRow[],
    itens: (itens ?? []) as OsItemRow[],
    anexos: anexosComUrl,
  }
}

export async function criarOrdemServico(
  payload: TablesInsert<'ordens_servico'>,
): Promise<OrdemServicoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ordens_servico')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao abrir OS.')
  return data as OrdemServicoRow
}

export async function atualizarOrdemServico(
  id: string,
  payload: TablesUpdate<'ordens_servico'>,
): Promise<OrdemServicoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ordens_servico')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Erro ao atualizar OS.')
  const row = data as OrdemServicoRow
  if (payload.status === 'cancelada') {
    await estornarBaixasOs(id)
  }
  return row
}

/** Devolve ao estoque as peças já baixadas nos itens da OS. */
export async function estornarBaixasOs(osId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('os_estornar_baixas_os', { p_os_id: osId })
  if (error) throw new Error(error.message ?? 'Erro ao estornar baixas do estoque.')
}

/** Remove a OS e registros vinculados (checklist, itens, anexos). Estorna baixas antes de excluir. */
export async function excluirOrdemServico(companyId: string, osId: string): Promise<void> {
  await estornarBaixasOs(osId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anexos, error: anexosErr } = await (supabase as any)
    .from('os_anexos')
    .select('caminho_storage')
    .eq('os_id', osId)
    .eq('company_id', companyId)

  if (anexosErr) throw new Error((anexosErr as { message?: string }).message ?? 'Erro ao carregar anexos da OS.')

  const paths = ((anexos ?? []) as Array<{ caminho_storage: string }>)
    .map((a) => a.caminho_storage)
    .filter(Boolean)
  if (paths.length > 0) {
    const { error: stErr } = await supabase.storage.from(BUCKET_OS_FOTOS).remove(paths)
    if (stErr) throw new Error(stErr.message ?? 'Erro ao remover fotos da OS.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('ordens_servico')
    .delete()
    .eq('id', osId)
    .eq('company_id', companyId)

  if (error) throw new Error((error as { message?: string }).message ?? 'Erro ao excluir ordem de serviço.')
}

export async function adicionarChecklistItem(
  payload: TablesInsert<'os_checklist_itens'>,
): Promise<OsChecklistRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('os_checklist_itens')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao adicionar item do checklist.')
  return data as OsChecklistRow
}

export async function atualizarChecklistItem(
  id: string,
  payload: TablesUpdate<'os_checklist_itens'>,
): Promise<OsChecklistRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('os_checklist_itens')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao atualizar checklist.')
  return data as OsChecklistRow
}

export async function excluirChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('os_checklist_itens').delete().eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao remover checklist.')
}

export async function adicionarOsItem(payload: TablesInsert<'os_itens'>): Promise<OsItemRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('os_itens').insert(payload).select().single()
  if (error) throw new Error(error.message ?? 'Erro ao adicionar item na OS.')
  return data as OsItemRow
}

export async function excluirOsItem(row: OsItemRow): Promise<void> {
  if (row.movimentacao_id) {
    throw new Error('Não é possível remover item já baixado do estoque.')
  }
  const { error } = await supabase.from('os_itens').delete().eq('id', row.id)
  if (error) throw new Error(error.message ?? 'Erro ao remover item.')
}

export async function baixarPecaNaOs(osItemId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('os_baixar_item_estoque', {
    p_os_item_id: osItemId,
  })
  if (error) throw new Error(error.message ?? 'Erro ao dar baixa no estoque.')
  return data as string
}

export async function uploadAnexoOs(
  companyId: string,
  osId: string,
  file: File,
): Promise<OsAnexoRow> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${companyId}/${osId}/${crypto.randomUUID()}-${safeName}`

  const { error: upErr } = await supabase.storage.from(BUCKET_OS_FOTOS).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (upErr) throw new Error(upErr.message ?? 'Falha no upload da imagem.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('os_anexos')
    .insert({
      company_id: companyId,
      os_id: osId,
      caminho_storage: path,
      nome_arquivo: file.name,
    })
    .select()
    .single()

  if (error) {
    await supabase.storage.from(BUCKET_OS_FOTOS).remove([path])
    throw new Error(error.message ?? 'Erro ao registrar anexo.')
  }

  return data as OsAnexoRow
}

export async function excluirAnexoOs(anexo: OsAnexoRow): Promise<void> {
  const { error: stErr } = await supabase.storage.from(BUCKET_OS_FOTOS).remove([anexo.caminho_storage])
  if (stErr) throw new Error(stErr.message ?? 'Erro ao remover arquivo.')

  const { error } = await supabase.from('os_anexos').delete().eq('id', anexo.id)
  if (error) throw new Error(error.message ?? 'Erro ao remover anexo.')
}
