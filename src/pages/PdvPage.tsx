import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarClientes, type ClienteComRelacoes } from '../services/clientes.service'
import {
  formatMoneyInput,
  maskMoneyInput,
  parseMoneyInput,
} from '../lib/money'
import {
  MSG_QUANTIDADE_INTEIRA,
  filtrarInputQuantidadeInteira,
  parseQuantidadeInteira,
} from '../lib/quantidade'
import { EstoqueItemThumb } from '../components/EstoqueItemThumb'
import {
  finalizarConversaoPdv,
  lerPrefillPdv,
  limparPrefillPdv,
} from '../services/orcamento.service'
import { listarItensEstoque, type EstoqueItemComLocal } from '../services/estoque.service'
import { dataExibicaoVenda } from '../services/lancamentos.service'
import {
  finalizarVendaPdv,
  labelPagamento,
  listarVendasRecentes,
  obterResumoVendasHoje,
  type FormaPagamento,
  type VendaLista,
} from '../services/pdv.service'

type PdvPageProps = {
  companyId: string
  activeStoreId: string
}

type CarrinhoLinha = {
  key: string
  estoqueItemId: string | null
  descricao: string
  quantidade: number
  precoUnitario: number
  saldoMax: number | null
  sku: string | null
  imagemUrl: string | null
}

type PagamentoLinha = {
  id: string
  forma: FormaPagamento
  valorStr: string
}

const FORMAS_PAGAMENTO: FormaPagamento[] = ['pix', 'dinheiro', 'credito', 'debito']

function novaLinhaPagamento(forma: FormaPagamento = 'pix'): PagamentoLinha {
  return { id: crypto.randomUUID(), forma, valorStr: '' }
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatShortTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function IconHistorico() {
  return (
    <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PdvPage({ companyId, activeStoreId }: PdvPageProps) {
  const semLoja = !activeStoreId

  const [itensEstoque, setItensEstoque] = useState<EstoqueItemComLocal[]>([])
  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [vendasRecentes, setVendasRecentes] = useState<VendaLista[]>([])
  const [resumoHoje, setResumoHoje] = useState<{ quantidade: number; total: number } | null>(null)

  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<CarrinhoLinha[]>([])
  const [clienteId, setClienteId] = useState('')
  const [bicicletaId, setBicicletaId] = useState('')
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>(() => [novaLinhaPagamento('pix')])
  const [descontoStr, setDescontoStr] = useState('')

  const [loading, setLoading] = useState(true)
  const [finalizando, setFinalizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<{ numero: number; total: number } | null>(null)
  const [recentesAberto, setRecentesAberto] = useState(false)
  const [checkoutAberto, setCheckoutAberto] = useState(false)

  const recarregar = useCallback(async () => {
    if (!activeStoreId) {
      setItensEstoque([])
      setClientes([])
      setVendasRecentes([])
      setResumoHoje(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const [itens, cls, vendas, resumo] = await Promise.all([
        listarItensEstoque(companyId, activeStoreId),
        listarClientes(companyId, activeStoreId),
        listarVendasRecentes(companyId, activeStoreId),
        obterResumoVendasHoje(companyId, activeStoreId),
      ])
      setItensEstoque(itens)
      setClientes(cls)
      setVendasRecentes(vendas)
      setResumoHoje(resumo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar PDV.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId])

  useEffect(() => {
    setCarrinho([])
    setClienteId('')
    setBicicletaId('')
    setBusca('')
    setSucesso(null)
    setRecentesAberto(false)
    setCheckoutAberto(false)
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    if (loading) return
    const prefill = lerPrefillPdv()
    if (!prefill?.itens.length) return
    setClienteId(prefill.clienteId)
    setBicicletaId(prefill.bicicletaId || '')
    setDescontoStr(
      prefill.desconto > 0 ? String(prefill.desconto).replace('.', ',') : '',
    )
    setCarrinho(
      prefill.itens.map((item) => {
        const estoque = itensEstoque.find((e) => e.id === item.estoqueItemId)
        return {
          key: item.estoqueItemId,
          estoqueItemId: item.estoqueItemId,
          descricao: item.descricao,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          saldoMax: estoque ? Number(estoque.saldo_atual) : null,
          sku: estoque?.sku ?? null,
          imagemUrl: item.imagemUrl ?? estoque?.imagem_url ?? null,
        }
      }),
    )
    setSucesso(null)
    setErro(null)
  }, [loading, itensEstoque])

  useEffect(() => {
    if (!recentesAberto && !checkoutAberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || finalizando) return
      if (checkoutAberto) setCheckoutAberto(false)
      else if (recentesAberto) setRecentesAberto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recentesAberto, checkoutAberto, finalizando])

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  )

  const bikesCliente = clienteSel?.bicicletas ?? []

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return itensEstoque.slice(0, 24)
    return itensEstoque
      .filter(
        (i) =>
          i.nome.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.sku_fornecedor?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 32)
  }, [itensEstoque, busca])

  const subtotal = useMemo(
    () => carrinho.reduce((acc, l) => acc + l.quantidade * l.precoUnitario, 0),
    [carrinho],
  )

  const qtdItensCarrinho = useMemo(
    () => carrinho.reduce((acc, l) => acc + l.quantidade, 0),
    [carrinho],
  )

  const desconto = parseMoneyInput(descontoStr) ?? 0
  const total = Math.max(subtotal - desconto, 0)

  const somaPagamentos = useMemo(
    () =>
      pagamentos.reduce((acc, p) => {
        const v = parseMoneyInput(p.valorStr)
        return acc + (v ?? 0)
      }, 0),
    [pagamentos],
  )

  const restantePagamento = Math.round((total - somaPagamentos) * 100) / 100
  const pagamentoOk = total > 0 && Math.abs(restantePagamento) < 0.01

  function abrirCheckout() {
    if (semLoja) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    if (carrinho.length === 0) {
      setErro('Adicione produtos ao carrinho.')
      return
    }
    setErro(null)
    setPagamentos([novaLinhaPagamento('pix')])
    setCheckoutAberto(true)
  }

  function atualizarPagamento(id: string, patch: Partial<PagamentoLinha>) {
    setPagamentos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function adicionarFormaPagamento() {
    const usadas = new Set(pagamentos.map((p) => p.forma))
    const proxima = FORMAS_PAGAMENTO.find((f) => !usadas.has(f)) ?? 'pix'
    setPagamentos((prev) => [...prev, novaLinhaPagamento(proxima)])
  }

  function removerFormaPagamento(id: string) {
    setPagamentos((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== id)))
  }

  function preencherRestantePagamento(id: string) {
    const linha = pagamentos.find((p) => p.id === id)
    if (!linha) return
    const outros = pagamentos
      .filter((p) => p.id !== id)
      .reduce((acc, p) => acc + (parseMoneyInput(p.valorStr) ?? 0), 0)
    const falta = Math.max(total - outros, 0)
    atualizarPagamento(id, { valorStr: falta > 0 ? formatMoneyInput(falta) : '' })
  }

  function adicionarProduto(item: EstoqueItemComLocal) {
    setSucesso(null)
    const existente = carrinho.find((l) => l.estoqueItemId === item.id)
    if (existente) {
      const novaQtd = existente.quantidade + 1
      if (novaQtd > Number(item.saldo_atual)) {
        setErro(`Saldo insuficiente para "${item.nome}".`)
        return
      }
      setCarrinho((prev) =>
        prev.map((l) =>
          l.key === existente.key ? { ...l, quantidade: novaQtd } : l,
        ),
      )
      return
    }
    if (Number(item.saldo_atual) <= 0) {
      setErro(`"${item.nome}" está sem saldo.`)
      return
    }
    setCarrinho((prev) => [
      ...prev,
      {
        key: item.id,
        estoqueItemId: item.id,
        descricao: item.nome,
        quantidade: 1,
        precoUnitario: Number(item.preco_varejo) || Number(item.custo_medio) || 0,
        saldoMax: Number(item.saldo_atual),
        sku: item.sku,
        imagemUrl: item.imagem_url,
      },
    ])
    setErro(null)
  }

  function atualizarLinha(key: string, patch: Partial<CarrinhoLinha>) {
    setCarrinho((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (
          patch.quantidade != null &&
          !Number.isFinite(parseQuantidadeInteira(String(patch.quantidade)))
        ) {
          setErro(MSG_QUANTIDADE_INTEIRA)
          return l
        }
        if (l.saldoMax != null && next.quantidade > l.saldoMax) {
          setErro(`Máximo disponível: ${l.saldoMax}`)
          return l
        }
        if (next.quantidade <= 0) return l
        return next
      }),
    )
    setErro(null)
  }

  function removerLinha(key: string) {
    setCarrinho((prev) => prev.filter((l) => l.key !== key))
  }

  function limparCarrinho() {
    setCarrinho([])
    setDescontoStr('')
    setPagamentos([novaLinhaPagamento('pix')])
    setSucesso(null)
    setErro(null)
    setCheckoutAberto(false)
  }

  async function handleFinalizar() {
    if (semLoja) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    if (carrinho.length === 0) {
      setErro('Adicione produtos ao carrinho.')
      return
    }
    if (carrinho.some((l) => !Number.isInteger(l.quantidade) || l.quantidade <= 0)) {
      setErro(MSG_QUANTIDADE_INTEIRA)
      return
    }
    const linhasPag = pagamentos
      .map((p) => ({ forma: p.forma, valor: parseMoneyInput(p.valorStr) ?? 0 }))
      .filter((p) => p.valor > 0)
    if (linhasPag.length === 0) {
      setErro('Informe o valor em ao menos uma forma de pagamento.')
      return
    }
    if (!pagamentoOk) {
      setErro(
        restantePagamento > 0
          ? `Falta ${formatBRL(restantePagamento)} para fechar o total.`
          : `Pagamento excede o total em ${formatBRL(-restantePagamento)}.`,
      )
      return
    }
    setFinalizando(true)
    setErro(null)
    setSucesso(null)
    try {
      const formaPrincipal = linhasPag.length > 1 ? 'pix' : linhasPag[0].forma
      const resultado = await finalizarVendaPdv({
        companyId,
        storeId: activeStoreId,
        clienteId: clienteId || null,
        bicicletaId: bicicletaId || null,
        formaPagamento: formaPrincipal,
        pagamentos: linhasPag,
        desconto,
        observacao: '',
        itens: carrinho.map((l) => ({
          estoque_item_id: l.estoqueItemId,
          descricao: l.descricao,
          quantidade: l.quantidade,
          preco_unitario: l.precoUnitario,
        })),
      })
      const prefill = lerPrefillPdv()
      if (prefill?.orcamentoId) {
        await finalizarConversaoPdv(prefill.orcamentoId, resultado.vendaId)
      }
      setSucesso({ numero: resultado.numero, total: resultado.total })
      setCheckoutAberto(false)
      limparCarrinho()
      setClienteId('')
      setBicicletaId('')
      limparPrefillPdv()
      await recarregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao finalizar venda.')
    } finally {
      setFinalizando(false)
    }
  }

  return (
    <div className="cp-page cp-page--pdv pdv-page">
      <header className="pdv-head">
        <div className="pdv-head__main">
          <h1 className="pdv-head__title">PDV</h1>
          <p className="pdv-head__tag">
            Balcão rápido — estoque, cliente e bike na mesma venda.
          </p>
        </div>
        <div className="pdv-head__aside">
          <button
            type="button"
            className="pdv-recentes-trigger"
            onClick={() => setRecentesAberto(true)}
            disabled={semLoja}
            aria-label="Ver vendas recentes"
            title="Vendas recentes"
          >
            <IconHistorico />
            <span className="pdv-recentes-trigger__lbl">Recentes</span>
            {!semLoja && vendasRecentes.length > 0 && (
              <span className="pdv-recentes-trigger__badge" aria-hidden>
                {vendasRecentes.length}
              </span>
            )}
          </button>
          <ul className="pdv-kpi-grid" aria-label="Resumo do dia">
            <li className="pdv-kpi pdv-kpi--qty">
              <span className="pdv-kpi__label">Vendas hoje</span>
              <span className="pdv-kpi__value">
                {semLoja || resumoHoje === null ? '—' : String(resumoHoje.quantidade)}
              </span>
            </li>
            <li className="pdv-kpi pdv-kpi--total">
              <span className="pdv-kpi__label">Faturamento hoje</span>
              <span className="pdv-kpi__value pdv-kpi__value--currency">
                {semLoja || resumoHoje === null ? '—' : formatBRL(resumoHoje.total)}
              </span>
            </li>
          </ul>
        </div>
      </header>

      {semLoja && (
        <div className="pdv-alert pdv-alert--warn" role="status">
          Selecione uma loja no topo da tela para registrar vendas.
        </div>
      )}

      {erro && (
        <div className="pdv-alert pdv-alert--error" role="alert">
          {erro}
        </div>
      )}

      {sucesso && (
        <div className="pdv-alert pdv-alert--ok" role="status">
          Venda #{sucesso.numero} finalizada — {formatBRL(sucesso.total)}
        </div>
      )}

      <div className="pdv-layout">
        <section className="pdv-panel pdv-panel--catalog" aria-label="Produtos">
          <div className="pdv-panel__head">
            <h2 className="pdv-panel__title">Produtos</h2>
          </div>
          <div className="pdv-search-wrap">
            <input
              type="search"
              className="pdv-search"
              placeholder="Buscar nome, SKU ou código fornecedor…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              disabled={semLoja || loading}
              autoComplete="off"
            />
          </div>
          <ul className="pdv-prod-grid">
            {loading ? (
              <li className="pdv-prod-empty">Carregando estoque…</li>
            ) : produtosFiltrados.length === 0 ? (
              <li className="pdv-prod-empty">Nenhum produto encontrado.</li>
            ) : (
              produtosFiltrados.map((item) => {
                const semSaldo = Number(item.saldo_atual) <= 0
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="pdv-prod-card"
                      disabled={semLoja || semSaldo}
                      onClick={() => adicionarProduto(item)}
                    >
                      <EstoqueItemThumb
                        imagemUrl={item.imagem_url}
                        alt=""
                        variant="card"
                      />
                      <span className="pdv-prod-card__body">
                        <span className="pdv-prod-card__name">{item.nome}</span>
                        <span className="pdv-prod-card__meta">
                          SKU {item.sku} · {Number(item.saldo_atual)} {item.unidade}
                        </span>
                        <span className="pdv-prod-card__price">
                          {formatBRL(Number(item.preco_varejo) || Number(item.custo_medio) || 0)}
                        </span>
                      </span>
                      {semSaldo && <span className="pdv-prod-card__badge">Sem saldo</span>}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        <section className="pdv-panel pdv-panel--cart" aria-label="Carrinho">
          <div className="pdv-panel__head pdv-panel__head--row">
            <h2 className="pdv-panel__title">Carrinho</h2>
            {carrinho.length > 0 && (
              <button type="button" className="pdv-link-btn" onClick={limparCarrinho}>
                Limpar
              </button>
            )}
          </div>
          <ul className="pdv-cart-list">
            {carrinho.length === 0 ? (
              <li className="pdv-cart-empty">Toque em um produto para adicionar.</li>
            ) : (
              carrinho.map((linha) => (
                <li key={linha.key} className="pdv-cart-line">
                  <EstoqueItemThumb
                    imagemUrl={linha.imagemUrl}
                    alt={linha.descricao}
                    variant="cart"
                  />
                  <div className="pdv-cart-line__main">
                  <div className="pdv-cart-line__top">
                    <span className="pdv-cart-line__name">{linha.descricao}</span>
                    <button
                      type="button"
                      className="pdv-icon-btn"
                      aria-label="Remover item"
                      onClick={() => removerLinha(linha.key)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="pdv-cart-line__controls">
                    <label className="pdv-field pdv-field--inline">
                      <span className="pdv-field__lbl">Qtd</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        className="pdv-input pdv-input--sm"
                        value={linha.quantidade}
                        onChange={(e) => {
                          const qtdStr = filtrarInputQuantidadeInteira(e.target.value)
                          const qtd = parseQuantidadeInteira(qtdStr) || 0
                          atualizarLinha(linha.key, { quantidade: qtd })
                        }}
                      />
                    </label>
                    <label className="pdv-field pdv-field--inline">
                      <span className="pdv-field__lbl">Preço</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="pdv-input pdv-input--sm"
                        placeholder="0,00"
                        value={formatMoneyInput(linha.precoUnitario)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '')
                          if (!digits) {
                            atualizarLinha(linha.key, { precoUnitario: 0 })
                            return
                          }
                          const n = parseMoneyInput(e.target.value)
                          if (n != null) atualizarLinha(linha.key, { precoUnitario: n })
                        }}
                      />
                    </label>
                    <span className="pdv-cart-line__sub">
                      {formatBRL(linha.quantidade * linha.precoUnitario)}
                    </span>
                  </div>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="pdv-cart-bar">
            <div className="pdv-cart-bar__summary">
              <span className="pdv-cart-bar__qty">
                {carrinho.length === 0
                  ? 'Carrinho vazio'
                  : `${qtdItensCarrinho} ${qtdItensCarrinho === 1 ? 'item' : 'itens'}`}
              </span>
              <span className="pdv-cart-bar__total">{formatBRL(total)}</span>
            </div>
            <button
              type="button"
              className="pdv-finalize pdv-finalize--bar"
              disabled={semLoja || carrinho.length === 0}
              onClick={abrirCheckout}
            >
              Finalizar venda
            </button>
          </div>
        </section>

      </div>

      {checkoutAberto && (
        <div
          className="st-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !finalizando) setCheckoutAberto(false)
          }}
        >
          <div
            className="st-modal pdv-checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdv-checkout-title"
          >
            <div className="st-modal__head">
              <h2 id="pdv-checkout-title" className="st-modal__title">
                Finalizar venda
              </h2>
              <button
                type="button"
                className="st-modal__close"
                onClick={() => setCheckoutAberto(false)}
                disabled={finalizando}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="pdv-checkout-modal__body">
              <p className="pdv-checkout-modal__hint">
                {qtdItensCarrinho} {qtdItensCarrinho === 1 ? 'item' : 'itens'} no carrinho
              </p>

              <div className="pdv-checkout">
                <div className="pdv-field">
                  <label className="pdv-field__lbl" htmlFor="pdv-cliente-modal">
                    Cliente (opcional)
                  </label>
                  <select
                    id="pdv-cliente-modal"
                    className="pdv-input"
                    value={clienteId}
                    onChange={(e) => {
                      setClienteId(e.target.value)
                      setBicicletaId('')
                    }}
                  >
                    <option value="">Consumidor / balcão</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {clienteId && bikesCliente.length > 0 && (
                  <div className="pdv-field">
                    <label className="pdv-field__lbl" htmlFor="pdv-bike-modal">
                      Bicicleta
                    </label>
                    <select
                      id="pdv-bike-modal"
                      className="pdv-input"
                      value={bicicletaId}
                      onChange={(e) => setBicicletaId(e.target.value)}
                    >
                      <option value="">Não vincular</option>
                      {bikesCliente.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.marca} {b.modelo}
                          {b.numero_serie ? ` · ${b.numero_serie}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pdv-pay-mixed">
                  <div className="pdv-pay-mixed__head">
                    <span className="pdv-field__lbl">Pagamento</span>
                    <button
                      type="button"
                      className="pdv-link-btn"
                      onClick={adicionarFormaPagamento}
                      disabled={pagamentos.length >= FORMAS_PAGAMENTO.length}
                    >
                      + Forma
                    </button>
                  </div>
                  <ul className="pdv-pay-mixed__list">
                    {pagamentos.map((p) => (
                      <li key={p.id} className="pdv-pay-line">
                        <select
                          className="pdv-input pdv-pay-line__forma"
                          value={p.forma}
                          onChange={(e) =>
                            atualizarPagamento(p.id, {
                              forma: e.target.value as FormaPagamento,
                            })
                          }
                        >
                          {FORMAS_PAGAMENTO.map((fp) => (
                            <option key={fp} value={fp}>
                              {labelPagamento(fp)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="pdv-input pdv-pay-line__valor"
                          placeholder="0,00"
                          value={p.valorStr}
                          onChange={(e) =>
                            atualizarPagamento(p.id, { valorStr: maskMoneyInput(e.target.value) })
                          }
                        />
                        <button
                          type="button"
                          className="pdv-pay-line__fill"
                          title="Preencher valor restante"
                          onClick={() => preencherRestantePagamento(p.id)}
                        >
                          Restante
                        </button>
                        {pagamentos.length > 1 && (
                          <button
                            type="button"
                            className="pdv-icon-btn"
                            aria-label="Remover forma"
                            onClick={() => removerFormaPagamento(p.id)}
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p
                    className={`pdv-pay-mixed__hint${!pagamentoOk && somaPagamentos > 0 ? ' pdv-pay-mixed__hint--warn' : ''}`}
                  >
                    {pagamentoOk
                      ? 'Valor do pagamento conferido.'
                      : restantePagamento > 0
                        ? `Falta ${formatBRL(restantePagamento)}`
                        : somaPagamentos > 0
                          ? `Excedente de ${formatBRL(-restantePagamento)}`
                          : `Total a pagar: ${formatBRL(total)}`}
                  </p>
                </div>

                <label className="pdv-field">
                  <span className="pdv-field__lbl">Desconto (R$)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="pdv-input"
                    placeholder="0,00"
                    value={descontoStr}
                    onChange={(e) => setDescontoStr(maskMoneyInput(e.target.value))}
                  />
                </label>

                <dl className="pdv-totals">
                  <div className="pdv-totals__row">
                    <dt>Subtotal</dt>
                    <dd>{formatBRL(subtotal)}</dd>
                  </div>
                  {desconto > 0 && (
                    <div className="pdv-totals__row pdv-totals__row--disc">
                      <dt>Desconto</dt>
                      <dd>− {formatBRL(desconto)}</dd>
                    </div>
                  )}
                  <div className="pdv-totals__row pdv-totals__row--total">
                    <dt>Total</dt>
                    <dd>{formatBRL(total)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="pdv-finalize"
                  disabled={finalizando || !pagamentoOk}
                  onClick={() => void handleFinalizar()}
                >
                  {finalizando ? 'Finalizando…' : `Confirmar — ${formatBRL(total)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {recentesAberto && (
        <div
          className="st-modal-overlay pdv-recent-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRecentesAberto(false)
          }}
        >
          <div
            className="pdv-recent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdv-recentes-title"
          >
            <div className="pdv-recent-modal__head">
              <h2 id="pdv-recentes-title" className="pdv-recent-modal__title">
                Vendas recentes
              </h2>
              <button
                type="button"
                className="st-modal__close"
                onClick={() => setRecentesAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="pdv-recent-modal__body">
              <ul className="pdv-recent-list pdv-recent-list--modal">
                {loading ? (
                  <li className="pdv-recent-empty">Carregando…</li>
                ) : vendasRecentes.length === 0 ? (
                  <li className="pdv-recent-empty">Nenhuma venda nesta loja ainda.</li>
                ) : (
                  vendasRecentes.map((v) => (
                    <li key={v.id} className="pdv-recent-item">
                      <span className="pdv-recent-item__num">#{v.numero}</span>
                      <span className="pdv-recent-item__meta">
                        {formatShortTime(dataExibicaoVenda(v))}
                        {v.clienteNome ? ` · ${v.clienteNome}` : ''}
                      </span>
                      <span className="pdv-recent-item__total">{formatBRL(Number(v.total))}</span>
                      <span className="pdv-recent-item__pay">{labelPagamento(v.forma_pagamento)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}







