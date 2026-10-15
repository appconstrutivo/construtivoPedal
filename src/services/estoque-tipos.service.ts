import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../lib/database.types'

export type EstoqueTipoRow = Tables<'estoque_tipos'>

/** Tipos nativos: definem o comportamento do item em PDV, Oficina, Orçamentos e relatórios. */
export type TipoBaseEstoque = 'peca' | 'acessorio' | 'bike'

export const TIPOS_BASE: { key: TipoBaseEstoque; label: string; plural: string }[] = [
  { key: 'peca', label: 'Peça', plural: 'Peças' },
  { key: 'acessorio', label: 'Acessório', plural: 'Acessórios' },
  { key: 'bike', label: 'Bike', plural: 'Bikes' },
]

export const NOME_TIPO_MAX = 60

export function toTipoBaseEstoque(valor: string | null | undefined): TipoBaseEstoque {
  if (valor === 'bike') return 'bike'
  if (valor === 'acessorio' || valor === 'componente') return 'acessorio'
  return 'peca'
}

export function labelTipoBase(base: string | null | undefined): string {
  const key = toTipoBaseEstoque(base)
  return TIPOS_BASE.find((t) => t.key === key)?.label ?? 'Peça'
}

export function normalizarNomeTipo(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim()
}

function chaveNome(nome: string): string {
  return normalizarNomeTipo(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** True se o nome coincide com um tipo nativo (Peça, Acessório, Bike), no singular ou plural. */
export function ehNomeTipoBase(nome: string): boolean {
  const chave = chaveNome(nome)
  return TIPOS_BASE.some((t) => chaveNome(t.label) === chave || chaveNome(t.plural) === chave)
}

function validarNome(nome: string): string {
  const nomeLimpo = normalizarNomeTipo(nome)
  if (!nomeLimpo) throw new Error('Informe o nome do tipo.')
  if (nomeLimpo.length > NOME_TIPO_MAX) {
    throw new Error(`O nome deve ter no máximo ${NOME_TIPO_MAX} caracteres.`)
  }
  if (ehNomeTipoBase(nomeLimpo)) throw new Error('Este tipo já existe no sistema.')
  return nomeLimpo
}

function mensagemErroTipo(error: unknown, fallback: string): string {
  const e = error as { code?: string; message?: string } | null
  if (e?.code === '23505') return 'Já existe um tipo com esse nome.'
  return e?.message ?? fallback
}

/** Tipos personalizados ativos da empresa (compartilhados entre as lojas). */
export async function listarTiposEstoque(companyId: string): Promise<EstoqueTipoRow[]> {
  if (!companyId) return []

  const { data, error } = await supabase
    .from('estoque_tipos')
    .select('*')
    .eq('company_id', companyId)
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error(error.message ?? 'Erro ao carregar tipos de item.')
  return data ?? []
}

export type ConfigTipoEstoque = {
  nome: string
  base: TipoBaseEstoque
  /** Patrimônio da loja: não soma no valor do estoque nem nos alertas de reposição. */
  patrimonio: boolean
}

export async function criarTipoEstoque(
  companyId: string,
  config: ConfigTipoEstoque,
): Promise<EstoqueTipoRow> {
  const nomeLimpo = validarNome(config.nome)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_tipos')
    .insert({ company_id: companyId, nome: nomeLimpo, base: config.base, patrimonio: config.patrimonio })
    .select()
    .single()
  if (error) throw new Error(mensagemErroTipo(error, 'Erro ao criar tipo.'))
  return data as EstoqueTipoRow
}

/** Atualiza nome, base e patrimônio; o banco propaga a nova base para os itens do tipo. */
export async function atualizarTipoEstoque(
  id: string,
  config: ConfigTipoEstoque,
): Promise<EstoqueTipoRow> {
  const nomeLimpo = validarNome(config.nome)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('estoque_tipos')
    .update({ nome: nomeLimpo, base: config.base, patrimonio: config.patrimonio })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(mensagemErroTipo(error, 'Erro ao atualizar tipo.'))
  return data as EstoqueTipoRow
}

/** Desativa o tipo (soft delete). O banco devolve os itens ao tipo base. */
export async function excluirTipoEstoque(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('estoque_tipos')
    .update({ ativo: false })
    .eq('id', id)
  if (error) throw new Error(mensagemErroTipo(error, 'Erro ao excluir tipo.'))
}
