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
  grupo_recorrencia_id: string | null
  ocorrencia: number | null
  ocorrencias_total: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  clienteNome: string | null
}

export type FrequenciaEventoRecorrencia = 'mensal' | 'trimestral' | 'anual'

const FREQUENCIA_EVENTO_MESES: Record<FrequenciaEventoRecorrencia, number> = {
  mensal: 1,
  trimestral: 3,
  anual: 12,
}

export const FREQUENCIA_EVENTO_LABEL: Record<FrequenciaEventoRecorrencia, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
}

/** Datas (YYYY-MM-DD) a partir do 1º dia, no dia do mês, até a data limite (máx. 36). */
export function gerarDatasEventoRecorrenteAte(
  primeiraData: string,
  frequencia: FrequenciaEventoRecorrencia,
  ate: string,
  maxOcorrencias = 36,
): string[] {
  const partes = primeiraData.split('-').map(Number)
  if (partes.length !== 3 || !ate || ate < primeiraData) return []

  const [ano0, mes0, dia0] = partes
  const salto = FREQUENCIA_EVENTO_MESES[frequencia]
  const datas: string[] = []

  for (let i = 0; i < maxOcorrencias; i++) {
    const mesAbs = mes0 - 1 + i * salto
    const ano = ano0 + Math.floor(mesAbs / 12)
    const mes = (mesAbs % 12) + 1
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dia = Math.min(dia0, ultimoDia)
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (iso > ate) break
    datas.push(iso)
  }

  return datas
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

/**
 * Eventos ainda agendados que já começaram (hoje ou atrasados).
 * Badge do menu: só some ao concluir ou cancelar — não some só porque a data passou.
 */
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

  if (error) throw new Error(error.message ?? 'Erro ao contar eventos da agenda.')
  return count ?? 0
}

/** Eventos agendados em aberto até hoje (inclui atrasados) — faixa de alerta da agenda. */
export async function listarCalendarioEventosPendentesAteHoje(
  companyId: string,
  storeId: string,
): Promise<CalendarioEventoRow[]> {
  if (!storeId) return []
  const hoje = dataLocalISO()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_eventos')
    .select('*, clientes(nome)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .eq('status', 'agendado')
    .lte('data_inicio', hoje)
    .order('data_inicio', { ascending: true })
    .order('hora_inicio', { ascending: true, nullsFirst: true })
    .limit(200)

  if (error) throw new Error(error.message ?? 'Erro ao listar eventos em aberto.')
  return ((data ?? []) as RawEvento[]).map(mapEvento)
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

export type CriarEventoRecorrenteInput = {
  company_id: string
  store_id: string
  titulo: string
  tipo: TipoCalendarioEvento
  data_inicio: string
  hora_inicio?: string | null
  cliente_id?: string | null
  observacoes?: string | null
  frequencia: FrequenciaEventoRecorrencia
  repetirAte: string
}

/** Cria série de eventos pontuais (ex.: todo dia 10 até a data limite). */
export async function criarCalendarioEventosRecorrentes(
  params: CriarEventoRecorrenteInput,
): Promise<CalendarioEventoRow[]> {
  const datas = gerarDatasEventoRecorrenteAte(params.data_inicio, params.frequencia, params.repetirAte)
  if (datas.length === 0) {
    throw new Error('Informe uma data final igual ou posterior ao início.')
  }
  if (datas.length === 1) {
    const um = await criarCalendarioEvento({
      company_id: params.company_id,
      store_id: params.store_id,
      titulo: params.titulo.trim(),
      tipo: params.tipo,
      data_inicio: datas[0],
      data_fim: datas[0],
      hora_inicio: params.hora_inicio || null,
      cliente_id: params.cliente_id || null,
      observacoes: params.observacoes?.trim() || null,
      status: 'agendado',
    })
    return [um]
  }

  const { data: auth } = await supabase.auth.getUser()
  const grupoId = crypto.randomUUID()
  const tituloBase = params.titulo.trim()
  const total = datas.length
  const linhas = datas.map((dia, i) => ({
    company_id: params.company_id,
    store_id: params.store_id,
    titulo: `${tituloBase} (${i + 1}/${total})`,
    tipo: params.tipo,
    data_inicio: dia,
    data_fim: dia,
    hora_inicio: params.hora_inicio || null,
    cliente_id: params.cliente_id || null,
    observacoes: params.observacoes?.trim() || null,
    status: 'agendado' as const,
    grupo_recorrencia_id: grupoId,
    ocorrencia: i + 1,
    ocorrencias_total: total,
    created_by: auth.user?.id ?? null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('calendario_eventos')
    .insert(linhas)
    .select('*, clientes(nome)')

  if (error) throw new Error(error.message ?? 'Erro ao criar eventos recorrentes.')
  return ((data ?? []) as RawEvento[]).map(mapEvento)
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
