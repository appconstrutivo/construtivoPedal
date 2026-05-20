import { useCallback, useEffect, useMemo, useState } from 'react'
import { EstoqueItemPicker } from '../components/EstoqueItemPicker'
import { ServicoCatalogoPicker } from '../components/ServicoCatalogoPicker'
import { imprimirOrcamento } from '../components/OrcamentoPrint'
import {
  MSG_QUANTIDADE_INTEIRA,
  filtrarInputQuantidadeInteira,
  parseQuantidadeInteira,
} from '../lib/quantidade'
import { listarClientes, type ClienteComRelacoes } from '../services/clientes.service'
import { listarCatalogoServicos, type CatalogoServicoRow } from '../services/catalogo-servicos.service'
import { listarItensEstoque, type EstoqueItemComLocal } from '../services/estoque.service'
import {
  adicionarOrcamentoItem,
  atualizarOrcamento,
  atualizarOrcamentoItem,
  calcularSubtotalOrcamento,
  calcularTotalOrcamento,
  carregarOrcamentoDetalhe,
  converterOrcamentoEmOs,
  converterOrcamentoEmPdvPrefill,
  criarOrcamento,
  enviarOrcamento,
  excluirOrcamento,
  excluirOrcamentoItem,
  labelStatusOrcamento,
  listarOrcamentos,
  marcarAprovacaoOrcamentoVista,
  marcarOrcamentoAprovado,
  marcarOrcamentoRecusado,
  montarTextoWhatsappOrcamento,
  orcamentoAprovacaoNaoVista,
  ORCAMENTO_CLIENTE_BALCAO,
  urlAprovacaoOrcamento,
  type OrcamentoDetalhe,
  type OrcamentoLista,
  type OrcamentoItemRow,
  type StatusOrcamento,
} from '../services/orcamento.service'

type OrcamentosPageProps = {
  companyId: string
  activeStoreId: string
  companyName: string
  onNavigatePdv: () => void
  onNavigateOficina: (osId?: string) => void
  onAprovacoesPendentesChange?: () => void
}

type FiltroLista = 'todos' | 'rascunho' | 'enviado' | 'aprovado' | 'outros'

const FILTROS: { key: FiltroLista; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'rascunho', label: 'Rascunho' },
  { key: 'enviado', label: 'Enviado' },
  { key: 'aprovado', label: 'Aprovado' },
  { key: 'outros', label: 'Outros' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
function statusChipClass(s: StatusOrcamento) {
  const m: Record<StatusOrcamento, string> = {
    rascunho: 'orc-chip orc-chip--draft',
    enviado: 'orc-chip orc-chip--sent',
    aprovado: 'orc-chip orc-chip--ok',
    recusado: 'orc-chip orc-chip--no',
    expirado: 'orc-chip orc-chip--exp',
    convertido: 'orc-chip orc-chip--done',
  }
  return m[s] ?? 'orc-chip'
}
function podeEditar(s: StatusOrcamento) {
  return s === 'rascunho' || s === 'enviado'
}
function podeExcluir(s: StatusOrcamento) {
  return s !== 'convertido'
}
function defaultValidoAte() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}
function syncForm(d: OrcamentoDetalhe) {
  return {
    clienteId: d.cliente_id ?? '',
    bicicletaId: d.bicicleta_id ?? '',
    resumo: d.resumo ?? '',
    observacoes: d.observacoes ?? '',
    desconto: String(Number(d.desconto) || 0),
    validoAte: d.valido_ate ?? defaultValidoAte(),
  }
}

export function OrcamentosPage({
  companyId,
  activeStoreId,
  companyName,
  onNavigatePdv,
  onNavigateOficina,
  onAprovacoesPendentesChange,
}: OrcamentosPageProps) {
  const semLoja = !activeStoreId
  const [lista, setLista] = useState<OrcamentoLista[]>([])
  const [filtro, setFiltro] = useState<FiltroLista>('todos')
  const [busca, setBusca] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<OrcamentoDetalhe | null>(null)
  const [loadingLista, setLoadingLista] = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msgOk, setMsgOk] = useState<string | null>(null)
  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [itensEstoque, setItensEstoque] = useState<EstoqueItemComLocal[]>([])
  const [catalogoServicos, setCatalogoServicos] = useState<CatalogoServicoRow[]>([])
  const [modalNovoOpen, setModalNovoOpen] = useState(false)
  const [novoClienteId, setNovoClienteId] = useState('')
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState({
    clienteId: '',
    bicicletaId: '',
    resumo: '',
    observacoes: '',
    desconto: '0',
    validoAte: defaultValidoAte(),
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [pecaItemId, setPecaItemId] = useState('')
  const [pecaQtd, setPecaQtd] = useState('1')
  const [servicoCatalogoId, setServicoCatalogoId] = useState('')

  const carregarLista = useCallback(async () => {
    if (!activeStoreId) { setLista([]); setLoadingLista(false); return }
    setLoadingLista(true)
    setErro(null)
    try { setLista(await listarOrcamentos(companyId, activeStoreId)) }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar orçamentos.') }
    finally { setLoadingLista(false) }
  }, [companyId, activeStoreId])

  const carregarContexto = useCallback(async () => {
    if (!activeStoreId) { setClientes([]); setItensEstoque([]); setCatalogoServicos([]); return }
    try {
      const [c, it, svc] = await Promise.all([
        listarClientes(companyId, activeStoreId),
        listarItensEstoque(companyId, activeStoreId),
        listarCatalogoServicos(companyId, { somenteAtivos: true, storeId: activeStoreId }),
      ])
      setClientes(c)
      setItensEstoque(it.filter((i) => ['peca', 'acessorio', 'componente'].includes(i.categoria)))
      setCatalogoServicos(svc)
    } catch { /* noop */ }
  }, [companyId, activeStoreId])

  const recarregarDetalhe = useCallback(async (orcId: string) => {
    setLoadingDetalhe(true)
    setErro(null)
    try {
      const d = await carregarOrcamentoDetalhe(companyId, orcId)
      setDetalhe(d)
      if (d) setForm(syncForm(d))
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar orçamento.') }
    finally { setLoadingDetalhe(false) }
  }, [companyId])

  useEffect(() => {
    setSelectedId(null); setDetalhe(null)
    void carregarLista(); void carregarContexto()
  }, [carregarLista, carregarContexto, activeStoreId])

  useEffect(() => {
    if (!activeStoreId) return
    const intervalo = window.setInterval(() => void carregarLista(), 45_000)
    return () => window.clearInterval(intervalo)
  }, [activeStoreId, carregarLista])

  useEffect(() => {
    if (!selectedId) { setDetalhe(null); return }
    void recarregarDetalhe(selectedId)
  }, [selectedId, recarregarDetalhe])

  useEffect(() => {
    if (!detalhe || !orcamentoAprovacaoNaoVista(detalhe)) return
    void marcarAprovacaoOrcamentoVista(detalhe.id)
      .then(() => {
        onAprovacoesPendentesChange?.()
        return carregarLista()
      })
      .then(() => recarregarDetalhe(detalhe.id))
      .catch(() => {})
  }, [
    detalhe?.id,
    detalhe?.status,
    detalhe?.aprovado_cliente_em,
    detalhe?.aprovacao_vista_em,
    onAprovacoesPendentesChange,
    carregarLista,
    recarregarDetalhe,
  ])

  const listaFiltrada = useMemo(() => {
    let rows = lista
    if (filtro === 'rascunho') rows = rows.filter((r) => r.status === 'rascunho')
    else if (filtro === 'enviado') rows = rows.filter((r) => r.status === 'enviado')
    else if (filtro === 'aprovado') rows = rows.filter((r) => r.status === 'aprovado')
    else if (filtro === 'outros') rows = rows.filter((r) => ['recusado', 'expirado', 'convertido'].includes(r.status))
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      if (r.clienteNome.toLowerCase().includes(q)) return true
      if (String(r.numero).includes(q)) return true
      if (r.bikeLabel?.toLowerCase().includes(q)) return true
      if (!r.cliente_id && ORCAMENTO_CLIENTE_BALCAO.toLowerCase().includes(q)) return true
      return false
    })
  }, [lista, filtro, busca])

  useEffect(() => {
    if (!listaFiltrada.length) { if (selectedId) setSelectedId(null); return }
    if (!selectedId || !listaFiltrada.some((r) => r.id === selectedId)) setSelectedId(listaFiltrada[0].id)
  }, [listaFiltrada, selectedId])

  const bikesCliente = useMemo(
    () => clientes.find((c) => c.id === form.clienteId)?.bicicletas ?? [],
    [clientes, form.clienteId],
  )
  const editavel = detalhe ? podeEditar(detalhe.status) : false
  const semCliente = detalhe ? !detalhe.cliente_id : false
  const podeVincularCliente = detalhe ? !detalhe.cliente_id && detalhe.status !== 'convertido' : false
  const podeAlterarCliente = detalhe
    ? detalhe.status !== 'convertido' && (!detalhe.cliente_id || editavel)
    : false
  const subtotal = detalhe ? calcularSubtotalOrcamento(detalhe.itens) : 0
  const total = detalhe ? calcularTotalOrcamento(detalhe.itens, Number(form.desconto) || 0) : 0
  const temPeca = detalhe?.itens.some((i) => i.tipo === 'peca') ?? false
  const temServico = detalhe?.itens.some((i) => i.tipo === 'servico') ?? false
  const podeConverter = detalhe && (detalhe.status === 'enviado' || detalhe.status === 'aprovado')

  const cabecalhoMudou = useMemo(() => {
    if (!detalhe) return false
    const clienteId = form.clienteId || null
    const bikeId = clienteId ? form.bicicletaId || null : null
    const validoAteSalvo = detalhe.valido_ate ?? defaultValidoAte()
    return (
      clienteId !== (detalhe.cliente_id ?? null) ||
      bikeId !== (detalhe.bicicleta_id ?? null) ||
      form.resumo.trim() !== (detalhe.resumo ?? '').trim() ||
      (form.observacoes.trim() || null) !== (detalhe.observacoes?.trim() || null) ||
      (Number(form.desconto) || 0) !== Number(detalhe.desconto || 0) ||
      (form.validoAte || null) !== validoAteSalvo
    )
  }, [detalhe, form])

  async function persistCabecalho() {
    if (!detalhe) return
    const clienteId = form.clienteId || null
    await atualizarOrcamento(detalhe.id, {
      cliente_id: clienteId,
      bicicleta_id: clienteId ? form.bicicletaId || null : null,
      resumo: form.resumo.trim(),
      observacoes: form.observacoes.trim() || null,
      desconto: Number(form.desconto) || 0,
      valido_ate: form.validoAte || null,
    })
  }

  async function handleCriar() {
    if (!activeStoreId) { setErro('Selecione uma loja no topo da tela.'); return }
    setCriando(true); setErro(null)
    try {
      const row = await criarOrcamento({
        company_id: companyId,
        store_id: activeStoreId,
        cliente_id: novoClienteId || null,
        status: 'rascunho',
        resumo: '',
      })
      await carregarLista(); setSelectedId(row.id); setModalNovoOpen(false); setNovoClienteId(''); setMsgOk('Orçamento criado.')
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao criar.') }
    finally { setCriando(false) }
  }

  async function handleSalvar() {
    if (!detalhe || !editavel) return
    if (!cabecalhoMudou) {
      setMsgOk('Nenhuma alteração para salvar.')
      return
    }
    setBusy('save')
    setErro(null)
    setMsgOk(null)
    try {
      await persistCabecalho()
      await carregarLista()
      await recarregarDetalhe(detalhe.id)
      setMsgOk('Orçamento salvo.')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setBusy(null)
    }
  }

  async function handleVincularCliente() {
    if (!detalhe || !podeVincularCliente || !form.clienteId) {
      setErro('Selecione um cliente cadastrado para vincular.')
      return
    }
    setBusy('vincular'); setErro(null); setMsgOk(null)
    try {
      await persistCabecalho()
      await carregarLista()
      await recarregarDetalhe(detalhe.id)
      setMsgOk('Cliente vinculado ao orçamento.')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao vincular cliente.')
    } finally {
      setBusy(null)
    }
  }

  async function handleEnviar() {
    if (!detalhe) return
    setBusy('send'); setErro(null)
    try {
      if (editavel) await persistCabecalho()
      await enviarOrcamento({ orcamentoId: detalhe.id, validoAte: form.validoAte || null })
      await carregarLista(); await recarregarDetalhe(detalhe.id); setMsgOk('Orçamento enviado.')
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao enviar.') }
    finally { setBusy(null) }
  }

  async function handleExcluir() {
    if (!detalhe || !window.confirm(`Excluir orçamento #${detalhe.numero}?`)) return
    setBusy('del'); setErro(null)
    try { await excluirOrcamento(companyId, detalhe.id); setSelectedId(null); setDetalhe(null); await carregarLista(); setMsgOk('Excluído.') }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao excluir.') }
    finally { setBusy(null) }
  }

  async function handleAddPeca() {
    if (!detalhe || !editavel || !pecaItemId) return
    const qtd = parseQuantidadeInteira(pecaQtd)
    if (!Number.isFinite(qtd) || qtd < 1) { setErro(MSG_QUANTIDADE_INTEIRA); return }
    const it = itensEstoque.find((x) => x.id === pecaItemId)
    if (!it) return
    setBusy('peca')
    try {
      await adicionarOrcamentoItem({
        company_id: companyId, orcamento_id: detalhe.id, tipo: 'peca', estoque_item_id: it.id,
        servico_catalogo_id: null, descricao: it.nome, quantidade: qtd,
        preco_unitario: Number(it.preco_varejo) || Number(it.custo_medio) || 0,
      })
      setPecaItemId(''); setPecaQtd('1'); await carregarLista(); await recarregarDetalhe(detalhe.id)
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao adicionar peça.') }
    finally { setBusy(null) }
  }

  async function handleAddServico() {
    if (!detalhe || !editavel || !servicoCatalogoId) return
    const svc = catalogoServicos.find((s) => s.id === servicoCatalogoId)
    if (!svc) return
    setBusy('svc')
    try {
      await adicionarOrcamentoItem({
        company_id: companyId, orcamento_id: detalhe.id, tipo: 'servico', estoque_item_id: null,
        servico_catalogo_id: svc.id, descricao: svc.nome, quantidade: 1, preco_unitario: Number(svc.preco_sugerido) || 0,
      })
      setServicoCatalogoId(''); await carregarLista(); await recarregarDetalhe(detalhe.id)
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao adicionar serviço.') }
    finally { setBusy(null) }
  }

  async function patchItem(item: OrcamentoItemRow, patch: { quantidade?: number; preco_unitario?: number }) {
    if (!detalhe || !editavel) return
    setBusy(item.id)
    try { await atualizarOrcamentoItem(item.id, patch); await carregarLista(); await recarregarDetalhe(detalhe.id) }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao atualizar item.') }
    finally { setBusy(null) }
  }

  async function handleRemoverItem(itemId: string) {
    if (!detalhe || !editavel) return
    setBusy(itemId)
    setErro(null)
    try {
      await excluirOrcamentoItem(itemId)
      await carregarLista()
      await recarregarDetalhe(detalhe.id)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao remover item.')
    } finally {
      setBusy(null)
    }
  }

  function renderItemRow(item: OrcamentoItemRow) {
    const sub = Number(item.quantidade) * Number(item.preco_unitario)
    return (
      <tr key={item.id}>
        <td>{item.descricao}<span className="orc-table__tipo">{item.tipo === 'servico' ? 'Serviço' : 'Peça'}</span></td>
        <td className="orc-table__num">
          {editavel ? (
            <input className="orc-input orc-input--cell" defaultValue={item.quantidade} disabled={busy === item.id}
              onBlur={(e) => { const q = parseQuantidadeInteira(e.target.value); if (q >= 1) void patchItem(item, { quantidade: q }) }} />
          ) : item.quantidade}
        </td>
        <td className="orc-table__num">
          {editavel ? (
            <input className="orc-input orc-input--cell" type="number" min={0} step="0.01" defaultValue={item.preco_unitario} disabled={busy === item.id}
              onBlur={(e) => { const p = Number(e.target.value); if (Number.isFinite(p) && p >= 0) void patchItem(item, { preco_unitario: p }) }} />
          ) : formatBRL(Number(item.preco_unitario))}
        </td>
        <td className="orc-table__num">{formatBRL(sub)}</td>
        {editavel ? (
          <td><button type="button" className="orc-icon-btn" disabled={busy === item.id}
            onClick={() => void handleRemoverItem(item.id)}>×</button></td>
        ) : null}
      </tr>
    )
  }

  return (
    <div className="cp-page cp-page--orcamentos">
      <header className="orc-topbar">
        <h1 className="orc-topbar__title">Orçamentos</h1>
        <button type="button" className="st-primary-btn" disabled={semLoja} onClick={() => { setErro(null); setModalNovoOpen(true) }}>
          Novo orçamento
        </button>
      </header>

      {semLoja && <div className="st-panel orc-warn"><p className="st-panel__hint">Selecione uma loja no topo da tela.</p></div>}
      {erro && <div className="st-form-error" role="alert">{erro}</div>}
      {msgOk && <p className="orc-msg-ok" role="status">{msgOk}</p>}

      <div className="orc-layout">
        <aside className="orc-aside">
          <input type="search" className="orc-search" placeholder="Buscar cliente, nº ou bike…" value={busca}
            onChange={(e) => setBusca(e.target.value)} disabled={semLoja} />
          <div className="orc-chips" role="group" aria-label="Filtrar status">
            {FILTROS.map(({ key, label }) => (
              <button key={key} type="button" disabled={semLoja}
                className={filtro === key ? 'orc-chip-filter orc-chip-filter--on' : 'orc-chip-filter'}
                onClick={() => setFiltro(key)}>{label}</button>
            ))}
          </div>
          <div className="orc-list" role="list">
            {loadingLista ? <p className="orc-muted">Carregando…</p>
              : !listaFiltrada.length ? <p className="orc-muted">Nenhum orçamento neste filtro.</p>
              : listaFiltrada.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="listitem"
                  className={[
                    'orc-list-item',
                    selectedId === r.id ? 'orc-list-item--active' : '',
                    r.aprovacaoNaoVista ? 'orc-list-item--notify' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedId(r.id)}
                >
                  {r.aprovacaoNaoVista && (
                    <span
                      className="orc-list-item__dot"
                      aria-label="Cliente aprovou — clique para ver"
                    />
                  )}
                  <div className="orc-list-item__top">
                    <span className="orc-list-item__num">#{r.numero}</span>
                    <span className={statusChipClass(r.status)}>{labelStatusOrcamento(r.status)}</span>
                  </div>
                  <div className="orc-list-item__name">{r.clienteNome}</div>
                  {r.bikeLabel && <div className="orc-list-item__sub">{r.bikeLabel}</div>}
                  <div className="orc-list-item__meta">{r.totalItens} itens · {formatBRL(Math.max(r.subtotal - Number(r.desconto || 0), 0))}</div>
                </button>
              ))}
          </div>
        </aside>

        <section className="orc-detail st-panel">
          {loadingDetalhe ? <p className="orc-muted">Carregando…</p>
            : !detalhe ? <p className="st-panel__hint">Selecione um orçamento ou crie um novo.</p>
            : (
              <>
                <div className="orc-detail__head">
                  <div>
                    <h2 className="orc-detail__title">Orçamento #{detalhe.numero}
                      <span className={statusChipClass(detalhe.status)}>{labelStatusOrcamento(detalhe.status)}</span>
                    </h2>
                    <p className="orc-detail__sub">Atualizado {formatShortDate(detalhe.updated_at)}</p>
                  </div>
                  {podeExcluir(detalhe.status) && (
                    <button type="button" className="orc-btn-excluir st-ghost-btn" disabled={busy === 'del'}
                      onClick={() => void handleExcluir()}>
                      {busy === 'del' ? 'Excluindo…' : 'Excluir orçamento'}
                    </button>
                  )}
                </div>

                <div className="orc-form-grid">
                  <label className="orc-field">
                    <span>Cliente {semCliente ? '(opcional)' : ''}</span>
                    <select
                      className="orc-input"
                      value={form.clienteId}
                      disabled={!podeAlterarCliente || busy === 'vincular'}
                      onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value, bicicletaId: '' }))}
                    >
                      <option value="">{ORCAMENTO_CLIENTE_BALCAO}</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    {semCliente && (
                      <span className="orc-field__hint">
                        Orçamento rápido sem cadastro. Você pode vincular um cliente depois.
                      </span>
                    )}
                  </label>
                  {podeVincularCliente && form.clienteId && !editavel && (
                    <div className="orc-field orc-field--action">
                      <button
                        type="button"
                        className="st-primary-btn st-primary-btn--soft"
                        disabled={busy === 'vincular'}
                        onClick={() => void handleVincularCliente()}
                      >
                        {busy === 'vincular' ? 'Vinculando…' : 'Vincular cliente'}
                      </button>
                    </div>
                  )}
                  <label className="orc-field"><span>Bicicleta</span>
                    <select
                      className="orc-input"
                      value={form.bicicletaId}
                      disabled={!editavel || !form.clienteId}
                      onChange={(e) => setForm((f) => ({ ...f, bicicletaId: e.target.value }))}
                    >
                      <option value="">Nenhuma</option>
                      {bikesCliente.map((b) => <option key={b.id} value={b.id}>{b.marca} {b.modelo}</option>)}
                    </select>
                  </label>
                  <label className="orc-field orc-field--wide"><span>Resumo</span>
                    <textarea
                      className="orc-input orc-input--area"
                      rows={2}
                      value={form.resumo}
                      disabled={!editavel}
                      onChange={(e) => setForm((f) => ({ ...f, resumo: e.target.value }))}
                    />
                  </label>
                  <label className="orc-field orc-field--wide"><span>Observações</span>
                    <textarea
                      className="orc-input orc-input--area"
                      rows={2}
                      value={form.observacoes}
                      disabled={!editavel}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                    />
                  </label>
                  <label className="orc-field"><span>Válido até</span>
                    <input
                      type="date"
                      className="orc-input"
                      value={form.validoAte}
                      disabled={!editavel}
                      onChange={(e) => setForm((f) => ({ ...f, validoAte: e.target.value }))}
                    />
                  </label>
                  <label className="orc-field"><span>Desconto (R$)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="orc-input"
                      value={form.desconto}
                      disabled={!editavel}
                      onChange={(e) => setForm((f) => ({ ...f, desconto: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="orc-items">
                  <h3 className="orc-items__title">Itens</h3>
                  {editavel && (
                    <div className="orc-add-row">
                      <div className="orc-add-block">
                        <p className="orc-add-label">Peça (estoque)</p>
                        <EstoqueItemPicker itens={itensEstoque} value={pecaItemId} onChange={setPecaItemId} disabled={busy === 'peca'} />
                        <div className="orc-add-inline">
                          <input className="orc-input orc-input--qtd" value={pecaQtd} onChange={(e) => setPecaQtd(filtrarInputQuantidadeInteira(e.target.value))} />
                          <button type="button" className="st-ghost-btn" disabled={!pecaItemId || busy === 'peca'} onClick={() => void handleAddPeca()}>Adicionar peça</button>
                        </div>
                      </div>
                      <div className="orc-add-block">
                        <p className="orc-add-label">Serviço (catálogo)</p>
                        <ServicoCatalogoPicker
                          servicos={catalogoServicos}
                          value={servicoCatalogoId}
                          onChange={setServicoCatalogoId}
                          formatPreco={formatBRL}
                          disabled={busy === 'svc'}
                        />
                        <button type="button" className="st-ghost-btn" disabled={!servicoCatalogoId || busy === 'svc'} onClick={() => void handleAddServico()}>Adicionar serviço</button>
                      </div>
                    </div>
                  )}
                  {!detalhe.itens.length ? <p className="orc-muted">Nenhum item.</p> : (
                    <div className="orc-table-wrap">
                      <table className="orc-table">
                        <thead><tr><th>Descrição</th><th className="orc-table__num">Qtd</th><th className="orc-table__num">Preço</th><th className="orc-table__num">Subtotal</th>{editavel && <th />}</tr></thead>
                        <tbody>{detalhe.itens.map(renderItemRow)}</tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="orc-totals">
                  <div className="orc-totals__row"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
                  <div className="orc-totals__row"><span>Desconto</span><span>− {formatBRL(Number(form.desconto) || 0)}</span></div>
                  <div className="orc-totals__row orc-totals__row--total"><span>Total</span><span>{formatBRL(total)}</span></div>
                </div>

                <div className="orc-actions">
                  {detalhe.status === 'rascunho' && (
                    <>
                      <button type="button" className="st-primary-btn" disabled={busy === 'save' || !editavel} onClick={() => void handleSalvar()}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</button>
                      <button type="button" className="st-primary-btn st-primary-btn--soft" disabled={busy === 'send' || !detalhe.itens.length} onClick={() => void handleEnviar()}>{busy === 'send' ? 'Enviando…' : 'Enviar ao cliente'}</button>
                      </>
                  )}
                  {(detalhe.status === 'enviado' || detalhe.status === 'aprovado') && (
                    <>
                      {editavel && <button type="button" className="st-ghost-btn" disabled={busy === 'save'} onClick={() => void handleSalvar()}>Salvar alterações</button>}
                      <button type="button" className="st-ghost-btn" onClick={() => imprimirOrcamento(detalhe, companyName)}>Imprimir</button>
                      <button type="button" className="st-ghost-btn" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(montarTextoWhatsappOrcamento(detalhe, companyName))}`, '_blank', 'noopener')}>WhatsApp</button>
                      <button type="button" className="st-ghost-btn" onClick={() => void navigator.clipboard.writeText(detalhe.token_aprovacao ? urlAprovacaoOrcamento(detalhe.token_aprovacao) : '').then(() => setMsgOk('Link copiado.')).catch(() => setErro('Não foi possível copiar.'))}>Copiar link aprovação</button>
                      <button type="button" className="st-ghost-btn" onClick={() => void marcarOrcamentoAprovado(detalhe.id).then(() => { void carregarLista(); void recarregarDetalhe(detalhe.id) })}>Marcar aprovado</button>
                      <button type="button" className="st-ghost-btn" onClick={() => void marcarOrcamentoRecusado(detalhe.id).then(() => { void carregarLista(); void recarregarDetalhe(detalhe.id) })}>Marcar recusado</button>
                    </>
                  )}
                  {podeConverter && (
                    <div className="orc-actions__convert">
                      {temPeca && !temServico && <button type="button" className="st-primary-btn" disabled={!!busy} onClick={() => void converterOrcamentoEmPdvPrefill(companyId, detalhe.id).then(onNavigatePdv).catch((e) => setErro(e instanceof Error ? e.message : 'Erro PDV.'))}>Converter em venda (PDV)</button>}
                      {temServico && !temPeca && activeStoreId && detalhe.cliente_id && <button type="button" className="st-primary-btn" disabled={!!busy} onClick={() => void converterOrcamentoEmOs({ companyId, storeId: activeStoreId, orcamentoId: detalhe.id }).then(({ osId }) => onNavigateOficina(osId)).catch((e) => setErro(e instanceof Error ? e.message : 'Erro OS.'))}>Converter em OS</button>}
                      {temServico && !temPeca && activeStoreId && !detalhe.cliente_id && (
                        <p className="orc-muted">Vincule um cliente para converter em OS.</p>
                      )}
                      {temPeca && temServico && (
                        <>
                          <button type="button" className="st-ghost-btn" disabled={!!busy} onClick={() => void converterOrcamentoEmPdvPrefill(companyId, detalhe.id).then(onNavigatePdv)}>Converter em venda (PDV)</button>
                          {activeStoreId && detalhe.cliente_id && <button type="button" className="st-ghost-btn" disabled={!!busy} onClick={() => void converterOrcamentoEmOs({ companyId, storeId: activeStoreId, orcamentoId: detalhe.id }).then(({ osId }) => onNavigateOficina(osId))}>Converter em OS</button>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
        </section>
      </div>

      {modalNovoOpen && (
        <div className="st-modal-overlay" role="presentation" onClick={() => setModalNovoOpen(false)}>
          <div className="st-modal" role="dialog" aria-modal="true" aria-labelledby="orc-novo-title" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal__head">
              <h2 id="orc-novo-title" className="st-modal__title">Novo orçamento</h2>
              <button type="button" className="st-modal__close" aria-label="Fechar" onClick={() => setModalNovoOpen(false)}>×</button>
            </div>
            <form
              className="st-form"
              onSubmit={(e) => {
                e.preventDefault()
                void handleCriar()
              }}
            >
              <label className="st-field">
                <span>Cliente (opcional)</span>
                <select className="st-input" value={novoClienteId} onChange={(e) => setNovoClienteId(e.target.value)}>
                  <option value="">{ORCAMENTO_CLIENTE_BALCAO}</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <span className="orc-field__hint">Deixe em balcão para orçamento rápido e vincule o cliente depois.</span>
              </label>
              <div className="st-form-actions">
                <button type="button" className="st-ghost-btn" onClick={() => setModalNovoOpen(false)} disabled={criando}>Cancelar</button>
                <button type="submit" className="st-primary-btn" disabled={criando}>
                  {criando ? 'Criando…' : 'Criar orçamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
