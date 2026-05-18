import { useCallback, useEffect, useState } from 'react'
import { FinCaixasTab } from '../components/financeiro/FinCaixasTab'
import { FinContasPagarTab } from '../components/financeiro/FinContasPagarTab'
import { obterResumoVendasHoje } from '../services/pdv.service'
import { obterResumoContasPagar } from '../services/financeiro.service'
import {
  obterRelatorioConsolidado,
  type PeriodoRelatorio,
  type RelatorioConsolidado,
} from '../services/relatorios.service'

type FinanceiroPageProps = {
  companyId: string
  activeStoreId: string
  storeName?: string
}

type AbaFinanceiro = 'visao' | 'fluxo' | 'receber' | 'pagar' | 'contas'

const PERIODOS: { key: PeriodoRelatorio; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Mês' },
]

const ABAS: { key: AbaFinanceiro; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'fluxo', label: 'Fluxo de caixa' },
  { key: 'receber', label: 'A receber' },
  { key: 'pagar', label: 'A pagar' },
  { key: 'contas', label: 'Caixas e contas' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function KpiCard({
  label,
  value,
  hint,
  tom,
}: {
  label: string
  value: string
  hint?: string
  tom: 'teal' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate'
}) {
  return (
    <article className={`rl-kpi rl-kpi--${tom}`}>
      <span className="rl-kpi__label">{label}</span>
      <span className="rl-kpi__value">{value}</span>
      {hint ? <span className="rl-kpi__hint">{hint}</span> : null}
    </article>
  )
}

function BarraProporcional({
  valor,
  max,
  tom,
}: {
  valor: number
  max: number
  tom: 'teal' | 'blue' | 'violet' | 'amber'
}) {
  const pct = max > 0 ? Math.min(100, Math.round((valor / max) * 100)) : 0
  return (
    <div className="rl-bar" aria-hidden>
      <div className={`rl-bar__fill rl-bar__fill--${tom}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function PainelEmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <section className="fin-soon">
      <h2 className="fin-soon__title">{titulo}</h2>
      <p className="fin-soon__text">{descricao}</p>
      <p className="fin-soon__badge">Em desenvolvimento</p>
    </section>
  )
}

function AbaVisaoGeral({
  vendasHoje,
  dados,
  resumoPagar,
}: {
  vendasHoje: { quantidade: number; total: number } | null
  dados: RelatorioConsolidado & { intervalo: { label: string } }
  resumoPagar: { pendentes: number; vencidas: number; totalPendente: number } | null
}) {
  const { vendas } = dados

  return (
    <>
      <div className="rl-kpi-grid">
        <KpiCard
          tom="teal"
          label="Entradas hoje (PDV)"
          value={vendasHoje ? formatBRL(vendasHoje.total) : '—'}
          hint={vendasHoje ? `${vendasHoje.quantidade} vendas finalizadas` : undefined}
        />
        <KpiCard
          tom="blue"
          label={`Faturamento · ${dados.intervalo.label}`}
          value={formatBRL(vendas.faturamento)}
          hint={`${vendas.quantidade} vendas no período`}
        />
        <KpiCard tom="violet" label="Ticket médio" value={formatBRL(vendas.ticketMedio)} />
        <KpiCard
          tom="amber"
          label="A pagar (pendente)"
          value={resumoPagar ? formatBRL(resumoPagar.totalPendente) : '—'}
          hint={
            resumoPagar
              ? `${resumoPagar.pendentes} conta(s)${resumoPagar.vencidas > 0 ? ` · ${resumoPagar.vencidas} vencida(s)` : ''}`
              : undefined
          }
        />
      </div>

      <div className="rl-split">
        <section className="rl-card">
          <h2 className="rl-sec__title">Entradas por forma de pagamento</h2>
          {vendas.quantidade === 0 ? (
            <p className="rl-empty">Nenhuma venda no período selecionado.</p>
          ) : (
            <ul className="rl-ranked">
              {vendas.porFormaPagamento
                .filter((f) => f.total > 0)
                .map((f) => (
                  <li key={f.forma} className="rl-ranked__row">
                    <div className="rl-ranked__head">
                      <span>{f.label}</span>
                      <span>{formatBRL(f.total)}</span>
                    </div>
                    <BarraProporcional valor={f.total} max={vendas.faturamento} tom="teal" />
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rl-card">
          <h2 className="rl-sec__title">Próximos passos</h2>
          <ul className="fin-roadmap">
            <li>
              <strong>Fluxo de caixa</strong>
              <span>Entradas e saídas consolidadas, com lançamentos manuais.</span>
            </li>
            <li>
              <strong>Contas a receber</strong>
              <span>Vendas a prazo, OS faturadas e crediário de clientes.</span>
            </li>
            <li>
              <strong>Contas a pagar</strong>
              <span>Fornecedores, despesas fixas e alertas de vencimento.</span>
            </li>
            <li>
              <strong>Caixas e contas</strong>
              <span>Caixa da loja, bancos e abertura/fechamento de turno.</span>
            </li>
          </ul>
          <p className="rl-card__hint">
            Entradas vêm do PDV. Use as abas A pagar e Caixas e contas para despesas e saldos da loja.
          </p>
        </section>
      </div>
    </>
  )
}

function AbaFluxo({ dados }: { dados: RelatorioConsolidado }) {
  const { vendas } = dados

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--3">
        <KpiCard tom="teal" label="Entradas (PDV)" value={formatBRL(vendas.faturamento)} />
        <KpiCard tom="rose" label="Saídas" value="—" hint="Lançamentos manuais em breve" />
        <KpiCard tom="slate" label="Saldo projetado" value="—" hint="Entradas − saídas" />
      </div>
      <section className="rl-card">
        <h2 className="rl-sec__title">Movimentações automáticas · PDV</h2>
        {vendas.quantidade === 0 ? (
          <p className="rl-empty">Sem vendas no período.</p>
        ) : (
          <ul className="rl-metrics">
            {vendas.porFormaPagamento
              .filter((f) => f.total > 0)
              .map((f) => (
                <li key={f.forma}>
                  <span>{f.label}</span>
                  <strong className="fin-valor--entrada">+ {formatBRL(f.total)}</strong>
                </li>
              ))}
          </ul>
        )}
      </section>
      <PainelEmBreve
        titulo="Despesas e transferências"
        descricao="Registre saídas avulsas, pagamentos a fornecedores e movimentações entre contas."
      />
    </>
  )
}

export function FinanceiroPage({ companyId, activeStoreId, storeName }: FinanceiroPageProps) {
  const [aba, setAba] = useState<AbaFinanceiro>('visao')
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>('mes')
  const [dados, setDados] = useState<(RelatorioConsolidado & { intervalo: { label: string } }) | null>(
    null,
  )
  const [vendasHoje, setVendasHoje] = useState<{ quantidade: number; total: number } | null>(null)
  const [resumoPagar, setResumoPagar] = useState<{
    pendentes: number
    vencidas: number
    totalPendente: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const semLoja = !activeStoreId
  const periodoDesabilitado = aba === 'receber' || aba === 'pagar' || aba === 'contas'

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setDados(null)
      setVendasHoje(null)
      setResumoPagar(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const [relatorio, hoje, resumo] = await Promise.all([
        obterRelatorioConsolidado(companyId, activeStoreId, periodo),
        obterResumoVendasHoje(companyId, activeStoreId),
        obterResumoContasPagar(companyId, activeStoreId),
      ])
      setDados(relatorio)
      setVendasHoje(hoje)
      setResumoPagar(resumo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados financeiros.')
      setDados(null)
      setVendasHoje(null)
      setResumoPagar(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId, periodo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return (
    <div className="cp-page fin-page">
      <header className="rl-head">
        <div>
          <h1 className="rl-head__title">Financeiro</h1>
          <p className="rl-head__sub">
            {semLoja
              ? 'Selecione uma loja no topo da tela.'
              : `${storeName ?? 'Loja ativa'} · gestão financeira da empresa`}
          </p>
        </div>
        <button
          type="button"
          className="cp-btn cp-btn--ghost"
          onClick={() => void carregar()}
          disabled={loading || semLoja}
        >
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      <div className="rl-toolbar">
        <div className="rl-period" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={periodo === p.key}
              className={periodo === p.key ? 'rl-period__btn rl-period__btn--active' : 'rl-period__btn'}
              onClick={() => setPeriodo(p.key)}
              disabled={semLoja || periodoDesabilitado}
              title={
                periodoDesabilitado
                  ? 'Período disponível nas abas Visão geral e Fluxo de caixa'
                  : undefined
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <nav className="rl-tabs" aria-label="Área financeira">
          {ABAS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={aba === t.key ? 'rl-tabs__btn rl-tabs__btn--active' : 'rl-tabs__btn'}
              onClick={() => setAba(t.key)}
              disabled={semLoja}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {erro ? (
        <div className="rl-alert" role="alert">
          {erro}
        </div>
      ) : null}

      {semLoja ? (
        <section className="cp-panel cp-panel--muted">
          <p className="cp-panel__hint">
            O financeiro respeita a loja selecionada no cabeçalho. Troque a loja para ver outra
            unidade.
          </p>
        </section>
      ) : aba === 'pagar' ? (
        <FinContasPagarTab companyId={companyId} storeId={activeStoreId} />
      ) : aba === 'contas' ? (
        <FinCaixasTab companyId={companyId} storeId={activeStoreId} />
      ) : loading && !dados ? (
        <div className="rl-loading" role="status">
          <span className="cp-auth-loading__spinner" aria-hidden />
          Carregando indicadores…
        </div>
      ) : dados ? (
        <div className={loading ? 'rl-content rl-content--loading' : 'rl-content'}>
          {aba === 'visao' && (
            <AbaVisaoGeral vendasHoje={vendasHoje} dados={dados} resumoPagar={resumoPagar} />
          )}
          {aba === 'fluxo' && <AbaFluxo dados={dados} />}
          {aba === 'receber' && (
            <PainelEmBreve
              titulo="Contas a receber"
              descricao="Parcelas de vendas, OS faturadas e recebimentos de clientes, com baixa automática ao receber no caixa."
            />
          )}
        </div>
      ) : null}
    </div>
  )
}
