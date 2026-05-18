import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  listarClientes,
  criarCliente,
  atualizarCliente,
  excluirCliente,
  criarBicicleta,
  atualizarBicicleta,
  excluirBicicleta,
  type ClienteComRelacoes,
  type BicicletaRow,
  type AtividadeRow,
} from '../services/clientes.service'
import {
  labelStatusOrcamento,
  listarOrcamentosPorCliente,
  type OrcamentoLista,
  type StatusOrcamento,
} from '../services/orcamento.service'

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

/** Aceita date-only (YYYY-MM-DD) ou ISO completo vindo do Postgres/Supabase. */
function parseClientDate(value: string | null | undefined): Date | null {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  const d =
    s.includes('T') || s.length > 10 ? new Date(s) : new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDate(iso: string | null | undefined) {
  const d = parseClientDate(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d)
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function daysSince(iso: string) {
  const d = parseClientDate(iso)
  if (!d) return Number.NaN
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function visitLabel(iso: string | null) {
  if (!iso) return 'Nunca'
  const d = daysSince(iso)
  if (!Number.isFinite(d)) return 'Nunca'
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
function IconPencil() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none">
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
function IconTrash() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ─── modal novo cliente ──────────────────────────── */

type ClienteFormModalProps = {
  companyId: string
  activeStoreId: string
  cliente?: ClienteComRelacoes
  onClose: () => void
  onSalvo: (c: ClienteComRelacoes) => void
}

function ClienteFormModal({ companyId, activeStoreId, cliente, onClose, onSalvo }: ClienteFormModalProps) {
  const editando = Boolean(cliente)
  const [nome, setNome] = useState(cliente?.nome ?? '')
  const [fone, setFone] = useState(cliente?.fone ?? '')
  const [email, setEmail] = useState(cliente?.email ?? '')
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return }
    if (!editando && !activeStoreId) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    setSaving(true)
    setErro('')
    try {
      if (editando && cliente) {
        const atualizado = await atualizarCliente(cliente.id, {
          nome: nome.trim(),
          fone: fone.trim() || null,
          email: email.trim() || null,
          endereco: endereco.trim() || null,
        })
        onSalvo({ ...cliente, ...atualizado })
      } else {
        const novo = await criarCliente({
          company_id: companyId,
          store_id: activeStoreId,
          nome: nome.trim(),
          fone: fone.trim() || null,
          email: email.trim() || null,
          endereco: endereco.trim() || null,
          tags: [],
        })
        onSalvo({ ...novo, bicicletas: [], atividades: [], ultima_visita: null })
      }
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
          <h2 id="modal-title" className="cl-modal__title">
            {editando ? 'Editar cliente' : 'Novo cliente'}
          </h2>
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
              {saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── modal nova bicicleta ───────────────────────── */

type BicicletaFormModalProps = {
  companyId: string
  clienteId: string
  bike?: BicicletaRow
  onClose: () => void
  onSalvo: (b: BicicletaRow) => void
}

function BicicletaFormModal({ companyId, clienteId, bike, onClose, onSalvo }: BicicletaFormModalProps) {
  const editando = Boolean(bike)
  const [marca, setMarca] = useState(bike?.marca ?? '')
  const [modelo, setModelo] = useState(bike?.modelo ?? '')
  const [aro, setAro] = useState(bike?.aro ?? '')
  const [cor, setCor] = useState(bike?.cor ?? '')
  const [numeroSerie, setNumeroSerie] = useState(bike?.numero_serie ?? '')
  const [quilometragem, setQuilometragem] = useState(
    bike?.quilometragem != null ? String(bike.quilometragem) : '',
  )
  const [observacoes, setObservacoes] = useState(bike?.observacoes ?? '')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!marca.trim()) {
      setErro('Marca é obrigatória.')
      return
    }
    if (!modelo.trim()) {
      setErro('Modelo é obrigatório.')
      return
    }
    let km: number | null = null
    if (quilometragem.trim()) {
      const n = Number(quilometragem.replace(/\s/g, '').replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) {
        setErro('Quilometragem inválida.')
        return
      }
      km = Math.round(n)
    }
    setSaving(true)
    setErro('')
    try {
      const payload = {
        marca: marca.trim(),
        modelo: modelo.trim(),
        aro: aro.trim() || null,
        cor: cor.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        quilometragem: km,
        observacoes: observacoes.trim() || null,
      }
      if (editando && bike) {
        const atualizada = await atualizarBicicleta(bike.id, payload)
        onSalvo(atualizada)
      } else {
        const nova = await criarBicicleta({
          company_id: companyId,
          cliente_id: clienteId,
          ...payload,
        })
        onSalvo(nova)
      }
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-bike-title">
      <div className="cl-modal">
        <div className="cl-modal__head">
          <h2 id="modal-bike-title" className="cl-modal__title">
            {editando ? 'Editar bicicleta' : 'Nova bicicleta'}
          </h2>
          <button type="button" className="cl-modal__close" onClick={onClose} aria-label="Fechar">
            <IconX />
          </button>
        </div>

        <form className="cl-form" onSubmit={handleSubmit} noValidate>
          <div className="cl-field">
            <label htmlFor="nb-marca" className="cl-label">Marca <span className="cl-req" aria-hidden>*</span></label>
            <input
              id="nb-marca"
              className="cl-input"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Ex.: Caloi, Trek"
              autoComplete="off"
            />
          </div>
          <div className="cl-field">
            <label htmlFor="nb-modelo" className="cl-label">Modelo <span className="cl-req" aria-hidden>*</span></label>
            <input
              id="nb-modelo"
              className="cl-input"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ex.: Explorer, Marlin 5"
              autoComplete="off"
            />
          </div>
          <div className="cl-field cl-field--inline-2">
            <div>
              <label htmlFor="nb-aro" className="cl-label">Aro</label>
              <input
                id="nb-aro"
                className="cl-input"
                value={aro}
                onChange={(e) => setAro(e.target.value)}
                placeholder="29, 700C…"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="nb-cor" className="cl-label">Cor</label>
              <input
                id="nb-cor"
                className="cl-input"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                placeholder="Preto, azul…"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="cl-field">
            <label htmlFor="nb-serie" className="cl-label">Nº de série</label>
            <input
              id="nb-serie"
              className="cl-input"
              value={numeroSerie}
              onChange={(e) => setNumeroSerie(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="cl-field">
            <label htmlFor="nb-km" className="cl-label">Quilometragem (opcional)</label>
            <input
              id="nb-km"
              className="cl-input"
              inputMode="decimal"
              value={quilometragem}
              onChange={(e) => setQuilometragem(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="cl-field">
            <label htmlFor="nb-obs" className="cl-label">Observações</label>
            <textarea
              id="nb-obs"
              className="cl-input cl-textarea"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
            />
          </div>

          {erro && <p className="cl-form-error" role="alert">{erro}</p>}

          <div className="cl-modal__foot">
            <button type="button" className="cl-btn cl-btn--ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="cl-btn cl-btn--accent" disabled={saving}>
              {saving && <IconSpin />}
              {saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar bicicleta'}
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
  companyId,
  activeStoreId,
  onClose,
  onClienteAtualizado,
  onClienteExcluido,
  onBicicletaSalva,
  onBicicletaExcluida,
}: {
  cliente: ClienteComRelacoes
  companyId: string
  activeStoreId: string
  onClose: () => void
  onClienteAtualizado: (c: ClienteComRelacoes) => void
  onClienteExcluido: (clienteId: string) => void
  onBicicletaSalva: (b: BicicletaRow) => void
  onBicicletaExcluida: (bikeId: string, clienteId: string) => void
}) {
  const cor = avatarColor(cliente.nome)
  const [modalCliente, setModalCliente] = useState(false)
  const [bikeModal, setBikeModal] = useState<BicicletaRow | 'nova' | null>(null)
  const [excluindoCliente, setExcluindoCliente] = useState(false)
  const [excluindoBikeId, setExcluindoBikeId] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [orcamentosCliente, setOrcamentosCliente] = useState<OrcamentoLista[]>([])

  useEffect(() => {
    void listarOrcamentosPorCliente(companyId, cliente.id)
      .then(setOrcamentosCliente)
      .catch(() => setOrcamentosCliente([]))
  }, [companyId, cliente.id])

  async function handleExcluirCliente() {
    const nBikes = cliente.bicicletas.length
    const msg =
      nBikes > 0
        ? `Excluir "${cliente.nome}" e ${nBikes} bicicleta(s) cadastrada(s)?\n\nEsta ação não pode ser desfeita.`
        : `Excluir o cliente "${cliente.nome}"?\n\nEsta ação não pode ser desfeita.`
    if (!window.confirm(msg)) return
    setExcluindoCliente(true)
    setErroAcao(null)
    try {
      await excluirCliente(companyId, cliente.id)
      onClienteExcluido(cliente.id)
    } catch (e: unknown) {
      setErroAcao(e instanceof Error ? e.message : 'Erro ao excluir cliente.')
    } finally {
      setExcluindoCliente(false)
    }
  }

  async function handleExcluirBike(b: BicicletaRow) {
    const nome = `${b.marca} ${b.modelo}`.trim()
    if (!window.confirm(`Excluir a bicicleta "${nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluindoBikeId(b.id)
    setErroAcao(null)
    try {
      await excluirBicicleta(b.id)
      onBicicletaExcluida(b.id, cliente.id)
    } catch (e: unknown) {
      setErroAcao(e instanceof Error ? e.message : 'Erro ao excluir bicicleta.')
    } finally {
      setExcluindoBikeId(null)
    }
  }

  return (
    <div className="cl-detail" aria-label={`Detalhe de ${cliente.nome}`}>
      <div className="cl-detail__topbar">
        <button type="button" className="cl-back" onClick={onClose} aria-label="Voltar à lista">
          <IconArrowLeft />
          <span>Clientes</span>
        </button>
        <div className="cl-detail__actions">
          <button type="button" className="cl-btn cl-btn--ghost" onClick={() => setModalCliente(true)}>
            Editar
          </button>
          <button
            type="button"
            className="cl-btn cl-btn--danger"
            onClick={() => void handleExcluirCliente()}
            disabled={excluindoCliente}
          >
            {excluindoCliente ? 'Excluindo…' : 'Excluir'}
          </button>
          <button type="button" className="cl-btn cl-btn--accent">
            <IconPlus />
            Nova OS
          </button>
        </div>
      </div>

      {erroAcao && (
        <p className="cl-form-error cl-detail__erro" role="alert">{erroAcao}</p>
      )}

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
        <div className="cl-section__head">
          <div id="lbl-bikes" className="cp-dash-label cp-dash-label--violet">
            <span className="cp-dash-label__dot" aria-hidden />
            Bicicletas <span className="cl-count">{cliente.bicicletas.length}</span>
          </div>
          <button
            type="button"
            className="cl-btn cl-btn--ghost"
            onClick={() => setBikeModal('nova')}
          >
            <IconPlus />
            Nova bicicleta
          </button>
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
                <div className="cl-bike__actions">
                  <button
                    type="button"
                    className="cl-icon-btn"
                    aria-label={`Editar ${b.marca} ${b.modelo}`}
                    onClick={() => setBikeModal(b)}
                  >
                    <IconPencil />
                  </button>
                  <button
                    type="button"
                    className="cl-icon-btn cl-icon-btn--danger"
                    aria-label={`Excluir ${b.marca} ${b.modelo}`}
                    onClick={() => void handleExcluirBike(b)}
                    disabled={excluindoBikeId === b.id}
                  >
                    <IconTrash />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalCliente && (
        <ClienteFormModal
          companyId={companyId}
          activeStoreId={activeStoreId}
          cliente={cliente}
          onClose={() => setModalCliente(false)}
          onSalvo={(c) => {
            onClienteAtualizado(c)
            setModalCliente(false)
          }}
        />
      )}

      {bikeModal && (
        <BicicletaFormModal
          companyId={companyId}
          clienteId={cliente.id}
          bike={bikeModal === 'nova' ? undefined : bikeModal}
          onClose={() => setBikeModal(null)}
          onSalvo={(b) => {
            onBicicletaSalva(b)
            setBikeModal(null)
          }}
        />
      )}

      <section className="cl-section" aria-labelledby="lbl-orc">
        <div id="lbl-orc" className="cp-dash-label cp-dash-label--teal">
          <span className="cp-dash-label__dot" aria-hidden />
          Orçamentos recentes
        </div>
        {orcamentosCliente.length === 0 ? (
          <p className="cl-empty-hint">Nenhum orçamento para este cliente.</p>
        ) : (
          <ul className="cl-orc-list">
            {orcamentosCliente.map((o) => (
              <li key={o.id} className="cl-orc-list__item">
                <span className="cl-orc-list__num">#{o.numero}</span>
                <span className={`cl-orc-list__status cl-orc-list__status--${o.status}`}>
                  {labelStatusOrcamento(o.status as StatusOrcamento)}
                </span>
                <span className="cl-orc-list__val">
                  {formatBRL(o.subtotal - Number(o.desconto || 0))}
                </span>
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
  activeStoreId: string
}

export function ClientesPage({ companyId, activeStoreId }: ClientesPageProps) {
  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FilterKey>('todos')
  const [selecionado, setSelecionado] = useState<ClienteComRelacoes | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setClientes([])
      setSelecionado(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const data = await listarClientes(companyId, activeStoreId)
      setClientes(data)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId])

  useEffect(() => { void carregar() }, [carregar])

  useEffect(() => {
    setSelecionado(null)
    setModalAberto(false)
  }, [activeStoreId])

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

  function handleSalvo(cliente: ClienteComRelacoes) {
    setClientes((prev) => {
      const existe = prev.some((c) => c.id === cliente.id)
      const next = existe
        ? prev.map((c) => (c.id === cliente.id ? cliente : c))
        : [...prev, cliente]
      return next.sort((a, b) => a.nome.localeCompare(b.nome))
    })
    setModalAberto(false)
    setSelecionado(cliente)
  }

  function handleClienteAtualizado(cliente: ClienteComRelacoes) {
    setClientes((prev) =>
      prev
        .map((c) => (c.id === cliente.id ? cliente : c))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    )
    setSelecionado(cliente)
  }

  function handleClienteExcluido(clienteId: string) {
    setClientes((prev) => prev.filter((c) => c.id !== clienteId))
    setSelecionado(null)
  }

  function handleBicicletaSalva(bike: BicicletaRow) {
    const merge = (bikes: BicicletaRow[]) => {
      const idx = bikes.findIndex((b) => b.id === bike.id)
      if (idx >= 0) {
        const next = [...bikes]
        next[idx] = bike
        return next
      }
      return [...bikes, bike]
    }
    setSelecionado((cur) => {
      if (!cur || cur.id !== bike.cliente_id) return cur
      return { ...cur, bicicletas: merge(cur.bicicletas) }
    })
    setClientes((prev) =>
      prev.map((c) =>
        c.id === bike.cliente_id ? { ...c, bicicletas: merge(c.bicicletas) } : c,
      ),
    )
  }

  function handleBicicletaExcluida(bikeId: string, clienteId: string) {
    const remove = (bikes: BicicletaRow[]) => bikes.filter((b) => b.id !== bikeId)
    setSelecionado((cur) => {
      if (!cur || cur.id !== clienteId) return cur
      return { ...cur, bicicletas: remove(cur.bicicletas) }
    })
    setClientes((prev) =>
      prev.map((c) =>
        c.id === clienteId ? { ...c, bicicletas: remove(c.bicicletas) } : c,
      ),
    )
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
                disabled={!activeStoreId}
                title={!activeStoreId ? 'Selecione uma loja no topo' : undefined}
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
              <button type="button" className="cl-btn cl-btn--ghost" onClick={() => void carregar()}>
                Tentar novamente
              </button>
            </div>
          ) : !activeStoreId ? (
            <div className="cl-empty">
              <p className="cl-empty__text">Selecione uma loja no topo da tela.</p>
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
              companyId={companyId}
              activeStoreId={activeStoreId}
              onClose={() => setSelecionado(null)}
              onClienteAtualizado={handleClienteAtualizado}
              onClienteExcluido={handleClienteExcluido}
              onBicicletaSalva={handleBicicletaSalva}
              onBicicletaExcluida={handleBicicletaExcluida}
            />
          </div>
        ) : (
          <div className="cl-detail-col cl-detail-col--empty" aria-hidden>
            <span className="cl-detail-col__hint">Selecione um cliente</span>
          </div>
        )}
      </div>

      {modalAberto && (
        <ClienteFormModal
          companyId={companyId}
          activeStoreId={activeStoreId}
          onClose={() => setModalAberto(false)}
          onSalvo={handleSalvo}
        />
      )}
    </>
  )
}
