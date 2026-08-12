import { supabase } from '../lib/supabaseClient'

export type TipoRevisaoManual = 'verificacao_30' | 'periodica' | 'intermediaria' | 'geral'

export type ManualRevisaoSlot = {
  sequencia: number
  tipo: TipoRevisaoManual
  titulo: string
  status: 'pendente' | 'realizada'
  realizada_em: string | null
  loja_nome: string | null
  os_numero: number | null
  atrasada?: boolean
  prazo_em?: string | null
  descricao?: string | null
  dias_apos_venda?: number | null
  regra_titulo?: string | null
}

export type ManualManutencaoItem = {
  tipo: 'peca' | 'servico' | string
  descricao: string
  quantidade: number
}

export type ManualManutencao = {
  os_numero: number
  data: string | null
  loja_nome: string | null
  problema: string | null
  itens: ManualManutencaoItem[]
}

export type ManualProprietarioPublico = {
  bike: {
    marca: string
    modelo: string
    aro: string | null
    cor: string | null
    numero_serie: string | null
    foto_url: string | null
    quilometragem: number | null
    observacoes?: string | null
    data_compra?: string | null
    comprada_na_loja?: boolean
  }
  cliente_primeiro_nome: string | null
  empresa_nome: string | null
  empresa_logo_url: string | null
  loja_nome: string | null
  revisoes: ManualRevisaoSlot[]
  proxima: { sequencia: number; tipo: TipoRevisaoManual; titulo: string } | null
  manutencoes: ManualManutencao[]
  verificacao_30_atrasada?: boolean
  prazo_verificacao_30?: string | null
}

export type ManualSecao =
  | 'sumario'
  | 'caracteristicas'
  | 'cuidados'
  | 'uso'
  | 'revisoes'
  | 'manutencoes'

export const MANUAL_SECOES: Array<{ id: ManualSecao; label: string; blurb: string }> = [
  { id: 'caracteristicas', label: 'Características', blurb: 'Dados e identificação da sua bike' },
  { id: 'cuidados', label: 'Cuidados', blurb: 'Conservação no dia a dia' },
  { id: 'uso', label: 'Forma de uso', blurb: 'Boas práticas para pedalar com segurança' },
  { id: 'revisoes', label: 'Revisões', blurb: 'Quadro de revisões programadas' },
  { id: 'manutencoes', label: 'Manutenções', blurb: 'Histórico completo na oficina' },
]

export function urlManualProprietario(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return `${base}?manual=${encodeURIComponent(token)}`
}

export function montarTextoWhatsappManual(
  token: string,
  bikeLabel: string,
  lojaOuEmpresa?: string | null,
): string {
  const link = urlManualProprietario(token)
  const loja = lojaOuEmpresa?.trim() || 'sua bicicletaria'
  return (
    `Olá! Aqui está o Manual do Proprietário da sua ${bikeLabel}.\n\n` +
    `Nele você encontra cuidados, forma de uso, o quadro de revisões e o histórico de manutenções feitas na ${loja}.\n\n` +
    `${link}`
  )
}

export async function carregarManualPublico(token: string): Promise<ManualProprietarioPublico | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('manual_proprietario_por_token', {
    p_token: token,
  })
  if (error) throw new Error(error.message ?? 'Erro ao carregar manual.')
  if (!data) return null
  const raw = data as ManualProprietarioPublico
  return {
    ...raw,
    manutencoes: Array.isArray(raw.manutencoes) ? raw.manutencoes : [],
    revisoes: Array.isArray(raw.revisoes) ? raw.revisoes : [],
  }
}

/** Garante token + quadro (útil para bikes antigas antes do backfill em cache). */
export async function garantirManualBike(bicicletaId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('manual_garantir_quadro_bike', {
    p_bicicleta_id: bicicletaId,
  })
  if (error) throw new Error(error.message ?? 'Erro ao preparar manual da bike.')
}

export async function buscarTokenManualBike(bicicletaId: string): Promise<string | null> {
  await garantirManualBike(bicicletaId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('bicicletas')
    .select('token_manual')
    .eq('id', bicicletaId)
    .maybeSingle()
  if (error) throw new Error(error.message ?? 'Erro ao buscar token do manual.')
  return (data?.token_manual as string | null) ?? null
}

export async function contarSelosAplicadosNaOs(osId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('bike_manual_revisoes')
    .select('id', { count: 'exact', head: true })
    .eq('os_id', osId)
    .eq('status', 'realizada')
  if (error) return 0
  return count ?? 0
}

export function labelTipoRevisao(tipo: TipoRevisaoManual | string): string {
  switch (tipo) {
    case 'verificacao_30':
      return 'Verificação de 30 dias'
    case 'periodica':
      return 'Revisão Periódica'
    case 'intermediaria':
      return 'Revisão Intermediária'
    case 'geral':
      return 'Revisão Geral'
    default:
      return tipo
  }
}
