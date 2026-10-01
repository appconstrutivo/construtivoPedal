export type TipoMovimentacaoEstoque = 'entrada' | 'saida' | 'ajuste'

export type MotivoMovimentacaoEstoque =
  | 'compra'
  | 'retorno'
  | 'perda'
  | 'consumo_interno'
  | 'devolucao_fornecedor'
  | 'balanco'
  | 'montagem'
  | 'desmontagem'

type OpcaoMotivo = { key: MotivoMovimentacaoEstoque; label: string }

export const TIPOS_MOVIMENTACAO: Array<{ key: TipoMovimentacaoEstoque; label: string }> = [
  { key: 'entrada', label: '↓ Entrada' },
  { key: 'saida', label: '↑ Saída' },
  { key: 'ajuste', label: '⇅ Balanço' },
]

/** Motivos manuais da constraint `estoque_movimentacoes_motivo_check`; montagem/desmontagem são só via RPC de kit. */
export const MOTIVOS_POR_TIPO: Record<TipoMovimentacaoEstoque, OpcaoMotivo[]> = {
  entrada: [
    { key: 'compra', label: 'Compra' },
    { key: 'retorno', label: 'Retorno / sobra' },
  ],
  saida: [
    { key: 'perda', label: 'Perda / avaria' },
    { key: 'consumo_interno', label: 'Uso interno' },
    { key: 'devolucao_fornecedor', label: 'Devolução ao fornecedor' },
  ],
  ajuste: [{ key: 'balanco', label: 'Balanço' }],
}

/** Saída sem padrão: o operador escolhe, evitando classificar perda/uso por engano. */
export function motivoPadraoMovimentacao(tipo: TipoMovimentacaoEstoque): MotivoMovimentacaoEstoque | '' {
  if (tipo === 'entrada') return 'compra'
  if (tipo === 'ajuste') return 'balanco'
  return ''
}

const LABEL_MOTIVO: Record<MotivoMovimentacaoEstoque, string> = {
  compra: 'Compra',
  retorno: 'Retorno / sobra',
  perda: 'Perda / avaria',
  consumo_interno: 'Uso interno',
  devolucao_fornecedor: 'Devolução ao fornecedor',
  balanco: 'Balanço',
  montagem: 'Montagem',
  desmontagem: 'Desmontagem',
}

export function labelMotivoMovimentacao(motivo: string | null | undefined): string | null {
  if (!motivo) return null
  return LABEL_MOTIVO[motivo as MotivoMovimentacaoEstoque] ?? null
}
