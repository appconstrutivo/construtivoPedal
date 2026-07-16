import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FinCaixasTab } from '../components/financeiro/FinCaixasTab'
import { FinContasPagarTab } from '../components/financeiro/FinContasPagarTab'
import { FinContasReceberTab } from '../components/financeiro/FinContasReceberTab'
import { obterResumoVendasHoje } from '../services/pdv.service'
import {
  labelOrigemMovimentacao,
  obterResumoContasPagar,
  obterResumoContasReceber,
  obterResumoFluxoCaixa,
  type ResumoFluxoCaixa,
} from '../services/financeiro.service'
import {
  intervaloPeriodo,
  tentarIntervaloPersonalizado,
  obterRelatorioConsolidado,
  type IntervaloRelatorio,
  type PeriodoRelatorio,
  type RelatorioConsolidado,
} from '../services/relatorios.service'

type FinanceiroPageProps = {
  companyId: string
  activeStoreId: string
  storeName?: string
  /** Atualiza badge do menu quando contas a pagar mudam (pagar, criar, cancelar). */
  onContasPagarChange?: () => void
}

type AbaFinanceiro = 'visao' | 'fluxo' | 'receber' | 'pagar' | 'contas'

const PERIODOS: { key: PeriodoRelatorio | 'custom'; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Mês' },
  { key: 'custom', label: 'Personalizado' },
]

function hojeIsoLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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

function formatShortDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function AbaVisaoGeral({
  vendasHoje,
  dados,
  resumoPagar,
  resumoReceber,
  fluxo,
  onIrFluxo,
}: {
  vendasHoje: { quantidade: number; total: number } | null
  dados: RelatorioConsolidado & { intervalo: { label: string } }
  resumoPagar: { pendentes: number; vencidas: number; totalPendente: number } | null
  resumoReceber: { pendentes: number; totalPendente: number; recebidoMesOs: number } | null
  fluxo: ResumoFluxoCaixa | null
  onIrFluxo: () => void
}) {
  const { vendas } = dados
  const saldo =
    fluxo != null ? vendas.faturamento - fluxo.totalSaidas : null

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
        <KpiCard
          tom="rose"
          label={`Saídas · ${dados.intervalo.label}`}
          value={fluxo ? formatBRL(fluxo.totalSaidas) : '—'}
          hint={
            fluxo
              ? fluxo.quantidadeSaidas > 0
                ? `${fluxo.quantidadeSaidas} lançamento(s)`
                : 'Nenhuma saída no período'
              : undefined
          }
        />
        <KpiCard
          tom="slate"
          label="Saldo do período"
          value={saldo != null ? formatBRL(saldo) : '—'}
          hint="Faturamento PDV − saídas do caixa"
        />
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
        <KpiCard
          tom="teal"
          label="A receber (pendente)"
          value={resumoReceber ? formatBRL(resumoReceber.totalPendente) : '—'}
          hint={
            resumoReceber
              ? `${resumoReceber.pendentes} título(s) · ${formatBRL(resumoReceber.recebidoMesOs)} OS no mês`
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
          <h2 className="rl-sec__title">Controle do caixa</h2>
          <ul className="fin-roadmap">
            <li>
              <strong>Fluxo de caixa</strong>
              <span>Compare entradas do PDV com saídas lançadas no período.</span>
            </li>
            <li>
              <strong>A pagar</strong>
              <span>Despesas de fornecedores, fixas e impostos — pagamentos geram saída.</span>
            </li>
            <li>
              <strong>Caixas e contas</strong>
              <span>Saídas avulsas e saldo por conta (caixa, banco, PIX).</span>
            </li>
          </ul>
          <p className="rl-card__hint">
            Vendas do PDV entram no caixa automaticamente. Lance despesas em A pagar ou saídas
            avulsas em Caixas.
          </p>
          <button type="button" className="cp-btn cp-btn--ghost fin-link-fluxo" onClick={onIrFluxo}>
            Ver fluxo de caixa
          </button>
        </section>
      </div>
    </>
  )
}

function AbaFluxo({
  dados,
  fluxo,
  onIrCaixas,
  onIrPagar,
}: {
  dados: RelatorioConsolidado
  fluxo: ResumoFluxoCaixa | null
  onIrCaixas: () => void
  onIrPagar: () => void
}) {
  const { vendas } = dados
  const totalSaidas = fluxo?.totalSaidas ?? 0
  const saldo = vendas.faturamento - totalSaidas

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--3">
        <KpiCard
          tom="teal"
          label="Entradas (PDV)"
          value={formatBRL(vendas.faturamento)}
          hint={`${vendas.quantidade} venda(s) no período`}
        />
        <KpiCard
          tom="rose"
          label="Saídas"
          value={fluxo ? formatBRL(totalSaidas) : '—'}
          hint={
            fluxo
              ? fluxo.quantidadeSaidas > 0
                ? `${fluxo.quantidadeSaidas} lançamento(s)`
                : 'Nenhuma saída no período'
              : undefined
          }
        />
        <KpiCard
          tom="slate"
          label="Saldo do período"
          value={fluxo ? formatBRL(saldo) : '—'}
          hint="Entradas PDV − saídas do caixa"
        />
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

      <section className="rl-card">
        <div className="fin-fluxo-head">
          <div>
            <h2 className="rl-sec__title">Despesas e saídas</h2>
            <p className="rl-card__hint fin-fluxo-head__hint">
              Pagamentos de contas e lançamentos manuais no caixa da loja.
            </p>
          </div>
          <div className="fin-fluxo-actions">
            <button type="button" className="cp-btn cp-btn--ghost" onClick={onIrPagar}>
              A pagar
            </button>
            <button type="button" className="cp-btn cp-btn--primary" onClick={onIrCaixas}>
              Lançar saída
            </button>
          </div>
        </div>

        {fluxo && fluxo.porOrigem.length > 0 ? (
          <ul className="rl-metrics fin-fluxo-origem">
            {fluxo.porOrigem.map((o) => (
              <li key={o.origem}>
                <span>
                  {o.label}
                  <small className="fin-fluxo-origem__qtd"> · {o.quantidade}</small>
                </span>
                <strong className="fin-valor--saida">− {formatBRL(o.total)}</strong>
              </li>
            ))}
          </ul>
        ) : null}

        {!fluxo || fluxo.saidas.length === 0 ? (
          <p className="rl-empty">
            Nenhuma saída no período. Use <strong>A pagar</strong> para despesas ou{' '}
            <strong>Caixas e contas</strong> para saídas avulsas.
          </p>
        ) : (
          <ul className="fin-fluxo-saidas">
            {fluxo.saidas.map((s) => (
              <li key={s.id} className="fin-fluxo-saida">
                <div className="fin-fluxo-saida__main">
                  <span className="fin-fluxo-saida__desc">{s.descricao}</span>
                  <span className="fin-fluxo-saida__meta">
                    {formatShortDateTime(s.realizada_em)}
                    {' · '}
                    {labelOrigemMovimentacao(s.origem)}
                    {s.contaNome ? ` · ${s.contaNome}` : ''}
                  </span>
                </div>
                <strong className="fin-valor--saida">− {formatBRL(s.valor)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export function FinanceiroPage({
  companyId,
  activeStoreId,
  storeName,
  onContasPagarChange,
}: FinanceiroPageProps) {
  const [aba, setAba] = useState<AbaFinanceiro>('visao')
  const [periodo, setPeriodo] = useState<PeriodoRelatorio | 'custom'>('mes')
  const [dataInicio, setDataInicio] = useState(hojeIsoLocal)
  const [dataFim, setDataFim] = useState(hojeIsoLocal)
  const [dados, setDados] = useState<(RelatorioConsolidado & { intervalo: { label: string } }) | null>(
    null,
  )
  const [vendasHoje, setVendasHoje] = useState<{ quantidade: number; total: number } | null>(null)
  const [resumoPagar, setResumoPagar] = useState<{
    pendentes: number
    vencidas: number
    totalPendente: number
  } | null>(null)
  const [resumoReceber, setResumoReceber] = useState<{
    pendentes: number
    totalPendente: number
    recebidoMesOs: number
  } | null>(null)
  const [fluxo, setFluxo] = useState<ResumoFluxoCaixa | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const semLoja = !activeStoreId
  const periodoDesabilitado = aba === 'receber' || aba === 'pagar' || aba === 'contas'

  const intervalo = useMemo((): IntervaloRelatorio | null => {
    if (periodo === 'custom') return tentarIntervaloPersonalizado(dataInicio, dataFim)
    return intervaloPeriodo(periodo)
  }, [periodo, dataInicio, dataFim])

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setDados(null)
      setVendasHoje(null)
      setResumoPagar(null)
      setResumoReceber(null)
      setFluxo(null)
      setLoading(false)
      return
    }
    if (periodo === 'custom' && !intervalo) {
      setErro(null)
      setDados(null)
      setFluxo(null)
      setLoading(false)
      return
    }
    if (periodo === 'custom' && dataInicio > dataFim) {
      setErro('A data inicial não pode ser posterior à data final.')
      setDados(null)
      setFluxo(null)
      setLoading(false)
      return
    }
    if (!intervalo) return

    setLoading(true)
    setErro(null)
    try {
      const [relatorio, hoje, resumo, resumoRec, resumoFluxo] = await Promise.all([
        obterRelatorioConsolidado(companyId, activeStoreId, intervalo),
        obterResumoVendasHoje(companyId, activeStoreId),
        obterResumoContasPagar(companyId, activeStoreId),
        obterResumoContasReceber(companyId, activeStoreId),
        obterResumoFluxoCaixa(companyId, activeStoreId, intervalo.desde, intervalo.ate),
      ])
      setDados(relatorio)
      setVendasHoje(hoje)
      setResumoPagar(resumo)
      setResumoReceber(resumoRec)
      setFluxo(resumoFluxo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados financeiros.')
      setDados(null)
      setVendasHoje(null)
      setResumoPagar(null)
      setResumoReceber(null)
      setFluxo(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId, intervalo, periodo, dataInicio, dataFim])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abaAnteriorRef = useRef(aba)
  useEffect(() => {
    const anterior = abaAnteriorRef.current
    abaAnteriorRef.current = aba
    const veioDeOperacional =
      anterior === 'receber' || anterior === 'pagar' || anterior === 'contas'
    if (veioDeOperacional && (aba === 'visao' || aba === 'fluxo')) {
      void carregar()
    }
  }, [aba, carregar])

  return (
    <div className="cp-page fin-page">
      <header className="rl-head">
        <div>
          <h1 className="rl-head__title">Financeiro</h1>
          <p className="rl-head__sub">
            {semLoja
              ? 'Selecione uma loja no topo da tela.'
              : `${storeName ?? 'Loja ativa'} · ${intervalo?.label ?? 'período personalizado'}`}
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
        {periodo === 'custom' && !periodoDesabilitado ? (
          <div className="rl-custom-period">
            <label className="rl-custom-period__field">
              <span>De</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                disabled={semLoja}
              />
            </label>
            <label className="rl-custom-period__field">
              <span>Até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                disabled={semLoja}
              />
            </label>
          </div>
        ) : null}
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
        <FinContasPagarTab
          companyId={companyId}
          storeId={activeStoreId}
          onListaChange={onContasPagarChange}
        />
      ) : aba === 'receber' ? (
        <FinContasReceberTab companyId={companyId} storeId={activeStoreId} />
      ) : aba === 'contas' ? (
        <FinCaixasTab companyId={companyId} storeId={activeStoreId} />
      ) : periodo === 'custom' && !intervalo ? (
        <section className="cp-panel cp-panel--muted">
          <p className="cp-panel__hint">Informe a data inicial e a data final para analisar o período.</p>
        </section>
      ) : loading && !dados ? (
        <div className="rl-loading" role="status">
          <span className="cp-auth-loading__spinner" aria-hidden />
          Carregando indicadores…
        </div>
      ) : dados ? (
        <div className={loading ? 'rl-content rl-content--loading' : 'rl-content'}>
          {aba === 'visao' && (
            <AbaVisaoGeral
              vendasHoje={vendasHoje}
              dados={dados}
              resumoPagar={resumoPagar}
              resumoReceber={resumoReceber}
              fluxo={fluxo}
              onIrFluxo={() => setAba('fluxo')}
            />
          )}
          {aba === 'fluxo' && (
            <AbaFluxo
              dados={dados}
              fluxo={fluxo}
              onIrCaixas={() => setAba('contas')}
              onIrPagar={() => setAba('pagar')}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}
