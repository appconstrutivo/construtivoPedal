import { supabase } from '../lib/supabaseClient'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'

export type TipoCalendarioEventoPadrao = 'entrega' | 'interno' | 'outro'

/** Slug padrão ou id (UUID) de tipo customizado da loja. */
export type TipoCalendarioEvento = string

export type CorCalendarioTipo = 'teal' | 'amber' | 'blue' | 'violet' | 'slate' | 'rose'

export type CalendarioTipoEventoRow = Tables<'calendario_tipos_evento'>

export type StatusCalendarioEvento = 'agendado' | 'concluido' | 'cancelado'

export type CalendarioEventoRow = {
  id: string
  company_id: string
  store_id: string
  titulo: string
  observacoes: string | null
  tipo: TipoCalendarioEvento
  data_inicio: string
  data_fim: string
  hora_inicio: string | null
  cliente_id: string | null
  status: StatusCalendarioEvento
  created_by: string | null
  created_at: string
  updated_at: string
  clienteNome: string | null
}

export type TipoCalendarioOpcao = {
  key: string
  label: string
  cor?: CorCalendarioTipo
  custom?: boolean
}

export const TIPOS_CALENDARIO_PADRAO: { key: TipoCalendarioEventoPadrao; label: string; cor: CorCalendarioTipo }[] = [
  { key: 'entrega', label: 'Entrega', cor: 'teal' },
  { key: 'interno', label: 'Equipe', cor: 'slate' },
  { key: 'outro', label: 'Outro', cor: 'rose' },
]

/** Tipos removidos do seletor — mantidos só para exibir eventos antigos. */
const TIPOS_CALENDARIO_LEGADO: Record<string, { label: string; cor: CorCalendarioTipo }> = {
  revisao: { label: 'Revisão', cor: 'amber' },
  compromisso: { label: 'Cliente', cor: 'blue' },
  fornecedor: { label: 'Fornecedor', cor: 'violet' },
}

/** @deprecated Use TIPOS_CALENDARIO_PADRAO */
export const TIPOS_CALENDARIO = TIPOS_CALENDARIO_PADRAO

export const CORES_CALENDARIO_TIPO: { key: CorCalendarioTipo; label: string }[] = [
  { key: 'teal', label: 'Verde' },
  { key: 'amber', label: 'Âmbar' },
  { key: 'blue', label: 'Azul' },
  { key: 'violet', label: 'Roxo' },
  { key: 'slate', label: 'Cinza' },
  { key: 'rose', label: 'Rosa' },
]

const TIPOS_PADRAO_KEYS = new Set<string>(TIPOS_CALENDARIO_PADRAO.map((t) => t.key))

export function tipoCalendarioEhPadrao(tipo: string): boolean {
  return TIPOS_PADRAO_KEYS.has(tipo) || tipo in TIPOS_CALENDARIO_LEGADO
}

export function montarTiposCalendarioOpcoes(tiposCustom: CalendarioTipoEventoRow[]): TipoCalendarioOpcao[] {
  const padrao: TipoCalendarioOpcao[] = TIPOS_CALENDARIO_PADRAO.map((t) => ({
    key: t.key,
    label: t.label,
    cor: t.cor,
    custom: false,
  }))
  const custom: TipoCalendarioOpcao[] = tiposCustom
    .filter((t) => t.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((t) => ({
      key: t.id,
      label: t.nome,
      cor: t.cor as CorCalendarioTipo,
      custom: true,
    }))
  return [...padrao, ...custom]
}

export function labelTipoCalendario(tipo: string, tiposCustom: CalendarioTipoEventoRow[] = []): string {
  const padrao = TIPOS_CALENDARIO_PADRAO.find((t) => t.key === tipo)
  if (padrao) return padrao.label
  const legado = TIPOS_CALENDARIO_LEGADO[tipo]
  if (legado) return legado.label
  const custom = tiposCustom.find((t) => t.id === tipo)
  if (custom) return custom.nome
  return tipo
}

export function corTipoCalendario(tipo: string, tiposCustom: CalendarioTipoEventoRow[] = []): CorCalendarioTipo {
  const padrao = TIPOS_CALENDARIO_PADRAO.find((t) => t.key === tipo)
  if (padrao) return padrao.cor
  const legado = TIPOS_CALENDARIO_LEGADO[tipo]
  if (legado) return legado.cor
  const custom = tiposCustom.find((t) => t.id === tipo)
  if (custom) return custom.cor as CorCalendarioTipo
  return 'blue'
}

export function dataLocalISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function labelStatusCalendario(status: StatusCalendarioEvento): string {
  if (status === 'concluido') return 'Concluído'
  if (status === 'cancelado') return 'Cancelado'
  return 'Agendado'
}

export function eventoCobreData(
  evento: Pick<CalendarioEventoRow, 'data_inicio' | 'data_fim'>,
  iso: string,
): boolean {
  return evento.data_inicio <= iso && evento.data_fim >= iso
}

export function eventoEhPeriodo(evento: Pick<CalendarioEventoRow, 'data_inicio' | 'data_fim'>): boolean {
  return evento.data_fim > evento.data_inicio
}

type RawEvento = Omit<CalendarioEventoRow, 'clienteNome' | 'tipo' | 'status'> & {
  tipo: string
  status: string
  clientes?: { nome?: string | null } | null
}

function mapEvento(row: RawEvento): CalendarioEventoRow {
  return {
    ...row,
    tipo: row.tipo as TipoCalendarioEvento,
    status: row.status as StatusCalendarioEvento,
    clienteNome: row.clientes?.nome?.trim() || null,
  }
}

export async function listarCalendarioTiposEvento(
  companyId: string,
  storeId: string,
): Promise<CalendarioTipoEventoRow[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_tipos_evento')
    .select('*')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (error) throw new Error(error.message ?? 'Erro ao carregar tipos de evento.')
  return (data ?? []) as CalendarioTipoEventoRow[]
}

export async function criarCalendarioTipoEvento(
  payload: TablesInsert<'calendario_tipos_evento'> & {
    company_id: string
    store_id: string
    nome: string
  },
): Promise<CalendarioTipoEventoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_tipos_evento')
    .insert(payload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um tipo com este nome nesta loja.')
    }
    throw new Error(error.message ?? 'Erro ao criar tipo de evento.')
  }
  return data as CalendarioTipoEventoRow
}

export async function listarCalendarioEventos(
  companyId: string,
  storeId: string,
  inicio: string,
  fim: string,
): Promise<CalendarioEventoRow[]> {
  if (!storeId) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_eventos')
    .select('*, clientes(nome)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .neq('status', 'cancelado')
    .lte('data_inicio', fim)
    .gte('data_fim', inicio)
    .order('data_inicio', { ascending: true })
    .order('hora_inicio', { ascending: true, nullsFirst: true })

  if (error) throw new Error(error.message ?? 'Erro ao carregar agenda.')
  const rows = ((data ?? []) as RawEvento[]).map(mapEvento)
  const unicos = new Map<string, CalendarioEventoRow>()
  for (const row of rows) unicos.set(row.id, row)
  return [...unicos.values()]
}

/** Eventos agendados cujo período inclui hoje — badge do menu. */
export async function contarCalendarioEventosHoje(
  companyId: string,
  storeId: string,
): Promise<number> {
  if (!storeId) return 0
  const hoje = dataLocalISO()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('calendario_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'agendado')
    .lte('data_inicio', hoje)
    .gte('data_fim', hoje)

  if (error) throw new Error(error.message ?? 'Erro ao contar eventos da agenda.')
  return count ?? 0
}

export async function criarCalendarioEvento(
  payload: TablesInsert<'calendario_eventos'> & {
    company_id: string
    store_id: string
    titulo: string
    data_inicio: string
    data_fim: string
  },
): Promise<CalendarioEventoRow> {
  const { data: auth } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_eventos')
    .insert({ ...payload, created_by: auth.user?.id ?? null })
    .select('*, clientes(nome)')
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao criar evento.')
  return mapEvento(data as RawEvento)
}

export async function atualizarCalendarioEvento(
  id: string,
  payload: TablesUpdate<'calendario_eventos'>,
): Promise<CalendarioEventoRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_eventos')
    .update(payload)
    .eq('id', id)
    .select('*, clientes(nome)')
    .single()
  if (error) throw new Error(error.message ?? 'Erro ao atualizar evento.')
  return mapEvento(data as RawEvento)
}

export async function excluirCalendarioEvento(id: string): Promise<void> {
  const { error } = await supabase.from('calendario_eventos').delete().eq('id', id)
  if (error) throw new Error(error.message ?? 'Erro ao excluir evento.')
}
