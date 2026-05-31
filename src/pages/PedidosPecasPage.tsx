import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClientePicker } from '../components/ClientePicker'
import { EstoqueItemPicker } from '../components/EstoqueItemPicker'
import { listarClientes, type ClienteComRelacoes } from '../services/clientes.service'
import { listarItensEstoque, type EstoqueItemComLocal } from '../services/estoque.service'
import {
  cancelarPedidoPeca,
  criarPedidoPeca,
  desfazerPedidoChegou,
  labelStatusPedidoPeca,
  listarPedidosPecas,
  marcarClienteAvisado,
  marcarPedidoChegou,
  marcarPedidoEntregue,
  nomeClientePedido,
  pedidoTemCliente,
  telefoneClientePedido,
  type FiltroPedidosPecas,
  type PedidoPecaComRelacoes,
} from '../services/pedidos-pecas.service'

type PedidosPecasPageProps = {
  companyId: string
  activeStoreId: string
  onBadgeChange?: () => void
}

type ModoItem = 'livre' | 'estoque'
type ModoCliente = 'nenhum' | 'cadastrado' | 'avulso'

const FILTROS: { key: FiltroPedidosPecas; label: string }[] = [
  { key: 'ativos', label: 'Em aberto' },
  { key: 'pendente', label: 'Aguardando' },
  { key: 'chegou', label: 'Chegaram' },
  { key: 'com_cliente', label: 'Com cliente' },
  { key: 'todos', label: 'Todos' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function telHref(tel: string) {
  const digits = tel.replace(/\D/g, '')
  return digits ? `tel:+${digits.startsWith('55') ? digits : `55${digits}`}` : undefined
}

export function PedidosPecasPage({ companyId, activeStoreId, onBadgeChange }: PedidosPecasPageProps) {
  const semLoja = !activeStoreId

  const [pedidos, setPedidos] = useState<PedidoPecaComRelacoes[]>([])
  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [itensEstoque, setItensEstoque] = useState<EstoqueItemComLocal[]>([])
  const [filtro, setFiltro] = useState<FiltroPedidosPecas>('ativos')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [processandoId, setProcessandoId] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [modoItem, setModoItem] = useState<ModoItem>('livre')
  const [descricaoLivre, setDescricaoLivre] = useState('')
  const [estoqueItemId, setEstoqueItemId] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [modoCliente, setModoCliente] = useState<ModoCliente>('nenhum')
  const [clienteId, setClienteId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [sinal, setSinal] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const recarregar = useCallback(async () => {
    if (!activeStoreId) {
      setPedidos([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const [lista, cls, its] = await Promise.all([
        listarPedidosPecas(companyId, activeStoreId, filtro),
        listarClientes(companyId, activeStoreId),
        listarItensEstoque(companyId, activeStoreId),
      ])
      setPedidos(lista)
      setClientes(cls)
      setItensEstoque(its)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar pedidos.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId, filtro])

  useEffect(() => {
    setSucesso(null)
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    if (!activeStoreId) return
    setPedidos([])
    setModalAberto(false)
  }, [activeStoreId])

  const resumo = useMemo(() => {
    const pendentes = pedidos.filter((p) => p.status === 'pendente').length
    const chegaram = pedidos.filter((p) => p.status === 'chegou').length
    const avisar = pedidos.filter(
      (p) => p.status === 'chegou' && pedidoTemCliente(p) && !p.cliente_avisado,
    ).length
    return { pendentes, chegaram, avisar }
  }, [pedidos])

  const pedidosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return pedidos
    return pedidos.filter((p) => {
      if (p.descricao.toLowerCase().includes(q)) return true
      if (p.estoque_item?.sku?.toLowerCase().includes(q)) return true
      const nome = nomeClientePedido(p)
      if (nome?.toLowerCase().includes(q)) return true
      const tel = telefoneClientePedido(p)
      if (tel?.includes(q)) return true
      return false
    })
  }, [pedidos, busca])

  function limparFormulario() {
    setModoItem('livre')
    setDescricaoLivre('')
    setEstoqueItemId('')
    setQuantidade('1')
    setModoCliente('nenhum')
    setClienteId('')
    setClienteNome('')
    setClienteTelefone('')
    setSinal('')
    setObservacoes('')
  }

  function abrirModal() {
    if (semLoja) return
    limparFormulario()
    setModalAberto(true)
    setErro(null)
  }

  function fecharModal() {
    if (salvando) return
    setModalAberto(false)
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    if (semLoja) return

    let descricao = descricaoLivre.trim()
    let itemId: string | null = null

    if (modoItem === 'estoque') {
      if (!estoqueItemId) {
        setErro('Selecione um item do estoque.')
        return
      }
      const item = itensEstoque.find((i) => i.id === estoqueItemId)
      if (!item) {
        setErro('Item de estoque não encontrado.')
        return
      }
      descricao = item.nome
      itemId = item.id
    }

    if (!descricao) {
      setErro('Informe a descrição do produto.')
      return
    }

    const qtd = parseInt(quantidade, 10)
    if (!Number.isFinite(qtd) || qtd < 1) {
      setErro('Quantidade inválida.')
      return
    }

    let sinalVal: number | null = null
    if (sinal.trim()) {
      const parsed = parseFloat(sinal.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed < 0) {
        setErro('Valor do sinal inválido.')
        return
      }
      sinalVal = parsed
    }

    setSalvando(true)
    setErro(null)
    try {
      await criarPedidoPeca({
        company_id: companyId,
        store_id: activeStoreId,
        descricao,
        estoque_item_id: itemId,
        quantidade: qtd,
        cliente_id: modoCliente === 'cadastrado' && clienteId ? clienteId : null,
        cliente_nome: modoCliente === 'avulso' ? clienteNome.trim() || null : null,
        cliente_telefone: modoCliente !== 'nenhum' ? clienteTelefone.trim() || null : null,
        sinal_valor: sinalVal,
        observacoes: observacoes.trim() || null,
      })
      setModalAberto(false)
      limparFormulario()
      setSucesso('Pedido adicionado à lista.')
      await recarregar()
      onBadgeChange?.()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar pedido.')
    } finally {
      setSalvando(false)
    }
  }

  async function acao(id: string, fn: () => Promise<unknown>, msg?: string) {
    if (semLoja) return
    setProcessandoId(id)
    setErro(null)
    try {
      await fn()
      if (msg) setSucesso(msg)
      await recarregar()
      onBadgeChange?.()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na operação.')
    } finally {
      setProcessandoId(null)
    }
  }

  return (
    <div className="cp-page cp-page--pedidos">
      <header className="ped-topbar">
        <div>
          <h1 className="ped-topbar__title">Pedidos de peças</h1>
          <p className="cp-dash-head__tag">
            Lista de reposição e pedidos de clientes no balcão. Marque quando chegar e avise quem solicitou.
          </p>
        </div>
        <button
          type="button"
          className="cp-btn cp-btn--primary"
          onClick={abrirModal}
          disabled={semLoja}
        >
          + Novo pedido
        </button>
      </header>

      {semLoja && (
        <p className="ped-warn cp-panel__hint" role="status">
          Selecione uma loja no topo da tela.
        </p>
      )}

      {erro && !modalAberto && <p className="st-form-error">{erro}</p>}
      {sucesso && <p className="ped-msg-ok" role="status">{sucesso}</p>}

      <div className="ped-resumo">
        <div className="ped-resumo__card">
          <span className="ped-resumo__num">{resumo.pendentes}</span>
          <span className="ped-resumo__label">Aguardando chegada</span>
        </div>
        <div className="ped-resumo__card ped-resumo__card--accent">
          <span className="ped-resumo__num">{resumo.chegaram}</span>
          <span className="ped-resumo__label">Chegaram na loja</span>
        </div>
        <div className="ped-resumo__card ped-resumo__card--warn">
          <span className="ped-resumo__num">{resumo.avisar}</span>
          <span className="ped-resumo__label">Clientes a avisar</span>
        </div>
      </div>

      <div className="ped-toolbar">
        <input
          type="search"
          className="ped-search"
          placeholder="Buscar produto, cliente ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          disabled={semLoja}
        />
        <div className="ped-chips" role="tablist" aria-label="Filtrar pedidos">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filtro === f.key}
              className={filtro === f.key ? 'ped-chip ped-chip--on' : 'ped-chip'}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="cp-panel__hint" role="status">Carregando pedidos…</p>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="cp-panel ped-empty">
          <p className="cp-panel__hint">
            {semLoja
              ? 'Nenhum pedido — selecione uma loja.'
              : busca.trim()
                ? 'Nenhum pedido encontrado para esta busca.'
                : 'Nenhum pedido na lista. Adicione peças que precisa encomendar ou que clientes solicitaram.'}
          </p>
          {!semLoja && !busca.trim() && (
            <button type="button" className="cp-btn cp-btn--primary" onClick={abrirModal}>
              Adicionar primeiro pedido
            </button>
          )}
        </div>
      ) : (
        <ul className="ped-list" aria-label="Lista de pedidos">
          {pedidosFiltrados.map((p) => {
            const temCliente = pedidoTemCliente(p)
            const nomeCli = nomeClientePedido(p)
            const telCli = telefoneClientePedido(p)
            const busy = processandoId === p.id
            const concluido = p.status === 'entregue' || p.status === 'cancelado'

            return (
              <li
                key={p.id}
                className={[
                  'ped-item',
                  temCliente ? 'ped-item--cliente' : '',
                  p.status === 'chegou' ? 'ped-item--chegou' : '',
                  concluido ? 'ped-item--done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="ped-item__check">
                  {p.status === 'pendente' ? (
                    <button
                      type="button"
                      className="ped-check"
                      title="Marcar como chegou"
                      aria-label={`Marcar ${p.descricao} como chegou`}
                      disabled={busy || semLoja}
                      onClick={() =>
                        void acao(p.id, () => marcarPedidoChegou(companyId, activeStoreId, p.id), 'Item marcado como chegou.')
                      }
                    />
                  ) : p.status === 'chegou' ? (
                    <button
                      type="button"
                      className="ped-check ped-check--on"
                      title="Desfazer chegada"
                      aria-label={`Desfazer chegada de ${p.descricao}`}
                      disabled={busy || semLoja}
                      onClick={() =>
                        void acao(p.id, () => desfazerPedidoChegou(companyId, activeStoreId, p.id))
                      }
                    />
                  ) : (
                    <span
                      className={
                        p.status === 'entregue'
                          ? 'ped-check ped-check--done'
                          : 'ped-check ped-check--cancel'
                      }
                      aria-hidden
                    />
                  )}
                </div>

                <div className="ped-item__body">
                  <div className="ped-item__head">
                    <strong className="ped-item__nome">
                      {p.quantidade > 1 ? `${p.quantidade}× ` : ''}
                      {p.descricao}
                    </strong>
                    <span className={`ped-status ped-status--${p.status}`}>
                      {labelStatusPedidoPeca(p.status)}
                    </span>
                  </div>

                  <div className="ped-item__meta">
                    {p.estoque_item && (
                      <span className="ped-tag ped-tag--estoque">SKU {p.estoque_item.sku}</span>
                    )}
                    {!p.estoque_item_id && (
                      <span className="ped-tag ped-tag--livre">Texto livre</span>
                    )}
                    <span className="ped-tag">{formatShortDate(p.created_at)}</span>
                    {p.sinal_valor != null && Number(p.sinal_valor) > 0 && (
                      <span className="ped-tag ped-tag--sinal">Sinal {formatBRL(Number(p.sinal_valor))}</span>
                    )}
                  </div>

                  {temCliente && (
                    <div className="ped-item__cliente">
                      <span className="ped-item__cliente-icon" aria-hidden>
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                          <circle cx={12} cy={8} r={3.5} stroke="currentColor" strokeWidth={1.75} />
                          <path
                            d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
                            stroke="currentColor"
                            strokeWidth={1.75}
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <div className="ped-item__cliente-info">
                        <span className="ped-item__cliente-nome">{nomeCli ?? 'Cliente'}</span>
                        {telCli && (
                          <a className="ped-item__cliente-tel" href={telHref(telCli)}>
                            {telCli}
                          </a>
                        )}
                      </div>
                      {p.status === 'chegou' && (
                        <label className="ped-avisado">
                          <input
                            type="checkbox"
                            checked={p.cliente_avisado}
                            disabled={busy || semLoja}
                            onChange={(e) =>
                              void acao(
                                p.id,
                                () =>
                                  marcarClienteAvisado(
                                    companyId,
                                    activeStoreId,
                                    p.id,
                                    e.target.checked,
                                  ),
                              )
                            }
                          />
                          Cliente avisado
                        </label>
                      )}
                    </div>
                  )}

                  {p.observacoes && (
                    <p className="ped-item__obs">{p.observacoes}</p>
                  )}
                </div>

                {!concluido && (
                  <div className="ped-item__actions">
                    {p.status === 'chegou' && (
                      <button
                        type="button"
                        className="cp-btn cp-btn--primary cp-btn--sm"
                        disabled={busy || semLoja}
                        onClick={() =>
                          void acao(
                            p.id,
                            () => marcarPedidoEntregue(companyId, activeStoreId, p.id),
                            'Pedido entregue ao cliente.',
                          )
                        }
                      >
                        Entregue
                      </button>
                    )}
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost cp-btn--sm"
                      disabled={busy || semLoja}
                      onClick={() => {
                        if (!window.confirm('Cancelar este pedido?')) return
                        void acao(p.id, () => cancelarPedidoPeca(companyId, activeStoreId, p.id), 'Pedido cancelado.')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {modalAberto && (
        <div
          className="st-modal-overlay st-modal-overlay--scroll"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ped-modal-title"
        >
          <div className="st-modal st-modal--lg st-modal--scroll">
            <div className="st-modal__head">
              <h2 id="ped-modal-title" className="st-modal__title">
                Novo pedido de peça
              </h2>
              <button type="button" className="st-modal__close" onClick={fecharModal} aria-label="Fechar">
                ×
              </button>
            </div>

            <form className="st-form st-form--modal-scroll" onSubmit={handleCriar} noValidate>
              <div className="st-modal__body ped-modal__body">
              <fieldset className="ped-form-section">
                <legend className="ped-form-section__title">Produto</legend>
                <div className="ped-modo-toggle">
                  <button
                    type="button"
                    className={modoItem === 'livre' ? 'ped-modo-btn ped-modo-btn--on' : 'ped-modo-btn'}
                    onClick={() => setModoItem('livre')}
                  >
                    Texto livre
                  </button>
                  <button
                    type="button"
                    className={modoItem === 'estoque' ? 'ped-modo-btn ped-modo-btn--on' : 'ped-modo-btn'}
                    onClick={() => setModoItem('estoque')}
                  >
                    Do estoque
                  </button>
                </div>

                {modoItem === 'livre' ? (
                  <label className="st-field st-field--full">
                    <span>Descrição *</span>
                    <input
                      className="st-input"
                      value={descricaoLivre}
                      onChange={(e) => setDescricaoLivre(e.target.value)}
                      placeholder="Ex.: Câmara 29×1.95 Schwalbe, parafuso do guidão…"
                      required
                      autoFocus
                    />
                  </label>
                ) : (
                  <label className="st-field st-field--full">
                    <span>Item do estoque *</span>
                    <EstoqueItemPicker
                      itens={itensEstoque}
                      value={estoqueItemId}
                      onChange={setEstoqueItemId}
                      placeholder="Buscar produto cadastrado…"
                    />
                    <span className="st-field__hint">
                      Use quando o produto já existe no cadastro, mesmo sem saldo.
                    </span>
                  </label>
                )}

                <label className="st-field">
                  <span>Quantidade</span>
                  <input
                    className="st-input"
                    type="number"
                    min={1}
                    step={1}
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                </label>
              </fieldset>

              <fieldset className="ped-form-section">
                <legend className="ped-form-section__title">Cliente (opcional)</legend>
                <div className="ped-modo-toggle">
                  <button
                    type="button"
                    className={modoCliente === 'nenhum' ? 'ped-modo-btn ped-modo-btn--on' : 'ped-modo-btn'}
                    onClick={() => setModoCliente('nenhum')}
                  >
                    Reposição
                  </button>
                  <button
                    type="button"
                    className={modoCliente === 'cadastrado' ? 'ped-modo-btn ped-modo-btn--on' : 'ped-modo-btn'}
                    onClick={() => setModoCliente('cadastrado')}
                  >
                    Cliente cadastrado
                  </button>
                  <button
                    type="button"
                    className={modoCliente === 'avulso' ? 'ped-modo-btn ped-modo-btn--on' : 'ped-modo-btn'}
                    onClick={() => setModoCliente('avulso')}
                  >
                    Cliente avulso
                  </button>
                </div>

                {modoCliente === 'cadastrado' && (
                  <div className="ped-cliente-fields">
                    <label className="st-field st-field--full">
                      <span>Cliente</span>
                      <ClientePicker
                        clientes={clientes}
                        value={clienteId}
                        onChange={(id) => {
                          setClienteId(id)
                          const c = clientes.find((x) => x.id === id)
                          if (c?.fone) setClienteTelefone(c.fone)
                        }}
                        allowBalcao={false}
                        placeholder="Buscar cliente cadastrado…"
                      />
                    </label>
                    <div className="st-form-grid ped-cliente-fields__row">
                      <label className="st-field">
                        <span>Telefone alternativo</span>
                        <input
                          className="st-input"
                          type="tel"
                          value={clienteTelefone}
                          onChange={(e) => setClienteTelefone(e.target.value)}
                          placeholder="Opcional"
                        />
                      </label>
                      <label className="st-field">
                        <span>Sinal (opcional)</span>
                        <input
                          className="st-input"
                          inputMode="decimal"
                          value={sinal}
                          onChange={(e) => setSinal(e.target.value)}
                          placeholder="0,00"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {modoCliente === 'avulso' && (
                  <div className="ped-cliente-fields">
                    <div className="st-form-grid">
                      <label className="st-field">
                        <span>Nome</span>
                        <input
                          className="st-input"
                          value={clienteNome}
                          onChange={(e) => setClienteNome(e.target.value)}
                          placeholder="Nome do cliente"
                        />
                      </label>
                      <label className="st-field">
                        <span>Telefone / WhatsApp</span>
                        <input
                          className="st-input"
                          type="tel"
                          value={clienteTelefone}
                          onChange={(e) => setClienteTelefone(e.target.value)}
                          placeholder="(00) 00000-0000"
                        />
                      </label>
                    </div>
                    <label className="st-field">
                      <span>Sinal (opcional)</span>
                      <input
                        className="st-input"
                        inputMode="decimal"
                        value={sinal}
                        onChange={(e) => setSinal(e.target.value)}
                        placeholder="0,00"
                      />
                    </label>
                  </div>
                )}
              </fieldset>

              <label className="st-field st-field--full">
                <span>Observações</span>
                <textarea
                  className="st-input st-textarea ped-modal__obs"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Cor, medida, fornecedor preferido…"
                />
              </label>
              </div>

              {erro && modalAberto && <p className="st-form-error st-form-error--modal-foot">{erro}</p>}

              <div className="st-form-actions st-form-actions--modal-foot">
                <button type="button" className="cp-btn cp-btn--ghost" onClick={fecharModal} disabled={salvando}>
                  Cancelar
                </button>
                <button type="submit" className="cp-btn cp-btn--primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Adicionar à lista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
