import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  listarClientes,
  criarCliente,
  type ClienteComRelacoes,
  type BicicletaRow,
  type AtividadeRow,
} from '../services/clientes.service'

/* ─── helpers visuais ─────────────────────────────── */

type FilterKey = 'todos' | 'bikes' | 'revisao' | 'inativo'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'bikes', label: 'Com bike' },
  { key: 'revisao', label: 'Revisão próxima' },
  { key: 'inativo', label: 'Inativos' },
]

const AVATAR_COLORS = [
  '#0f766e','#2563eb','#6d28d9','#d97706','#e11d48','#0284c7','#059669',
]

function avatarColor(nome: string) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h + nome.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

function initials(nome: string) {
  const parts = nome.trim().split(' ')
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso + 'T12:00:00'))
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000)
}

function visitLabel(iso: string | null) {
  if (!iso) return 'Nunca'
  const d = daysSince(iso)
  if (d === 0) return 'Hoje'
  if (d === 1) return 'Ontem'
  if (d < 30) return `${d}d atrás`
  if (d < 365) return `${Math.floor(d / 30)}m atrás`
  return `${Math.floor(d / 365)}a atrás`
}

const COR_MAP: Record<string, string> = {
  'preto': '#1e1e1e', 'preto mate': '#1e1e1e', 'branco': '#e5e7eb',
  'azul': '#2563eb', 'verde': '#16a34a', 'cinza': '#6b7280',
  'vermelho': '#dc2626', 'amarelo': '#eab308',
}
function bikeCor(c: string | null) {
  return c ? (COR_MAP[c.toLowerCase()] ?? '#94a3b8') : '#94a3b8'
}

/* ─── ícones ─────────────────────────────────────── */

function IconPlus() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg aria-hidden width={17} height={17} viewBox="0 0 24 24" fill="none">
      <circle cx={10.5} cy={10.5} r={6.5} stroke="currentColor" strokeWidth={1.75} />
      <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  )
}
function IconBike() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none">
      <circle cx={5.5} cy={15.5} r={3.5} stroke="currentColor" strokeWidth={1.75} />
      <circle cx={18.5} cy={15.5} r={3.5} stroke="currentColor" strokeWidth={1.75} />
      <path d="M5.5 15.5 9 9h6l3.5 6.5" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 9h4l1.5-3" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconPhone() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path d="M6 2h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 11l5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 4 4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  )
}
function IconMail() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none">
      <rect x={3} y={5} width={18} height={14} rx={2} stroke="currentColor" strokeWidth={1.75} />
      <path d="m3 7 9 6 9-6" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  )
}
function IconMapPin() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" stroke="currentColor" strokeWidth={1.75} />
      <circle cx={12} cy={10} r={2.5} stroke="currentColor" strokeWidth={1.75} />
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path d="M8 5V3m8 2V3M4 11h16M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  )
}
function IconArrowLeft() {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5m0 0 7 7m-7-7 7-7" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconWrench() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path d="m14.7 6.3 3 3a2 2 0 0 1-2.3 3.2l-.5-.5L10 17.6a2 2 0 1 1-2.8-2.8l5.1-5.1-.5-.5a2 2 0 0 1 3.2-2.3Z" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconCart() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path d="M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={9} cy={20} r={1.25} fill="currentColor" />
      <circle cx={18} cy={20} r={1.25} fill="currentColor" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.75} />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconX() {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  )
}
function IconSpin() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none" className="cl-spin">
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2} strokeDasharray="42 16" strokeLinecap="round" />
    </svg>
  )
}

/* ─── modal novo cliente ──────────────────────────── */

type NovoClienteModalProps = {
  companyId: string
  onClose: () => void
  onSalvo: (c: ClienteComRelacoes) => void
}

function NovoClienteModal({ companyId, onClose, onSalvo }: NovoClienteModalProps) {
  const [nome, setNome] = useState('')
  const [fone, setFone] = useState('')
  const [email, setEmail] = useState('')
  const [endereco, setEndereco] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return }
    setSaving(true)
    setErro('')
    try {
      const novo = await criarCliente({
        company_id: companyId,
        nome: nome.trim(),
        fone: fone.trim() || null,
        email: email.trim() || null,
        endereco: endereco.trim() || null,
        tags: [],
      })
      onSalvo({ ...novo, bicicletas: [], atividades: [], ultima_visita: null })
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="cl-modal">
        <div className="cl-modal__head">
          <h2 id="modal-title" className="cl-modal__title">Novo cliente</h2>
          <button type="button" className="cl-modal__close" onClick={onClose} aria-label="Fechar">
            <IconX />
          </button>
        </div>

        <form className="cl-form" onSubmit={handleSubmit} noValidate>
          <div className="cl-field">
            <label htmlFor="nc-nome" className="cl-label">Nome <span className="cl-req" aria-hidden>*</span></label>
            <input
              id="nc-nome"
              className="cl-input"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              autoComplete="name"
              autoFocus
              required
            />
          </div>
          <div className="cl-field">
            <label htmlFor="nc-fone" className="cl-label">Telefone</label>
            <input
              id="nc-fone"
              className="cl-input"
              type="tel"
              value={fone}
              onChange={(e) => setFone(e.target.value)}
              placeholder="(00) 00000-0000"
              autoComplete="tel"
            />
          </div>
          <div className="cl-field">
            <label htmlFor="nc-email" className="cl-label">E-mail (opcional)</label>
            <input
              id="nc-email"
              className="cl-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              autoComplete="email"
            />
          </div>
          <div className="cl-field">
            <label htmlFor="nc-endereco" className="cl-label">Endereço (opcional)</label>
            <input
              id="nc-endereco"
              className="cl-input"
              type="text"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro, cidade"
              autoComplete="street-address"
            />
          </div>

          {erro && <p className="cl-form-error" role="alert">{erro}</p>}

          <div className="cl-modal__foot">
            <button type="button" className="cl-btn cl-btn--ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="cl-btn cl-btn--accent" disabled={saving}>
              {saving && <IconSpin />}
              {saving ? 'Salvando…' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── painel de detalhe ───────────────────────────── */

function ClienteDetalhe({
  cliente,
  onClose,
}: {
  cliente: ClienteComRelacoes
  onClose: () => void
}) {
  const cor = avatarColor(cliente.nome)

  return (
    <div className="cl-detail" aria-label={`Detalhe de ${cliente.nome}`}>
      <div className="cl-detail__topbar">
        <button type="button" className="cl-back" onClick={onClose} aria-label="Voltar à lista">
          <IconArrowLeft />
          <span>Clientes</span>
        </button>
        <div className="cl-detail__actions">
          <button type="button" className="cl-btn cl-btn--ghost">Editar</button>
          <button type="button" className="cl-btn cl-btn--accent">
            <IconPlus />
            Nova OS
          </button>
        </div>
      </div>

      <div className="cl-detail__hero">
        <span className="cl-avatar cl-avatar--lg" style={{ background: cor }} aria-hidden>
          {initials(cliente.nome)}
        </span>
        <div className="cl-detail__identity">
          <div className="cl-detail__name-row">
            <h2 className="cl-detail__name">{cliente.nome}</h2>
            {cliente.tags?.includes('VIP') && <span className="cl-tag cl-tag--vip">VIP</span>}
            {cliente.tags?.includes('Inativo') && <span className="cl-tag cl-tag--inactive">Inativo</span>}
          </div>
          <div className="cl-detail__meta">
            {cliente.fone && (
              <span className="cl-meta-item"><IconPhone /> {cliente.fone}</span>
            )}
            {cliente.email && (
              <span className="cl-meta-item"><IconMail /> {cliente.email}</span>
            )}
            {cliente.endereco && (
              <span className="cl-meta-item">
                <IconMapPin /> {cliente.endereco}
              </span>
            )}
            <span className="cl-meta-item">
              <IconCalendar /> Cliente desde {formatDate(cliente.created_at)}
            </span>
          </div>
        </div>
      </div>

      <section className="cl-section" aria-labelledby="lbl-bikes">
        <div id="lbl-bikes" className="cp-dash-label cp-dash-label--violet">
          <span className="cp-dash-label__dot" aria-hidden />
          Bicicletas <span className="cl-count">{cliente.bicicletas.length}</span>
        </div>
        {cliente.bicicletas.length === 0 ? (
          <p className="cl-empty-hint">Nenhuma bike cadastrada.</p>
        ) : (
          <ul className="cl-bikes">
            {cliente.bicicletas.map((b: BicicletaRow) => (
              <li key={b.id} className="cl-bike">
                <span className="cl-bike__icon" aria-hidden><IconBike /></span>
                <div className="cl-bike__body">
                  <span className="cl-bike__name">{b.marca} {b.modelo}</span>
                  <span className="cl-bike__spec">
                    {b.aro && `${b.aro} · `}
                    {b.cor && <><span className="cl-color-dot" style={{ background: bikeCor(b.cor) }} aria-hidden /> {b.cor}</>}
                    {b.numero_serie && ` · ${b.numero_serie}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cl-section" aria-labelledby="lbl-hist">
        <div id="lbl-hist" className="cp-dash-label cp-dash-label--blue">
          <span className="cp-dash-label__dot" aria-hidden />
          Histórico
        </div>
        {cliente.atividades.length === 0 ? (
          <p className="cl-empty-hint">Nenhuma atividade registrada.</p>
        ) : (
          <ul className="cl-hist">
            {[...cliente.atividades]
              .sort((a, b) => b.data_registro.localeCompare(a.data_registro))
              .map((a: AtividadeRow) => (
                <li key={a.id} className="cl-hist__item">
                  <span className={`cl-hist__icon cl-hist__icon--${a.tipo}`} aria-hidden>
                    {a.tipo === 'os' && <IconWrench />}
                    {a.tipo === 'venda' && <IconCart />}
                    {a.tipo === 'revisao' && <IconClock />}
                  </span>
                  <div className="cl-hist__body">
                    <span className="cl-hist__desc">{a.descricao}</span>
                    <span className="cl-hist__date">{formatDate(a.data_registro)}</span>
                  </div>
                  {a.valor != null ? (
                    <span className="cl-hist__val">{formatBRL(a.valor)}</span>
                  ) : a.tipo === 'revisao' ? (
                    <span className="cl-tag cl-tag--schedule">Programada</span>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ─── linha da lista ────────────────────────────────── */

function ClienteRow({
  cliente,
  active,
  onClick,
}: {
  cliente: ClienteComRelacoes
  active: boolean
  onClick: () => void
}) {
  const cor = avatarColor(cliente.nome)
  const dias = cliente.ultima_visita ? daysSince(cliente.ultima_visita) : 999
  const visitaClass =
    dias > 60 ? 'cl-row__visit--old' : dias > 14 ? 'cl-row__visit--mid' : ''

  return (
    <li>
      <button
        type="button"
        className={active ? 'cl-row cl-row--active' : 'cl-row'}
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
      >
        <span className="cl-avatar" style={{ background: cor }} aria-hidden>
          {initials(cliente.nome)}
        </span>
        <div className="cl-row__body">
          <div className="cl-row__top">
            <span className="cl-row__name">{cliente.nome}</span>
            {cliente.tags?.includes('VIP') && (
              <span className="cl-tag cl-tag--vip">VIP</span>
            )}
            {cliente.tags?.includes('Inativo') && (
              <span className="cl-tag cl-tag--inactive">Inativo</span>
            )}
          </div>
          <span className="cl-row__phone">{cliente.fone ?? '—'}</span>
        </div>
        <div className="cl-row__aside">
          <span className="cl-row__bikes" aria-label={`${cliente.bicicletas.length} bikes`}>
            <IconBike /> {cliente.bicicletas.length}
          </span>
          <span className={`cl-row__visit ${visitaClass}`}>
            {visitLabel(cliente.ultima_visita)}
          </span>
        </div>
      </button>
    </li>
  )
}

/* ─── página principal ──────────────────────────────── */

type ClientesPageProps = {
  companyId: string
}

export function ClientesPage({ companyId }: ClientesPageProps) {
  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FilterKey>('todos')
  const [selecionado, setSelecionado] = useState<ClienteComRelacoes | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await listarClientes(companyId)
      setClientes(data)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { carregar() }, [carregar])

  const clientesFiltrados = useMemo(() => {
    let lista = clientes

    if (filtro === 'bikes') lista = lista.filter((c) => c.bicicletas.length > 0)
    else if (filtro === 'revisao')
      lista = lista.filter((c) => c.atividades.some((a) => a.tipo === 'revisao'))
    else if (filtro === 'inativo')
      lista = lista.filter((c) => c.tags?.includes('Inativo'))

    if (busca.trim()) {
      const q = busca.toLowerCase()
      lista = lista.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          (c.fone ?? '').includes(q) ||
          (c.email ?? '').toLowerCase().includes(q),
      )
    }

    return lista
  }, [clientes, busca, filtro])

  const totalBikes = clientes.reduce((acc, c) => acc + c.bicicletas.length, 0)
  const showDetail = selecionado !== null

  function handleSalvo(novo: ClienteComRelacoes) {
    setClientes((prev) => [...prev, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
    setModalAberto(false)
    setSelecionado(novo)
  }

  return (
    <>
      <div className={`cl-page${showDetail ? ' cl-page--detail-open' : ''}`}>
        {/* ── coluna lista ── */}
        <div className={`cl-list-col${showDetail ? ' cl-list-col--hidden-mobile' : ''}`}>
          <header className="cl-list-head">
            <div className="cl-list-head__top">
              <div>
                <h1 className="cl-list-head__title">Clientes</h1>
                <div className="cl-list-head__stats">
                  {loading ? (
                    <span className="cl-loading-text">carregando…</span>
                  ) : (
                    <>
                      <span>{clientes.length} clientes</span>
                      <span className="cl-dot-sep" aria-hidden>·</span>
                      <span>{totalBikes} bikes</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="cl-btn cl-btn--accent cl-btn--new"
                onClick={() => setModalAberto(true)}
              >
                <IconPlus />
                Novo
              </button>
            </div>

            <div className="cl-search-wrap">
              <span className="cl-search-icon" aria-hidden><IconSearch /></span>
              <input
                type="search"
                className="cl-search"
                placeholder="Nome, telefone ou e-mail…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar cliente"
                autoComplete="off"
              />
            </div>

            <div className="cl-filters" role="group" aria-label="Filtrar clientes">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filtro === f.key ? 'cl-chip cl-chip--on' : 'cl-chip'}
                  onClick={() => setFiltro(f.key)}
                  aria-pressed={filtro === f.key}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </header>

          {loading ? (
            <div className="cl-state-center" aria-live="polite" aria-label="Carregando clientes">
              <IconSpin />
              <span className="cl-loading-text">Buscando clientes…</span>
            </div>
          ) : erro ? (
            <div className="cl-state-center cl-state-center--error" role="alert">
              <p>{erro}</p>
              <button type="button" className="cl-btn cl-btn--ghost" onClick={carregar}>
                Tentar novamente
              </button>
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="cl-empty">
              <span className="cl-empty__icon" aria-hidden><IconSearch /></span>
              <p className="cl-empty__text">
                {busca ? 'Nenhum resultado.' : 'Nenhum cliente cadastrado.'}
              </p>
            </div>
          ) : (
            <ul className="cl-list">
              {clientesFiltrados.map((c) => (
                <ClienteRow
                  key={c.id}
                  cliente={c}
                  active={selecionado?.id === c.id}
                  onClick={() => setSelecionado(c)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── coluna detalhe ── */}
        {showDetail ? (
          <div className="cl-detail-col">
            <ClienteDetalhe
              cliente={selecionado}
              onClose={() => setSelecionado(null)}
            />
          </div>
        ) : (
          <div className="cl-detail-col cl-detail-col--empty" aria-hidden>
            <span className="cl-detail-col__hint">Selecione um cliente</span>
          </div>
        )}
      </div>

      {modalAberto && (
        <NovoClienteModal
          companyId={companyId}
          onClose={() => setModalAberto(false)}
          onSalvo={handleSalvo}
        />
      )}
    </>
  )
}
