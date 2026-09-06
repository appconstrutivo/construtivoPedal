import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClientePicker } from './ClientePicker'
import { listarClientes, type ClienteComRelacoes } from '../services/clientes.service'
import {
  isVencida,
  labelCategoriaContaPagar,
  listarContasPagarPendentesPeriodo,
  nomeCredorContaPagar,
  type ContaPagar,
} from '../services/financeiro.service'
import {
  atualizarCalendarioEvento,
  CORES_CALENDARIO_TIPO,
  criarCalendarioEvento,
  criarCalendarioTipoEvento,
  corTipoCalendario,
  dataLocalISO,
  excluirCalendarioEvento,
  eventoCobreData,
  eventoEhPeriodo,
  labelStatusCalendario,
  labelTipoCalendario,
  listarCalendarioEventos,
  listarCalendarioTiposEvento,
  montarTiposCalendarioOpcoes,
  tipoCalendarioEhPadrao,
  type CalendarioEventoRow,
  type CalendarioTipoEventoRow,
  type CorCalendarioTipo,
  type TipoCalendarioEvento,
} from '../services/calendario.service'

type AgendaPanelProps = {
  companyId: string
  activeStoreId: string
  onBadgeChange?: () => void
  onNavigateFinanceiro?: () => void
  /** Só carrega dados quando a aba Início está visível. */
  active?: boolean
}

type AgendaItemDia =
  | { kind: 'evento'; data: CalendarioEventoRow }
  | { kind: 'conta_pagar'; data: ContaPagar }

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatDiaCurto(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatHora(hora: string | null) {
  if (!hora) return null
  return hora.slice(0, 5)
}

function celulasDoMes(ano: number, mes: number): string[] {
  const primeiro = new Date(ano, mes, 1)
  const inicio = new Date(primeiro)
  inicio.setDate(1 - primeiro.getDay())
  const out: string[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    out.push(dataLocalISO(d))
  }
  return out
}

type FormEvento = {
  titulo: string
  tipo: TipoCalendarioEvento
  dataInicio: string
  dataFim: string
  horaInicio: string
  clienteId: string
  observacoes: string
}

function formVazio(dia: string): FormEvento {
  return {
    titulo: '',
    tipo: 'entrega',
    dataInicio: dia,
    dataFim: dia,
    horaInicio: '',
    clienteId: '',
    observacoes: '',
  }
}

function formDoEvento(e: CalendarioEventoRow): FormEvento {
  return {
    titulo: e.titulo,
    tipo: e.tipo,
    dataInicio: e.data_inicio,
    dataFim: e.data_fim,
    horaInicio: formatHora(e.hora_inicio) ?? '',
    clienteId: e.cliente_id ?? '',
    observacoes: e.observacoes ?? '',
  }
}

export function AgendaPanel({
  companyId,
  activeStoreId,
  onBadgeChange,
  onNavigateFinanceiro,
  active = true,
}: AgendaPanelProps) {
  const hoje = dataLocalISO()
  const agora = new Date()
  const semLoja = !activeStoreId
  const [cursor, setCursor] = useState({ ano: agora.getFullYear(), mes: agora.getMonth() })
  const [diaSelecionado, setDiaSelecionado] = useState(hoje)
  const [eventos, setEventos] = useState<CalendarioEventoRow[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [msgOk, setMsgOk] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormEvento>(() => formVazio(hoje))
  const [tiposCustom, setTiposCustom] = useState<CalendarioTipoEventoRow[]>([])
  const [tipoMenuAberto, setTipoMenuAberto] = useState(false)
  const [novoTipoAberto, setNovoTipoAberto] = useState(false)
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [novoTipoCor, setNovoTipoCor] = useState<CorCalendarioTipo>('blue')
  const loadSeqRef = useRef(0)
  const tipoPickRef = useRef<HTMLDivElement>(null)

  const tiposOpcoes = useMemo(() => montarTiposCalendarioOpcoes(tiposCustom), [tiposCustom])
  const tipoSelecionado = useMemo(
    () => tiposOpcoes.find((t) => t.key === form.tipo) ?? tiposOpcoes[0],
    [tiposOpcoes, form.tipo],
  )

  const celulas = useMemo(() => celulasDoMes(cursor.ano, cursor.mes), [cursor.ano, cursor.mes])
  const inicioGrade = celulas[0]
  const fimGrade = celulas[celulas.length - 1]
  const mesPrefix = `${cursor.ano}-${String(cursor.mes + 1).padStart(2, '0')}`

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setEventos([])
      setContasPagar([])
      setClientes([])
      setTiposCustom([])
      setLoading(false)
      return
    }
    const seq = ++loadSeqRef.current
    setLoading(true)
    setErro(null)
    try {
      const [ev, cp, cl, tipos] = await Promise.all([
        listarCalendarioEventos(companyId, activeStoreId, inicioGrade, fimGrade),
        listarContasPagarPendentesPeriodo(companyId, activeStoreId, inicioGrade, fimGrade),
        listarClientes(companyId, activeStoreId),
        listarCalendarioTiposEvento(companyId, activeStoreId),
      ])
      if (seq !== loadSeqRef.current) return
      setEventos(ev)
      setContasPagar(cp)
      setClientes(cl)
      setTiposCustom(tipos)
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return
      setErro(e instanceof Error ? e.message : 'Erro ao carregar agenda.')
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [companyId, activeStoreId, inicioGrade, fimGrade])

  useEffect(() => {
    if (!active) return
    void carregar()
  }, [active, carregar])

  useEffect(() => {
    setDiaSelecionado(dataLocalISO())
  }, [activeStoreId])

  useEffect(() => {
    if (!tipoMenuAberto) return
    const fecharAoClicarFora = (e: MouseEvent) => {
      if (tipoPickRef.current && !tipoPickRef.current.contains(e.target as Node)) {
        setTipoMenuAberto(false)
      }
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [tipoMenuAberto])

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, CalendarioEventoRow[]>()
    for (const iso of celulas) {
      map.set(
        iso,
        eventos.filter((e) => eventoCobreData(e, iso)),
      )
    }
    return map
  }, [celulas, eventos])

  const contasPorDia = useMemo(() => {
    const map = new Map<string, ContaPagar[]>()
    for (const iso of celulas) {
      map.set(iso, contasPagar.filter((c) => c.vencimento === iso))
    }
    return map
  }, [celulas, contasPagar])

  const eventosHoje = useMemo(
    () => eventos.filter((e) => e.status === 'agendado' && eventoCobreData(e, hoje)),
    [eventos, hoje],
  )
  const contasHoje = useMemo(() => contasPagar.filter((c) => c.vencimento === hoje), [contasPagar, hoje])

  const itensDoDia = useMemo(() => {
    const eventosLista = eventosPorDia.get(diaSelecionado) ?? []
    const contasLista = contasPorDia.get(diaSelecionado) ?? []
    const itens: AgendaItemDia[] = [
      ...eventosLista.map((e) => ({ kind: 'evento' as const, data: e })),
      ...contasLista.map((c) => ({ kind: 'conta_pagar' as const, data: c })),
    ]
    return itens.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'conta_pagar' ? 1 : -1
      if (a.kind === 'evento' && b.kind === 'evento') {
        const ha = a.data.hora_inicio ?? ''
        const hb = b.data.hora_inicio ?? ''
        if (ha !== hb) return ha.localeCompare(hb)
        return a.data.titulo.localeCompare(b.data.titulo, 'pt-BR')
      }
      if (a.kind === 'conta_pagar' && b.kind === 'conta_pagar') {
        return a.data.descricao.localeCompare(b.data.descricao, 'pt-BR')
      }
      return 0
    })
  }, [eventosPorDia, contasPorDia, diaSelecionado])

  function fecharModal() {
    setModalAberto(false)
    setEditandoId(null)
    setTipoMenuAberto(false)
    setNovoTipoAberto(false)
    setNovoTipoNome('')
    setNovoTipoCor('blue')
  }

  function abrirNovo(dia = diaSelecionado) {
    setEditandoId(null)
    setForm(formVazio(dia))
    setTipoMenuAberto(false)
    setNovoTipoAberto(false)
    setNovoTipoNome('')
    setNovoTipoCor('blue')
    setErro(null)
    setModalAberto(true)
  }

  function abrirEditar(evento: CalendarioEventoRow) {
    setEditandoId(evento.id)
    setForm(formDoEvento(evento))
    setTipoMenuAberto(false)
    setNovoTipoAberto(false)
    setNovoTipoNome('')
    setNovoTipoCor('blue')
    setErro(null)
    setModalAberto(true)
  }

  function irMes(delta: number) {
    setCursor((c) => {
      const d = new Date(c.ano, c.mes + delta, 1)
      return { ano: d.getFullYear(), mes: d.getMonth() }
    })
  }

  function irHoje() {
    const d = new Date()
    setCursor({ ano: d.getFullYear(), mes: d.getMonth() })
    setDiaSelecionado(hoje)
  }

  async function handleCriarTipo() {
    if (!activeStoreId) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    const nome = novoTipoNome.trim()
    if (!nome) {
      setErro('Informe o nome do novo tipo.')
      return
    }
    setBusy('tipo')
    setErro(null)
    try {
      const criado = await criarCalendarioTipoEvento({
        company_id: companyId,
        store_id: activeStoreId,
        nome,
        cor: novoTipoCor,
        ordem: tiposCustom.length,
      })
      setTiposCustom((lista) => [...lista, criado].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')))
      setForm((f) => ({ ...f, tipo: criado.id }))
      setTipoMenuAberto(false)
      setNovoTipoAberto(false)
      setNovoTipoNome('')
      setNovoTipoCor('blue')
      setMsgOk(`Tipo "${criado.nome}" adicionado.`)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar tipo.')
    } finally {
      setBusy(null)
    }
  }

  function classeCardTipo(tipo: string) {
    return tipoCalendarioEhPadrao(tipo) ? tipo : `custom-${corTipoCalendario(tipo, tiposCustom)}`
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!activeStoreId) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    const titulo = form.titulo.trim()
    if (!titulo) {
      setErro('Informe o título do evento.')
      return
    }
    if (form.dataFim < form.dataInicio) {
      setErro('A data final não pode ser anterior ao início.')
      return
    }
    setBusy('save')
    setErro(null)
    setMsgOk(null)
    try {
      const payload = {
        titulo,
        tipo: form.tipo,
        data_inicio: form.dataInicio,
        data_fim: form.dataFim,
        hora_inicio: form.horaInicio || null,
        cliente_id: form.clienteId || null,
        observacoes: form.observacoes.trim() || null,
      }
      if (editandoId) {
        await atualizarCalendarioEvento(editandoId, payload)
        setMsgOk('Evento atualizado.')
      } else {
        await criarCalendarioEvento({
          company_id: companyId,
          store_id: activeStoreId,
          status: 'agendado',
          ...payload,
        })
        setMsgOk('Evento criado.')
      }
      setModalAberto(false)
      setEditandoId(null)
      setDiaSelecionado(form.dataInicio)
      await carregar()
      onBadgeChange?.()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar evento.')
    } finally {
      setBusy(null)
    }
  }

  async function handleConcluir(id: string) {
    setBusy(id)
    setErro(null)
    try {
      await atualizarCalendarioEvento(id, { status: 'concluido' })
      fecharModal()
      await carregar()
      onBadgeChange?.()
      setMsgOk('Evento concluído.')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao concluir.')
    } finally {
      setBusy(null)
    }
  }

  async function handleExcluir(id: string) {
    if (!window.confirm('Excluir este evento da agenda?')) return
    setBusy(id)
    setErro(null)
    try {
      await excluirCalendarioEvento(id)
      fecharModal()
      await carregar()
      onBadgeChange?.()
      setMsgOk('Evento excluído.')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="cal-panel">
      <div className="cal-panel__toolbar">
        <button type="button" className="st-primary-btn st-primary-btn--soft" disabled={semLoja} onClick={() => abrirNovo()}>
          Novo evento
        </button>
      </div>

      {semLoja && <p className="st-panel__hint">Selecione uma loja no topo da tela.</p>}
      {erro && !modalAberto && (
        <div className="st-form-error" role="alert">
          {erro}
        </div>
      )}
      {msgOk && (
        <p className="cal-ok" role="status">
          {msgOk}
        </p>
      )}

      {(eventosHoje.length > 0 || contasHoje.length > 0) && (
        <div className="cal-hoje" role="status">
          <strong>
            {eventosHoje.length > 0 && contasHoje.length > 0
              ? `${eventosHoje.length} evento${eventosHoje.length === 1 ? '' : 's'} e ${contasHoje.length} conta${contasHoje.length === 1 ? '' : 's'} a pagar hoje`
              : eventosHoje.length > 0
                ? eventosHoje.length === 1
                  ? '1 evento hoje'
                  : `${eventosHoje.length} eventos hoje`
                : contasHoje.length === 1
                  ? '1 conta a pagar hoje'
                  : `${contasHoje.length} contas a pagar hoje`}
          </strong>
          <span>
            {[
              ...eventosHoje.slice(0, 2).map((e) => e.titulo),
              ...contasHoje.slice(0, 2).map((c) => c.descricao),
            ]
              .slice(0, 3)
              .join(' · ')}
            {eventosHoje.length + contasHoje.length > 3 ? '…' : ''}
          </span>
          {diaSelecionado !== hoje && (
            <button type="button" className="st-ghost-btn" onClick={irHoje}>
              Ver hoje
            </button>
          )}
        </div>
      )}

      <div className="cal-layout">
        <section className="cal-board st-panel">
          <div className="cal-nav">
            <button type="button" className="cal-nav__arrow" onClick={() => irMes(-1)} aria-label="Mês anterior">
              ‹
            </button>
            <h2 className="cal-nav__title">
              {MESES[cursor.mes]} {cursor.ano}
            </h2>
            <button type="button" className="cal-nav__arrow" onClick={() => irMes(1)} aria-label="Próximo mês">
              ›
            </button>
            <button type="button" className="st-ghost-btn cal-nav__hoje" onClick={irHoje}>
              Hoje
            </button>
          </div>

          <div className="cal-grid" role="grid" aria-label={`Calendário de ${MESES[cursor.mes]}`}>
            {SEMANA.map((d) => (
              <div key={d} className="cal-grid__head">
                {d}
              </div>
            ))}
            {celulas.map((iso) => {
              const doMes = iso.startsWith(mesPrefix)
              const lista = eventosPorDia.get(iso) ?? []
              const agendados = lista.filter((e) => e.status === 'agendado')
              const contas = contasPorDia.get(iso) ?? []
              const totalMarcacoes = agendados.length + (contas.length > 0 ? 1 : 0)
              const selected = iso === diaSelecionado
              const isHoje = iso === hoje
              const barrasEvento = agendados.slice(0, contas.length > 0 ? 2 : 3)
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  className={[
                    'cal-day',
                    doMes ? '' : 'cal-day--out',
                    selected ? 'cal-day--selected' : '',
                    isHoje ? 'cal-day--today' : '',
                    totalMarcacoes > 0 ? 'cal-day--busy' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setDiaSelecionado(iso)}
                  onDoubleClick={() => abrirNovo(iso)}
                >
                  <span className="cal-day__n">{Number(iso.slice(8, 10))}</span>
                  {totalMarcacoes > 0 && (
                    <span className="cal-day__bars" aria-hidden>
                      {barrasEvento.map((e) => (
                        <span
                          key={e.id}
                          className={`cal-day__bar cal-day__bar--${e.tipo}${eventoEhPeriodo(e) ? ' cal-day__bar--range' : ''}`}
                          title={e.titulo}
                        />
                      ))}
                      {contas.length > 0 && (
                        <span
                          className="cal-day__bar cal-day__bar--pagar"
                          title={contas.length === 1 ? contas[0].descricao : `${contas.length} contas a pagar`}
                        />
                      )}
                      {totalMarcacoes > 3 && <span className="cal-day__more">+{totalMarcacoes - 3}</span>}
                    </span>
                  )}
                  {totalMarcacoes > 1 && (
                    <span className="cal-day__count" aria-label={`${totalMarcacoes} itens`}>
                      {totalMarcacoes}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="cal-legend">
            Barras coloridas marcam eventos; a barra vermelha indica contas a pagar pendentes. Duplo clique cria evento.
          </p>
        </section>

        <aside className="cal-side st-panel">
          <div className="cal-side__head">
            <h3 className="cal-side__title">
              {diaSelecionado === hoje ? 'Hoje' : formatDiaCurto(diaSelecionado)}
              {itensDoDia.length > 0 && (
                <span className="cal-side__count">
                  {itensDoDia.length} {itensDoDia.length === 1 ? 'item' : 'itens'}
                </span>
              )}
            </h3>
            <button type="button" className="st-ghost-btn" disabled={semLoja} onClick={() => abrirNovo(diaSelecionado)}>
              Adicionar
            </button>
          </div>
          {loading ? (
            <p className="cal-muted">Carregando…</p>
          ) : itensDoDia.length === 0 ? (
            <p className="cal-muted">Nenhum evento ou conta a pagar neste dia.</p>
          ) : (
            <ul className="cal-list">
              {itensDoDia.map((item) =>
                item.kind === 'evento' ? (
                  <li key={`ev-${item.data.id}`}>
                    <button
                      type="button"
                      className={`cal-card cal-card--${classeCardTipo(item.data.tipo)}${item.data.status === 'concluido' ? ' cal-card--done' : ''}`}
                      onClick={() => abrirEditar(item.data)}
                    >
                      <span className={`cal-card__tipo cal-card__tipo--${classeCardTipo(item.data.tipo)}`}>
                        {labelTipoCalendario(item.data.tipo, tiposCustom)}
                      </span>
                      <strong className="cal-card__title">{item.data.titulo}</strong>
                      <span className="cal-card__meta">
                        {formatHora(item.data.hora_inicio) ? `${formatHora(item.data.hora_inicio)} · ` : ''}
                        {eventoEhPeriodo(item.data)
                          ? `${formatDiaCurto(item.data.data_inicio)} – ${formatDiaCurto(item.data.data_fim)}`
                          : 'Dia inteiro'}
                        {item.data.clienteNome ? ` · ${item.data.clienteNome}` : ''}
                      </span>
                      {item.data.status !== 'agendado' && (
                        <span className="cal-card__status">{labelStatusCalendario(item.data.status)}</span>
                      )}
                    </button>
                    {item.data.status === 'agendado' && (
                      <button
                        type="button"
                        className="cal-card__done"
                        disabled={busy === item.data.id}
                        onClick={() => void handleConcluir(item.data.id)}
                      >
                        Concluir
                      </button>
                    )}
                  </li>
                ) : (
                  <li key={`cp-${item.data.id}`}>
                    <button
                      type="button"
                      className={`cal-card cal-card--pagar${isVencida(item.data.vencimento, item.data.status) ? ' cal-card--pagar-vencida' : ''}`}
                      onClick={() => onNavigateFinanceiro?.()}
                      title="Abrir financeiro"
                    >
                      <span className="cal-card__tipo cal-card__tipo--pagar">Conta a pagar</span>
                      <strong className="cal-card__title">{item.data.descricao}</strong>
                      <span className="cal-card__meta">
                        {formatBRL(item.data.valor)}
                        {nomeCredorContaPagar(item.data) ? ` · ${nomeCredorContaPagar(item.data)}` : ''}
                        {` · ${labelCategoriaContaPagar(item.data.categoria)}`}
                      </span>
                      {isVencida(item.data.vencimento, item.data.status) && (
                        <span className="cal-card__status cal-card__status--alert">Vencida</span>
                      )}
                    </button>
                    {onNavigateFinanceiro && (
                      <button
                        type="button"
                        className="cal-card__done cal-card__done--financeiro"
                        onClick={() => onNavigateFinanceiro()}
                      >
                        Pagar
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </aside>
      </div>

      {modalAberto && (
        <div className="st-modal-overlay" role="presentation" onClick={fecharModal}>
          <div
            className="st-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-modal-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="st-modal__head">
              <h2 id="cal-modal-title" className="st-modal__title">
                {editandoId ? 'Editar evento' : 'Novo evento'}
              </h2>
              <button type="button" className="st-modal__close" aria-label="Fechar" onClick={fecharModal}>
                ×
              </button>
            </div>
            <form className="st-form" onSubmit={(ev) => void handleSalvar(ev)}>
              {erro && (
                <div className="st-form-error" role="alert">
                  {erro}
                </div>
              )}
              <label className="st-field">
                <span>Título</span>
                <input
                  className="st-input"
                  value={form.titulo}
                  onChange={(ev) => setForm((f) => ({ ...f, titulo: ev.target.value }))}
                  placeholder="Ex.: Entrega da Trek, revisão de 30 dias…"
                  autoFocus
                  required
                />
              </label>
              <fieldset className="cal-tipos">
                <legend>Tipo</legend>
                <div className="cal-tipo-pick" ref={tipoPickRef}>
                  <button
                    type="button"
                    className="cal-tipo-pick__trigger"
                    aria-haspopup="listbox"
                    aria-expanded={tipoMenuAberto}
                    onClick={() => {
                      setTipoMenuAberto((v) => !v)
                      setErro(null)
                    }}
                  >
                    <span
                      className={`cal-tipo-pick__dot cal-tipo-pick__dot--${tipoSelecionado.cor ?? 'blue'}`}
                      aria-hidden
                    />
                    <span className="cal-tipo-pick__label">{tipoSelecionado.label}</span>
                    <svg className="cal-tipo-pick__chev" aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`cal-tipo-add${novoTipoAberto ? ' cal-tipo-add--on' : ''}`}
                    aria-label="Adicionar tipo de evento"
                    title="Adicionar tipo"
                    onClick={() => {
                      setTipoMenuAberto(false)
                      setNovoTipoAberto((v) => !v)
                      setErro(null)
                    }}
                  >
                    +
                  </button>
                  {tipoMenuAberto && (
                    <div className="cal-tipo-pick__menu" role="listbox" aria-label="Tipos de evento">
                      {tiposOpcoes.map((t) => {
                        const ativo = form.tipo === t.key
                        return (
                          <button
                            key={t.key}
                            type="button"
                            role="option"
                            aria-selected={ativo}
                            className={`cal-tipo-pick__opt${ativo ? ' cal-tipo-pick__opt--on' : ''}`}
                            onClick={() => {
                              setForm((f) => ({ ...f, tipo: t.key }))
                              setTipoMenuAberto(false)
                            }}
                          >
                            <span
                              className={`cal-tipo-pick__dot cal-tipo-pick__dot--${t.cor ?? 'blue'}`}
                              aria-hidden
                            />
                            <span className="cal-tipo-pick__opt-label">{t.label}</span>
                            {t.custom && <span className="cal-tipo-pick__opt-tag">Personalizado</span>}
                            {ativo && (
                              <svg className="cal-tipo-pick__check" aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none">
                                <path d="M5 12.5 10 17.5 19 8.5" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                {novoTipoAberto && (
                  <div className="cal-tipos-novo">
                    <input
                      className="st-input cal-tipos-novo__nome"
                      value={novoTipoNome}
                      onChange={(ev) => setNovoTipoNome(ev.target.value)}
                      placeholder="Nome do novo tipo"
                      maxLength={40}
                      autoFocus
                    />
                    <div className="cal-tipos-novo__cores" role="group" aria-label="Cor do tipo">
                      {CORES_CALENDARIO_TIPO.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          className={`cal-cor-btn cal-cor-btn--${c.key}${novoTipoCor === c.key ? ' cal-cor-btn--on' : ''}`}
                          title={c.label}
                          aria-label={c.label}
                          aria-pressed={novoTipoCor === c.key}
                          onClick={() => setNovoTipoCor(c.key)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="st-primary-btn cal-tipos-novo__salvar"
                      disabled={busy === 'tipo'}
                      onClick={() => void handleCriarTipo()}
                    >
                      {busy === 'tipo' ? 'Salvando…' : 'Adicionar tipo'}
                    </button>
                    <button
                      type="button"
                      className="st-ghost-btn"
                      disabled={busy === 'tipo'}
                      onClick={() => {
                        setNovoTipoAberto(false)
                        setNovoTipoNome('')
                        setNovoTipoCor('blue')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </fieldset>
              <div className="cal-form-grid">
                <label className="st-field">
                  <span>Início</span>
                  <input
                    type="date"
                    className="st-input"
                    value={form.dataInicio}
                    onChange={(ev) => {
                      const v = ev.target.value
                      setForm((f) => ({
                        ...f,
                        dataInicio: v,
                        dataFim: f.dataFim < v ? v : f.dataFim,
                      }))
                    }}
                    required
                  />
                </label>
                <label className="st-field">
                  <span>Fim do período</span>
                  <input
                    type="date"
                    className="st-input"
                    value={form.dataFim}
                    min={form.dataInicio}
                    onChange={(ev) => setForm((f) => ({ ...f, dataFim: ev.target.value }))}
                    required
                  />
                </label>
                <label className="st-field">
                  <span>Horário (opcional)</span>
                  <input
                    type="time"
                    className="st-input"
                    value={form.horaInicio}
                    onChange={(ev) => setForm((f) => ({ ...f, horaInicio: ev.target.value }))}
                  />
                </label>
              </div>
              <p className="cal-field-hint">
                Use o mesmo dia no início e no fim para um compromisso pontual. Datas diferentes marcam o intervalo no
                calendário.
              </p>
              <label className="st-field">
                <span>Cliente (opcional)</span>
                <ClientePicker
                  clientes={clientes}
                  value={form.clienteId}
                  allowBalcao={false}
                  placeholder="Vincular a um cliente…"
                  onChange={(id) => setForm((f) => ({ ...f, clienteId: id }))}
                />
              </label>
              <label className="st-field">
                <span>Observações</span>
                <textarea
                  className="st-input"
                  rows={2}
                  value={form.observacoes}
                  onChange={(ev) => setForm((f) => ({ ...f, observacoes: ev.target.value }))}
                />
              </label>
              <div className="st-form-actions">
                {editandoId && (
                  <button
                    type="button"
                    className="st-ghost-btn"
                    disabled={!!busy}
                    onClick={() => void handleExcluir(editandoId)}
                  >
                    Excluir
                  </button>
                )}
                {editandoId && (
                  <button
                    type="button"
                    className="st-ghost-btn"
                    disabled={!!busy}
                    onClick={() => void handleConcluir(editandoId)}
                  >
                    Concluir
                  </button>
                )}
                <span className="cal-form-spacer" />
                <button type="button" className="st-ghost-btn" onClick={fecharModal} disabled={!!busy}>
                  Cancelar
                </button>
                <button type="submit" className="st-primary-btn" disabled={busy === 'save'}>
                  {busy === 'save' ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
