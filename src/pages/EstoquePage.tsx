import { useMemo, useState } from 'react'

type CategoriaEstoque = 'peca' | 'bike' | 'componente'
type StatusEstoque = 'critico' | 'reposicao' | 'saudavel'

type ItemEstoque = {
  id: string
  sku: string
  nome: string
  categoria: CategoriaEstoque
  saldo: number
  minimo: number
  local: string
  custoMedio: number
}

type Movimentacao = {
  id: string
  tipo: 'entrada' | 'saida' | 'ajuste'
  item: string
  quantidade: number
  origem: string
  horario: string
}

type EstoquePageProps = {
  companyId: string
}

const CATEGORIAS: { key: CategoriaEstoque | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'peca', label: 'Peças' },
  { key: 'bike', label: 'Bikes' },
  { key: 'componente', label: 'Componentes' },
]

const STATUS_FILTERS: { key: StatusEstoque | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'critico', label: 'Crítico' },
  { key: 'reposicao', label: 'Reposição' },
  { key: 'saudavel', label: 'Saudável' },
]

const ITENS_MOCK: ItemEstoque[] = [
  {
    id: 'it-001',
    sku: 'PC-CLN-11V',
    nome: 'Corrente KMC 11v',
    categoria: 'peca',
    saldo: 3,
    minimo: 8,
    local: 'Loja Centro',
    custoMedio: 139.9,
  },
  {
    id: 'it-002',
    sku: 'BK-SL-29-M',
    nome: 'Bike Sense Impact SL 29 M',
    categoria: 'bike',
    saldo: 2,
    minimo: 1,
    local: 'Loja Centro',
    custoMedio: 5420,
  },
  {
    id: 'it-003',
    sku: 'PC-PST-180',
    nome: 'Pastilha de Freio Shimano B01S',
    categoria: 'peca',
    saldo: 12,
    minimo: 10,
    local: 'Oficina',
    custoMedio: 34.5,
  },
  {
    id: 'it-004',
    sku: 'CP-CASS-12V',
    nome: 'Cassete SunRace 12v',
    categoria: 'componente',
    saldo: 1,
    minimo: 4,
    local: 'Loja Norte',
    custoMedio: 289.9,
  },
  {
    id: 'it-005',
    sku: 'PC-CAM-29',
    nome: 'Câmara 29 Presta',
    categoria: 'peca',
    saldo: 24,
    minimo: 12,
    local: 'Loja Norte',
    custoMedio: 19.8,
  },
  {
    id: 'it-006',
    sku: 'CP-PED-CLP',
    nome: 'Pedal Clip MTB',
    categoria: 'componente',
    saldo: 5,
    minimo: 6,
    local: 'Loja Centro',
    custoMedio: 211.4,
  },
]

const MOVIMENTACOES_MOCK: Movimentacao[] = [
  {
    id: 'mv-001',
    tipo: 'saida',
    item: 'Corrente KMC 11v',
    quantidade: 1,
    origem: 'OS #1542',
    horario: '10:17',
  },
  {
    id: 'mv-002',
    tipo: 'entrada',
    item: 'Câmara 29 Presta',
    quantidade: 20,
    origem: 'NF 48291',
    horario: '11:42',
  },
  {
    id: 'mv-003',
    tipo: 'ajuste',
    item: 'Pedal Clip MTB',
    quantidade: -1,
    origem: 'Inventário rápido',
    horario: '13:06',
  },
  {
    id: 'mv-004',
    tipo: 'saida',
    item: 'Pastilha Shimano B01S',
    quantidade: 2,
    origem: 'OS #1548',
    horario: '15:21',
  },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function categoriaLabel(categoria: CategoriaEstoque): string {
  if (categoria === 'peca') return 'Peça'
  if (categoria === 'bike') return 'Bike'
  return 'Componente'
}

function statusItem(item: ItemEstoque): StatusEstoque {
  if (item.saldo <= item.minimo * 0.5) return 'critico'
  if (item.saldo <= item.minimo) return 'reposicao'
  return 'saudavel'
}

function statusLabel(status: StatusEstoque): string {
  if (status === 'critico') return 'Crítico'
  if (status === 'reposicao') return 'Reposição'
  return 'Saudável'
}

export function EstoquePage({ companyId }: EstoquePageProps) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<CategoriaEstoque | 'todos'>('todos')
  const [status, setStatus] = useState<StatusEstoque | 'todos'>('todos')

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return ITENS_MOCK.filter((item) => {
      if (categoria !== 'todos' && item.categoria !== categoria) return false

      const itemStatus = statusItem(item)
      if (status !== 'todos' && itemStatus !== status) return false

      if (!termo) return true
      return (
        item.nome.toLowerCase().includes(termo) ||
        item.sku.toLowerCase().includes(termo) ||
        item.local.toLowerCase().includes(termo)
      )
    })
  }, [busca, categoria, status])

  const resumo = useMemo(() => {
    const totalSkus = ITENS_MOCK.length
    const criticos = ITENS_MOCK.filter((item) => statusItem(item) === 'critico').length
    const reposicao = ITENS_MOCK.filter((item) => statusItem(item) === 'reposicao').length
    const valorEstoque = ITENS_MOCK.reduce((acc, item) => acc + item.custoMedio * item.saldo, 0)
    return { totalSkus, criticos, reposicao, valorEstoque }
  }, [])

  return (
    <div className="st-page">
      <header className="st-head">
        <div>
          <h1 className="st-head__title">Estoque</h1>
          <p className="st-head__tag">
            Operação por loja e oficina, com foco em giro, reposição e baixa automática por OS.
          </p>
        </div>
        <span className="st-head__tenant" title={companyId}>
          Tenant ativo
        </span>
      </header>

      <section className="st-kpi-grid" aria-label="Resumo do estoque">
        <article className="st-kpi st-kpi--teal">
          <span className="st-kpi__label">SKUs ativos</span>
          <strong className="st-kpi__value">{resumo.totalSkus}</strong>
        </article>
        <article className="st-kpi st-kpi--rose">
          <span className="st-kpi__label">Estoque crítico</span>
          <strong className="st-kpi__value">{resumo.criticos}</strong>
        </article>
        <article className="st-kpi st-kpi--amber">
          <span className="st-kpi__label">Em reposição</span>
          <strong className="st-kpi__value">{resumo.reposicao}</strong>
        </article>
        <article className="st-kpi st-kpi--blue">
          <span className="st-kpi__label">Valor em estoque</span>
          <strong className="st-kpi__value st-kpi__value--currency">{formatBRL(resumo.valorEstoque)}</strong>
        </article>
      </section>

      <div className="st-layout">
        <section className="st-main" aria-label="Itens de estoque">
          <div className="st-toolbar">
            <label className="st-search-wrap" htmlFor="st-busca">
              <span className="cp-sr-only">Buscar item de estoque</span>
              <input
                id="st-busca"
                className="st-search"
                type="search"
                placeholder="Buscar por item, SKU ou loja..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoComplete="off"
              />
            </label>

            <div className="st-chips" role="group" aria-label="Filtrar por categoria">
              {CATEGORIAS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={categoria === item.key ? 'st-chip st-chip--on' : 'st-chip'}
                  onClick={() => setCategoria(item.key)}
                  aria-pressed={categoria === item.key}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="st-chips" role="group" aria-label="Filtrar por status">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={status === item.key ? 'st-chip st-chip--on' : 'st-chip'}
                  onClick={() => setStatus(item.key)}
                  aria-pressed={status === item.key}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="st-list-wrap">
            {itensFiltrados.length === 0 ? (
              <div className="st-empty">
                <p className="st-empty__title">Nenhum item encontrado</p>
                <p className="st-empty__hint">Ajuste os filtros ou revise o termo da busca.</p>
              </div>
            ) : (
              <ul className="st-list">
                {itensFiltrados.map((item) => {
                  const st = statusItem(item)
                  return (
                    <li key={item.id} className="st-row">
                      <div className="st-row__main">
                        <div className="st-row__identity">
                          <strong className="st-row__name">{item.nome}</strong>
                          <span className="st-row__sku">{item.sku}</span>
                        </div>
                        <div className="st-row__meta">
                          <span>{categoriaLabel(item.categoria)}</span>
                          <span className="st-dot" aria-hidden>
                            •
                          </span>
                          <span>{item.local}</span>
                        </div>
                      </div>

                      <div className="st-row__stock">
                        <span className="st-row__stock-value">{item.saldo}</span>
                        <span className="st-row__stock-label">mín. {item.minimo}</span>
                      </div>

                      <div className="st-row__status">
                        <span className={`st-badge st-badge--${st}`}>{statusLabel(st)}</span>
                        <span className="st-row__cost">{formatBRL(item.custoMedio)}</span>
                      </div>

                      <button type="button" className="st-row__action">
                        Repor
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="st-side" aria-label="Contexto operacional do estoque">
          <section className="st-panel">
            <h2 className="st-panel__title">Movimentações de hoje</h2>
            <ul className="st-mov-list">
              {MOVIMENTACOES_MOCK.map((mov) => (
                <li key={mov.id} className="st-mov">
                  <div className="st-mov__head">
                    <span className={`st-mov__type st-mov__type--${mov.tipo}`}>{mov.tipo}</span>
                    <span className="st-mov__time">{mov.horario}</span>
                  </div>
                  <strong className="st-mov__item">{mov.item}</strong>
                  <span className="st-mov__meta">
                    {mov.quantidade > 0 ? '+' : ''}
                    {mov.quantidade} un · {mov.origem}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="st-panel">
            <h2 className="st-panel__title">Ações sugeridas</h2>
            <ul className="st-tips">
              <li>Programar compra de correntes 11v para cobertura de 15 dias.</li>
              <li>Sincronizar baixa de cassete com OS para evitar ruptura na oficina.</li>
              <li>Criar alerta por loja quando saldo ficar abaixo de 50% do mínimo.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
