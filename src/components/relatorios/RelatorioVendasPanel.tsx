import { useCallback, useEffect, useState } from 'react'
import { listarClientes } from '../../services/clientes.service'
import type { FormaPagamento } from '../../services/pdv.service'
import {
  obterRelatorioVendasDetalhado,
  type FiltrosRelatorioVendas,
  type OrigemVendaFiltro,
  type RelatorioVendasDetalhado,
} from '../../services/relatorios-vendas.service'
import type { IntervaloRelatorio } from '../../services/relatorios.service'

type VisaoVendas = 'resumo' | 'vendas' | 'itens' | 'servicos' | 'clientes' | 'diario'

type RelatorioVendasPanelProps = {
  companyId: string
  activeStoreId: string
  intervalo: IntervaloRelatorio
}

const VISAO: { key: VisaoVendas; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'vendas', label: 'Por venda' },
  { key: 'itens', label: 'Por peça' },
  { key: 'servicos', label: 'Por serviço' },
  { key: 'clientes', label: 'Por cliente' },
  { key: 'diario', label: 'Faturamento diário' },
]

const ORIGENS: { key: OrigemVendaFiltro; label: string }[] = [
  { key: 'todas', label: 'Todas as origens' },
  { key: 'balcao', label: 'Balcão (PDV)' },
  { key: 'oficina', label: 'Oficina (OS)' },
]

const FORMAS: { key: FormaPagamento | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas as formas' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'pix', label: 'PIX' },
  { key: 'credito', label: 'Crédito' },
  { key: 'debito', label: 'Débito' },
  { key: 'outro', label: 'Outro' },
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

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
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

function ListaVazia({ texto }: { texto: string }) {
  return <p className="rl-empty">{texto}</p>
}

function VisaoResumo({ dados }: { dados: RelatorioVendasDetalhado }) {
  const { resumo } = dados
  const maxTop = resumo.topProdutos[0]?.faturamento ?? 0

  return (
    <>
      <div className="rl-kpi-grid rl-kpi-grid--4">
        <KpiCard tom="teal" label="Faturamento" value={formatBRL(resumo.faturamento)} />
        <KpiCard
          tom="blue"
          label="Vendas"
          value={String(resumo.quantidade)}
          hint={
            resumo.quantidade > 0
              ? `Balcão ${resumo.quantidadeBalcao} · Oficina ${resumo.quantidadeOficina}`
              : undefined
          }
        />
        <KpiCard tom="violet" label="Ticket médio" value={formatBRL(resumo.ticketMedio)} />
        <KpiCard tom="amber" label="Descontos" value={formatBRL(resumo.descontos)} />
      </div>
      <div className="rl-kpi-grid rl-kpi-grid--2 rl-vendas-mix">
        <KpiCard
          tom="teal"
          label="Balcão (PDV)"
          value={formatBRL(resumo.faturamentoBalcao)}
          hint={`${resumo.quantidadeBalcao} vendas no período`}
        />
        <KpiCard
          tom="violet"
          label="Oficina (OS)"
          value={formatBRL(resumo.faturamentoOficina)}
          hint={`${resumo.quantidadeOficina} recebimentos no período`}
        />
      </div>
      <div className="rl-split">
        <section className="rl-card">
          <h2 className="rl-sec__title">Formas de pagamento</h2>
          {resumo.quantidade === 0 ? (
            <ListaVazia texto="Sem vendas no período selecionado." />
          ) : (
            <ul className="rl-ranked">
              {resumo.porFormaPagamento
                .filter((f) => f.total > 0)
                .map((f) => (
                  <li key={f.forma} className="rl-ranked__row">
                    <div className="rl-ranked__head">
                      <span>
                        {f.label} <em className="rl-muted">({f.quantidade})</em>
                      </span>
                      <span>{formatBRL(f.total)}</span>
                    </div>
                    <BarraProporcional valor={f.total} max={resumo.faturamento} tom="blue" />
                  </li>
                ))}
            </ul>
          )}
        </section>
        <section className="rl-card">
          <h2 className="rl-sec__title">Peças em destaque</h2>
          {resumo.topProdutos.length === 0 ? (
            <ListaVazia texto="Sem peças vendidas no período." />
          ) : (
            <ol className="rl-table">
              {resumo.topProdutos.map((p, i) => (
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

function VisaoPorVenda({ dados }: { dados: RelatorioVendasDetalhado }) {
  if (dados.porVenda.length === 0) {
    return <ListaVazia texto="Nenhuma venda encontrada com os filtros aplicados." />
  }

  return (
    <div className="rl-card rl-card--flush">
      <div className="rl-data-table-wrap">
        <table className="rl-data-table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Origem</th>
              <th>Itens</th>
              <th>Pagamento</th>
              <th className="rl-data-table__num">Total</th>
            </tr>
          </thead>
          <tbody>
            {dados.porVenda.map((v) => (
              <tr key={v.id}>
                <td className="rl-data-table__strong">#{v.numero}</td>
                <td>{formatShortDate(v.realizadaEm)}</td>
                <td>{v.clienteNome ?? '—'}</td>
                <td>
                  <span className={`rl-badge rl-badge--${v.origem === 'oficina' ? 'violet' : 'teal'}`}>
                    {v.origem === 'oficina' ? 'Oficina' : 'Balcão'}
                  </span>
                </td>
                <td>{v.qtdItens}</td>
                <td className="rl-data-table__muted">{v.pagamentoResumo}</td>
                <td className="rl-data-table__num rl-data-table__strong">{formatBRL(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VisaoPorItem({ dados }: { dados: RelatorioVendasDetalhado }) {
  const max = dados.porItem[0]?.faturamento ?? 0
  if (dados.porItem.length === 0) {
    return <ListaVazia texto="Nenhuma peça vendida no período." />
  }

  return (
    <section className="rl-card">
      <h2 className="rl-sec__title">Peças e produtos vendidos</h2>
      <ol className="rl-table">
        {dados.porItem.map((p, i) => (
          <li key={`${p.descricao}-${i}`} className="rl-table__row">
            <span className="rl-table__rank">{i + 1}</span>
            <span className="rl-table__name">
              {p.descricao}
              {p.sku ? <em className="rl-muted"> · {p.sku}</em> : null}
            </span>
            <span className="rl-table__qty">
              {formatNum(p.quantidade, 0)} un. · {p.vendas} vendas
            </span>
            <span className="rl-table__val">{formatBRL(p.faturamento)}</span>
            <BarraProporcional valor={p.faturamento} max={max} tom="teal" />
          </li>
        ))}
      </ol>
    </section>
  )
}

function VisaoPorServico({ dados }: { dados: RelatorioVendasDetalhado }) {
  const max = dados.porServico[0]?.faturamento ?? 0
  if (dados.porServico.length === 0) {
    return <ListaVazia texto="Nenhum serviço registrado no período." />
  }

  return (
    <section className="rl-card">
      <h2 className="rl-sec__title">Serviços e mão de obra</h2>
      <p className="rl-card__hint">
        Itens sem vínculo com estoque — serviços do catálogo, mão de obra e lançamentos avulsos.
      </p>
      <ol className="rl-table">
        {dados.porServico.map((s, i) => (
          <li key={`${s.descricao}-${i}`} className="rl-table__row">
            <span className="rl-table__rank">{i + 1}</span>
            <span className="rl-table__name">{s.descricao}</span>
            <span className="rl-table__qty">
              {formatNum(s.quantidade, 0)} · {s.vendas} vendas
            </span>
            <span className="rl-table__val">{formatBRL(s.faturamento)}</span>
            <BarraProporcional valor={s.faturamento} max={max} tom="violet" />
          </li>
        ))}
      </ol>
    </section>
  )
}

function VisaoPorCliente({ dados }: { dados: RelatorioVendasDetalhado }) {
  if (dados.porCliente.length === 0) {
    return <ListaVazia texto="Nenhuma venda vinculada a clientes no período." />
  }

  return (
    <div className="rl-card rl-card--flush">
      <div className="rl-data-table-wrap">
        <table className="rl-data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="rl-data-table__num">Vendas</th>
              <th className="rl-data-table__num">Faturamento</th>
              <th className="rl-data-table__num">Ticket médio</th>
              <th>Última compra</th>
            </tr>
          </thead>
          <tbody>
            {dados.porCliente.map((c) => (
              <tr key={c.clienteId}>
                <td className="rl-data-table__strong">{c.clienteNome}</td>
                <td className="rl-data-table__num">{c.quantidadeVendas}</td>
                <td className="rl-data-table__num">{formatBRL(c.faturamento)}</td>
                <td className="rl-data-table__num">{formatBRL(c.ticketMedio)}</td>
                <td className="rl-data-table__muted">{formatShortDate(c.ultimaCompra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VisaoDiario({ dados }: { dados: RelatorioVendasDetalhado }) {
  const max = dados.faturamentoDiario.reduce((m, d) => Math.max(m, d.faturamento), 0)

  if (dados.faturamentoDiario.length === 0) {
    return <ListaVazia texto="Sem faturamento no período selecionado." />
  }

  return (
    <section className="rl-card">
      <h2 className="rl-sec__title">Faturamento por dia</h2>
      <ul className="rl-daily">
        {dados.faturamentoDiario.map((d) => (
          <li key={d.data} className="rl-daily__row">
            <div className="rl-daily__head">
              <span className="rl-daily__date">{d.label}</span>
              <span className="rl-daily__total">{formatBRL(d.faturamento)}</span>
            </div>
            <BarraProporcional valor={d.faturamento} max={max} tom="teal" />
            <div className="rl-daily__meta">
              <span>{d.quantidade} vendas</span>
              <span>Ticket {formatBRL(d.ticketMedio)}</span>
              <span>Balcão {formatBRL(d.faturamentoBalcao)}</span>
              <span>Oficina {formatBRL(d.faturamentoOficina)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RelatorioVendasPanel({ companyId, activeStoreId, intervalo }: RelatorioVendasPanelProps) {
  const [visao, setVisao] = useState<VisaoVendas>('resumo')
  const [origem, setOrigem] = useState<OrigemVendaFiltro>('todas')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | 'todas'>('todas')
  const [clienteId, setClienteId] = useState<string>('')
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([])
  const [dados, setDados] = useState<RelatorioVendasDetalhado | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setClienteId('')
    setOrigem('todas')
    setFormaPagamento('todas')
    void listarClientes(companyId, activeStoreId)
      .then((rows) => setClientes(rows.map((c) => ({ id: c.id, nome: c.nome }))))
      .catch(() => setClientes([]))
  }, [companyId, activeStoreId])

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setDados(null)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const filtros: FiltrosRelatorioVendas = {
        origem,
        formaPagamento,
        clienteId: clienteId || null,
      }
      const res = await obterRelatorioVendasDetalhado(companyId, activeStoreId, intervalo, filtros)
      setDados(res)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar relatório de vendas.')
      setDados(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId, intervalo, origem, formaPagamento, clienteId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return (
    <div className={loading && dados ? 'rl-vendas rl-vendas--loading' : 'rl-vendas'}>
      <div className="rl-vendas-filters">
        <label className="rl-vendas-filters__field">
          <span>Cliente</span>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            disabled={loading}
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="rl-vendas-filters__field">
          <span>Origem</span>
          <select
            value={origem}
            onChange={(e) => setOrigem(e.target.value as OrigemVendaFiltro)}
            disabled={loading}
          >
            {ORIGENS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="rl-vendas-filters__field">
          <span>Pagamento</span>
          <select
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | 'todas')}
            disabled={loading}
          >
            {FORMAS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="rl-subtabs" aria-label="Visão do relatório de vendas">
        {VISAO.map((v) => (
          <button
            key={v.key}
            type="button"
            className={visao === v.key ? 'rl-subtabs__btn rl-subtabs__btn--active' : 'rl-subtabs__btn'}
            onClick={() => setVisao(v.key)}
            disabled={loading && !dados}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {erro ? (
        <div className="rl-alert" role="alert">
          {erro}
        </div>
      ) : null}

      {loading && !dados ? (
        <div className="rl-loading" role="status">
          <span className="cp-auth-loading__spinner" aria-hidden />
          Carregando movimentações…
        </div>
      ) : dados ? (
        <>
          {visao === 'resumo' && <VisaoResumo dados={dados} />}
          {visao === 'vendas' && <VisaoPorVenda dados={dados} />}
          {visao === 'itens' && <VisaoPorItem dados={dados} />}
          {visao === 'servicos' && <VisaoPorServico dados={dados} />}
          {visao === 'clientes' && <VisaoPorCliente dados={dados} />}
          {visao === 'diario' && <VisaoDiario dados={dados} />}
        </>
      ) : null}
    </div>
  )
}
