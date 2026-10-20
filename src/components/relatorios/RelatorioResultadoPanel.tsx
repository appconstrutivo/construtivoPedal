import { useEffect, useMemo, useState } from 'react'
import { labelCategoriaSaida } from '../../lib/financeiro-categorias'
import type { IntervaloRelatorio } from '../../services/relatorios.service'
import {
  GRUPO_DESPESA_DRE_LABEL,
  intervaloAnterior,
  listarDetalheDespesasDre,
  obterResultadoDre,
  type DespesaDreItem,
  type DetalheDespesasDre,
  type GrupoDespesaDre,
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
  /** Abre o detalhe de despesas neste grupo (ou todas, se 'todas'). */
  detalheDespesas?: GrupoDespesaDre | 'todas'
}

const LINHAS_DRE: LinhaDre[] = [
  { label: 'Vendas (valor da nota)', valor: (d) => d.vendasNota },
  { label: 'Taxas de cartão', valor: (d) => d.taxas, sinal: '−', ocultarSeZero: true },
  { label: 'Receita', valor: (d) => d.receita, sinal: '=', destaque: 'subtotal' },
  { label: 'Impostos', valor: (d) => d.impostos, sinal: '−' },
  { label: 'Custo das mercadorias vendidas', valor: (d) => d.cmv, sinal: '−' },
  { label: 'Perdas de estoque', valor: (d) => d.perdasEstoque, sinal: '−', ocultarSeZero: true },
  { label: 'Lucro bruto', valor: (d) => d.lucroBruto, sinal: '=', destaque: 'subtotal' },
  {
    label: 'Despesas variáveis',
    valor: (d) => d.despesasVariaveis,
    sinal: '−',
    detalheDespesas: 'variavel',
  },
  { label: 'Margem de contribuição', valor: (d) => d.margemContribuicao, sinal: '=', destaque: 'subtotal' },
  {
    label: 'Despesas fixas e folha',
    valor: (d) => d.despesasFixas,
    sinal: '−',
    detalheDespesas: 'fixa',
  },
  {
    label: 'Outras despesas',
    valor: (d) => d.despesasOperacionais,
    sinal: '−',
    detalheDespesas: 'operacional',
  },
  {
    label: 'Tarifas e juros',
    valor: (d) => d.despesasFinanceiras,
    sinal: '−',
    ocultarSeZero: true,
    detalheDespesas: 'financeira',
  },
  { label: 'Lucro líquido', valor: (d) => d.lucroLiquido, sinal: '=', destaque: 'total' },
]

const TIPO_LABEL: Record<TipoMargem, string> = {
  peca: 'Peças',
  bike: 'Bikes',
  acessorio: 'Acessórios',
  servico: 'Serviços',
}

const ABAS_DETALHE: { key: GrupoDespesaDre | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'fixa', label: 'Fixas e folha' },
  { key: 'variavel', label: 'Variáveis' },
  { key: 'operacional', label: 'Outras' },
  { key: 'financeira', label: 'Tarifas' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDateShort(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
    new Date(`${isoDate.slice(0, 10)}T12:00:00`),
  )
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
  onOpen,
}: {
  label: string
  valor: number
  anterior?: number
  comparacao: string
  hint?: string
  tom: 'teal' | 'blue' | 'rose' | 'slate' | 'amber'
  inverso?: boolean
  onOpen?: () => void
}) {
  const body = (
    <>
      <span className="rl-kpi__label">
        {label}
        {onOpen ? <span className="rl-kpi__action">Ver lista</span> : null}
      </span>
      <span className="rl-kpi__value">
        {formatBRL(valor)}{' '}
        <Variacao atual={valor} anterior={anterior} comparacao={comparacao} inverso={inverso} />
      </span>
      {hint ? <span className="rl-kpi__hint">{hint}</span> : null}
    </>
  )

  if (onOpen) {
    return (
      <button
        type="button"
        className={`rl-kpi rl-kpi--${tom} rl-kpi--clickable`}
        onClick={onOpen}
        title="Ver detalhe das despesas"
      >
        {body}
      </button>
    )
  }

  return <article className={`rl-kpi rl-kpi--${tom}`}>{body}</article>
}

function DespesasDetalheModal({
  intervaloLabel,
  detalhe,
  loading,
  erro,
  abaInicial,
  onClose,
}: {
  intervaloLabel: string
  detalhe: DetalheDespesasDre | null
  loading: boolean
  erro: string | null
  abaInicial: GrupoDespesaDre | 'todas'
  onClose: () => void
}) {
  const [aba, setAba] = useState<GrupoDespesaDre | 'todas'>(abaInicial)

  useEffect(() => {
    setAba(abaInicial)
  }, [abaInicial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const itensFiltrados = useMemo(() => {
    if (!detalhe) return [] as DespesaDreItem[]
    if (aba === 'todas') return detalhe.itens
    return detalhe.itens.filter((i) => i.grupo === aba)
  }, [detalhe, aba])

  const totalAba = useMemo(() => {
    if (!detalhe) return 0
    if (aba === 'todas') return detalhe.total
    return detalhe.totais[aba]
  }, [detalhe, aba])

  const abasVisiveis = useMemo(() => {
    if (!detalhe) return ABAS_DETALHE
    return ABAS_DETALHE.filter((a) => a.key === 'todas' || detalhe.totais[a.key] > 0 || a.key === abaInicial)
  }, [detalhe, abaInicial])

  return (
    <div
      className="st-modal-overlay st-modal-overlay--scroll"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="st-modal st-modal--lg st-modal--scroll rl-desp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rl-desp-title"
      >
        <div className="st-modal__head">
          <div>
            <h2 id="rl-desp-title" className="st-modal__title">
              Despesas do período
            </h2>
            <p className="rl-desp-modal__sub">{intervaloLabel}</p>
          </div>
          <button type="button" className="st-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="rl-desp-modal__tabs" role="tablist" aria-label="Grupo de despesa">
          {abasVisiveis.map((a) => {
            const total = detalhe ? (a.key === 'todas' ? detalhe.total : detalhe.totais[a.key]) : 0
            return (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={aba === a.key}
                className={`rl-desp-modal__tab${aba === a.key ? ' rl-desp-modal__tab--on' : ''}`}
                onClick={() => setAba(a.key)}
              >
                <span>{a.label}</span>
                {!loading && detalhe ? <em>{formatBRL(total)}</em> : null}
              </button>
            )
          })}
        </div>

        <div className="rl-desp-modal__body">
          {loading ? (
            <div className="rl-loading" role="status">
              <span className="cp-auth-loading__spinner" aria-hidden />
              Carregando despesas…
            </div>
          ) : erro ? (
            <div className="rl-alert" role="alert">
              {erro}
            </div>
          ) : itensFiltrados.length === 0 ? (
            <p className="rl-empty">Nenhuma despesa neste grupo no período.</p>
          ) : (
            <ul className="rl-desp-lista">
              {itensFiltrados.map((item) => (
                <li key={item.id} className="rl-desp-lista__item">
                  <div className="rl-desp-lista__main">
                    <span className="rl-desp-lista__desc">{item.descricao}</span>
                    <span className="rl-desp-lista__meta">
                      {item.categoriaLabel}
                      {' · '}
                      {item.origemLabel}
                      {item.meta ? ` · ${item.meta}` : ''}
                      {' · '}
                      {formatDateShort(item.data)}
                    </span>
                  </div>
                  <strong className="rl-desp-lista__valor">{formatBRL(item.valor)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rl-desp-modal__foot">
          <span>
            {aba === 'todas'
              ? 'Total das despesas'
              : GRUPO_DESPESA_DRE_LABEL[aba]}
          </span>
          <strong>{formatBRL(totalAba)}</strong>
        </div>
      </div>
    </div>
  )
}

export function RelatorioResultadoPanel({ companyId, activeStoreId, intervalo }: Props) {
  const [atual, setAtual] = useState<ResultadoDre | null>(null)
  const [anterior, setAnterior] = useState<ResultadoDre | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const intervaloAnt = useMemo(() => intervaloAnterior(intervalo), [intervalo])

  const [detalheAberto, setDetalheAberto] = useState(false)
  const [detalheAba, setDetalheAba] = useState<GrupoDespesaDre | 'todas'>('todas')
  const [detalhe, setDetalhe] = useState<DetalheDespesasDre | null>(null)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalheErro, setDetalheErro] = useState<string | null>(null)

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

  useEffect(() => {
    setDetalhe(null)
    setDetalheAberto(false)
    setDetalheErro(null)
  }, [companyId, activeStoreId, intervalo])

  function abrirDetalhe(aba: GrupoDespesaDre | 'todas') {
    setDetalheAba(aba)
    setDetalheAberto(true)
    if (detalhe || detalheLoading) return
    setDetalheLoading(true)
    setDetalheErro(null)
    listarDetalheDespesasDre(companyId, activeStoreId, intervalo)
      .then((d) => setDetalhe(d))
      .catch((e) => setDetalheErro(e instanceof Error ? e.message : 'Erro ao carregar despesas.'))
      .finally(() => setDetalheLoading(false))
  }

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
          hint="Fixas, variáveis e outras · toque para ver"
          inverso
          onOpen={() => abrirDetalhe('todas')}
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
              const clicavel = Boolean(l.detalheDespesas)
              return (
                <div
                  key={l.label}
                  role="row"
                  className={`rl-dre__row${l.destaque ? ` rl-dre__row--${l.destaque}` : ''}${
                    clicavel ? ' rl-dre__row--clickable' : ''
                  }`}
                  tabIndex={clicavel ? 0 : undefined}
                  onClick={clicavel ? () => abrirDetalhe(l.detalheDespesas!) : undefined}
                  onKeyDown={
                    clicavel
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            abrirDetalhe(l.detalheDespesas!)
                          }
                        }
                      : undefined
                  }
                  title={clicavel ? 'Ver despesas deste grupo' : undefined}
                >
                  <span role="cell" className="rl-dre__label">
                    {l.sinal ? <i className="rl-dre__sinal">{l.sinal}</i> : null}
                    {l.label}
                    {clicavel ? <span className="rl-dre__hint-click">detalhe</span> : null}
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
        <p className="rl-card__hint">
          Receitas pela data da venda · despesas pelo vencimento. Clique em uma linha de despesa para ver
          o detalhe.
        </p>
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

      {detalheAberto ? (
        <DespesasDetalheModal
          intervaloLabel={intervalo.label}
          detalhe={detalhe}
          loading={detalheLoading}
          erro={detalheErro}
          abaInicial={detalheAba}
          onClose={() => setDetalheAberto(false)}
        />
      ) : null}
    </div>
  )
}
