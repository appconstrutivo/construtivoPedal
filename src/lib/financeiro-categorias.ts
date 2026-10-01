/** Espelha as constraints de categoria da migração 075 (contas a pagar e saídas do caixa). */
export type CategoriaSaida =
  | 'fixa'
  | 'fornecedor'
  | 'folha'
  | 'imposto'
  | 'variavel'
  | 'servico_terceiro'
  | 'financeira'
  | 'outro'
  | 'investimento'
  | 'retirada_socio'
  | 'transferencia'

export type CategoriaContaPagar = Exclude<CategoriaSaida, 'transferencia'>

/** Linha da DRE gerencial onde a saída é apurada; `fora_dre` só afeta o caixa. */
export type GrupoDre =
  | 'deducao'
  | 'despesa_fixa'
  | 'despesa_variavel'
  | 'despesa_operacional'
  | 'despesa_financeira'
  | 'fora_dre'

type OpcaoCategoria = {
  key: CategoriaSaida
  label: string
  hint: string
  grupoDre: GrupoDre
}

export const CATEGORIAS_SAIDA: OpcaoCategoria[] = [
  {
    key: 'fixa',
    label: 'Despesa fixa',
    hint: 'Aluguel, luz, água, internet, contador, sistema…',
    grupoDre: 'despesa_fixa',
  },
  {
    key: 'fornecedor',
    label: 'Compra de mercadoria',
    hint: 'Peças, bikes e acessórios para revenda. Vira custo só quando vender.',
    grupoDre: 'fora_dre',
  },
  {
    key: 'folha',
    label: 'Folha e pró-labore',
    hint: 'Salários, pró-labore, encargos, benefícios…',
    grupoDre: 'despesa_fixa',
  },
  { key: 'imposto', label: 'Imposto', hint: 'DAS, ISS, taxas municipais…', grupoDre: 'deducao' },
  {
    key: 'variavel',
    label: 'Despesa variável',
    hint: 'Comissões, frete de entrega, embalagens…',
    grupoDre: 'despesa_variavel',
  },
  {
    key: 'servico_terceiro',
    label: 'Serviço de terceiro',
    hint: 'Mecânico terceirizado, manutenção, limpeza…',
    grupoDre: 'despesa_operacional',
  },
  {
    key: 'financeira',
    label: 'Tarifas e juros',
    hint: 'Tarifa bancária, juros, multa por atraso…',
    grupoDre: 'despesa_financeira',
  },
  {
    key: 'outro',
    label: 'Outra despesa',
    hint: 'Alimentação, material de limpeza, diversos…',
    grupoDre: 'despesa_operacional',
  },
  {
    key: 'investimento',
    label: 'Investimento / equipamento',
    hint: 'Ferramentas, compressor, móveis, reforma…',
    grupoDre: 'fora_dre',
  },
  {
    key: 'retirada_socio',
    label: 'Retirada do sócio',
    hint: 'Distribuição de lucro. Pró-labore vai em Folha.',
    grupoDre: 'fora_dre',
  },
  {
    key: 'transferencia',
    label: 'Transferência / sangria',
    hint: 'Dinheiro movido entre caixas e contas. Não é despesa.',
    grupoDre: 'fora_dre',
  },
]

export const CATEGORIAS_CONTA_PAGAR = CATEGORIAS_SAIDA.filter(
  (c): c is OpcaoCategoria & { key: CategoriaContaPagar } => c.key !== 'transferencia',
)

export function opcaoCategoriaSaida(c: string | null | undefined): OpcaoCategoria | undefined {
  return CATEGORIAS_SAIDA.find((o) => o.key === c)
}

export function labelCategoriaSaida(c: string | null | undefined): string {
  if (!c) return ''
  return opcaoCategoriaSaida(c)?.label ?? c
}
