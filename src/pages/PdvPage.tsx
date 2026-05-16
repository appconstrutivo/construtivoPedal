import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarClientes, type ClienteComRelacoes } from '../services/clientes.service'
import { listarItensEstoque, type EstoqueItemComLocal } from '../services/estoque.service'
import {
  finalizarVendaPdv,
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

function parseMoney(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function labelPagamento(f: string) {
  const map: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    credito: 'Crédito',
    debito: 'Débito',
    outro: 'Outro',
  }
  return map[f] ?? f
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
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('pix')
  const [descontoStr, setDescontoStr] = useState('')

  const [loading, setLoading] = useState(true)
  const [finalizando, setFinalizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<{ numero: number; total: number } | null>(null)

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
    void recarregar()
  }, [recarregar])

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

  const desconto = parseMoney(descontoStr) ?? 0
  const total = Math.max(subtotal - desconto, 0)

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
      },
    ])
    setErro(null)
  }

  function atualizarLinha(key: string, patch: Partial<CarrinhoLinha>) {
    setCarrinho((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
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
    setSucesso(null)
    setErro(null)
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
    setFinalizando(true)
    setErro(null)
    setSucesso(null)
    try {
      const resultado = await finalizarVendaPdv({
        companyId,
        storeId: activeStoreId,
        clienteId: clienteId || null,
        bicicletaId: bicicletaId || null,
        formaPagamento,
        desconto,
        observacao: '',
        itens: carrinho.map((l) => ({
          estoque_item_id: l.estoqueItemId,
          descricao: l.descricao,
          quantidade: l.quantidade,
          preco_unitario: l.precoUnitario,
        })),
      })
      setSucesso({ numero: resultado.numero, total: resultado.total })
      limparCarrinho()
      setClienteId('')
      setBicicletaId('')
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
                      <span className="pdv-prod-card__name">{item.nome}</span>
                      <span className="pdv-prod-card__meta">
                        SKU {item.sku} · {Number(item.saldo_atual)} {item.unidade}
                      </span>
                      <span className="pdv-prod-card__price">
                        {formatBRL(Number(item.preco_varejo) || Number(item.custo_medio) || 0)}
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
                        min={0.001}
                        step={1}
                        className="pdv-input pdv-input--sm"
                        value={linha.quantidade}
                        onChange={(e) =>
                          atualizarLinha(linha.key, {
                            quantidade: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="pdv-field pdv-field--inline">
                      <span className="pdv-field__lbl">Preço</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="pdv-input pdv-input--sm"
                        value={linha.precoUnitario}
                        onChange={(e) => {
                          const n = parseMoney(e.target.value)
                          if (n != null) atualizarLinha(linha.key, { precoUnitario: n })
                        }}
                      />
                    </label>
                    <span className="pdv-cart-line__sub">
                      {formatBRL(linha.quantidade * linha.precoUnitario)}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="pdv-checkout">
            <div className="pdv-field">
              <label className="pdv-field__lbl" htmlFor="pdv-cliente">
                Cliente (opcional)
              </label>
              <select
                id="pdv-cliente"
                className="pdv-input"
                value={clienteId}
                onChange={(e) => {
                  setClienteId(e.target.value)
                  setBicicletaId('')
                }}
                disabled={semLoja}
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
                <label className="pdv-field__lbl" htmlFor="pdv-bike">
                  Bicicleta
                </label>
                <select
                  id="pdv-bike"
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

            <div className="pdv-pay-row">
              {(['pix', 'dinheiro', 'credito', 'debito'] as const).map((fp) => (
                <button
                  key={fp}
                  type="button"
                  className={`pdv-pay-chip${formaPagamento === fp ? ' pdv-pay-chip--on' : ''}`}
                  onClick={() => setFormaPagamento(fp)}
                >
                  {labelPagamento(fp)}
                </button>
              ))}
            </div>

            <label className="pdv-field">
              <span className="pdv-field__lbl">Desconto (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                className="pdv-input"
                placeholder="0,00"
                value={descontoStr}
                onChange={(e) => setDescontoStr(e.target.value)}
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
              disabled={semLoja || finalizando || carrinho.length === 0}
              onClick={() => void handleFinalizar()}
            >
              {finalizando ? 'Finalizando…' : `Finalizar — ${formatBRL(total)}`}
            </button>
          </div>
        </section>

        <aside className="pdv-panel pdv-panel--recent" aria-label="Vendas recentes">
          <div className="pdv-panel__head">
            <h2 className="pdv-panel__title">Recentes</h2>
          </div>
          <ul className="pdv-recent-list">
            {loading ? (
              <li className="pdv-recent-empty">Carregando…</li>
            ) : vendasRecentes.length === 0 ? (
              <li className="pdv-recent-empty">Nenhuma venda nesta loja ainda.</li>
            ) : (
              vendasRecentes.map((v) => (
                <li key={v.id} className="pdv-recent-item">
                  <span className="pdv-recent-item__num">#{v.numero}</span>
                  <span className="pdv-recent-item__meta">
                    {formatShortTime(v.created_at)}
                    {v.clienteNome ? ` · ${v.clienteNome}` : ''}
                  </span>
                  <span className="pdv-recent-item__total">{formatBRL(Number(v.total))}</span>
                  <span className="pdv-recent-item__pay">{labelPagamento(v.forma_pagamento)}</span>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  )
}
