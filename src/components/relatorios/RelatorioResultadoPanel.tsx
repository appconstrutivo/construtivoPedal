import { useEffect, useMemo, useState } from 'react'
import { labelCategoriaSaida } from '../../lib/financeiro-categorias'
import type { IntervaloRelatorio } from '../../services/relatorios.service'
import {
  intervaloAnterior,
  obterResultadoDre,
  type ResultadoDre,
  type TipoMargem,
} from '../../services/resultado.service'

type Props = {
  companyId: string
  activeStoreId: string
  intervalo: IntervaloRelatorio
}

type LinhaDre = {
  label: string
  valor: (d: ResultadoDre) => number
  sinal?: '−' | '='
  destaque?: 'subtotal' | 'total'
  ocultarSeZero?: boolean
}

const LINHAS_DRE: LinhaDre[] = [
  { label: 'Vendas (valor da nota)', valor: (d) => d.vendasNota },
  { label: 'Taxas de cartão', valor: (d) => d.taxas, sinal: '−', ocultarSeZero: true },
  { label: 'Receita', valor: (d) => d.receita, sinal: '=', destaque: 'subtotal' },
  { label: 'Impostos', valor: (d) => d.impostos, sinal: '−' },
  { label: 'Custo das mercadorias vendidas', valor: (d) => d.cmv, sinal: '−' },
  { label: 'Perdas de estoque', valor: (d) => d.perdasEstoque, sinal: '−', ocultarSeZero: true },
  { label: 'Lucro bruto', valor: (d) => d.lucroBruto, sinal: '=', destaque: 'subtotal' },
  { label: 'Despesas variáveis', valor: (d) => d.despesasVariaveis, sinal: '−' },
  { label: 'Margem de contribuição', valor: (d) => d.margemContribuicao, sinal: '=', destaque: 'subtotal' },
  { label: 'Despesas fixas e folha', valor: (d) => d.despesasFixas, sinal: '−' },
  { label: 'Outras despesas', valor: (d) => d.despesasOperacionais, sinal: '−' },
  { label: 'Tarifas e juros', valor: (d) => d.despesasFinanceiras, sinal: '−', ocultarSeZero: true },
  { label: 'Lucro líquido', valor: (d) => d.lucroLiquido, sinal: '=', destaque: 'total' },
]

const TIPO_LABEL: Record<TipoMargem, string> = {
  peca: 'Peças',
  bike: 'Bikes',
  acessorio: 'Acessórios',
  servico: 'Serviços',
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function pct(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null
}

function formatPct(v: number | null) {
  return v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function Variacao({
  atual,
  anterior,
  comparacao,
  inverso = false,
}: {
  atual: number
  anterior: number | undefined
  comparacao: string
  inverso?: boolean
}) {
  if (anterior === undefined || anterior === 0) return null
  const v = Math.round(((atual - anterior) / Math.abs(anterior)) * 100)
  if (v === 0) return null
  const bom = inverso ? v < 0 : v > 0
  return (
    <span className={bom ? 'rl-delta rl-delta--up' : 'rl-delta rl-delta--down'} title={`vs ${comparacao}`}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v)}%
    </span>
  )
}

function Kpi({
  label,
  valor,
  anterior,
  comparacao,
  hint,
  tom,
  inverso,
}: {
  label: string
  valor: number
  anterior?: number
  comparacao: string
  hint?: string
  tom: 'teal' | 'blue' | 'rose' | 'slate' | 'amber'
  inverso?: boolean
}) {
  return (
    <article className={`rl-kpi rl-kpi--${tom}`}>
      <span className="rl-kpi__label">{label}</span>
      <span className="rl-kpi__value">
        {formatBRL(valor)}{' '}
        <Variacao atual={valor} anterior={anterior} comparacao={comparacao} inverso={inverso} />
      </span>
      {hint ? <span className="rl-kpi__hint">{hint}</span> : null}
    </article>
  )
}

export function RelatorioResultadoPanel({ companyId, activeStoreId, intervalo }: Props) {
  const [atual, setAtual] = useState<ResultadoDre | null>(null)
  const [anterior, setAnterior] = useState<ResultadoDre | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const intervaloAnt = useMemo(() => intervaloAnterior(intervalo), [intervalo])

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setErro(null)
    Promise.all([
      obterResultadoDre(companyId, activeStoreId, intervalo),
      obterResultadoDre(companyId, activeStoreId, intervaloAnt),
    ])
      .then(([a, b]) => {
        if (cancelado) return
        setAtual(a)
        setAnterior(b)
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro ao calcular o resultado.')
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [companyId, activeStoreId, intervalo, intervaloAnt])

  if (erro) {
    return (
      <div className="rl-alert" role="alert">
        {erro}
      </div>
    )
  }

  if (!atual) {
    return (
      <div className="rl-loading" role="status">
        <span className="cp-auth-loading__spinner" aria-hidden />
        Calculando resultado…
      </div>
    )
  }

  const d = atual
  const despesas = d.despesasVariaveis + d.despesasFixas + d.despesasOperacionais + d.despesasFinanceiras
  const despesasAnt = anterior
    ? anterior.despesasVariaveis + anterior.despesasFixas + anterior.despesasOperacionais + anterior.despesasFinanceiras
    : undefined

  return (
    <div className={loading ? 'rl-content rl-content--loading' : 'rl-content'}>
      {d.itensSemCusto > 0 || d.cmvEstimado > 0 ? (
        <div className="rl-dre-avisos">
          {d.itensSemCusto > 0 ? (
            <span className="rl-dre-aviso rl-dre-aviso--warn">
              ⚠ {d.itensSemCusto} {d.itensSemCusto === 1 ? 'item vendido' : 'itens vendidos'} sem custo cadastrado
            </span>
          ) : null}
          {d.cmvEstimado > 0 ? (
            <span
              className="rl-dre-aviso"
              title="Vendas feitas antes do registro automático de custo usam o custo médio atual do item."
            >
              ⓘ {formatBRL(d.cmvEstimado)} do custo é estimado
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="rl-kpi-grid rl-kpi-grid--dre">
        <Kpi
          tom="blue"
          label="Receita"
          valor={d.receita}
          anterior={anterior?.receita}
          comparacao={intervaloAnt.label}
          hint={`${d.quantidadeVendas} venda(s) · já sem taxas`}
        />
        <Kpi
          tom="amber"
          label="Custo das mercadorias"
          valor={d.cmv}
          comparacao={intervaloAnt.label}
          hint={`Custo dos itens vendidos · ${formatPct(pct(d.cmv, d.receita))} da receita`}
        />
        <Kpi
          tom="teal"
          label="Lucro bruto"
          valor={d.lucroBruto}
          anterior={anterior?.lucroBruto}
          comparacao={intervaloAnt.label}
          hint={`Receita − custo e impostos · margem ${formatPct(pct(d.lucroBruto, d.receita))}`}
        />
        <Kpi
          tom="slate"
          label="Despesas"
          valor={despesas}
          anterior={despesasAnt}
          comparacao={intervaloAnt.label}
          hint="Fixas, variáveis e outras"
          inverso
        />
        <Kpi
          tom={d.lucroLiquido >= 0 ? 'teal' : 'rose'}
          label="Lucro líquido"
          valor={d.lucroLiquido}
          anterior={anterior?.lucroLiquido}
          comparacao={intervaloAnt.label}
          hint={`Lucro bruto − despesas · margem ${formatPct(pct(d.lucroLiquido, d.receita))}`}
        />
      </div>

      <section className="rl-card rl-dre-card">
        <h2 className="rl-sec__title">Demonstrativo de resultado</h2>
        <div className="rl-dre" role="table" aria-label="Demonstrativo de resultado">
          <div className="rl-dre__row rl-dre__row--head" role="row">
            <span role="columnheader" />
            <span role="columnheader">Período</span>
            <span role="columnheader" title="% sobre a receita">
              %
            </span>
            <span role="columnheader" className="rl-dre__ant" title={`Comparação: ${intervaloAnt.label}`}>
              Anterior
            </span>
          </div>
          {LINHAS_DRE.filter((l) => !(l.ocultarSeZero && l.valor(d) === 0 && (!anterior || l.valor(anterior) === 0))).map(
            (l) => {
              const v = l.valor(d)
              return (
                <div
                  key={l.label}
                  role="row"
                  className={`rl-dre__row${l.destaque ? ` rl-dre__row--${l.destaque}` : ''}`}
                >
                  <span role="cell" className="rl-dre__label">
                    {l.sinal ? <i className="rl-dre__sinal">{l.sinal}</i> : null}
                    {l.label}
                  </span>
                  <span role="cell" className={v < 0 && l.destaque ? 'rl-dre__neg' : undefined}>
                    {formatBRL(v)}
                  </span>
                  <span role="cell" className="rl-dre__pct">
                    {l.label.startsWith('Vendas') ? '' : formatPct(pct(v, d.receita))}
                  </span>
                  <span role="cell" className="rl-dre__ant">
                    {anterior ? formatBRL(l.valor(anterior)) : '—'}
                  </span>
                </div>
              )
            },
          )}
        </div>
        <p className="rl-card__hint">Receitas pela data da venda · despesas pelo vencimento.</p>
      </section>

      <div className="rl-split">
        <section className="rl-card">
          <h2 className="rl-sec__title">Margem por tipo</h2>
          {d.margemPorTipo.length === 0 ? (
            <p className="rl-empty">Nenhuma venda no período.</p>
          ) : (
            <ul className="rl-ranked">
              {d.margemPorTipo.map((m) => {
                const margem = pct(m.receita - m.custo, m.receita)
                return (
                  <li key={m.tipo} className="rl-ranked__row">
                    <div className="rl-ranked__head">
                      <span>{TIPO_LABEL[m.tipo]}</span>
                      <span>
                        {formatBRL(m.receita)} <em className="rl-muted">· {formatPct(margem)}</em>
                      </span>
                    </div>
                    <div className="rl-bar" aria-hidden>
                      <div
                        className="rl-bar__fill rl-bar__fill--teal"
                        style={{ width: `${Math.max(0, Math.min(100, margem ?? 0))}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rl-card">
          <h2 className="rl-sec__title">Fora do lucro</h2>
          {d.foraResultado.length === 0 ? (
            <p className="rl-empty">Nenhuma compra de mercadoria, investimento ou retirada no período.</p>
          ) : (
            <ul className="rl-metrics">
              {d.foraResultado.map((f) => (
                <li key={f.categoria}>
                  <span>{labelCategoriaSaida(f.categoria)}</span>
                  <strong>{formatBRL(f.total)}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="rl-card__hint">Saem do caixa, mas não são despesa do período.</p>
        </section>
      </div>
    </div>
  )
}
