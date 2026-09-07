import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FinCaixasTab } from '../components/financeiro/FinCaixasTab'
import { FinContasPagarTab } from '../components/financeiro/FinContasPagarTab'
import { FinContasReceberTab } from '../components/financeiro/FinContasReceberTab'
import { obterResumoVendasHoje } from '../services/pdv.service'
import {
  labelOrigemMovimentacao,
  listarContasFinanceiras,
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
  onNavigateFornecedores?: () => void
  onNavigateRelatorios?: () => void
}

type AbaFinanceiro = 'caixa' | 'receber' | 'pagar' | 'contas' | 'extrato'

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
  { key: 'caixa', label: 'Caixa' },
  { key: 'receber', label: 'A receber' },
  { key: 'pagar', label: 'A pagar' },
  { key: 'contas', label: 'Contas' },
  { key: 'extrato', label: 'Extrato' },
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

function formatShortDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function LinkModulo({
  texto,
  onClick,
}: {
  texto: string
  onClick?: () => void
}) {
  if (!onClick) return null
  return (
    <p className="rl-cross-link">
      <button type="button" className="rl-cross-link__btn" onClick={onClick}>
        {texto}
      </button>
    </p>
  )
}

function AbaCaixa({
  vendasHoje,
  saldoContas,
  fluxoHoje,
  resumoPagar,
  resumoReceber,
  onIrReceber,
  onIrPagar,
  onIrContas,
  onIrExtrato,
  onNavigateRelatorios,
}: {
  vendasHoje: { quantidade: number; total: number } | null
  saldoContas: number | null
  fluxoHoje: ResumoFluxoCaixa | null
  resumoPagar: { pendentes: number; vencidas: number; totalPendente: number } | null
  resumoReceber: { pendentes: number; totalPendente: number; recebidoMesOs: number } | null
  onIrReceber: () => void
  onIrPagar: () => void
  onIrContas: () => void
  onIrExtrato: () => void
  onNavigateRelatorios?: () => void
}) {
  const entradasHoje = vendasHoje?.total ?? 0
  const saidasHoje = fluxoHoje?.totalSaidas ?? 0

  return (
    <>
      <div className="rl-kpi-grid">
        <KpiCard
          tom="slate"
          label="Saldo atual"
          value={saldoContas != null ? formatBRL(saldoContas) : '—'}
          hint="Soma das contas ativas da loja"
        />
        <KpiCard
          tom="teal"
          label="Vendas hoje (PDV)"
          value={vendasHoje ? formatBRL(entradasHoje) : '—'}
          hint={vendasHoje ? `${vendasHoje.quantidade} venda(s) finalizadas` : undefined}
        />
        <KpiCard
          tom="rose"
          label="Saídas hoje"
          value={fluxoHoje ? formatBRL(saidasHoje) : '—'}
          hint={
            fluxoHoje
              ? fluxoHoje.quantidadeSaidas > 0
                ? `${fluxoHoje.quantidadeSaidas} lançamento(s)`
                : 'Nenhuma saída hoje'
              : undefined
          }
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
          tom="blue"
          label="A receber (pendente)"
          value={resumoReceber ? formatBRL(resumoReceber.totalPendente) : '—'}
          hint={
            resumoReceber
              ? `${resumoReceber.pendentes} título(s) em aberto`
              : undefined
          }
        />
      </div>

      <div className="rl-split">
        <section className="rl-card">
          <h2 className="rl-sec__title">Pendências</h2>
          <ul className="rl-metrics">
            <li>
              <span>Contas a pagar</span>
              <strong>
                {resumoPagar
                  ? `${resumoPagar.pendentes}${resumoPagar.vencidas > 0 ? ` (${resumoPagar.vencidas} vencida(s))` : ''}`
                  : '—'}
              </strong>
            </li>
            <li>
              <span>Títulos a receber</span>
              <strong>{resumoReceber ? resumoReceber.pendentes : '—'}</strong>
            </li>
            <li>
              <span>Saldo do dia</span>
              <strong>{formatBRL(entradasHoje - saidasHoje)}</strong>
            </li>
          </ul>
          <div className="fin-fluxo-actions fin-caixa-actions">
            <button type="button" className="cp-btn cp-btn--ghost" onClick={onIrPagar}>
              Ir para A pagar
            </button>
            <button type="button" className="cp-btn cp-btn--ghost" onClick={onIrReceber}>
              Ir para A receber
            </button>
          </div>
        </section>

        <section className="rl-card">
          <h2 className="rl-sec__title">Ações rápidas</h2>
          <p className="rl-card__hint">
            Vendas do PDV entram no caixa automaticamente. Lance despesas em A pagar ou saídas avulsas
            em Contas.
          </p>
          <div className="fin-fluxo-actions fin-caixa-actions">
            <button type="button" className="cp-btn cp-btn--primary" onClick={onIrContas}>
              Lançar saída
            </button>
            <button type="button" className="cp-btn cp-btn--ghost" onClick={onIrExtrato}>
              Ver extrato
            </button>
          </div>
        </section>
      </div>

      <LinkModulo
        texto="Faturamento do período e análise de vendas → Ver em Relatórios"
        onClick={onNavigateRelatorios}
      />
    </>
  )
}

function AbaExtrato({
  dados,
  fluxo,
  intervaloLabel,
  onIrCaixas,
  onIrPagar,
  onNavigateRelatorios,
}: {
  dados: RelatorioConsolidado
  fluxo: ResumoFluxoCaixa | null
  intervaloLabel: string
  onIrCaixas: () => void
  onIrPagar: () => void
  onNavigateRelatorios?: () => void
}) {
  const { vendas } = dados
  const totalSaidas = fluxo?.totalSaidas ?? 0
  const saldo = vendas.faturamento - totalSaidas

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--3">
        <KpiCard
          tom="teal"
          label={`Vendas no período (PDV) · ${intervaloLabel}`}
          value={formatBRL(vendas.faturamento)}
          hint={`${vendas.quantidade} venda(s) · balcão + oficina`}
        />
        <KpiCard
          tom="rose"
          label={`Saídas · ${intervaloLabel}`}
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
          hint="Vendas PDV − saídas do caixa"
        />
      </div>

      <section className="rl-card">
        <div className="fin-fluxo-head">
          <div>
            <h2 className="rl-sec__title">Movimentações de saída</h2>
            <p className="rl-card__hint fin-fluxo-head__hint">
              Pagamentos de contas e lançamentos manuais no período selecionado.
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
            <strong>Contas</strong> para saídas avulsas.
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

      <LinkModulo
        texto="Faturamento detalhado, ticket médio e mix de pagamento → Ver em Relatórios"
        onClick={onNavigateRelatorios}
      />
    </>
  )
}

export function FinanceiroPage({
  companyId,
  activeStoreId,
  storeName,
  onContasPagarChange,
  onNavigateFornecedores,
  onNavigateRelatorios,
}: FinanceiroPageProps) {
  const [aba, setAba] = useState<AbaFinanceiro>('caixa')
  const [periodo, setPeriodo] = useState<PeriodoRelatorio | 'custom'>('mes')
  const [dataInicio, setDataInicio] = useState(hojeIsoLocal)
  const [dataFim, setDataFim] = useState(hojeIsoLocal)
  const [dadosExtrato, setDadosExtrato] = useState<
    (RelatorioConsolidado & { intervalo: { label: string } }) | null
  >(null)
  const [vendasHoje, setVendasHoje] = useState<{ quantidade: number; total: number } | null>(null)
  const [saldoContas, setSaldoContas] = useState<number | null>(null)
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
  const [fluxoHoje, setFluxoHoje] = useState<ResumoFluxoCaixa | null>(null)
  const [fluxoExtrato, setFluxoExtrato] = useState<ResumoFluxoCaixa | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const semLoja = !activeStoreId
  const periodoDesabilitado = aba !== 'extrato'
  const precisaDadosDashboard = aba === 'caixa' || aba === 'extrato'

  const intervalo = useMemo((): IntervaloRelatorio | null => {
    if (periodo === 'custom') return tentarIntervaloPersonalizado(dataInicio, dataFim)
    return intervaloPeriodo(periodo)
  }, [periodo, dataInicio, dataFim])

  const carregarCaixa = useCallback(async () => {
    const hojeInterval = intervaloPeriodo('hoje')
    const [hoje, resumo, resumoRec, fluxo, contas] = await Promise.all([
      obterResumoVendasHoje(companyId, activeStoreId),
      obterResumoContasPagar(companyId, activeStoreId),
      obterResumoContasReceber(companyId, activeStoreId),
      obterResumoFluxoCaixa(companyId, activeStoreId, hojeInterval.desde, hojeInterval.ate),
      listarContasFinanceiras(companyId, activeStoreId),
    ])
    setVendasHoje(hoje)
    setResumoPagar(resumo)
    setResumoReceber(resumoRec)
    setFluxoHoje(fluxo)
    setSaldoContas(contas.reduce((acc, c) => acc + c.saldo_atual, 0))
  }, [companyId, activeStoreId])

  const carregarExtrato = useCallback(async () => {
    if (!intervalo) return
    const [relatorio, resumoFluxo] = await Promise.all([
      obterRelatorioConsolidado(companyId, activeStoreId, intervalo),
      obterResumoFluxoCaixa(companyId, activeStoreId, intervalo.desde, intervalo.ate),
    ])
    setDadosExtrato(relatorio)
    setFluxoExtrato(resumoFluxo)
  }, [companyId, activeStoreId, intervalo])

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setDadosExtrato(null)
      setVendasHoje(null)
      setSaldoContas(null)
      setResumoPagar(null)
      setResumoReceber(null)
      setFluxoHoje(null)
      setFluxoExtrato(null)
      setLoading(false)
      return
    }
    if (aba === 'extrato') {
      if (periodo === 'custom' && !intervalo) {
        setErro(null)
        setDadosExtrato(null)
        setFluxoExtrato(null)
        setLoading(false)
        return
      }
      if (periodo === 'custom' && dataInicio > dataFim) {
        setErro('A data inicial não pode ser posterior à data final.')
        setDadosExtrato(null)
        setFluxoExtrato(null)
        setLoading(false)
        return
      }
      if (!intervalo) return
    }

    setLoading(true)
    setErro(null)
    try {
      if (aba === 'caixa') {
        await carregarCaixa()
      } else if (aba === 'extrato') {
        await carregarExtrato()
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados financeiros.')
      if (aba === 'caixa') {
        setVendasHoje(null)
        setSaldoContas(null)
        setResumoPagar(null)
        setResumoReceber(null)
        setFluxoHoje(null)
      } else if (aba === 'extrato') {
        setDadosExtrato(null)
        setFluxoExtrato(null)
      }
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, aba, periodo, dataInicio, dataFim, intervalo, carregarCaixa, carregarExtrato])

  useEffect(() => {
    if (!precisaDadosDashboard) return
    void carregar()
  }, [carregar, precisaDadosDashboard])

  const abaAnteriorRef = useRef(aba)
  useEffect(() => {
    const anterior = abaAnteriorRef.current
    abaAnteriorRef.current = aba
    const veioDeOperacional =
      anterior === 'receber' || anterior === 'pagar' || anterior === 'contas'
    if (veioDeOperacional && aba === 'caixa') {
      void carregarCaixa()
    }
  }, [aba, carregarCaixa])

  const subtitulo = semLoja
    ? 'Selecione uma loja no topo da tela.'
    : aba === 'caixa'
      ? `${storeName ?? 'Loja ativa'} · Caixa e pendências do dia`
      : aba === 'extrato'
        ? `${storeName ?? 'Loja ativa'} · ${intervalo?.label ?? 'período personalizado'}`
        : `${storeName ?? 'Loja ativa'} · Operação financeira`

  return (
    <div className="cp-page fin-page">
      <header className="rl-head">
        <div>
          <h1 className="rl-head__title">Financeiro</h1>
          <p className="rl-head__sub">{subtitulo}</p>
        </div>
        {precisaDadosDashboard ? (
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={() => void carregar()}
            disabled={loading || semLoja}
          >
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        ) : null}
      </header>

      <div className="rl-toolbar">
        <div
          className={periodoDesabilitado ? 'rl-period rl-period--disabled' : 'rl-period'}
          role="tablist"
          aria-label="Período"
        >
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={periodo === p.key}
              className={periodo === p.key ? 'rl-period__btn rl-period__btn--active' : 'rl-period__btn'}
              onClick={() => setPeriodo(p.key)}
              disabled={semLoja || periodoDesabilitado}
              title={periodoDesabilitado ? 'Período disponível na aba Extrato' : undefined}
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
          onNavigateFornecedores={onNavigateFornecedores}
        />
      ) : aba === 'receber' ? (
        <FinContasReceberTab companyId={companyId} storeId={activeStoreId} />
      ) : aba === 'contas' ? (
        <FinCaixasTab companyId={companyId} storeId={activeStoreId} />
      ) : aba === 'extrato' && periodo === 'custom' && !intervalo ? (
        <section className="cp-panel cp-panel--muted">
          <p className="cp-panel__hint">Informe a data inicial e a data final para ver o extrato.</p>
        </section>
      ) : loading && (aba === 'caixa' ? !vendasHoje && saldoContas === null : !dadosExtrato) ? (
        <div className="rl-loading" role="status">
          <span className="cp-auth-loading__spinner" aria-hidden />
          Carregando indicadores…
        </div>
      ) : aba === 'caixa' ? (
        <div className={loading ? 'rl-content rl-content--loading' : 'rl-content'}>
          <AbaCaixa
            vendasHoje={vendasHoje}
            saldoContas={saldoContas}
            fluxoHoje={fluxoHoje}
            resumoPagar={resumoPagar}
            resumoReceber={resumoReceber}
            onIrReceber={() => setAba('receber')}
            onIrPagar={() => setAba('pagar')}
            onIrContas={() => setAba('contas')}
            onIrExtrato={() => setAba('extrato')}
            onNavigateRelatorios={onNavigateRelatorios}
          />
        </div>
      ) : aba === 'extrato' && dadosExtrato ? (
        <div className={loading ? 'rl-content rl-content--loading' : 'rl-content'}>
          <AbaExtrato
            dados={dadosExtrato}
            fluxo={fluxoExtrato}
            intervaloLabel={dadosExtrato.intervalo.label}
            onIrCaixas={() => setAba('contas')}
            onIrPagar={() => setAba('pagar')}
            onNavigateRelatorios={onNavigateRelatorios}
          />
        </div>
      ) : null}
    </div>
  )
}
