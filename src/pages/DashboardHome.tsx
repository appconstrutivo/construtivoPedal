import { useEffect, useState, useId } from 'react'
import type { NavKey } from '../layout/AppShell'
import { listarOrdensServico, contarOsAbertas } from '../services/oficina.service'
import { obterResumoEstoqueLoja } from '../services/estoque.service'
import { listarVendasRecentes, obterResumoVendasHoje } from '../services/pdv.service'

type DashboardHomeProps = {
  activeNav: NavKey
  companyId: string
  activeStoreId: string
  onNavigate: (nav: NavKey) => void
}

function IconWorkshop({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="m14.7 6.3 3 3a2 2 0 0 1-2.3 3.2l-.5-.5L10 17.6a2 2 0 1 1-2.8-2.8l5.1-5.1-.5-.5a2 2 0 0 1 3.2-2.3Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPOS({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={9} cy={20} r={1.25} fill="currentColor" />
      <circle cx={18} cy={20} r={1.25} fill="currentColor" />
    </svg>
  )
}

function IconSearchUser({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <circle cx={10} cy={10} r={5.25} stroke="currentColor" strokeWidth={1.75} />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  )
}

function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4h6l1 2h4v14H4V6h4l1-2Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  )
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path
        d="M8 5V3m8 2V3m4 10V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <path d="M4 11h16" stroke="currentColor" strokeWidth={1.75} />
    </svg>
  )
}

function IconTrend({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M4 14 9 9l4 4 7-7" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 7h4v4" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconStock({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path
        d="m12 21-8-4V7l8-4 8 4v10l-8 4Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconBolt({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path
        d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconStores({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 10V20h16V10M4 10 2 6h20l-2 4M9 14h6"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function PlaceholderPanel({ title, hint }: { title: string; hint: string }) {
  const headingId = useId()
  return (
    <section className="cp-panel cp-panel--muted" aria-labelledby={headingId}>
      <h2 id={headingId} className="cp-panel__title">
        {title}
      </h2>
      <p className="cp-panel__hint">{hint}</p>
    </section>
  )
}

export function DashboardHome({ activeNav, companyId, activeStoreId, onNavigate }: DashboardHomeProps) {
  const [osAbertasCount, setOsAbertasCount] = useState<number | null>(null)
  const [ultimasOs, setUltimasOs] = useState<Array<{ id: string; numero: number; clienteNome: string }>>([])
  const [estoqueCritico, setEstoqueCritico] = useState<number | null>(null)
  const [vendasHoje, setVendasHoje] = useState<{ quantidade: number; total: number } | null>(null)
  const [ultimaVendaTexto, setUltimaVendaTexto] = useState<string | null>(null)
  const [semLoja, setSemLoja] = useState(false)

  useEffect(() => {
    if (activeNav !== 'inicio') return
    if (!activeStoreId) {
      setSemLoja(true)
      setOsAbertasCount(0)
      setUltimasOs([])
      setEstoqueCritico(0)
      setVendasHoje({ quantidade: 0, total: 0 })
      setUltimaVendaTexto(null)
      return
    }
    setSemLoja(false)
    let cancel = false
    void (async () => {
      try {
        const [n, lista, resumo, vendasResumo, vendasRecentes] = await Promise.all([
          contarOsAbertas(companyId, activeStoreId),
          listarOrdensServico(companyId, activeStoreId),
          obterResumoEstoqueLoja(companyId, activeStoreId),
          obterResumoVendasHoje(companyId, activeStoreId),
          listarVendasRecentes(companyId, activeStoreId, 1),
        ])
        if (cancel) return
        setOsAbertasCount(n)
        setEstoqueCritico(resumo.criticos)
        setVendasHoje(vendasResumo)
        setUltimasOs(
          lista.slice(0, 3).map((r) => ({ id: r.id, numero: r.numero, clienteNome: r.clienteNome })),
        )
        const ultima = vendasRecentes[0]
        setUltimaVendaTexto(
          ultima
            ? `Venda #${ultima.numero} — ${formatBRL(Number(ultima.total))}`
            : null,
        )
      } catch {
        if (!cancel) {
          setOsAbertasCount(null)
          setUltimasOs([])
          setEstoqueCritico(null)
          setVendasHoje(null)
          setUltimaVendaTexto(null)
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [activeNav, companyId, activeStoreId])
  if (activeNav !== 'inicio') {
    const titles: Record<Exclude<NavKey, 'inicio'>, { title: string; hint: string }> = {
      oficina: { title: 'Oficina', hint: 'OS, fotos e baixa de peças — em breve.' },
      pdv: { title: 'PDV', hint: 'Balcão rápido com vínculo à bike.' },
      financeiro: { title: 'Financeiro', hint: 'Fluxo de caixa, contas e gestão da empresa.' },
      lancamentos: { title: 'Lançamentos', hint: '2ª via de recibo e cancelamento de vendas.' },
      estoque: { title: 'Estoque', hint: 'Peças, bikes e movimentações por loja.' },
      clientes: { title: 'Clientes', hint: 'CRM, bikes e revisões num só lugar.' },
      relatorios: { title: 'Relatórios', hint: 'Vendas, oficina, estoque e clientes por loja.' },
      mais: { title: 'Mais', hint: 'Equipe, plano e preferências da empresa.' },
    }
    const cfg = titles[activeNav]
    return (
      <div className="cp-page cp-page--dash">
        <header className="cp-dash-head cp-dash-head--simple">
          <h1 className="cp-dash-head__title">{cfg.title}</h1>
          <p className="cp-dash-head__tag">{cfg.hint}</p>
        </header>
        <PlaceholderPanel title="Em breve" hint="Módulo ligado ao Supabase com dados isolados por empresa." />
      </div>
    )
  }

  return (
    <div className="cp-page cp-page--dash">
      <section className="cp-dash-block" aria-label="Atalhos">
        <div className="cp-act-grid">
          <button
            type="button"
            className="cp-act cp-act--workshop"
            aria-label="Abrir nova ordem de serviço na oficina"
            onClick={() => onNavigate('oficina')}
          >
            <span className="cp-act__glyph" aria-hidden>
              <IconWorkshop />
            </span>
            <span className="cp-act__title">Nova OS</span>
          </button>
          <button
            type="button"
            className="cp-act cp-act--sale"
            aria-label="Abrir ponto de venda no balcão"
            onClick={() => onNavigate('pdv')}
          >
            <span className="cp-act__glyph" aria-hidden>
              <IconPOS />
            </span>
            <span className="cp-act__title">PDV</span>
          </button>
          <button type="button" className="cp-act cp-act--people" aria-label="Buscar cliente ou bicicleta">
            <span className="cp-act__glyph" aria-hidden>
              <IconSearchUser />
            </span>
            <span className="cp-act__title">Buscar</span>
          </button>
        </div>
      </section>

      <section className="cp-dash-block" aria-labelledby="lbl-kpi">
        <div id="lbl-kpi" className="cp-dash-label cp-dash-label--slate">
          <span className="cp-dash-label__dot" aria-hidden />
          Hoje
        </div>
        <ul className="cp-kpi-grid">
          <li className="cp-kpi cp-kpi--workshop" title="Ordens aguardando ou em execução">
            <span className="cp-kpi__icon" aria-hidden>
              <IconClipboard />
            </span>
            <div className="cp-kpi__body">
              <span className="cp-kpi__label">OS abertas</span>
              <span className="cp-kpi__value">
                {semLoja ? '—' : osAbertasCount === null ? '—' : String(osAbertasCount)}
              </span>
            </div>
          </li>
          <li className="cp-kpi cp-kpi--schedule" title="Próximos 7 dias">
            <span className="cp-kpi__icon" aria-hidden>
              <IconCalendar />
            </span>
            <div className="cp-kpi__body">
              <span className="cp-kpi__label">Revisões</span>
              <span className="cp-kpi__value">—</span>
            </div>
          </li>
          <li className="cp-kpi cp-kpi--sale" title="Total registrado no PDV">
            <span className="cp-kpi__icon" aria-hidden>
              <IconTrend />
            </span>
            <div className="cp-kpi__body">
              <span className="cp-kpi__label">Vendas</span>
              <span className="cp-kpi__value">
                {semLoja ? '—' : vendasHoje === null ? '—' : String(vendasHoje.quantidade)}
              </span>
            </div>
          </li>
          <li className="cp-kpi cp-kpi--stock" title="Itens abaixo do estoque mínimo">
            <span className="cp-kpi__icon" aria-hidden>
              <IconStock />
            </span>
            <div className="cp-kpi__body">
              <span className="cp-kpi__label">Crítico</span>
              <span className="cp-kpi__value">
                {semLoja ? '—' : estoqueCritico === null ? '—' : String(estoqueCritico)}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <div className="cp-dash-split">
        <section className="cp-dash-block" aria-labelledby="lbl-live">
          <div id="lbl-live" className="cp-dash-label cp-dash-label--blue">
            <span className="cp-dash-label__dot" aria-hidden />
            Ao vivo
          </div>
          <ul className="cp-live">
            <li className="cp-live__row cp-live__row--workshop">
              <span className="cp-live__mark" aria-hidden />
              <span className="cp-live__text">
                {semLoja
                  ? 'Selecione uma loja no topo'
                  : ultimasOs.length === 0
                    ? 'Sem OS recentes nesta loja'
                    : ultimasOs.map((o) => `OS #${o.numero} — ${o.clienteNome}`).join(' · ')}
              </span>
            </li>
            <li className="cp-live__row cp-live__row--sale">
              <span className="cp-live__mark" aria-hidden />
              <span className="cp-live__text">
                {semLoja
                  ? 'Selecione uma loja no topo'
                  : ultimaVendaTexto ?? 'PDV sem vendas hoje'}
              </span>
            </li>
          </ul>
        </section>

        <aside className="cp-dash-block" aria-label="Resumo">
          <div className="cp-dash-label cp-dash-label--violet">
            <span className="cp-dash-label__dot" aria-hidden />
            Visão
          </div>
          <div className="cp-glance-stack">
            <div className="cp-glance cp-glance--pulse">
              <span className="cp-glance__glyph cp-glance__glyph--amber" aria-hidden>
                <IconBolt />
              </span>
              <span className="cp-glance__line">Automações quando houver dados</span>
            </div>
            <div className="cp-glance cp-glance--stores">
              <span className="cp-glance__glyph cp-glance__glyph--violet" aria-hidden>
                <IconStores />
              </span>
              <span className="cp-glance__line">Multi-loja por empresa</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
