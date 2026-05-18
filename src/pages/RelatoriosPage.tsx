import { useCallback, useEffect, useState } from 'react'
import {
  obterRelatorioConsolidado,
  type PeriodoRelatorio,
  type RelatorioConsolidado,
} from '../services/relatorios.service'

type RelatoriosPageProps = {
  companyId: string
  activeStoreId: string
  storeName?: string
}

type AbaRelatorio = 'geral' | 'vendas' | 'oficina' | 'estoque' | 'clientes'

const PERIODOS: { key: PeriodoRelatorio; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Mês' },
]

const ABAS: { key: AbaRelatorio; label: string }[] = [
  { key: 'geral', label: 'Geral' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'oficina', label: 'Oficina' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'clientes', label: 'Clientes' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatNum(v: number, dec = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(v)
}

function BarraProporcional({
  valor,
  max,
  tom,
}: {
  valor: number
  max: number
  tom: 'teal' | 'blue' | 'violet' | 'amber' | 'rose'
}) {
  const pct = max > 0 ? Math.min(100, Math.round((valor / max) * 100)) : 0
  return (
    <div className="rl-bar" aria-hidden>
      <div className={`rl-bar__fill rl-bar__fill--${tom}`} style={{ width: `${pct}%` }} />
    </div>
  )
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

function SecaoTitulo({ children }: { children: string }) {
  return <h2 className="rl-sec__title">{children}</h2>
}

function ListaVazia({ texto }: { texto: string }) {
  return <p className="rl-empty">{texto}</p>
}

function AbaGeral({ dados }: { dados: RelatorioConsolidado }) {
  const { vendas, oficina, estoque, clientes } = dados
  return (
    <>
      <div className="rl-kpi-grid">
        <KpiCard tom="teal" label="Faturamento PDV" value={formatBRL(vendas.faturamento)} hint={`${vendas.quantidade} vendas`} />
        <KpiCard tom="blue" label="Ticket médio" value={formatBRL(vendas.ticketMedio)} />
        <KpiCard tom="violet" label="OS abertas" value={String(oficina.abertasAgora)} hint={`${oficina.entreguesNoPeriodo} entregues no período`} />
        <KpiCard tom="amber" label="Estoque crítico" value={String(estoque.criticos)} hint={`${estoque.reposicao} em reposição`} />
      </div>
      <div className="rl-split">
        <section className="rl-card">
          <SecaoTitulo>Resumo operacional</SecaoTitulo>
          <ul className="rl-metrics">
            <li>
              <span>Oficina — OS criadas</span>
              <strong>{oficina.criadasNoPeriodo}</strong>
            </li>
            <li>
              <span>Oficina — valor itens</span>
              <strong>{formatBRL(oficina.faturamentoItens)}</strong>
            </li>
            <li>
              <span>Estoque — valor em custo</span>
              <strong>{formatBRL(estoque.valorEstoque)}</strong>
            </li>
            <li>
              <span>Clientes — novos</span>
              <strong>{clientes.novosNoPeriodo}</strong>
            </li>
            <li>
              <span>Clientes — inativos 90d</span>
              <strong>{clientes.inativos90d}</strong>
            </li>
          </ul>
        </section>
        <section className="rl-card">
          <SecaoTitulo>Formas de pagamento</SecaoTitulo>
          {vendas.quantidade === 0 ? (
            <ListaVazia texto="Nenhuma venda no período." />
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
      </div>
    </>
  )
}

function AbaVendas({ dados }: { dados: RelatorioConsolidado }) {
  const { vendas } = dados
  const maxTop = vendas.topProdutos[0]?.faturamento ?? 0

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--3">
        <KpiCard tom="teal" label="Faturamento" value={formatBRL(vendas.faturamento)} />
        <KpiCard tom="blue" label="Vendas" value={String(vendas.quantidade)} />
        <KpiCard tom="violet" label="Descontos" value={formatBRL(vendas.descontos)} />
      </div>
      <div className="rl-split">
        <section className="rl-card">
          <SecaoTitulo>Por forma de pagamento</SecaoTitulo>
          {vendas.quantidade === 0 ? (
            <ListaVazia texto="Sem vendas no período selecionado." />
          ) : (
            <ul className="rl-ranked">
              {vendas.porFormaPagamento.map((f) => (
                <li key={f.forma} className="rl-ranked__row">
                  <div className="rl-ranked__head">
                    <span>
                      {f.label} <em className="rl-muted">({f.quantidade})</em>
                    </span>
                    <span>{formatBRL(f.total)}</span>
                  </div>
                  <BarraProporcional valor={f.total} max={vendas.faturamento} tom="blue" />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rl-card">
          <SecaoTitulo>Produtos mais vendidos</SecaoTitulo>
          {vendas.topProdutos.length === 0 ? (
            <ListaVazia texto="Sem itens registrados." />
          ) : (
            <ol className="rl-table">
              {vendas.topProdutos.map((p, i) => (
                <li key={p.descricao} className="rl-table__row">
                  <span className="rl-table__rank">{i + 1}</span>
                  <span className="rl-table__name">{p.descricao}</span>
                  <span className="rl-table__qty">{formatNum(p.quantidade, 0)} un.</span>
                  <span className="rl-table__val">{formatBRL(p.faturamento)}</span>
                  <BarraProporcional valor={p.faturamento} max={maxTop} tom="teal" />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}

function AbaOficina({ dados }: { dados: RelatorioConsolidado }) {
  const { oficina } = dados
  const maxStatus = oficina.porStatus[0]?.quantidade ?? 0

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--4">
        <KpiCard tom="violet" label="Abertas agora" value={String(oficina.abertasAgora)} />
        <KpiCard tom="blue" label="Criadas" value={String(oficina.criadasNoPeriodo)} />
        <KpiCard tom="teal" label="Entregues" value={String(oficina.entreguesNoPeriodo)} />
        <KpiCard tom="rose" label="Canceladas" value={String(oficina.canceladasNoPeriodo)} />
      </div>
      <div className="rl-split">
        <section className="rl-card">
          <SecaoTitulo>Pipeline por status</SecaoTitulo>
          {oficina.porStatus.length === 0 ? (
            <ListaVazia texto="Nenhuma OS nesta loja." />
          ) : (
            <ul className="rl-ranked">
              {oficina.porStatus.map((s) => (
                <li key={s.status} className="rl-ranked__row">
                  <div className="rl-ranked__head">
                    <span>{s.label}</span>
                    <span>{s.quantidade}</span>
                  </div>
                  <BarraProporcional valor={s.quantidade} max={maxStatus} tom="violet" />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rl-card">
          <SecaoTitulo>Receita de peças e serviços</SecaoTitulo>
          <p className="rl-highlight">{formatBRL(oficina.faturamentoItens)}</p>
          <p className="rl-card__hint">
            Soma dos itens lançados nas OS criadas no período (peças e mão de obra).
          </p>
        </section>
      </div>
    </>
  )
}

function AbaEstoque({ dados }: { dados: RelatorioConsolidado }) {
  const { estoque } = dados

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--4">
        <KpiCard tom="slate" label="SKUs ativos" value={String(estoque.totalSkus)} />
        <KpiCard tom="rose" label="Críticos" value={String(estoque.criticos)} />
        <KpiCard tom="amber" label="Reposição" value={String(estoque.reposicao)} />
        <KpiCard tom="teal" label="Valor (custo)" value={formatBRL(estoque.valorEstoque)} />
      </div>
      <div className="rl-split">
        <section className="rl-card">
          <SecaoTitulo>Movimentações no período</SecaoTitulo>
          <ul className="rl-metrics">
            <li>
              <span>Entradas</span>
              <strong>{formatNum(estoque.entradas, 0)} un.</strong>
            </li>
            <li>
              <span>Saídas</span>
              <strong>{formatNum(estoque.saidas, 0)} un.</strong>
            </li>
          </ul>
        </section>
        <section className="rl-card">
          <SecaoTitulo>Itens em alerta crítico</SecaoTitulo>
          {estoque.itensCriticos.length === 0 ? (
            <ListaVazia texto="Nenhum item crítico no momento." />
          ) : (
            <ul className="rl-table rl-table--compact">
              {estoque.itensCriticos.map((i) => (
                <li key={i.nome} className="rl-table__row">
                  <span className="rl-table__name">{i.nome}</span>
                  <span className="rl-table__qty">
                    {formatNum(i.saldo, 0)} / mín. {formatNum(i.minimo, 0)}
                  </span>
                  {i.sku ? <span className="rl-table__sku">{i.sku}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function AbaClientes({ dados }: { dados: RelatorioConsolidado }) {
  const { clientes } = dados
  const pctBikes =
    clientes.total > 0 ? Math.round((clientes.comBicicleta / clientes.total) * 100) : 0

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--4">
        <KpiCard tom="teal" label="Base total" value={String(clientes.total)} />
        <KpiCard tom="blue" label="Novos no período" value={String(clientes.novosNoPeriodo)} />
        <KpiCard tom="violet" label="Com bicicleta" value={String(clientes.comBicicleta)} hint={`${pctBikes}% da base`} />
        <KpiCard tom="amber" label="Inativos 90d" value={String(clientes.inativos90d)} hint="Sem atividade recente" />
      </div>
      <section className="rl-card">
        <SecaoTitulo>CRM — oportunidades</SecaoTitulo>
        <ul className="rl-insights">
          {clientes.inativos90d > 0 ? (
            <li>
              <strong>{clientes.inativos90d}</strong> clientes sem visita há mais de 90 dias — candidatos a
              campanha de reativação.
            </li>
          ) : (
            <li>Base ativa: nenhum cliente inativo há 90 dias.</li>
          )}
          {clientes.novosNoPeriodo > 0 ? (
            <li>
              <strong>{clientes.novosNoPeriodo}</strong> novos cadastros no período — ideal para onboarding e
              primeira revisão.
            </li>
          ) : null}
          {clientes.comBicicleta < clientes.total ? (
            <li>
              <strong>{clientes.total - clientes.comBicicleta}</strong> clientes sem bike cadastrada — oportunidade
              de vincular o ativo e histórico de manutenção.
            </li>
          ) : null}
        </ul>
      </section>
    </>
  )
}

export function RelatoriosPage({ companyId, activeStoreId, storeName }: RelatoriosPageProps) {
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>('30d')
  const [aba, setAba] = useState<AbaRelatorio>('geral')
  const [dados, setDados] = useState<(RelatorioConsolidado & { intervalo: { label: string } }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setDados(null)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const res = await obterRelatorioConsolidado(companyId, activeStoreId, periodo)
      setDados(res)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar relatórios.')
      setDados(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId, periodo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const semLoja = !activeStoreId

  return (
    <div className="cp-page rl-page">
      <header className="rl-head">
        <div>
          <h1 className="rl-head__title">Relatórios</h1>
          <p className="rl-head__sub">
            {semLoja
              ? 'Selecione uma loja no topo da tela.'
              : `${storeName ?? 'Loja ativa'} · ${dados?.intervalo.label ?? '…'}`}
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
              disabled={semLoja}
            >
              {p.label}
            </button>
          ))}
        </div>
        <nav className="rl-tabs" aria-label="Tipo de relatório">
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
          <p className="cp-panel__hint">Os relatórios respeitam a loja selecionada no cabeçalho.</p>
        </section>
      ) : loading && !dados ? (
        <div className="rl-loading" role="status">
          <span className="cp-auth-loading__spinner" aria-hidden />
          Carregando indicadores…
        </div>
      ) : dados ? (
        <div className={loading ? 'rl-content rl-content--loading' : 'rl-content'}>
          {aba === 'geral' && <AbaGeral dados={dados} />}
          {aba === 'vendas' && <AbaVendas dados={dados} />}
          {aba === 'oficina' && <AbaOficina dados={dados} />}
          {aba === 'estoque' && <AbaEstoque dados={dados} />}
          {aba === 'clientes' && <AbaClientes dados={dados} />}
        </div>
      ) : null}
    </div>
  )
}
